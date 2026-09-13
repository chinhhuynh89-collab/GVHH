// Adapter cho Google Gemini API. Interface CHUNG mọi adapter phải theo (xem claude.js để đối chiếu):
//   generate({ apiKey, model, systemPrompt, parts, mode }) -> Promise<rawItems[]>
//   parts: mảng trung lập [{type:'text', text} | {type:'image', mimeType, data(base64)}]
//   mode: 'quiz' | 'essay' | 'truefalse' | 'flashcard' | 'lessonplan'
//   rawItems: mảng thô (chưa lọc field) — với "lessonplan" là mảng 1 phần tử (cả giáo án) — index.js
//   tự lọc/map lại cho khớp khuôn addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan, adapter
//   không cần biết khuôn dữ liệu cuối của app.
//
// LƯU Ý: "@google/genai" chỉ build ESM — require() thường (CJS) đọc SAI thành object rỗng thay vì báo
// lỗi rõ ràng (đã kiểm chứng lúc code), nên bắt buộc dùng import() động (await import(...)) thay vì
// require() cho riêng gói này.
const MAX_OUTPUT_TOKENS = 4000;
const MAX_OUTPUT_TOKENS_LESSONPLAN = 8000; // giáo án dài hơn nhiều so với 1 câu hỏi/flashcard

const LEVEL_ENUM = ['biet', 'hieu', 'vandung', 'vandungcao'];

let _sdk = null;
async function loadSdk() {
  if (!_sdk) _sdk = await import('@google/genai');
  return _sdk;
}

function buildSchemas(Type) {
  const QUIZ_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            q: { type: Type.STRING, description: 'Nội dung câu hỏi, tiếng Việt' },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Đúng 4 phương án theo thứ tự A, B, C, D — không tự đánh số/chữ cái vào đầu mỗi phương án'
            },
            correct: { type: Type.INTEGER, description: 'Chỉ số phương án đúng: 0=A, 1=B, 2=C, 3=D' },
            explain: { type: Type.STRING, description: 'Giải thích ngắn gọn vì sao đáp án đó đúng' },
            level: { type: Type.STRING, enum: LEVEL_ENUM, description: 'Mức độ nhận thức của câu hỏi theo Thông tư 22/2021' }
          },
          required: ['q', 'options', 'correct', 'explain', 'level']
        }
      }
    },
    required: ['questions']
  };

  const ESSAY_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            q: { type: Type.STRING, description: 'Nội dung câu hỏi tự luận ngắn, tiếng Việt' },
            acceptedAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '1-4 cách diễn đạt đáp án đúng được chấp nhận (VD từ đồng nghĩa, viết tắt)'
            },
            explain: { type: Type.STRING, description: 'Giải thích ngắn gọn' },
            level: { type: Type.STRING, enum: LEVEL_ENUM, description: 'Mức độ nhận thức của câu hỏi theo Thông tư 22/2021' }
          },
          required: ['q', 'acceptedAnswers', 'explain', 'level']
        }
      }
    },
    required: ['questions']
  };

  const TRUEFALSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            q: { type: Type.STRING, description: 'Mệnh đề cần nhận định đúng/sai, tiếng Việt' },
            correct: { type: Type.INTEGER, description: '0 nếu mệnh đề ĐÚNG, 1 nếu mệnh đề SAI' },
            explain: { type: Type.STRING, description: 'Giải thích ngắn gọn vì sao đúng/sai' },
            level: { type: Type.STRING, enum: LEVEL_ENUM, description: 'Mức độ nhận thức của câu hỏi theo Thông tư 22/2021' }
          },
          required: ['q', 'correct', 'explain', 'level']
        }
      }
    },
    required: ['questions']
  };

  const FLASHCARD_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      flashcards: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING, description: 'Mặt trước — thuật ngữ/câu hỏi ngắn gọn, tiếng Việt' },
            back: { type: Type.STRING, description: 'Mặt sau — định nghĩa/câu trả lời ngắn gọn, tiếng Việt' }
          },
          required: ['front', 'back']
        }
      }
    },
    required: ['flashcards']
  };

  const LESSONPLAN_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      tenBai: { type: Type.STRING },
      monHoc: { type: Type.STRING },
      lop: { type: Type.STRING },
      soTiet: { type: Type.INTEGER },
      mucTieu: {
        type: Type.OBJECT,
        properties: {
          kienThuc: { type: Type.ARRAY, items: { type: Type.STRING } },
          nangLuc: { type: Type.ARRAY, items: { type: Type.STRING } },
          phamChat: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['kienThuc', 'nangLuc', 'phamChat']
      },
      thietBiDayHoc: { type: Type.ARRAY, items: { type: Type.STRING } },
      tienTrinh: {
        type: Type.ARRAY,
        description: 'ĐÚNG 4 hoạt động theo thứ tự: Mở đầu, Hình thành kiến thức mới, Luyện tập, Vận dụng',
        items: {
          type: Type.OBJECT,
          properties: {
            tenHoatDong: { type: Type.STRING },
            mucTieu: { type: Type.STRING },
            noiDung: { type: Type.STRING },
            sanPham: { type: Type.STRING },
            toChucThucHien: { type: Type.STRING }
          },
          required: ['tenHoatDong', 'mucTieu', 'noiDung', 'sanPham', 'toChucThucHien']
        }
      }
    },
    required: ['tenBai', 'monHoc', 'lop', 'soTiet', 'mucTieu', 'thietBiDayHoc', 'tienTrinh']
  };

  return { QUIZ_SCHEMA, ESSAY_SCHEMA, TRUEFALSE_SCHEMA, FLASHCARD_SCHEMA, LESSONPLAN_SCHEMA };
}

function pickSchema(schemas, mode) {
  if (mode === 'quiz') return schemas.QUIZ_SCHEMA;
  if (mode === 'essay') return schemas.ESSAY_SCHEMA;
  if (mode === 'truefalse') return schemas.TRUEFALSE_SCHEMA;
  if (mode === 'flashcard') return schemas.FLASHCARD_SCHEMA;
  return schemas.LESSONPLAN_SCHEMA;
}

async function generate({ apiKey, model, systemPrompt, parts, mode }) {
  const { GoogleGenAI, Type } = await loadSdk();
  const schemas = buildSchemas(Type);
  const ai = new GoogleGenAI({ apiKey });
  const geminiParts = parts.map((p) => (
    p.type === 'image' ? { inlineData: { mimeType: p.mimeType, data: p.data } } : { text: p.text }
  ));
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: geminiParts }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: pickSchema(schemas, mode),
      maxOutputTokens: mode === 'lessonplan' ? MAX_OUTPUT_TOKENS_LESSONPLAN : MAX_OUTPUT_TOKENS
    }
  });
  const parsed = JSON.parse(response.text);
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') return parsed.questions;
  if (mode === 'flashcard') return parsed.flashcards;
  return [parsed]; // lessonplan: 1 giáo án duy nhất, bọc mảng cho khớp interface chung
}

module.exports = {
  generate,
  secretName: 'GEMINI_API_KEY',
  firestoreKeyField: 'geminiApiKey',
  defaultModel: 'gemini-2.5-flash'
};
