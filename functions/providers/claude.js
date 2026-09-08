// Adapter cho Anthropic Claude API. Interface CHUNG — xem gemini.js để đối chiếu. Chỉ hoạt động khi
// secret ANTHROPIC_API_KEY đã được set (firebase functions:secrets:set ANTHROPIC_API_KEY) và
// config/aiProvider (Firestore) chọn provider: "claude".
const Anthropic = require('@anthropic-ai/sdk');

const MAX_OUTPUT_TOKENS = 4000;

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

async function generate({ apiKey, model, systemPrompt, parts, mode }) {
  const claudeBlocks = parts.map((p) => (
    p.type === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } }
      : { type: 'text', text: p.text }
  ));
  const anthropic = new Anthropic({ apiKey });
  const tool = mode === 'quiz' ? QUIZ_TOOL : FLASHCARD_TOOL;
  const response = await anthropic.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: claudeBlocks }]
  });
  const toolUse = (response.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!toolUse || !toolUse.input) throw new Error('Claude không trả tool_use hợp lệ');
  return mode === 'quiz' ? toolUse.input.questions : toolUse.input.flashcards;
}

module.exports = {
  generate,
  secretName: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-haiku-4-5-20251001'
};
