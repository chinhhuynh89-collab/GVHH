// Adapter cho Anthropic Claude API. Interface CHUNG — xem gemini.js để đối chiếu. Chỉ hoạt động khi
// secret ANTHROPIC_API_KEY đã được set (firebase functions:secrets:set ANTHROPIC_API_KEY) và
// config/aiProvider (Firestore) chọn provider: "claude".
const Anthropic = require('@anthropic-ai/sdk');

const MAX_OUTPUT_TOKENS = 4000;
const MAX_OUTPUT_TOKENS_LESSONPLAN = 8000; // giáo án dài hơn nhiều so với 1 câu hỏi/flashcard

const LEVEL_ENUM = ['biet', 'hieu', 'vandung', 'vandungcao'];

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
            explain: { type: 'string', description: 'Giải thích ngắn gọn vì sao đáp án đó đúng' },
            level: { type: 'string', enum: LEVEL_ENUM, description: 'Mức độ nhận thức theo Thông tư 22/2021' }
          },
          required: ['q', 'options', 'correct', 'explain', 'level']
        }
      }
    },
    required: ['questions']
  }
};

const ESSAY_TOOL = {
  name: 'return_essay_questions',
  description: 'Trả về danh sách câu hỏi tự luận ngắn (kèm đáp án chấp nhận được) đã soạn từ nội dung bài giảng.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Nội dung câu hỏi tự luận ngắn, tiếng Việt' },
            acceptedAnswers: {
              type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4,
              description: '1-4 cách diễn đạt đáp án đúng được chấp nhận (VD từ đồng nghĩa, viết tắt)'
            },
            explain: { type: 'string', description: 'Giải thích ngắn gọn' },
            level: { type: 'string', enum: LEVEL_ENUM, description: 'Mức độ nhận thức theo Thông tư 22/2021' }
          },
          required: ['q', 'acceptedAnswers', 'explain', 'level']
        }
      }
    },
    required: ['questions']
  }
};

const TRUEFALSE_TOOL = {
  name: 'return_truefalse_questions',
  description: 'Trả về danh sách câu hỏi dạng mệnh đề Đúng/Sai đã soạn từ nội dung bài giảng.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Mệnh đề cần nhận định đúng/sai, tiếng Việt' },
            correct: { type: 'integer', minimum: 0, maximum: 1, description: '0 nếu mệnh đề ĐÚNG, 1 nếu mệnh đề SAI' },
            explain: { type: 'string', description: 'Giải thích ngắn gọn vì sao đúng/sai' },
            level: { type: 'string', enum: LEVEL_ENUM, description: 'Mức độ nhận thức theo Thông tư 22/2021' }
          },
          required: ['q', 'correct', 'explain', 'level']
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

const LESSONPLAN_TOOL = {
  name: 'return_lesson_plan',
  description: 'Trả về giáo án (Kế hoạch bài dạy) theo mẫu Công văn 5512/BGDĐT-GDTrH đã soạn từ nội dung bài giảng.',
  input_schema: {
    type: 'object',
    properties: {
      tenBai: { type: 'string' },
      monHoc: { type: 'string' },
      lop: { type: 'string' },
      soTiet: { type: 'integer' },
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
        description: 'ĐÚNG 4 hoạt động theo thứ tự: Mở đầu, Hình thành kiến thức mới, Luyện tập, Vận dụng',
        items: {
          type: 'object',
          properties: {
            tenHoatDong: { type: 'string' },
            mucTieu: { type: 'string' },
            noiDung: { type: 'string' },
            sanPham: { type: 'string' },
            toChucThucHien: { type: 'string' }
          },
          required: ['tenHoatDong', 'mucTieu', 'noiDung', 'sanPham', 'toChucThucHien']
        }
      }
    },
    required: ['tenBai', 'monHoc', 'lop', 'soTiet', 'mucTieu', 'thietBiDayHoc', 'tienTrinh']
  }
};

function pickTool(mode) {
  if (mode === 'quiz') return QUIZ_TOOL;
  if (mode === 'essay') return ESSAY_TOOL;
  if (mode === 'truefalse') return TRUEFALSE_TOOL;
  if (mode === 'flashcard') return FLASHCARD_TOOL;
  return LESSONPLAN_TOOL;
}

async function generate({ apiKey, model, systemPrompt, parts, mode }) {
  const claudeBlocks = parts.map((p) => (
    p.type === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } }
      : { type: 'text', text: p.text }
  ));
  const anthropic = new Anthropic({ apiKey });
  const tool = pickTool(mode);
  const response = await anthropic.messages.create({
    model,
    max_tokens: mode === 'lessonplan' ? MAX_OUTPUT_TOKENS_LESSONPLAN : MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: claudeBlocks }]
  });
  const toolUse = (response.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!toolUse || !toolUse.input) throw new Error('Claude không trả tool_use hợp lệ');
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') return toolUse.input.questions;
  if (mode === 'flashcard') return toolUse.input.flashcards;
  return [toolUse.input]; // lessonplan: 1 giáo án duy nhất, bọc mảng cho khớp interface chung
}

module.exports = {
  generate,
  secretName: 'ANTHROPIC_API_KEY',
  firestoreKeyField: 'anthropicApiKey',
  defaultModel: 'claude-haiku-4-5-20251001'
};
