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
const AI_MODE_LABELS_VI = { quiz: 'trắc nghiệm', essay: 'tự luận', truefalse: 'Đúng/Sai', flashcard: 'flashcard', lessonplan: 'giáo án', quizrecognize: 'nhận diện câu hỏi từ PDF' };
// Tăng từ 4000/8000 lên 6000/10000 — prompt mới yêu cầu giải thích/tích hợp nội dung chi tiết hơn
// hẳn, ngân sách cũ dễ bị cắt giữa chừng (đặc biệt giáo án + tự luận nhiều bước giải).
const AI_MAX_OUTPUT_TOKENS = 6000;
const AI_MAX_OUTPUT_TOKENS_LESSONPLAN = 10000;
// Đề thi thật có thể có 30-50 câu (nhiều hơn hẳn 20 câu tối đa của mode "quiz" tự soạn) — cần ngân sách
// riêng lớn hơn để không bị cắt cụt giữa chừng khi nhận diện nguyên 1 đề dài. Chữ tiếng Việt có dấu tốn
// nhiều token/ký tự hơn hẳn tiếng Anh (bộ mã hoá tách nhỏ theo byte UTF-8) nên vẫn có thể bị cắt với đề
// rất dài — xem aiRecoverTruncatedArray bên dưới để cứu lại phần đã tạo được thay vì mất trắng cả lượt.
const AI_MAX_OUTPUT_TOKENS_QUIZRECOGNIZE = 24000;
function aiMaxOutputTokensFor(mode) {
  if (mode === 'lessonplan') return AI_MAX_OUTPUT_TOKENS_LESSONPLAN;
  if (mode === 'quizrecognize') return AI_MAX_OUTPUT_TOKENS_QUIZRECOGNIZE;
  return AI_MAX_OUTPUT_TOKENS;
}
const AI_LIMITS_DEFAULT = {
  monthlyCallCap: 100, dailyCallCap: 20, maxPointsPerRequest: 15, maxQuestionsPerRequest: 20,
  // Riêng cho "Nhận diện câu hỏi từ PDF" — số TRANG ĐỀ THI tối đa xử lý/lượt (khác maxPointsPerRequest ở
  // trên, dùng cho "điểm" bài giảng) — giờ xử lý theo NHÓM vài trang/lượt gọi API (xem
  // AI_QUIZRECOGNIZE_PAGES_PER_CALL) nên chịu được số trang lớn hơn hẳn mà không lo cắt cụt.
  maxPdfPagesForRecognize: 40,
  dailyCapByMode: { quiz: 10, essay: 10, flashcard: 10, lessonplan: 3, quizrecognize: 5 }
};
// gemini-2.5-flash bị Google ngừng cấp cho user mới (2026) -> đổi mặc định sang gemini-3.6-flash.
const AI_DEFAULT_MODEL_BY_PROVIDER = { gemini: 'gemini-3.6-flash', claude: 'claude-haiku-4-5-20251001' };

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

// Khung persona + yêu cầu "đọc kỹ trước khi soạn" dùng chung cho mọi mode — mục tiêu: ép AI bám CHI
// TIẾT CỤ THỂ có trong bài giảng (số liệu, tên chất, công thức, phương trình, ví dụ...) thay vì soạn
// nội dung chung chung/khuôn mẫu có thể dùng cho bài nào cũng được (lỗi người dùng phản ánh: "chưa sát
// nội dung bài giảng", "giáo án chưa tích hợp nội dung bài giảng vào").
const AI_PERSONA_PREFIX = `Bạn là một Giáo sư ${AI_SUBJECT_NAME} có nhiều năm kinh nghiệm giảng dạy phổ thông tại Việt Nam, am hiểu sâu Chương trình GDPT 2018 và đã biên soạn hàng trăm giáo án/đề kiểm tra đạt chuẩn Sở/Bộ GD&ĐT. Trước khi soạn, hãy ĐỌC KỸ TOÀN BỘ nội dung bài giảng được cung cấp bên dưới (kể cả chữ và ảnh chụp trang sách/slide nếu có) để nắm chắc các khái niệm, số liệu, công thức, phương trình phản ứng, ví dụ cụ thể xuất hiện trong bài — đây là nguồn DUY NHẤT bạn được dùng, KHÔNG bịa thêm kiến thức ngoài nội dung đó.`;

