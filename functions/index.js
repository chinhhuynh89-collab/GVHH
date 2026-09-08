// Cloud Function DUY NHẤT của app — tạo câu hỏi trắc nghiệm/flashcard bằng AI từ nội dung bài giảng
// đã nạp, CHỈ dành cho giáo viên gói Pro. Đây là backend đầu tiên của app (trước giờ 100% tĩnh trên
// GitHub Pages) — tồn tại DUY NHẤT để giấu kín API key AI + chặn người không trả phí, 2 việc không
// làm được ở phía trình duyệt (xem chapter-detail.js: gọi qua
// firebase.functions().httpsCallable('generateFromLesson')).
//
// Hàm KHÔNG tự ghi Firestore — chỉ trả kết quả AI về cho client, client hiện màn xem trước (giáo viên
// bỏ tích/sửa câu không ưng) rồi mới gọi addCustomQuizBatch/addCustomFlashcard (custom-quiz.js/
// custom-flashcards.js) như nạp PDF/Excel bình thường — không trùng lặp logic ghi, không mất bước
// duyệt của giáo viên trước khi lưu.
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
// dụng chung cho MỌI nhà cung cấp, không đổi theo provider.
const MAX_POINTS_PER_REQUEST = 15;
const MONTHLY_CALL_CAP = 100;

// ---------- Kiểm tra gói Pro — LẶP LẠI ĐÚNG logic getTeacherSubscription() (monetization.js) vì Cloud
// Function không load được file JS phía trình duyệt, phải viết lại 1 bản dùng Admin SDK. ----------
async function assertProTier(uid) {
  const snap = await admin.firestore().collection('subscriptions').doc(uid).get();
  const data = snap.exists ? snap.data() : { tier: 'free' };
  const notExpired = !data.expiresAt || new Date(data.expiresAt) >= new Date();
  if (data.tier !== 'pro' || !notExpired) {
    throw new HttpsError('permission-denied', 'Cần nâng cấp gói Pro để dùng tính năng tạo câu hỏi/flashcard bằng AI.');
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
// dạng riêng của hãng đó. Bỏ qua point dạng "table"/"warning" — không hữu ích để soạn câu hỏi.
function buildContentParts(points, lessonTitle) {
  const parts = [{
    type: 'text',
    text: `Đây là nội dung bài giảng "${lessonTitle || '(không có tiêu đề)'}" của 1 lớp học Hoá học phổ thông tại Việt Nam (có thể gồm cả chữ và ảnh chụp trang sách/slide gốc):`
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

function buildSystemPrompt(mode, count) {
  const kindText = mode === 'quiz' ? `${count} câu hỏi trắc nghiệm 4 đáp án` : `${count} flashcard (mặt trước/mặt sau)`;
  return `Bạn là trợ lý soạn học liệu cho giáo viên Hoá học phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ra CHÍNH XÁC ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, độ khó phù hợp học sinh. Nội dung câu hỏi/flashcard phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
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
  const { mode, points, count, lessonTitle } = request.data || {};

  if (mode !== 'quiz' && mode !== 'flashcard') {
    throw new HttpsError('invalid-argument', 'Thiếu hoặc sai "mode" (phải là "quiz" hoặc "flashcard").');
  }
  if (!Array.isArray(points) || !points.length) {
    throw new HttpsError('invalid-argument', 'Thiếu nội dung bài giảng để tạo câu hỏi/flashcard.');
  }
  const safeCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20);

  await assertProTier(uid);
  await checkAndIncrementUsage(uid);

  const cappedPoints = points.slice(0, MAX_POINTS_PER_REQUEST);
  const contentParts = buildContentParts(cappedPoints, lessonTitle);
  const hasRealContent = contentParts.some((p) => (p.type === 'text' && p.text.trim()) || p.type === 'image');
  if (!hasRealContent) {
    throw new HttpsError('invalid-argument', 'Không đọc được nội dung bài giảng để tạo câu hỏi/flashcard.');
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
      systemPrompt: buildSystemPrompt(mode, safeCount),
      parts: contentParts,
      mode
    });
  } catch (err) {
    logger.error(`Lỗi gọi AI (provider=${providerName})`, err);
    throw new HttpsError('internal', 'Không gọi được AI lúc này, thử lại sau.');
  }

  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new HttpsError('internal', 'AI không tạo được câu hỏi/flashcard nào từ nội dung này.');
  }

  // Lọc lại LẦN CUỐI cho khớp ĐÚNG khuôn addCustomQuizBatch/addCustomFlashcard (custom-quiz.js/
  // custom-flashcards.js) — dù đã ép schema/tool ở adapter, vẫn kiểm tra lại phòng AI trả thiếu field.
  const items = mode === 'quiz'
    ? rawItems
        .filter((it) => it && typeof it.q === 'string' && Array.isArray(it.options) && it.options.length === 4 && Number.isInteger(it.correct) && it.correct >= 0 && it.correct <= 3)
        .map((it) => ({ q: it.q, type: 'abcd', options: it.options, correct: it.correct, explain: typeof it.explain === 'string' ? it.explain : '' }))
    : rawItems
        .filter((it) => it && typeof it.front === 'string' && typeof it.back === 'string')
        .map((it) => ({ front: it.front, back: it.back }));

  if (!items.length) {
    throw new HttpsError('internal', 'AI trả về kết quả không đúng định dạng, thử lại.');
  }

  return { items };
});
