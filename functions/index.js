// Cloud Function DUY NHẤT của app — tạo trắc nghiệm/tự luận/flashcard/giáo án bằng AI từ nội dung bài
// giảng đã nạp, CHỈ dành cho giáo viên gói Pro. Đây là backend đầu tiên của app (trước giờ 100% tĩnh
// trên GitHub Pages) — tồn tại DUY NHẤT để giấu kín API key AI + chặn người không trả phí, 2 việc
// không làm được ở phía trình duyệt (xem chapter-detail.js: gọi qua
// firebase.functions().httpsCallable('generateFromLesson')).
//
// Hàm KHÔNG tự ghi Firestore — chỉ trả kết quả AI về cho client, client hiện màn xem trước (giáo viên
// bỏ tích/sửa câu không ưng) rồi mới gọi addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan
// (custom-quiz.js/custom-flashcards.js/custom-lessonplans.js) như nạp PDF/Excel bình thường — không
// trùng lặp logic ghi, không mất bước duyệt của giáo viên trước khi lưu.
//
// ---------- Đổi nhà cung cấp AI KHÔNG cần sửa code/deploy lại ----------
// 1. Set secret của hãng muốn dùng (1 lần):    firebase functions:secrets:set GEMINI_API_KEY
//    (hoặc ANTHROPIC_API_KEY — tên secret xem field "secretName" trong từng file providers/*.js)
// 2. Trong Firestore Console, sửa/tạo tài liệu config/aiProvider:
//      { "provider": "gemini" }   hoặc   { "provider": "claude" }
//    (có thể thêm field "model" để ép model cụ thể, không có thì dùng defaultModel của adapter đó)
// 3. Deploy CHỈ cần làm lại khi thêm 1 hãng MỚI hoàn toàn (tạo thêm 1 file trong providers/ theo đúng
//    interface generate({apiKey, model, systemPrompt, parts, mode}) rồi đăng ký vào PROVIDERS bên
//    dưới) — đổi qua lại giữa các hãng ĐÃ có sẵn thì chỉ cần bước 1-2, không đụng tới code.

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

// Khai báo TRƯỚC toàn bộ secret của mọi hãng đã đăng ký — secret nào chưa set giá trị thì đơn giản
// không dùng tới (không lỗi), chỉ cần đúng secret của provider đang CHỌN trong config/aiProvider.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const SECRETS_BY_NAME = { GEMINI_API_KEY, ANTHROPIC_API_KEY };

// Trần chi phí CỨNG — xem giải thích đầy đủ trong kế hoạch đã thống nhất với giáo viên (dazzling-
// mapping-haven.md lúc soạn tính năng này): 15 trang/lượt, 100 lượt/giáo viên/tháng, độc lập với công
// tắc bật/tắt gói Pro chung (config/monetization) để chi phí AI luôn có trần dù có đổi gì khác. Áp
// dụng chung cho MỌI nhà cung cấp lẫn MỌI loại ("mode"), không đổi theo provider/mode.
const MAX_POINTS_PER_REQUEST = 15;
const MONTHLY_CALL_CAP = 100;

// Đổi sang app môn khác (VD Toán, Lý) CHỈ cần sửa đúng 1 dòng này — xem HUONG-DAN-NHAN-BAN-MON-HOC.md
// ở thư mục gốc để biết đầy đủ các chỗ khác cần đổi khi nhân bản app sang môn học mới.
const SUBJECT_NAME = 'Hoá học';

// ---------- Kiểm tra gói Pro — LẶP LẠI ĐÚNG logic getTeacherSubscription() (monetization.js) vì Cloud
// Function không load được file JS phía trình duyệt, phải viết lại 1 bản dùng Admin SDK. ----------
async function assertProTier(uid) {
  const snap = await admin.firestore().collection('subscriptions').doc(uid).get();
  const data = snap.exists ? snap.data() : { tier: 'free' };
  const notExpired = !data.expiresAt || new Date(data.expiresAt) >= new Date();
  if (data.tier !== 'pro' || !notExpired) {
    throw new HttpsError('permission-denied', 'Cần nâng cấp gói Pro để dùng tính năng tạo bằng AI.');
  }
}