function aiBuildSystemPrompt(mode, params) {
  if (mode === 'quizrecognize') {
    return `${AI_PERSONA_PREFIX}

Nhiệm vụ: đây là ảnh chụp các trang của 1 ĐỀ THI TRẮC NGHIỆM ${AI_SUBJECT_NAME} có sẵn (không phải bài giảng) — nhiệm vụ của bạn là TRÍCH XUẤT CHÍNH XÁC từng câu hỏi trắc nghiệm 4 đáp án có trong đề, tuyệt đối KHÔNG tự sáng tác câu hỏi mới, KHÔNG sửa/rút gọn/diễn giải lại nội dung.

Yêu cầu bắt buộc:
1. Chép lại NGUYÊN VĂN đề bài và 4 phương án A/B/C/D của MỖI câu hỏi tìm thấy trong ảnh — giữ đúng 100% số liệu, công thức hoá học (ký hiệu, chỉ số trên/dưới, mũi tên phản ứng, đơn vị đo...), không bỏ sót câu nào, không đổi thứ tự các phương án.
2. QUAN TRỌNG — trước khi tự giải bất kỳ câu nào, PHẢI so sánh KỸ 4 phương án A/B/C/D với nhau để tìm dấu hiệu giáo viên đã tự đánh dấu đáp án đúng sẵn trong file gốc. Dấu hiệu có thể RẤT TINH TẾ, gồm (không giới hạn): màu nền/màu chữ khác biệt (dù chỉ khác nhẹ so với 3 phương án còn lại), chữ in đậm/in nghiêng khác biệt, gạch chân, khoanh tròn/đóng khung quanh 1 phương án, hoặc ký hiệu đi kèm như "(*)", "✓", "X", "→" ngay trước/sau 1 phương án. Nếu thấy BẤT KỲ dấu hiệu nào như vậy — dù nhỏ — field "correct" PHẢI lấy đúng theo phương án đó, field "correctSource" = "highlight".
3. CHỈ khi đã so sánh kỹ cả 4 phương án và chắc chắn KHÔNG có bất kỳ dấu hiệu khác biệt nào giữa chúng — mới tự giải bài toán/câu hỏi hoá học đó bằng kiến thức chuyên môn để xác định đáp án đúng nhất, field "correctSource" = "solved".
4. Field "explain" PHẢI viết THẬT NGẮN (tối đa 1 câu, khoảng 10-15 từ) — chỉ nêu lý do cốt lõi, không viết dài dòng, để dành ngân sách phản hồi xử lý được NHIỀU câu hỏi hơn trong 1 lượt (đề dài có thể tới 40-50 câu).
5. CHỈ trích các câu trắc nghiệm có ĐỦ 4 phương án A/B/C/D — bỏ qua câu tự luận, câu điền khuyết, trang bìa/trang trắng không có câu hỏi nào.`;
  }
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
    return `${AI_PERSONA_PREFIX}

Nhiệm vụ: soạn ĐÚNG ${total} ${kindText} bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, phân bố CHÍNH XÁC theo mức độ nhận thức (Thông tư 22/2021/TT-BGDĐT): ${breakdown}. Mỗi câu gắn đúng field "level" tương ứng.

Yêu cầu bắt buộc để câu hỏi CHẤT LƯỢNG, SÁT bài giảng:
1. MỖI câu hỏi PHẢI dựa trên 1 chi tiết CỤ THỂ có thật trong bài giảng đã cho (số liệu, tên chất, công thức hoá học, phương trình phản ứng, ví dụ, hiện tượng, tính chất... được nêu trong bài) — cấm soạn câu hỏi chung chung, sáo rỗng, có thể tráo dùng cho bất kỳ bài học nào khác.
2. Câu mức "Vận dụng"/"Vận dụng cao" PHẢI yêu cầu học sinh áp dụng kiến thức trong bài (tính toán số liệu cụ thể, viết/cân bằng phương trình, giải thích hiện tượng, so sánh) — không chỉ hỏi lại định nghĩa/khái niệm suông.
3. Đáp án nhiễu (các phương án sai) phải hợp lý, dựa trên lỗi hiểu sai thường gặp của học sinh về ĐÚNG nội dung bài này, không phải phương án sai vô nghĩa.
4. Thuật ngữ, ký hiệu hoá học, đơn vị đo phải chính xác tuyệt đối.${extra}`;
  }
  if (mode === 'flashcard') {
    return `${AI_PERSONA_PREFIX}

Nhiệm vụ: soạn CHÍNH XÁC ${params.count} flashcard (mặt trước/mặt sau) bằng tiếng Việt, đúng chương trình phổ thông Việt Nam, độ khó phù hợp học sinh.

Yêu cầu bắt buộc:
1. Mặt trước ("front") là 1 khái niệm/thuật ngữ/công thức/câu hỏi ngắn LẤY TRỰC TIẾP từ nội dung bài giảng đã cho — không tự nghĩ ra khái niệm ngoài bài.
2. Mặt sau ("back") là câu trả lời/giải thích chính xác, ngắn gọn, đúng như bài giảng trình bày (giữ đúng số liệu, công thức, tên gọi nếu có).
3. Ưu tiên các khái niệm/công thức QUAN TRỌNG NHẤT của bài, tránh trùng lặp ý, tránh chọn chi tiết phụ không đáng ghi nhớ.`;
  }
  return `${AI_PERSONA_PREFIX}

Nhiệm vụ: soạn Kế hoạch bài dạy (giáo án) theo ĐÚNG cấu trúc mẫu quy định tại Công văn 5512/BGDĐT-GDTrH của Bộ Giáo dục và Đào tạo, cho lớp ${params.lop}, thời lượng ${params.soTiet} tiết, gồm:
(I) Mục tiêu (Kiến thức, Năng lực, Phẩm chất — theo Chương trình GDPT 2018): PHẢI liệt kê ĐÚNG các đơn vị kiến thức CỤ THỂ xuất hiện trong bài giảng (tên khái niệm, công thức, phản ứng...), không viết mục tiêu chung chung kiểu "hiểu được kiến thức của bài".
(II) Thiết bị dạy học và học liệu.
(III) Tiến trình dạy học — ĐÚNG 4 hoạt động theo thứ tự cố định: "Hoạt động 1: Mở đầu", "Hoạt động 2: Hình thành kiến thức mới", "Hoạt động 3: Luyện tập", "Hoạt động 4: Vận dụng".

Yêu cầu bắt buộc để giáo án TÍCH HỢP THẬT SỰ nội dung bài giảng (không phải khung sáo rỗng):
1. "Hoạt động 2: Hình thành kiến thức mới" BẮT BUỘC phải trình bày TRỰC TIẾP đúng trình tự, khái niệm, số liệu, công thức, phương trình phản ứng, ví dụ CÓ THẬT trong bài giảng đã cho — chia thành các đơn vị kiến thức con bám sát cấu trúc bài giảng gốc (VD nếu bài có mục "1. ...", "2. ..." thì hoạt động này cũng chia theo đúng các mục đó). Mỗi bước "tổ chức thực hiện" phải nêu RÕ giáo viên trình bày/đặt câu hỏi về khái niệm/công thức/phản ứng CỤ THỂ nào, không viết chung chung "giáo viên trình bày khái niệm...".
2. "Hoạt động 3: Luyện tập" và "Hoạt động 4: Vận dụng" phải đưa ra bài tập/câu hỏi/tình huống dựa ĐÚNG trên kiến thức vừa trình bày ở Hoạt động 2 (dùng lại đúng số liệu, chất, phản ứng đã xuất hiện trong bài), không phải bài tập chung chung không liên quan.
3. Mỗi hoạt động nêu rõ mục tiêu, nội dung, sản phẩm, tổ chức thực hiện.
4. Viết tiếng Việt, ngôn ngữ sư phạm chuẩn mực, cụ thể, áp dụng trực tiếp được vào lớp học — không viết placeholder kiểu "..." hay "(bổ sung sau)".`;
}

