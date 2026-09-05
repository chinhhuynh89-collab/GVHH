// Hàm dùng CHUNG cho mọi nơi có câu hỏi trắc nghiệm (nạp file, luyện tập trong chương, tự kiểm tra,
// tạo đề/làm bài kiểm tra) — tránh viết trùng logic phân nhánh theo loại câu hỏi ở nhiều nơi.
//
// 3 dạng câu hỏi (field "type", THIẾU field này = mặc định "abcd" để tương thích câu hỏi cũ):
// - "abcd":      { type:'abcd', q, options:[4 chuỗi], correct: 0-3, explain }
// - "truefalse": { type:'truefalse', q, options:['Đúng','Sai'], correct: 0|1, explain } — tái dùng
//                nguyên cơ chế options+index đã có (render nút bấm, xáo thứ tự, chấm điểm).
// - "text":      { type:'text', q, acceptedAnswers:"đáp án 1|biến thể 2", explain } — không có
//                options/correct, chấm bằng so khớp chuỗi linh hoạt (xem normalizeAnswerText).

function getQuestionType(item) {
  return (item && item.type) || 'abcd';
}

const QUIZ_TYPE_LABELS = { abcd: 'ABCD', truefalse: 'Đúng/Sai', text: 'Nhập đáp án' };

const QUIZ_TYPE_OPTIONS = [
  { value: 'abcd', label: 'ABCD (4 đáp án)' },
  { value: 'truefalse', label: 'Đúng/Sai' },
  { value: 'text', label: 'Nhập đáp án' }
];

// So khớp LINH HOẠT cho câu "Nhập đáp án" — bỏ khoảng trắng thừa, không phân biệt hoa/thường, không
// phân biệt dấu tiếng Việt (kể cả "đ") để học sinh không bị chấm sai oan chỉ vì gõ khác 1 chút.
// Bỏ dấu tiếng Việt: sau normalize('NFD') mỗi chữ có dấu tách thành chữ cái gốc + 1(-2) ký tự "dấu
// kết hợp" riêng (combining mark, mã Unicode 0x300-0x36F) — lọc bỏ các ký tự trong khoảng mã đó
// (dùng codePointAt để tránh phải viết regex chứa ký tự Unicode đặc biệt, dễ gõ nhầm/khó đọc).
function stripCombiningMarks(s) {
  return Array.from(s).filter((ch) => {
    const code = ch.codePointAt(0);
    return code < 0x300 || code > 0x36f;
  }).join('');
}

function normalizeAnswerText(s) {
  return stripCombiningMarks(
    String(s == null ? '' : s).trim().toLowerCase().replace(/đ/g, 'd').normalize('NFD')
  ).replace(/\s+/g, ' ');
}

function isTextAnswerCorrect(acceptedAnswers, studentAnswer) {
  const given = normalizeAnswerText(studentAnswer);
  if (!given) return false;
  const variants = String(acceptedAnswers || '').split('|').map(normalizeAnswerText).filter(Boolean);
  return variants.includes(given);
}

// Hàm CHẤM ĐIỂM DUY NHẤT — dùng ở exam-taker.js và cả 2 chế độ luyện tập trong chapter-detail.js,
// thay cho so sánh "answer === item.correct" lặp lại độc lập ở nhiều nơi trước đây.
function isQuizAnswerCorrect(item, answer) {
  if (getQuestionType(item) === 'text') return isTextAnswerCorrect(item.acceptedAnswers, answer);
  return answer === item.correct;
}

// Chuỗi hiển thị "đáp án đúng" cho học sinh xem lại sau khi làm bài/luyện tập.
function formatCorrectAnswerDisplay(item) {
  if (getQuestionType(item) === 'text') {
    return String(item.acceptedAnswers || '').split('|').map((s) => s.trim()).filter(Boolean).join(' / ');
  }
  return (item.options && item.options[item.correct]) || '';
}
