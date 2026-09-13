// Gọi AI (Gemini/Claude) TRỰC TIẾP từ trình duyệt giáo viên — thay cho Cloud Function
// "generateFromLesson" (functions/index.js, functions/providers/*.js) vì tính năng đó cần nâng cấp gói
// Blaze mới deploy được, nhiều giáo viên gặp khó khi đăng ký thẻ thanh toán quốc tế. Bản này gọi thẳng
// API Gemini/Claude bằng key đọc từ Firestore secureConfig/aiKeys (đã nới quyền đọc cho MỌI người đã
// đăng nhập — xem firebase/firestore.rules) — key NÊN được giới hạn chỉ chạy từ đúng tên miền app
// (HTTP referrer restriction, cấu hình ở Google Cloud Console) để hạn chế bị lấy đi dùng nơi khác. Rủi
// ro tương đương việc học sinh có thể xem đáp án trắc nghiệm qua DevTools mà app đã chấp nhận từ
// trước (xem firebase/HUONG-DAN-TRIEN-KHAI.md).
//
// Toàn bộ phần LƯU nội dung (addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan) KHÔNG đổi gì —
// generateFromLessonClient() chỉ trả về {items}, giữ đúng hình dạng cũ của kết quả Cloud Function để
// chapter-detail.js không phải sửa nhiều.
//
// Logic nghiệp vụ (system prompt, schema, giới hạn lượt dùng) PORT lại từ functions/index.js +
// functions/providers/*.js — KHÔNG xoá Cloud Function cũ, phòng sau này giáo viên nâng cấp Blaze muốn
// chuyển lại dùng cách cũ (giấu key hẳn phía server, bảo mật tốt hơn).

// Đổi sang app môn khác (VD Toán, Lý) CHỈ cần sửa đúng 1 dòng này — xem HUONG-DAN-NHAN-BAN-MON-HOC.md.
const AI_SUBJECT_NAME = 'Hoá học';

const AI_LEVEL_KEYS = ['biet', 'hieu', 'vandung', 'vandungcao'];
const AI_LEVEL_LABELS_VI = { biet: 'Nhận biết', hieu: 'Thông hiểu', vandung: 'Vận dụng', vandungcao: 'Vận dụng cao' };
const AI_MODE_LABELS_VI = { quiz: 'trắc nghiệm', essay: 'tự luận', truefalse: 'Đúng/Sai', flashcard: 'flashcard', lessonplan: 'giáo án' };
const AI_MAX_OUTPUT_TOKENS = 4000;
const AI_MAX_OUTPUT_TOKENS_LESSONPLAN = 8000;
const AI_LIMITS_DEFAULT = {
  monthlyCallCap: 100, dailyCallCap: 20, maxPointsPerRequest: 15,
  dailyCapByMode: { quiz: 10, essay: 10, flashcard: 10, lessonplan: 3 }
};
const AI_DEFAULT_MODEL_BY_PROVIDER = { gemini: 'gemini-2.5-flash', claude: 'claude-haiku-4-5-20251001' };

function aiSumLevels(levels) {
  return AI_LEVEL_KEYS.reduce((s, k) => s + (parseInt(levels && levels[k], 10) || 0), 0);
}

function aiStripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ghép "points" của 1 Bài (chữ thường + ảnh trang PDF base64 lẫn lộn, xem doc-import.js) thành mảng
// "part" trung lập gửi cho AI — bỏ qua point dạng "table"/"warning" — không hữu ích để soạn nội dung.
function aiBuildContentParts(points, lessonTitle) {
  const parts = [{
    type: 'text',
    text: `Đây là nội dung bài giảng "${lessonTitle || '(không có tiêu đề)'}" của 1 lớp học ${AI_SUBJECT_NAME} phổ thông tại Việt Nam (có thể gồm cả chữ và ảnh chụp trang sách/slide gốc):`
  }];
  points.forEach((pt) => {
    if (typeof pt === 'string') {
      if (pt.trim()) parts.push({ type: 'text', text: pt.trim() });
      return;
    }
    if (!pt || typeof pt !== 'object') return;
    if (pt.type === 'text' && pt.html) {
      const text = aiStripHtml(pt.html);
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

function aiBuildSystemPrompt(mode, params) {
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') {
    const total = aiSumLevels(params.levels);
    const breakdown = AI_LEVEL_KEYS
      .filter((k) => (parseInt(params.levels[k], 10) || 0) > 0)
      .map((k) => `${params.levels[k]} câu mức "${AI_LEVEL_LABELS_VI[k]}"`)
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
    return `Bạn là trợ lý soạn học liệu cho giáo viên ${AI_SUBJECT_NAME} phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ĐÚNG ${total} ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, phân bố CHÍNH XÁC theo mức độ nhận thức (Thông tư 22/2021/TT-BGDĐT): ${breakdown}. Mỗi câu phải gắn đúng field "level" tương ứng đúng như số lượng đã yêu cầu ở trên.${extra} Nội dung câu hỏi phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
  }
  if (mode === 'flashcard') {
    return `Bạn là trợ lý soạn học liệu cho giáo viên ${AI_SUBJECT_NAME} phổ thông tại Việt Nam. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó — hãy soạn ra CHÍNH XÁC ${params.count} flashcard (mặt trước/mặt sau) bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, độ khó phù hợp học sinh. Nội dung flashcard phải bám sát bài giảng đã cho, không hỏi kiến thức không xuất hiện trong bài.`;
  }
  return `Bạn là giáo viên ${AI_SUBJECT_NAME} giàu kinh nghiệm tại Việt Nam, soạn Kế hoạch bài dạy (giáo án) theo ĐÚNG cấu trúc mẫu quy định tại Công văn 5512/BGDĐT-GDTrH của Bộ Giáo dục và Đào tạo, cho lớp ${params.lop}, thời lượng ${params.soTiet} tiết. Dựa ĐÚNG vào nội dung bài giảng được cung cấp — KHÔNG bịa thêm kiến thức ngoài nội dung đó. Giáo án gồm: (I) Mục tiêu (Kiến thức, Năng lực, Phẩm chất — viết theo Chương trình GDPT 2018), (II) Thiết bị dạy học và học liệu, (III) Tiến trình dạy học gồm ĐÚNG 4 hoạt động theo thứ tự cố định: "Hoạt động 1: Mở đầu", "Hoạt động 2: Hình thành kiến thức mới", "Hoạt động 3: Luyện tập", "Hoạt động 4: Vận dụng" — mỗi hoạt động nêu rõ mục tiêu, nội dung, sản phẩm, tổ chức thực hiện. Viết bằng tiếng Việt, ngôn ngữ sư phạm chuẩn mực, cụ thể, có thể áp dụng trực tiếp vào lớp học.`;
}

// ---------- Schema ép JSON có cấu trúc — Gemini dùng type chữ HOA (REST API), Claude dùng JSON Schema
// chuẩn (chữ thường) qua cơ chế "tool use". ----------
function aiGeminiSchema(mode) {
  if (mode === 'quiz' || mode === 'truefalse') {
    const props = {
      q: { type: 'STRING' },
      correct: { type: 'INTEGER' },
      explain: { type: 'STRING' },
      level: { type: 'STRING', enum: AI_LEVEL_KEYS }
    };
    if (mode === 'quiz') props.options = { type: 'ARRAY', items: { type: 'STRING' } };
    return {
      type: 'OBJECT',
      properties: { questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: props, required: Object.keys(props) } } },
      required: ['questions']
    };
  }
  if (mode === 'essay') {
    return {
      type: 'OBJECT',
      properties: {
        questions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              q: { type: 'STRING' },
              acceptedAnswers: { type: 'ARRAY', items: { type: 'STRING' } },
              explain: { type: 'STRING' },
              level: { type: 'STRING', enum: AI_LEVEL_KEYS }
            },
            required: ['q', 'acceptedAnswers', 'explain', 'level']
          }
        }
      },
      required: ['questions']
    };
  }
  if (mode === 'flashcard') {
    return {
      type: 'OBJECT',
      properties: {
        flashcards: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] }
        }
      },
      required: ['flashcards']
    };
  }
  // lessonplan
  return {
    type: 'OBJECT',
    properties: {
      tenBai: { type: 'STRING' }, monHoc: { type: 'STRING' }, lop: { type: 'STRING' }, soTiet: { type: 'INTEGER' },
      mucTieu: {
        type: 'OBJECT',
        properties: {
          kienThuc: { type: 'ARRAY', items: { type: 'STRING' } },
          nangLuc: { type: 'ARRAY', items: { type: 'STRING' } },
          phamChat: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['kienThuc', 'nangLuc', 'phamChat']
      },
      thietBiDayHoc: { type: 'ARRAY', items: { type: 'STRING' } },
      tienTrinh: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            tenHoatDong: { type: 'STRING' }, mucTieu: { type: 'STRING' }, noiDung: { type: 'STRING' },
            sanPham: { type: 'STRING' }, toChucThucHien: { type: 'STRING' }
          },
          required: ['tenHoatDong', 'mucTieu', 'noiDung', 'sanPham', 'toChucThucHien']
        }
      }
    },
    required: ['tenBai', 'monHoc', 'lop', 'soTiet', 'mucTieu', 'thietBiDayHoc', 'tienTrinh']
  };
}

function aiClaudeTool(mode) {
  if (mode === 'quiz' || mode === 'truefalse') {
    const props = {
      q: { type: 'string' },
      correct: { type: 'integer' },
      explain: { type: 'string' },
      level: { type: 'string', enum: AI_LEVEL_KEYS }
    };
    if (mode === 'quiz') props.options = { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 };
    return {
      name: mode === 'quiz' ? 'return_quiz_questions' : 'return_truefalse_questions',
      description: 'Trả về danh sách câu hỏi đã soạn từ nội dung bài giảng.',
      input_schema: {
        type: 'object',
        properties: { questions: { type: 'array', items: { type: 'object', properties: props, required: Object.keys(props) } } },
        required: ['questions']
      }
    };
  }
  if (mode === 'essay') {
    return {
      name: 'return_essay_questions',
      description: 'Trả về danh sách câu hỏi tự luận đã soạn từ nội dung bài giảng.',
      input_schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                acceptedAnswers: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
                explain: { type: 'string' },
                level: { type: 'string', enum: AI_LEVEL_KEYS }
              },
              required: ['q', 'acceptedAnswers', 'explain', 'level']
            }
          }
        },
        required: ['questions']
      }
    };
  }
  if (mode === 'flashcard') {
    return {
      name: 'return_flashcards',
      description: 'Trả về danh sách flashcard đã soạn từ nội dung bài giảng.',
      input_schema: {
        type: 'object',
        properties: {
          flashcards: {
            type: 'array',
            items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'] }
          }
        },
        required: ['flashcards']
      }
    };
  }
  return {
    name: 'return_lesson_plan',
    description: 'Trả về giáo án (Kế hoạch bài dạy) theo mẫu Công văn 5512/BGDĐT-GDTrH.',
    input_schema: {
      type: 'object',
      properties: {
        tenBai: { type: 'string' }, monHoc: { type: 'string' }, lop: { type: 'string' }, soTiet: { type: 'integer' },
        mucTieu: {
          type: 'object',
          properties: {
            kienThuc: { type: 'array', items: { type: 'string' } },
            nangLuc: { type: 'array', items: { type: 'string' } },
            phamChat: { type: 'array', items: { type: 'string' } }
          },
          required: ['kienThuc', 'nangLuc', 'phamChat']
        },
        thietBiDayHoc: { type: 'array', items: { type: 'string' } },
        tienTrinh: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tenHoatDong: { type: 'string' }, mucTieu: { type: 'string' }, noiDung: { type: 'string' },
              sanPham: { type: 'string' }, toChucThucHien: { type: 'string' }
            },
            required: ['tenHoatDong', 'mucTieu', 'noiDung', 'sanPham', 'toChucThucHien']
          }
        }
      },
      required: ['tenBai', 'monHoc', 'lop', 'soTiet', 'mucTieu', 'thietBiDayHoc', 'tienTrinh']
    }
  };
}

// ---------- Gọi thẳng REST API — cả 2 hãng đều hỗ trợ CORS cho lượt gọi trực tiếp từ trình duyệt
// (Claude cần thêm header "anthropic-dangerous-direct-browser-access", đúng tên Anthropic đặt cho cơ
// chế này — không phải dấu hiệu lỗi/nguy hiểm, chỉ là tên header xác nhận CHỦ Ý gọi từ trình duyệt).
// ----------
async function aiCallGeminiDirect({ apiKey, model, systemPrompt, parts, mode }) {
  const geminiParts = parts.map((p) => (
    p.type === 'image' ? { inlineData: { mimeType: p.mimeType, data: p.data } } : { text: p.text }
  ));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: geminiParts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: aiGeminiSchema(mode),
        maxOutputTokens: mode === 'lessonplan' ? AI_MAX_OUTPUT_TOKENS_LESSONPLAN : AI_MAX_OUTPUT_TOKENS
      }
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `Lỗi HTTP ${res.status}`);
  const candidate = data && data.candidates && data.candidates[0];
  const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
  if (!text) throw new Error('AI không trả về nội dung.');
  const parsed = JSON.parse(text);
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') return parsed.questions;
  if (mode === 'flashcard') return parsed.flashcards;
  return [parsed];
}

async function aiCallClaudeDirect({ apiKey, model, systemPrompt, parts, mode }) {
  const claudeBlocks = parts.map((p) => (
    p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } } : { type: 'text', text: p.text }
  ));
  const tool = aiClaudeTool(mode);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: mode === 'lessonplan' ? AI_MAX_OUTPUT_TOKENS_LESSONPLAN : AI_MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: claudeBlocks }]
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `Lỗi HTTP ${res.status}`);
  const toolUse = (data && data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!toolUse || !toolUse.input) throw new Error('Claude không trả tool_use hợp lệ.');
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') return toolUse.input.questions;
  if (mode === 'flashcard') return toolUse.input.flashcards;
  return [toolUse.input];
}

function aiIsValidLevel(v) { return AI_LEVEL_KEYS.includes(v); }

// Lọc lại LẦN CUỐI cho khớp ĐÚNG khuôn addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan — y
// hệt normalizeItems() cũ trong functions/index.js.
function aiNormalizeItems(mode, rawItems) {
  if (mode === 'quiz') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Array.isArray(it.options) && it.options.length === 4 && Number.isInteger(it.correct) && it.correct >= 0 && it.correct <= 3)
      .map((it) => {
        const q = { q: it.q, type: 'abcd', options: it.options, correct: it.correct, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (aiIsValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'essay') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Array.isArray(it.acceptedAnswers) && it.acceptedAnswers.some((a) => typeof a === 'string' && a.trim()))
      .map((it) => {
        const acceptedAnswers = it.acceptedAnswers.filter((a) => typeof a === 'string' && a.trim()).join('|');
        const q = { q: it.q, type: 'text', acceptedAnswers, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (aiIsValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'truefalse') {
    return rawItems
      .filter((it) => it && typeof it.q === 'string' && Number.isInteger(it.correct) && (it.correct === 0 || it.correct === 1))
      .map((it) => {
        const q = { q: it.q, type: 'truefalse', options: ['Đúng', 'Sai'], correct: it.correct, explain: typeof it.explain === 'string' ? it.explain : '' };
        if (aiIsValidLevel(it.level)) q.level = it.level;
        return q;
      });
  }
  if (mode === 'flashcard') {
    return rawItems.filter((it) => it && typeof it.front === 'string' && typeof it.back === 'string')
      .map((it) => ({ front: it.front, back: it.back }));
  }
  return rawItems.filter((it) => (
    it && typeof it.tenBai === 'string' &&
    it.mucTieu && Array.isArray(it.mucTieu.kienThuc) && Array.isArray(it.mucTieu.nangLuc) && Array.isArray(it.mucTieu.phamChat) &&
    Array.isArray(it.thietBiDayHoc) &&
    Array.isArray(it.tienTrinh) && it.tienTrinh.length > 0
  ));
}

// ---------- Đếm + chặn vượt trần lượt dùng — TỪNG giáo viên chỉ đọc/ghi được đúng bản ghi của mình
// (xem firebase/firestore.rules: match /aiUsage/{uid}). Theo dõi cả tháng lẫn ngày lẫn từng loại
// ("mode") riêng, y hệt logic cũ trong functions/index.js. ----------
async function aiCheckAndIncrementUsage(uid, mode, aiLimits) {
  const { db } = ensureFirebase();
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const dayKey = now.toISOString().slice(0, 10);
  const ref = db.collection('aiUsage').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const monthCount = data.monthKey === monthKey ? (data.count || 0) : 0;
    const sameDayData = data.dayKey === dayKey;
    const dayCount = sameDayData ? (data.dailyCount || 0) : 0;
    const dayByMode = sameDayData ? (data.dailyCountByMode || {}) : {};
    const modeCount = dayByMode[mode] || 0;

    if (monthCount >= aiLimits.monthlyCallCap) {
      throw new Error(`Đã dùng hết ${aiLimits.monthlyCallCap} lượt tạo bằng AI trong tháng này — thử lại vào tháng sau.`);
    }
    if (dayCount >= aiLimits.dailyCallCap) {
      throw new Error(`Đã dùng hết ${aiLimits.dailyCallCap} lượt tạo bằng AI hôm nay — thử lại vào ngày mai.`);
    }
    const modeCap = aiLimits.dailyCapByMode[mode];
    if (typeof modeCap === 'number' && modeCount >= modeCap) {
      throw new Error(`Đã dùng hết ${modeCap} lượt tạo ${AI_MODE_LABELS_VI[mode] || mode} hôm nay — thử lại vào ngày mai hoặc chọn loại khác.`);
    }

    tx.set(ref, {
      monthKey, count: monthCount + 1,
      dayKey, dailyCount: dayCount + 1,
      dailyCountByMode: Object.assign({}, dayByMode, { [mode]: modeCount + 1 }),
      updatedAt: now.toISOString()
    }, { merge: true });
  });
}

// Đọc nhà cung cấp/model đang chọn (config/aiProvider, công khai đọc) + API key tương ứng
// (secureConfig/aiKeys, đọc được vì đã đăng nhập — xem firestore.rules).
async function aiGetActiveProviderAndKey() {
  const { db } = ensureFirebase();
  const [providerSnap, keysSnap] = await Promise.all([
    db.collection('config').doc('aiProvider').get(),
    db.collection('secureConfig').doc('aiKeys').get()
  ]);
  const providerData = providerSnap.exists ? providerSnap.data() : {};
  const provider = providerData.provider === 'claude' ? 'claude' : 'gemini';
  const model = providerData.model || AI_DEFAULT_MODEL_BY_PROVIDER[provider];
  const keysData = keysSnap.exists ? keysSnap.data() : {};
  const apiKey = provider === 'claude' ? keysData.anthropicApiKey : keysData.geminiApiKey;
  return { provider, model, apiKey };
}

async function aiCallProvider(provider, args) {
  return provider === 'claude' ? aiCallClaudeDirect(args) : aiCallGeminiDirect(args);
}

// ---------- Hàm chính — THAY THẾ lượt gọi Cloud Function generateFromLesson cũ. Trả về { items } y
// hệt hình dạng cũ để chapter-detail.js không phải sửa nhiều. ----------
async function generateFromLessonClient(data) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { mode, points, lessonTitle } = data || {};

  if (!['quiz', 'essay', 'truefalse', 'flashcard', 'lessonplan'].includes(mode)) {
    throw new Error('Thiếu hoặc sai "mode".');
  }
  if (!Array.isArray(points) || !points.length) {
    throw new Error('Thiếu nội dung bài giảng để tạo nội dung.');
  }

  let params;
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') {
    const levels = data.levels || {};
    const safeLevels = {};
    AI_LEVEL_KEYS.forEach((k) => { safeLevels[k] = Math.min(Math.max(parseInt(levels[k], 10) || 0, 0), 15); });
    const total = aiSumLevels(safeLevels);
    if (total < 1 || total > 20) throw new Error('Tổng số câu theo các mức độ phải từ 1 đến 20.');
    params = { levels: safeLevels };
  } else if (mode === 'flashcard') {
    params = { count: Math.min(Math.max(parseInt(data.count, 10) || 10, 1), 20) };
  } else {
    const lop = String(data.lop || '').trim();
    const soTiet = Math.min(Math.max(parseInt(data.soTiet, 10) || 1, 1), 10);
    if (!lop) throw new Error('Thiếu "Lớp" để soạn giáo án.');
    params = { lop, soTiet };
  }

  // Khoá tính năng (Pro/miễn phí) — dùng CHUNG enforceFeatureLock đã có cho mọi tính năng khác.
  if (typeof enforceFeatureLock === 'function') await enforceFeatureLock(teacher.uid, 'aiGenerate');

  const cfg = typeof getMonetizationConfig === 'function' ? await getMonetizationConfig() : null;
  const aiLimits = (cfg && cfg.aiLimits) || AI_LIMITS_DEFAULT;
  await aiCheckAndIncrementUsage(teacher.uid, mode, aiLimits);

  const cappedPoints = points.slice(0, aiLimits.maxPointsPerRequest);
  const contentParts = aiBuildContentParts(cappedPoints, lessonTitle);
  const hasRealContent = contentParts.some((p) => (p.type === 'text' && p.text.trim()) || p.type === 'image');
  if (!hasRealContent) throw new Error('Không đọc được nội dung bài giảng để tạo nội dung.');

  const { provider, model, apiKey } = await aiGetActiveProviderAndKey();
  if (!apiKey) {
    throw new Error(`Chưa cấu hình API key cho nhà cung cấp AI "${provider}" — báo admin vào trang Quản trị → Cấu hình AI để dán key.`);
  }

  let rawItems;
  try {
    rawItems = await aiCallProvider(provider, { apiKey, model, systemPrompt: aiBuildSystemPrompt(mode, params), parts: contentParts, mode });
  } catch (err) {
    throw new Error('Không gọi được AI lúc này: ' + err.message);
  }
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('AI không tạo được nội dung nào từ bài giảng này.');

  const items = aiNormalizeItems(mode, rawItems);
  if (!items.length) throw new Error('AI trả về kết quả không đúng định dạng, thử lại.');
  return { items };
}