// ---------- Schema ép JSON có cấu trúc — Gemini dùng type chữ HOA (REST API), Claude dùng JSON Schema
// chuẩn (chữ thường) qua cơ chế "tool use". ----------
function aiGeminiSchema(mode) {
  if (mode === 'quizrecognize') {
    const props = {
      q: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correct: { type: 'INTEGER' },
      correctSource: { type: 'STRING', enum: ['highlight', 'solved'] },
      explain: { type: 'STRING' }
    };
    return {
      type: 'OBJECT',
      properties: { questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: props, required: Object.keys(props) } } },
      required: ['questions']
    };
  }
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
  if (mode === 'quizrecognize') {
    return {
      name: 'return_recognized_quiz_questions',
      description: 'Trả về danh sách câu hỏi trắc nghiệm đã nhận diện chính xác từ ảnh đề thi.',
      input_schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                correct: { type: 'integer' },
                correctSource: { type: 'string', enum: ['highlight', 'solved'] },
                explain: { type: 'string' }
              },
              required: ['q', 'options', 'correct', 'correctSource', 'explain']
            }
          }
        },
        required: ['questions']
      }
    };
  }
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

// Field JSON chứa mảng kết quả theo từng mode — dùng để CỨU LẠI 1 phần kết quả khi phản hồi AI bị cắt
// cụt giữa chừng (hết ngân sách token, hay gặp với đề thi dài nhiều câu) thay vì mất trắng cả lượt gọi.
// lessonplan trả về 1 OBJECT lớn (không phải mảng) nên không cứu được từng phần — null.
const AI_ARRAY_FIELD_BY_MODE = { quiz: 'questions', essay: 'questions', truefalse: 'questions', quizrecognize: 'questions', flashcard: 'flashcards', lessonplan: null };

