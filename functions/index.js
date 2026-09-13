// Cloud Function DUY NHẤT của app — tạo trắc nghiệm/tự luận/flashcard/giáo án bằng AI từ nội dung bài
// giảng đã nạp. Mặc định chỉ giáo viên gói Pro dùng được — admin bật/tắt được ở Quản trị → Khoá tính
// năng (xem assertAllowedToUseAi bên dưới, khớp LOCKABLE_FEATURES/enforceFeatureLock của
// monetization.js). Đây là backend đầu tiên của app (trước giờ 100% tĩnh trên GitHub Pages) — tồn
// tại DUY NHẤT để giấu kín API key AI + chặn người không trả phí (khi đang khoá), 2 việc
// không làm được ở phía trình duyệt (xem chapter-detail.js: gọi qua
// firebase.functions().httpsCallable('generateFromLesson')).
//
// Hàm KHÔNG tự ghi Firestore — chỉ trả kết quả AI về cho client, client hiện màn xem trước (giáo viên
// bỏ tích/sửa câu không ưng) rồi mới gọi addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan
// (custom-quiz.js/custom-flashcards.js/custom-lessonplans.js) như nạp PDF/Excel bình thường — không
// trùng lặp logic ghi, không mất bước duyệt của giáo viên trước khi lưu.
//
// ---------- Đổi nhà cung cấp/model/API key AI KHÔNG cần sửa code/deploy lại ----------
// Cách 1 (khuyến nghị) — ngay trong app: trang Quản trị → "🤖 Cấu hình AI" (admin.js
// buildAiConfigSection) → chọn nhà cung cấp, gõ model, dán API key → Lưu. Ghi thẳng vào Firestore
// (config/aiProvider + secureConfig/aiKeys — xem getApiKeyForProvider ở trên), có hiệu lực NGAY từ
// lượt tạo AI kế tiếp, không cần CLI/terminal.
// Cách 2 (dự phòng, không bắt buộc) — Secret Manager qua CLI, y hệt thiết kế ban đầu:
// 1. firebase functions:secrets:set GEMINI_API_KEY (hoặc ANTHROPIC_API_KEY)
// 2. Sửa tài liệu config/aiProvider trong Firestore Console: { "provider": "gemini", "model": "..." }
// getApiKeyForProvider() luôn ưu tiên Cách 1, chỉ dùng Cách 2 khi Firestore chưa có key.
// Thêm hẳn 1 hãng AI MỚI (chưa từng hỗ trợ) mới cần sửa code: tạo 1 file trong providers/ theo đúng
// interface generate({apiKey, model, systemPrompt, parts, mode}) rồi đăng ký vào PROVIDERS bên dưới,
// deploy lại 1 lần.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

const geminiProvider = require('./providers/gemini');
const claudeProvider = require('./providers/claude');

admin.initializeApp();

// Đăng ký hãng AI hỗ trợ tại đây — thêm 1 dòng khi có adapter mới trong providers/.
const PROVIDERS = {
  gemini: geminiProvider,
  claude: claudeProvider
};
const DEFAULT_PROVIDER = 'gemini';

// Admin DUY NHẤT của app, xác định bằng email — y hệt isAdmin() trong firebase/firestore.rules (app
// chỉ có 1 người quản trị, không cần vai trò/danh sách quyền phức tạp hơn). Dùng để chặn testAiKey
// bên dưới — chỉ admin mới được thử API key (tốn lượt gọi AI thật, dù rất nhỏ).
const ADMIN_EMAIL = 'chinhhuynh89@gmail.com';

// Khai báo TRƯỚC toàn bộ secret của mọi hãng đã đăng ký — secret nào chưa set giá trị thì đơn giản
// không dùng tới (không lỗi), chỉ cần đúng secret của provider đang CHỌN trong config/aiProvider.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const SECRETS_BY_NAME = { GEMINI_API_KEY, ANTHROPIC_API_KEY };

