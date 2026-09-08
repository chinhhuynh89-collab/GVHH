// Cloud Function DUY NHẤT của app — tạo câu hỏi trắc nghiệm/flashcard bằng Claude API từ nội dung
// bài giảng đã nạp, CHỈ dành cho giáo viên gói Pro. Đây là backend đầu tiên của app (trước giờ 100%
// tĩnh trên GitHub Pages) — tồn tại DUY NHẤT để giấu kín API key Claude + chặn người không trả phí,
// 2 việc không làm được ở phía trình duyệt (xem chapter-detail.js: gọi qua
// firebase.functions().httpsCallable('generateFromLesson')).
//
// Hàm KHÔNG tự ghi Firestore — chỉ trả kết quả AI về cho client, client hiện màn xem trước (giáo viên
// bỏ tích/sửa câu không ưng) rồi mới gọi addCustomQuizBatch/addCustomFlashcard (custom-quiz.js/
// custom-flashcards.js) như nạp PDF/Excel bình thường — không trùng lặp logic ghi, không mất bước
// duyệt của giáo viên trước khi lưu.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Trần chi phí CỨNG — xem giải thích đầy đủ trong kế hoạch đã thống nhất với giáo viên (dazzling-
// mapping-haven.md lúc soạn tính năng này): 15 trang/lượt, 100 lượt/giáo viên/tháng, độc lập với công
// tắc bật/tắt gói Pro chung (config/monetization) để chi phí AI luôn có trần dù có đổi gì khác.
const MAX_POINTS_PER_REQUEST = 15;
const MONTHLY_CALL_CAP = 100;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 4000;

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

// Bỏ thẻ HTML thô (points[].html có thể chứa <strong>/<sub>/<sup> từ lúc nạp Word/PDF cũ) thành chữ
// thường — AI đọc chữ thường vẫn hiểu đúng nội dung, không cần giữ định dạng.
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ghép "points" của 1 Bài (chữ thường + ảnh trang PDF base64 lẫn lộn, xem doc-import.js) thành các
// "content block" gửi thẳng cho Claude — Claude đọc ảnh trực tiếp được (multimodal), KHÔNG cần OCR
// riêng. Bỏ qua point dạng "table"/"warning" — không hữu ích để soạn câu hỏi, giữ prompt gọn nhẹ.
function buildContentBlocks(points, lessonTitle) {
  const blocks = [{
    type: 'text',
    text: `Đây là nội dung bài giảng "${lessonTitle || '(không có tiêu đề)'}" của 1 lớp học Hoá học phổ thông tại Việt Nam (có thể gồm cả chữ và ảnh chụp trang sách/slide gốc):`
  }];
  points.forEach((pt) => {
    if (typeof pt === 'string') {
      if (pt.trim()) blocks.push({ type: 'text', text: pt.trim() });
      return;
    }
    if (!pt || typeof pt !== 'object') return;
    if (pt.type === 'text' && pt.html) {
      const text = stripHtml(pt.html);
      if (text) blocks.push({ type: 'text', text });
      return;
    }
    if (pt.type === 'image' && pt.dataUri) {
      const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(pt.dataUri);
      if (match) blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }
  });
  return blocks;
}

const QUIZ_TOOL = {
  name: 'return_quiz_questions',
  description: 'Trả về danh sách câu hỏi trắc nghiệm 4 đáp án đã soạn từ nội dung bài giảng.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Nội dung câu hỏi, tiếng Việt' },
            options: {
              type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4,
              description: 'Đúng 4 phương án theo thứ tự A, B, C, D — không tự đánh số/chữ cái vào đầu mỗi phương án'
            },
            correct: { type: 'integer', minimum: 0, maximum: 3, description: 'Chỉ số phương án đúng: 0=A, 1=B, 2=C, 3=D' },
            explain: { type: 'string', description: 'Giải thích ngắn gọn vì sao đáp án đó đúng' }
          },
          required: ['q', 'options', 'correct']
        }
      }
    },
    required: ['questions']
  }
};

const FLASHCARD_TOOL = {
  name: 'return_flashcards',
  description: 'Trả về danh sách flashcard (mặt trước/mặt sau) đã soạn từ nội dung bài giảng.',
  input_schema: {
    type: 'object',
    properties: {
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string', description: 'Mặt trước — thuật ngữ/câu hỏi ngắn gọn, tiếng Việt' },
            back: { type: 'string', description: 'Mặt sau — định nghĩa/câu trả lời ngắn gọn, tiếng Việt' }
          },
          required: ['front', 'back']
        }
      }
    },
    required: ['flashcards']
  }
};

function buildSystemPrompt(mode, count) {
  const kindText = mode === 'quiz' ? `${count} câu hỏi trắc nghiệm 4 đáp án` : `${count} flashcard (mặt trước/mặt sau)`;
  return `Bạn là trợ lý soạn học liệu cho giáo viên Hoá học phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ra CHÍNH XÁC ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, độ khó phù hợp học sinh. Nội dung câu hỏi/flashcard phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài. Luôn gọi đúng 1 tool được cung cấp để trả kết quả — không trả lời bằng văn bản thường, không giải thích thêm ngoài tool.`;
}

exports.generateFromLesson = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'asia-southeast1', timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
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
  const contentBlocks = buildContentBlocks(cappedPoints, lessonTitle);
  const hasRealContent = contentBlocks.some((b) => (b.type === 'text' && b.text.trim()) || b.type === 'image');
  if (!hasRealContent) {
    throw new HttpsError('invalid-argument', 'Không đọc được nội dung bài giảng để tạo câu hỏi/flashcard.');
  }

  const tool = mode === 'quiz' ? QUIZ_TOOL : FLASHCARD_TOOL;
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(mode, safeCount),
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: contentBlocks }]
    });
  } catch (err) {
    logger.error('Lỗi gọi Claude API', err);
    throw new HttpsError('internal', 'Không gọi được AI lúc này, thử lại sau.');
  }

  const toolUse = (response.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!toolUse || !toolUse.input) {
    logger.error('Claude không trả tool_use hợp lệ', response);
    throw new HttpsError('internal', 'AI không trả về kết quả hợp lệ, thử lại.');
  }

  const rawItems = mode === 'quiz' ? toolUse.input.questions : toolUse.input.flashcards;
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new HttpsError('internal', 'AI không tạo được câu hỏi/flashcard nào từ nội dung này.');
  }

  // Lọc lại LẦN CUỐI cho khớp ĐÚNG khuôn addCustomQuizBatch/addCustomFlashcard (custom-quiz.js/
  // custom-flashcards.js) — dù đã ép bằng tool schema, vẫn kiểm tra lại phòng AI trả thiếu field.
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