// JSON bị cắt cụt giữa chừng (thường do hết maxOutputTokens) làm JSON.parse() lỗi toàn bộ dù phần lớn
// nội dung đã sinh ra hợp lệ — quét thủ công để lấy lại các phần tử ĐÃ HOÀN CHỈNH trong mảng
// "arrayField" (theo dõi độ sâu ngoặc {} + trạng thái trong/ngoài chuỗi để không đếm nhầm dấu ngoặc bên
// trong chuỗi), bỏ phần tử cuối cùng dở dang. Trả về mảng rỗng nếu không cứu được gì (VD lỗi xảy ra
// trước cả khi bắt đầu mảng).
function aiRecoverTruncatedArray(text, arrayField) {
  if (!arrayField) return [];
  const marker = `"${arrayField}"`;
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return [];
  const arrStart = text.indexOf('[', markerIdx);
  if (arrStart === -1) return [];

  const recovered = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { recovered.push(JSON.parse(text.slice(objStart, i + 1))); } catch (e) { /* phần tử lỗi — bỏ qua */ }
        objStart = -1;
      }
      continue;
    }
    if (ch === ']' && depth === 0) break; // hết mảng bình thường (không bị cắt) — dừng quét
  }
  return recovered;
}

// ---------- Gọi thẳng REST API — cả 2 hãng đều hỗ trợ CORS cho lượt gọi trực tiếp từ trình duyệt
// (Claude cần thêm header "anthropic-dangerous-direct-browser-access", đúng tên Anthropic đặt cho cơ
// chế này — không phải dấu hiệu lỗi/nguy hiểm, chỉ là tên header xác nhận CHỦ Ý gọi từ trình duyệt).
// ----------
// Đánh dấu lỗi HTTP 429 (vượt trần TỐC ĐỘ gọi API của Google/Anthropic — VD "20 lượt/phút" bản miễn
// phí, KHÁC hẳn trần lượt dùng/tháng của app) để aiCallProvider tự chờ rồi gọi lại thay vì báo lỗi
// luôn — quizrecognize giờ gọi nhiều lượt liên tiếp (mỗi nhóm trang 1 lượt) nên dễ chạm trần này hơn
// hẳn so với trước, cần tự phục hồi thay vì bắt giáo viên tự bấm lại.
function aiBuildHttpError(res, data, message) {
  const err = new Error(message);
  if (res.status !== 429) return err;
  err.rateLimited = true;
  // Gemini trả gợi ý thời gian chờ trong error.details (RetryInfo.retryDelay, VD "43.7s") — Anthropic
  // trả qua header chuẩn "retry-after" (giây nguyên) — không có thì mặc định chờ 15s.
  const retryInfo = data && data.error && Array.isArray(data.error.details)
    ? data.error.details.find((d) => typeof d['@type'] === 'string' && d['@type'].includes('RetryInfo'))
    : null;
  const geminiSeconds = retryInfo && retryInfo.retryDelay ? parseFloat(retryInfo.retryDelay) : null;
  const anthropicSeconds = res.headers && res.headers.get ? parseInt(res.headers.get('retry-after'), 10) : null;
  const seconds = geminiSeconds || anthropicSeconds || 15;
  err.retryAfterMs = Math.min(Math.max(seconds, 1), 60) * 1000; // chặn tối đa 60s/lần chờ
  return err;
}

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
        maxOutputTokens: aiMaxOutputTokensFor(mode)
      }
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw aiBuildHttpError(res, data, (data && data.error && data.error.message) || `Lỗi HTTP ${res.status}`);
  const candidate = data && data.candidates && data.candidates[0];
  const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
  if (!text) throw new Error('AI không trả về nội dung.');
  const arrayField = AI_ARRAY_FIELD_BY_MODE[mode];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Cắt cụt giữa chừng (thường do candidate.finishReason === 'MAX_TOKENS') — cứu lại phần đã tạo
    // hoàn chỉnh thay vì mất trắng, thay vì báo lỗi JSON khó hiểu cho giáo viên.
    const recovered = aiRecoverTruncatedArray(text, arrayField);
    if (recovered.length) { recovered.aiTruncated = true; return recovered; }
    const truncatedNote = candidate && candidate.finishReason === 'MAX_TOKENS' ? ' (phản hồi AI bị cắt cụt vì quá dài — thử file ít câu hơn, hoặc chia nhỏ file trước khi nạp)' : '';
    throw new Error('AI trả về dữ liệu không đọc được' + truncatedNote + '.');
  }
  if (arrayField) return parsed[arrayField];
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
      max_tokens: aiMaxOutputTokensFor(mode),
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: claudeBlocks }]
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw aiBuildHttpError(res, data, (data && data.error && data.error.message) || `Lỗi HTTP ${res.status}`);
  const toolUse = (data && data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!toolUse || !toolUse.input) {
    const truncatedNote = data && data.stop_reason === 'max_tokens' ? ' (phản hồi bị cắt cụt vì quá dài — thử file ít câu hơn, hoặc chia nhỏ file trước khi nạp)' : '';
    throw new Error('Claude không trả tool_use hợp lệ' + truncatedNote + '.');
  }
  const arrayField = AI_ARRAY_FIELD_BY_MODE[mode];
  if (arrayField) return toolUse.input[arrayField];
  return [toolUse.input];
}