// Trần chi phí MẶC ĐỊNH (dùng khi admin chưa cấu hình gì ở Quản trị → Cấu hình AI) — admin chỉnh
// được ở config/monetization.aiLimits, đọc lại MỖI LƯỢT GỌI (xem getMonetizationConfigServer), có
// hiệu lực ngay không cần deploy lại. dailyCapByMode giới hạn RIÊNG theo loại (giáo án tốn nhiều
// token hơn hẳn nên mặc định thấp hơn) — CỘNG DỒN với dailyCallCap/monthlyCallCap, không loại nào
// thay thế loại nào.
const AI_LIMITS_DEFAULT = {
  monthlyCallCap: 100,
  dailyCallCap: 20,
  maxPointsPerRequest: 15,
  dailyCapByMode: { quiz: 10, essay: 10, flashcard: 10, lessonplan: 3 }
};
const MODE_LABELS = { quiz: 'trắc nghiệm', essay: 'tự luận', truefalse: 'Đúng/Sai', flashcard: 'flashcard', lessonplan: 'giáo án' };

// Đổi sang app môn khác (VD Toán, Lý) CHỈ cần sửa đúng 1 dòng này — xem HUONG-DAN-NHAN-BAN-MON-HOC.md
// ở thư mục gốc để biết đầy đủ các chỗ khác cần đổi khi nhân bản app sang môn học mới.
const SUBJECT_NAME = 'Hoá học';

// ---------- Đọc config/monetization (bật/tắt kinh doanh + khoá tính năng + giới hạn AI) — LẶP LẠI
// ĐÚNG logic getMonetizationConfig()/LOCKABLE_FEATURES (monetization.js) vì Cloud Function không tải
// được file JS phía trình duyệt, phải viết lại 1 bản dùng Admin SDK. Đọc MỖI LƯỢT GỌI (không cache)
// để admin đổi ở Quản trị có hiệu lực ngay. ----------
async function getMonetizationConfigServer() {
  const snap = await admin.firestore().collection('config').doc('monetization').get();
  const data = snap.exists ? snap.data() : {};
  const aiLimitsData = data.aiLimits || {};
  return {
    enabled: !!data.enabled,
    lockedFeatures: data.lockedFeatures || {},
    aiLimits: {
      monthlyCallCap: aiLimitsData.monthlyCallCap || AI_LIMITS_DEFAULT.monthlyCallCap,
      dailyCallCap: aiLimitsData.dailyCallCap || AI_LIMITS_DEFAULT.dailyCallCap,
      maxPointsPerRequest: aiLimitsData.maxPointsPerRequest || AI_LIMITS_DEFAULT.maxPointsPerRequest,
      dailyCapByMode: Object.assign({}, AI_LIMITS_DEFAULT.dailyCapByMode, aiLimitsData.dailyCapByMode)
    }
  };
}

// ---------- Kiểm tra được phép dùng AI hay không — LẶP LẠI ĐÚNG logic enforceFeatureLock()
// (monetization.js): không khoá (chưa bật kinh doanh HOẶC admin đã tắt khoá riêng cho "aiGenerate")
// thì AI ĐÚNG cũng dùng được, ngược lại bắt buộc gói Pro. Mặc định lockedFeatures.aiGenerate=true
// (xem MONETIZATION_DEFAULTS, monetization.js) nên hành vi mặc định vẫn y hệt trước đây (chỉ Pro)
// cho tới khi admin chủ động mở ở Quản trị → Khoá tính năng. ----------
async function assertAllowedToUseAi(uid, cfg) {
  if (!cfg.enabled || !cfg.lockedFeatures.aiGenerate) return;
  const snap = await admin.firestore().collection('subscriptions').doc(uid).get();
  const data = snap.exists ? snap.data() : { tier: 'free' };
  const notExpired = !data.expiresAt || new Date(data.expiresAt) >= new Date();
  if (data.tier !== 'pro' || !notExpired) {
    throw new HttpsError('permission-denied', 'Cần nâng cấp gói Pro để dùng tính năng tạo bằng AI.');
  }
}