// ---------- Đếm + chặn vượt trần lượt dùng/tháng — 1 doc/giáo viên (aiUsage/{uid}), reset tự nhiên
// mỗi khi sang tháng mới nhờ so sánh monthKey (không cần cron dọn dẹp riêng). ----------
async function checkAndIncrementUsage(uid) {
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-09"
  const ref = admin.firestore().collection('aiUsage').doc(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const current = data.monthKey === monthKey ? (data.count || 0) : 0;
    if (current >= MONTHLY_CALL_CAP) {
      throw new HttpsError('resource-exhausted', `Đã dùng hết ${MONTHLY_CALL_CAP} lượt tạo bằng AI trong tháng này — thử lại vào tháng sau.`);
    }
    tx.set(ref, { monthKey, count: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

// Đọc config/aiProvider (Firestore) để biết đang chọn hãng nào — không có doc thì dùng DEFAULT_PROVIDER.
async function getActiveProviderConfig() {
  const snap = await admin.firestore().collection('config').doc('aiProvider').get();
  const data = snap.exists ? snap.data() : {};
  const name = PROVIDERS[data.provider] ? data.provider : DEFAULT_PROVIDER;
  return { name, adapter: PROVIDERS[name], model: data.model || PROVIDERS[name].defaultModel };
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
  if (mode === 'quiz' || mode === 'essay') {
    const total = sumLevels(params.levels);
    const breakdown = LEVEL_KEYS
      .filter((k) => (parseInt(params.levels[k], 10) || 0) > 0)
      .map((k) => `${params.levels[k]} câu mức "${LEVEL_LABELS[k]}"`)
      .join(', ');
    const kindText = mode === 'quiz' ? 'câu hỏi trắc nghiệm 4 đáp án' : 'câu hỏi tự luận ngắn (kèm đáp án/các cách diễn đạt đáp án được chấp nhận)';
    return `Bạn là trợ lý soạn học liệu cho giáo viên ${SUBJECT_NAME} phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ĐÚNG ${total} ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, phân bố CHÍNH XÁC theo mức độ nhận thức (Thông tư 22/2021/TT-BGDĐT): ${breakdown}. Mỗi câu phải gắn đúng field "level" tương ứng đúng như số lượng đã yêu cầu ở trên. Nội dung câu hỏi phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
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

  if (!['quiz', 'essay', 'flashcard', 'lessonplan'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Thiếu hoặc sai "mode" (phải là "quiz", "essay", "flashcard" hoặc "lessonplan").');
  }
  if (!Array.isArray(points) || !points.length) {
    throw new HttpsError('invalid-argument', 'Thiếu nội dung bài giảng để tạo nội dung.');
  }

  // Chuẩn hoá tham số riêng theo từng mode NGAY từ đầu — validate lỗi sai tham số trước khi tốn lượt
  // Pro/gọi AI, đỡ giáo viên mất lượt oan vì gửi thiếu field.
  let params;
  if (mode === 'quiz' || mode === 'essay') {
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

  await assertProTier(uid);
  await checkAndIncrementUsage(uid);

  const cappedPoints = points.slice(0, MAX_POINTS_PER_REQUEST);
  const contentParts = buildContentParts(cappedPoints, lessonTitle);
  const hasRealContent = contentParts.some((p) => (p.type === 'text' && p.text.trim()) || p.type === 'image');
  if (!hasRealContent) {
    throw new HttpsError('invalid-argument', 'Không đọc được nội dung bài giảng để tạo nội dung.');
  }

  const { name: providerName, adapter, model } = await getActiveProviderConfig();
  const secret = SECRETS_BY_NAME[adapter.secretName];
  const apiKey = secret && secret.value();
  if (!apiKey) {
    logger.error(`Chưa set secret ${adapter.secretName} cho provider "${providerName}"`);
    throw new HttpsError('failed-precondition', `Chưa cấu hình API key cho nhà cung cấp AI "${providerName}".`);
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