function aiIsValidLevel(v) { return AI_LEVEL_KEYS.includes(v); }

// Lọc lại LẦN CUỐI cho khớp ĐÚNG khuôn addCustomQuizBatch/addCustomFlashcard/addCustomLessonPlan — y
// hệt normalizeItems() cũ trong functions/index.js.
function aiNormalizeItems(mode, rawItems) {
  if (mode === 'quizrecognize') {
    return rawItems
      .map((it) => {
        if (!it || typeof it.q !== 'string' || !Array.isArray(it.options) || it.options.length !== 4) return null;
        let correct = it.correct;
        // Phòng trường hợp AI trả chữ cái ("C") hoặc chuỗi số ("2") thay vì đúng số nguyên cho field
        // "correct" — từng nghi ngờ đây là lý do câu có đáp án tô sẵn bị lọc mất (không khớp
        // Number.isInteger) trong khi câu AI tự giải (tự nhiên ra đúng số nguyên) vẫn qua được.
        if (typeof correct === 'string') {
          const letterIdx = 'ABCD'.indexOf(correct.trim().toUpperCase());
          correct = letterIdx !== -1 ? letterIdx : parseInt(correct, 10);
        }
        if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;
        const q = { q: it.q, type: 'abcd', options: it.options, correct, explain: typeof it.explain === 'string' ? it.explain : '' };
        // "solved" = AI tự giải để chọn đáp án (đề không có tô màu sẵn) — đánh dấu để giáo viên rà lại,
        // khác "highlight" (đọc đúng theo màu tô sẵn trong file gốc, tin cậy như cách cắt ảnh cũ).
        if (it.correctSource === 'solved') q.aiUnverifiedCorrect = true;
        return q;
      })
      .filter(Boolean);
  }
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

// Tự chờ + gọi lại khi gặp lỗi 429 (vượt trần TỐC ĐỘ gọi API, xem aiBuildHttpError) — tối đa 3 lần thử
// (1 lần đầu + 2 lần lại), mỗi lần chờ đúng thời gian API gợi ý. Hết lượt thử vẫn lỗi thì để lỗi thật
// bay lên cho nơi gọi tự xử lý (VD recognizeQuizFromPdfClient giữ lại phần đã xử lý được).
async function aiCallProvider(provider, args) {
  const call = provider === 'claude' ? aiCallClaudeDirect : aiCallGeminiDirect;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await call(args);
    } catch (err) {
      if (!err.rateLimited || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, err.retryAfterMs || 15000));
    }
  }
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

  // Khoá tính năng (Pro/miễn phí) — dùng CHUNG enforceFeatureLock đã có cho mọi tính năng khác.
  if (typeof enforceFeatureLock === 'function') await enforceFeatureLock(teacher.uid, 'aiGenerate');

  const cfg = typeof getMonetizationConfig === 'function' ? await getMonetizationConfig() : null;
  const aiLimits = (cfg && cfg.aiLimits) || AI_LIMITS_DEFAULT;
  const maxQ = aiLimits.maxQuestionsPerRequest || AI_LIMITS_DEFAULT.maxQuestionsPerRequest;

  let params;
  if (mode === 'quiz' || mode === 'essay' || mode === 'truefalse') {
    const levels = data.levels || {};
    const safeLevels = {};
    AI_LEVEL_KEYS.forEach((k) => { safeLevels[k] = Math.min(Math.max(parseInt(levels[k], 10) || 0, 0), 15); });
    const total = aiSumLevels(safeLevels);
    if (total < 1 || total > maxQ) throw new Error(`Tổng số câu theo các mức độ phải từ 1 đến ${maxQ}.`);
    params = { levels: safeLevels };
  } else if (mode === 'flashcard') {
    params = { count: Math.min(Math.max(parseInt(data.count, 10) || 10, 1), maxQ) };
  } else {
    const lop = String(data.lop || '').trim();
    const soTiet = Math.min(Math.max(parseInt(data.soTiet, 10) || 1, 1), 10);
    if (!lop) throw new Error('Thiếu "Lớp" để soạn giáo án.');
    params = { lop, soTiet };
  }

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