// ---------- Đếm + chặn vượt trần lượt dùng — 1 doc/giáo viên (aiUsage/{uid}), theo dõi CẢ tháng lẫn
// ngày lẫn từng loại ("mode") riêng, mỗi mốc tự reset khi sang tháng/ngày mới (so sánh monthKey/dayKey,
// không cần cron dọn dẹp riêng). ----------
async function checkAndIncrementUsage(uid, mode, aiLimits) {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7); // "2026-09"
  const dayKey = now.toISOString().slice(0, 10); // "2026-09-13"
  const ref = admin.firestore().collection('aiUsage').doc(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const monthCount = data.monthKey === monthKey ? (data.count || 0) : 0;
    const sameDayData = data.dayKey === dayKey;
    const dayCount = sameDayData ? (data.dailyCount || 0) : 0;
    const dayByMode = sameDayData ? (data.dailyCountByMode || {}) : {};
    const modeCount = dayByMode[mode] || 0;

    if (monthCount >= aiLimits.monthlyCallCap) {
      throw new HttpsError('resource-exhausted', `Đã dùng hết ${aiLimits.monthlyCallCap} lượt tạo bằng AI trong tháng này — thử lại vào tháng sau.`);
    }
    if (dayCount >= aiLimits.dailyCallCap) {
      throw new HttpsError('resource-exhausted', `Đã dùng hết ${aiLimits.dailyCallCap} lượt tạo bằng AI hôm nay — thử lại vào ngày mai.`);
    }
    const modeCap = aiLimits.dailyCapByMode[mode];
    if (typeof modeCap === 'number' && modeCount >= modeCap) {
      throw new HttpsError('resource-exhausted', `Đã dùng hết ${modeCap} lượt tạo ${MODE_LABELS[mode] || mode} hôm nay — thử lại vào ngày mai hoặc chọn loại khác.`);
    }

    tx.set(ref, {
      monthKey, count: monthCount + 1,
      dayKey, dailyCount: dayCount + 1,
      dailyCountByMode: Object.assign({}, dayByMode, { [mode]: modeCount + 1 }),
      updatedAt: now.toISOString()
    }, { merge: true });
  });
}

// Đọc config/aiProvider (Firestore) để biết đang chọn hãng nào — không có doc thì dùng DEFAULT_PROVIDER.
async function getActiveProviderConfig() {
  const snap = await admin.firestore().collection('config').doc('aiProvider').get();
  const data = snap.exists ? snap.data() : {};
  const name = PROVIDERS[data.provider] ? data.provider : DEFAULT_PROVIDER;
  return { name, adapter: PROVIDERS[name], model: data.model || PROVIDERS[name].defaultModel };
}

// Lấy API key: ƯU TIÊN key giáo viên tự dán qua trang Quản trị (Firestore secureConfig/aiKeys — xem
// admin.js buildAiConfigSection) vì có hiệu lực NGAY, không cần deploy lại. Nếu chưa dán qua đó thì
// dự phòng sang Secret Manager (firebase functions:secrets:set — cách cũ, vẫn hỗ trợ song song cho ai
// muốn bảo mật chặt hơn). secureConfig CHỈ admin đọc/ghi được từ trình duyệt (xem firestore.rules),
// nhưng Cloud Function dùng Admin SDK nên luôn đọc được bất kể rule.
async function getApiKeyForProvider(adapter) {
  try {
    const snap = await admin.firestore().collection('secureConfig').doc('aiKeys').get();
    const data = snap.exists ? snap.data() : {};
    const fsKey = data[adapter.firestoreKeyField];
    if (fsKey && String(fsKey).trim()) return String(fsKey).trim();
  } catch (e) { /* rơi xuống Secret Manager bên dưới */ }
  const secret = SECRETS_BY_NAME[adapter.secretName];
  return secret && secret.value();
}

// Bỏ thẻ HTML thô (points[].html có thể chứa <strong>/<sub>/<sup> từ lúc nạp Word/PDF cũ) thành chữ
// thường — AI đọc chữ thường vẫn hiểu đúng nội dung, không cần giữ định dạng.
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ghép "points" của 1 Bài (chữ thường + ảnh trang PDF base64 lẫn lộn, xem doc-import.js) thành mảng
// "part" TRUNG LẬP — không phụ thuộc hãng AI nào, từng adapter (providers/*.js) tự chuyển sang định
// dạng riêng của hãng đó. Bỏ qua point dạng "table"/"warning" — không hữu ích để soạn nội dung.
function buildContentParts(points, lessonTitle) {
  const parts = [{
    type: 'text',
    text: `Đây là nội dung bài giảng "${lessonTitle || '(không có tiêu đề)'}" của 1 lớp học ${SUBJECT_NAME} phổ thông tại Việt Nam (có thể gồm cả chữ và ảnh chụp trang sách/slide gốc):`
  }];
  points.forEach((pt) => {
    if (typeof pt === 'string') {
      if (pt.trim()) parts.push({ type: 'text', text: pt.trim() });
      return;
    }
    if (!pt || typeof pt !== 'object') return;
    if (pt.type === 'text' && pt.html) {
      const text = stripHtml(pt.html);
      if (text) parts.push({ type: 'text', text });
      return;
    }
    if (pt.type === 'image' && pt.dataUri) {
      const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(pt.dataUri);
      if (match) parts.push({ type: 'image', mimeType: match[1], data: match[2] });
    }
  });
  return parts;
}

