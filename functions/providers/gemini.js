// Adapter cho Google Gemini API. Interface CHUNG mọi adapter phải theo (xem claude.js để đối chiếu):
//   generate({ apiKey, model, systemPrompt, parts, mode }) -> Promise<rawItems[]>
//   parts: mảng trung lập [{type:'text', text} | {type:'image', mimeType, data(base64)}]
//   rawItems: mảng thô (chưa lọc field) — index.js tự lọc/map lại cho khớp khuôn addCustomQuizBatch/
//   addCustomFlashcard, adapter không cần biết khuôn dữ liệu cuối của app.
//
// LƯU Ý: "@google/genai" chỉ build ESM — require() thường (CJS) đọc SAI thành object rỗng thay vì báo
// lỗi rõ ràng (đã kiểm chứng lúc code), nên bắt buộc dùng import() động (await import(...)) thay vì
// require() cho riêng gói này.
const MAX_OUTPUT_TOKENS = 4000;

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
            explain: { type: Type.STRING, description: 'Giải thích ngắn gọn vì sao đáp án đó đúng' }
          },
          required: ['q', 'options', 'correct', 'explain']
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

  return { QUIZ_SCHEMA, FLASHCARD_SCHEMA };
}

async function generate({ apiKey, model, systemPrompt, parts, mode }) {
  const { GoogleGenAI, Type } = await loadSdk();
  const { QUIZ_SCHEMA, FLASHCARD_SCHEMA } = buildSchemas(Type);
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
      responseSchema: mode === 'quiz' ? QUIZ_SCHEMA : FLASHCARD_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS
    }
  });
  const parsed = JSON.parse(response.text);
  return mode === 'quiz' ? parsed.questions : parsed.flashcards;
}

module.exports = {
  generate,
  secretName: 'GEMINI_API_KEY',
  defaultModel: 'gemini-2.5-flash'
};