// Mỗi lượt GỌI API chỉ gửi kèm TỐI ĐA từng này trang — thay vì gửi nguyên cả đề (có thể 40-50 câu) làm
// 1 lượt DUY NHẤT, dễ chạm trần token và bị cắt cụt (xem lỗi thực tế đã gặp). Chia nhỏ theo nhóm trang
// giữ output MỖI lượt luôn nhỏ (vài trang ~ vài chục câu), gần như không bao giờ bị cắt cụt dù đề dài
// bao nhiêu trang — đánh đổi: nhiều lượt gọi API hơn (chậm hơn 1 chút, tốn nhiều lượt trong trần dùng
// hơn vì tính phí THEO LƯỢT GỌI THẬT, không phải theo 1 lần bấm nút).
const AI_QUIZRECOGNIZE_PAGES_PER_CALL = 3;

// ---------- Nhận diện câu hỏi trắc nghiệm từ ẢNH các trang PDF bằng AI — thay cho cách "cắt ảnh"
// (doc-import.js: extractQuizFromPdf) khi giáo viên muốn có CHỮ THẬT thay vì ảnh: q/options là text
// thường, câu hỏi sau khi nạp có đầy đủ tính năng như câu tự gõ tay (tìm kiếm được, đọc bằng TTS, trộn
// được cả câu lẫn đáp án khi thi) — đánh đổi là độ chính xác phụ thuộc khả năng AI đọc ảnh, không còn
// đảm bảo 100% pixel như cắt ảnh. Được giữ SONG SONG với cắt ảnh (không thay thế) — giáo viên tự chọn
// cách nào cho từng file (xem chapter-detail.js). Trả về { items, totalPages, usedPages, truncated,
// quotaExceeded } — usedPages < totalPages nghĩa là file dài hơn giới hạn, chỉ xử lý được usedPages
// trang đầu; quotaExceeded=true nghĩa là hết lượt dùng AI giữa chừng (vẫn trả về phần đã xử lý được).
// onProgress(chunkIndex, totalChunks) tuỳ chọn — báo tiến độ cho UI khi đề dài nhiều nhóm trang. ----------
async function recognizeQuizFromPdfClient(arrayBuffer, onProgress) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');

  // Khoá tính năng (Pro/miễn phí) — dùng CHUNG hệ thống với "Tạo bằng AI" (cùng chi phí API thật).
  if (typeof enforceFeatureLock === 'function') await enforceFeatureLock(teacher.uid, 'aiGenerate');

  const cfg = typeof getMonetizationConfig === 'function' ? await getMonetizationConfig() : null;
  const aiLimits = (cfg && cfg.aiLimits) || AI_LIMITS_DEFAULT;
  const maxPages = aiLimits.maxPdfPagesForRecognize || AI_LIMITS_DEFAULT.maxPdfPagesForRecognize;

  const { parts: pageParts, totalPages, usedPages } = await renderPdfPagesForAiRecognition(arrayBuffer, maxPages);
  if (!pageParts.length) throw new Error('Không đọc được trang nào từ file PDF này.');

  const { provider, model, apiKey } = await aiGetActiveProviderAndKey();
  if (!apiKey) {
    throw new Error(`Chưa cấu hình API key cho nhà cung cấp AI "${provider}" — báo admin vào trang Quản trị → Cấu hình AI để dán key.`);
  }

  const allItems = [];
  let anyTruncated = false;
  let quotaExceeded = false;
  let quotaError = null;
  const totalChunks = Math.ceil(pageParts.length / AI_QUIZRECOGNIZE_PAGES_PER_CALL);
  for (let c = 0; c < totalChunks; c++) {
    if (typeof onProgress === 'function') onProgress(c + 1, totalChunks);

    // Tính lượt dùng cho TỪNG lượt gọi API thật (không phải từng lần bấm nút) — đúng chi phí thật, tránh
    // 1 file dài "né" được trần dùng chỉ vì tính gộp theo lượt bấm. Hết lượt giữa chừng vẫn giữ lại các
    // câu đã nhận diện được ở các nhóm trang TRƯỚC đó thay vì mất trắng.
    try {
      await aiCheckAndIncrementUsage(teacher.uid, 'quizrecognize', aiLimits);
    } catch (err) {
      quotaExceeded = true;
      quotaError = err;
      break;
    }

    const chunkStart = c * AI_QUIZRECOGNIZE_PAGES_PER_CALL;
    const chunkParts = pageParts.slice(chunkStart, chunkStart + AI_QUIZRECOGNIZE_PAGES_PER_CALL);
    const contentParts = [
      { type: 'text', text: `Đây là trang ${chunkStart + 1}-${chunkStart + chunkParts.length} (trong tổng số ${usedPages} trang, theo đúng thứ tự) của 1 đề thi trắc nghiệm ${AI_SUBJECT_NAME} dạng ảnh chụp:` },
      ...chunkParts
    ];

    let rawItems;
    try {
      rawItems = await aiCallProvider(provider, { apiKey, model, systemPrompt: aiBuildSystemPrompt('quizrecognize', {}), parts: contentParts, mode: 'quizrecognize' });
    } catch (err) {
      throw new Error(`Không gọi được AI ở nhóm trang ${c + 1}/${totalChunks}: ` + err.message);
    }
    if (Array.isArray(rawItems)) {
      if (rawItems.aiTruncated) anyTruncated = true;
      allItems.push(...rawItems);
    }
  }

  if (!allItems.length) {
    if (quotaExceeded && quotaError) throw quotaError;
    throw new Error('AI không nhận diện được câu hỏi nào trong file này.');
  }

  const items = aiNormalizeItems('quizrecognize', allItems);
  if (!items.length) throw new Error('AI trả về kết quả không đúng định dạng, thử lại.');
  // rawCount > items.length nghĩa là AI CÓ trả về câu đó nhưng bị hàm chuẩn hoá LOẠI vì sai định dạng
  // (VD field "correct" không hợp lệ) — khác với AI không trả về câu đó ngay từ đầu. Phân biệt 2
  // trường hợp này giúp chẩn đoán đúng chỗ khi giáo viên báo "thiếu câu" mà không có lỗi/cảnh báo nào.
  const droppedByFormat = allItems.length - items.length;
  return { items, totalPages, usedPages, truncated: anyTruncated, quotaExceeded, rawCount: allItems.length, droppedByFormat };
}