// 4 mức độ nhận thức theo Thông tư 22/2021/TT-BGDĐT (đánh giá học sinh phổ thông) — dùng cho cả trắc
// nghiệm lẫn tự luận, để giáo viên chủ động phân bố đề đúng chuyên môn thay vì chỉ chọn 1 số lượng chung.
const LEVEL_KEYS = ['biet', 'hieu', 'vandung', 'vandungcao'];
const LEVEL_LABELS = { biet: 'Nhận biết', hieu: 'Thông hiểu', vandung: 'Vận dụng', vandungcao: 'Vận dụng cao' };

function sumLevels(levels) {
  return LEVEL_KEYS.reduce((s, k) => s + (parseInt(levels && levels[k], 10) || 0), 0);
}

function buildSystemPrompt(mode, params) {
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') {
    const total = sumLevels(params.levels);
    const breakdown = LEVEL_KEYS
      .filter((k) => (parseInt(params.levels[k], 10) || 0) > 0)
      .map((k) => `${params.levels[k]} câu mức "${LEVEL_LABELS[k]}"`)
      .join(', ');
    const kindText = mode === 'quiz'
      ? 'câu hỏi trắc nghiệm 4 đáp án'
      : mode === 'truefalse'
        ? 'câu hỏi dạng mệnh đề Đúng/Sai (học sinh nhận định mệnh đề đó đúng hay sai)'
        : 'câu hỏi tự luận dạng bài tập nhiều bước giải (không phải hỏi ngắn 1 dòng) — học sinh phải tự trình bày các bước giải rồi ra đáp số cuối cùng, giống 1 bài tập tính toán/vận dụng thật sự';
    const extra = mode === 'essay'
      ? ' Với mỗi câu, field "explain" PHẢI là lời giải chi tiết đầy đủ TỪNG BƯỚC (đánh số Bước 1, Bước 2, ... rồi tới "Đáp số:") để học sinh đối chiếu sau khi tự giải, KHÔNG viết giải thích ngắn 1 câu; field "acceptedAnswers" chỉ chứa đáp số CUỐI CÙNG (và các cách viết tương đương) để chấm nhanh, không chứa cả lời giải.'
      : mode === 'truefalse'
        ? ' field "correct": 0 nếu mệnh đề ĐÚNG, 1 nếu mệnh đề SAI.'
        : '';
    return `Bạn là trợ lý soạn học liệu cho giáo viên ${SUBJECT_NAME} phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ĐÚNG ${total} ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, phân bố CHÍNH XÁC theo mức độ nhận thức (Thông tư 22/2021/TT-BGDĐT): ${breakdown}. Mỗi câu phải gắn đúng field "level" tương ứng đúng như số lượng đã yêu cầu ở trên.${extra} Nội dung câu hỏi phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
  }
  if (mode === 'flashcard') {
    return `Bạn là trợ lý soạn học liệu cho giáo viên ${SUBJECT_NAME} phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ra CHÍNH XÁC ${params.count} flashcard (mặt trước/mặt sau) bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, độ khó phù hợp học sinh. Nội dung flashcard phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
  }
  // lessonplan
  return `Bạn là giáo viên ${SUBJECT_NAME} giàu kinh nghiệm tại Việt Nam, soạn Kế hoạch bài dạy (giáo án) theo ĐÚNG cấu trúc mẫu quy định tại Công văn 5512/BGDĐT-GDTrH của Bộ Giáo dục và Đào tạo, cho lớp ${params.lop}, thời lượng ${params.soTiet} tiết. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó. Giáo án gồm: (I) Mục tiêu (Kiến thức, Năng lực, Phẩm chất — viết theo Chương trình GDPT 2018), (II) Thiết bị dạy học và học liệu, (III) Tiến trình dạy học gồm ĐÚNG 4 hoạt động theo thứ tự cố định: "Hoạt động 1: Mở đầu", "Hoạt động 2: Hình thành kiến thức mới", "Hoạt động 3: Luyện tập", "Hoạt động 4: Vận dụng" — mỗi hoạt động nêu rõ mục tiêu, nội dung, sản phẩm, tổ chức thực hiện. Viết bằng tiếng Việt, ngôn ngữ sư phạm chuẩn mực, cụ thể, có thể áp dụng trực tiếp vào lớp học.`;
}

