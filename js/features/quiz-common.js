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

// ---------- Xem lại 1 bài kiểm tra ĐÃ NỘP (dùng ở cả 2 phía: học sinh xem lại bài mình, giáo viên
// xem bài của 1 học sinh cụ thể — xem exam-taker.js/exam-stats.js) ----------

// "exams/{id}.questions" (câu hỏi, KHÔNG có đáp án — công khai) và "examAnswers/{id}.answers" (đáp
// án đúng, cùng thứ tự) được TÁCH RIÊNG lúc tạo đề (xem exam-creator.js) — ghép lại đúng theo chỉ số
// thành 1 mảng "item" đủ {q, options/acceptedAnswers, correct/type} để isQuizAnswerCorrect/
// formatCorrectAnswerDisplay dùng được, giống hệt shape câu hỏi ở mọi nơi khác trong app.
function mergeExamAndAnswerKey(examQuestions, answerKeyAnswers) {
  return (examQuestions || []).map((q, i) => Object.assign({}, q, (answerKeyAnswers || [])[i] || {}));
}

// Dựng HTML xem lại từng câu (đúng/sai + đáp án đúng + đã chọn gì) — CÙNG 1 khuôn dùng ở mọi nơi xem
// lại bài kiểm tra, tránh viết lặp lại logic này (đã từng lặp 3-4 lần độc lập trước khi có file này).
function buildSubmissionReviewHtml(items, answers) {
  return items.map((item, i) => {
    const answer = (answers || [])[i];
    const isOk = isQuizAnswerCorrect(item, answer);
    const yourAnswerText = answer == null ? '(chưa trả lời)'
      : (getQuestionType(item) === 'text' ? answer : ((item.options && item.options[answer]) || ''));
    return `
      <div class="quiz-review-item ${isOk ? 'ok' : 'bad'}">
        <div class="qi-q">${i + 1}. ${escapeHtml(item.q)}</div>
        <div>Đáp án đúng: ${escapeHtml(formatCorrectAnswerDisplay(item))}</div>
        <div class="qi-status">${isOk ? '✓ Trả lời đúng' : '✗ Đã chọn: ' + escapeHtml(yourAnswerText)}</div>
      </div>
    `;
  }).join('');
}