function isValidLevel(v) {
  return LEVEL_KEYS.includes(v);
}

// Lọc lại LẦN CUỐI kết quả thô từ adapter cho khớp ĐÚNG khuôn addCustomQuizBatch/addCustomFlashcard/
// addCustomLessonPlan — dù đã ép schema/tool ở adapter, vẫn kiểm tra lại phòng AI trả thiếu field.
function normalizeItems(mode, rawItems) {
  if (mode === 'quiz') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Array.isArray(it.options) && it.options.length === 4 && Number.isInteger(it.correct) && it.correct >= 0 && it.correct <= 3)
      .map((it) => {
        const q = { q: it.q, type: 'abcd', options: it.options, correct: it.correct, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (isValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'essay') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Array.isArray(it.acceptedAnswers) && it.acceptedAnswers.some((a) => typeof a === 'string' && a.trim()))
      .map((it) => {
        const acceptedAnswers = it.acceptedAnswers.filter((a) => typeof a === 'string' && a.trim()).join('|');
        const q = { q: it.q, type: 'text', acceptedAnswers, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (isValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'truefalse') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Number.isInteger(it.correct) && (it.correct === 0 || it.correct === 1))
      .map((it) => {
        const q = { q: it.q, type: 'truefalse', options: ['Đúng', 'Sai'], correct: it.correct, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (isValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'flashcard') {
    return rawItems.filter((it) => it && typeof it.front === 'string' && typeof it.back === 'string')
      .map((it) => ({ front: it.front, back: it.back }));
  }
  // lessonplan — rawItems là mảng 1 phần tử (xem providers/*.js), kiểm tra đủ khung Công văn 5512.
  return rawItems.filter((it) => (
    it && typeof it.tenBai === 'string' &&
    it.mucTieu && Array.isArray(it.mucTieu.kienThuc) && Array.isArray(it.mucTieu.nangLuc) && Array.isArray(it.mucTieu.phamChat) &&
    Array.isArray(it.thietBiDayHoc) &&
    Array.isArray(it.tienTrinh) && it.tienTrinh.length > 0
  ));
}

exports.generateFromLesson = onCall({
  secrets: [GEMINI_API_KEY, ANTHROPIC_API_KEY],
  region: 'asia-southeast1',
  timeoutSeconds: 120,
  memory: '512MiB'
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Cần đăng nhập giáo viên.');
  }
  const uid = request.auth.uid;
  const { mode, points, lessonTitle } = request.data || {};

  if (!['quiz', 'essay', 'truefalse', 'flashcard', 'lessonplan'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Thiếu hoặc sai "mode" (phải là "quiz", "essay", "truefalse", "flashcard" hoặc "lessonplan").');
  }
  if (!Array.isArray(points) || !points.length) {
    throw new HttpsError('invalid-argument', 'Thiếu nội dung bài giảng để tạo nội dung.');
  }

  // Chuẩn hoá tham số riêng theo từng mode NGAY từ đầu — validate lỗi sai tham số trước khi tốn lượt
  // Pro/gọi AI, đỡ giáo viên mất lượt oan vì gửi thiếu field.
  let params;
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') {
    const levels = request.data.levels || {};
    const safeLevels = {};
    LEVEL_KEYS.forEach((k) => { safeLevels[k] = Math.min(Math.max(parseInt(levels[k], 10) || 0, 0), 15); });
    const total = sumLevels(safeLevels);
    if (total < 1 || total > 20) {
      throw new HttpsError('invalid-argument', 'Tổng số câu theo các mức độ phải từ 1 đến 20.');
    }
    params = { levels: safeLevels, total };
  } else if (mode === 'flashcard') {
    params = { count: Math.min(Math.max(parseInt(request.data.count, 10) || 10, 1), 20) };
  } else {
    const lop = String(request.data.lop || '').trim();
    const soTiet = Math.min(Math.max(parseInt(request.data.soTiet, 10) || 1, 1), 10);
    if (!lop) throw new HttpsError('invalid-argument', 'Thiếu "Lớp" để soạn giáo án.');
    params = { lop, soTiet };
  }

  const monetizationCfg = await getMonetizationConfigServer();
  await assertAllowedToUseAi(uid, monetizationCfg);
  await checkAndIncrementUsage(uid, mode, monetizationCfg.aiLimits);

  const cappedPoints = points.slice(0, monetizationCfg.aiLimits.maxPointsPerRequest);
  const contentParts = buildContentParts(cappedPoints, lessonTitle);
  const hasRealContent = contentParts.some((p) => (p.type === 'text' && p.text.trim()) || p.type === 'image');
  if (!hasRealContent) {
    throw new HttpsError('invalid-argument', 'Không đọc được nội dung bài giảng để tạo nội dung.');
  }

  const { name: providerName, adapter, model } = await getActiveProviderConfig();
  const apiKey = await getApiKeyForProvider(adapter);
  if (!apiKey) {
    logger.error(`Chưa có API key (Firestore lẫn Secret Manager) cho provider "${providerName}"`);
    throw new HttpsError('failed-precondition', `Chưa cấu hình API key cho nhà cung cấp AI "${providerName}" — vào trang Quản trị → Cấu hình AI để dán key.`);
  }

  let rawItems;
  try {
    rawItems = await adapter.generate({
      apiKey,
      model,
      systemPrompt: buildSystemPrompt(mode, params),
      parts: contentParts,
      mode
    });
  } catch (err) {
    logger.error(`Lỗi gọi AI (provider=${providerName}, mode=${mode})`, err);
    throw new HttpsError('internal', 'Không gọi được AI lúc này, thử lại sau.');
  }

  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new HttpsError('internal', 'AI không tạo được nội dung nào từ bài giảng này.');
  }

  const items = normalizeItems(mode, rawItems);
  if (!items.length) {
    throw new HttpsError('internal', 'AI trả về kết quả không đúng định dạng, thử lại.');
  }

  return { items };
});

// ---------- Kiểm tra API key trước khi admin bấm "Lưu" ở trang Quản trị → Cấu hình AI ----------
// Gọi THẬT 1 lượt sinh nội dung tối thiểu (mode 'flashcard', nội dung 1 dòng) để xác nhận key/model
// kết nối được — KHÔNG qua assertProTier/checkAndIncrementUsage (đây là thao tác của admin, không
// tính vào trần 100 lượt/giáo viên/tháng). Nếu admin.js không dán key mới (chỉ đổi model), tự lấy lại
// ĐÚNG key đang lưu cho provider đó để kiểm tra, khỏi bắt dán lại key mỗi lần chỉ muốn đổi model.
exports.testAiKey = onCall({
  secrets: [GEMINI_API_KEY, ANTHROPIC_API_KEY],
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB'
}, async (request) => {
  if (!request.auth || request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Chỉ admin mới dùng được tính năng này.');
  }
  const { provider, model } = request.data || {};
  let apiKey = request.data && request.data.apiKey;
  if (!PROVIDERS[provider]) {
    throw new HttpsError('invalid-argument', 'Nhà cung cấp không hợp lệ.');
  }
  const adapter = PROVIDERS[provider];
  if (!apiKey) apiKey = await getApiKeyForProvider(adapter);
  if (!apiKey) {
    throw new HttpsError('invalid-argument', 'Chưa có API key nào để kiểm tra — dán key trước khi lưu.');
  }
  try {
    await adapter.generate({
      apiKey,
      model: model || adapter.defaultModel,
      systemPrompt: 'Đây là lượt kiểm tra kết nối nội bộ. Trả về đúng 1 flashcard bất kỳ.',
      parts: [{ type: 'text', text: 'Kiểm tra kết nối API.' }],
      mode: 'flashcard'
    });
  } catch (err) {
    logger.error(`Kiểm tra API key thất bại (provider=${provider})`, err);
    throw new HttpsError('invalid-argument', 'Không kết nối được — kiểm tra lại API key và/hoặc tên model.');
  }
  return { ok: true };
});
