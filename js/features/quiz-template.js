// Nạp hàng loạt câu hỏi trắc nghiệm từ file .txt theo mẫu cố định — phân tích tất định, không đoán mò.
//
// Mẫu ABCD (mỗi câu cách nhau bởi 1 dòng trống):
// Câu hỏi ở đây?
// A) Đáp án A
// B) Đáp án B
// C) Đáp án C
// D) Đáp án D
// Đúng: B
// Giải thích: nội dung giải thích (tuỳ chọn)
//
// Mẫu Đúng/Sai (dùng lại đúng từ khoá "Đúng:", nhưng ghi chữ Đúng/Sai thay vì A-D, KHÔNG có dòng A)-D)):
// NaOH là 1 bazơ mạnh.
// Đúng: Đúng
//
// Mẫu Nhập đáp án (dòng "Đáp án:" — nhiều đáp án chấp nhận cách nhau bởi dấu "|"):
// Công thức hoá học của muối ăn?
// Đáp án: NaCl | natri clorua

function parseQuizTemplate(text) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const questions = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const q = lines[0];
    const options = [];
    let correctLetter = -1;
    let correctWord = '';
    let acceptedAnswers = '';
    let explain = '';

    for (let i = 1; i < lines.length; i++) {
      const optMatch = lines[i].match(/^([A-D])[).]\s*(.+)$/i);
      if (optMatch) { options[optMatch[1].toUpperCase().charCodeAt(0) - 65] = optMatch[2].trim(); continue; }
      const correctLetterMatch = lines[i].match(/^Đúng\s*:\s*([A-D])\s*$/i);
      if (correctLetterMatch) { correctLetter = correctLetterMatch[1].toUpperCase().charCodeAt(0) - 65; continue; }
      const correctWordMatch = lines[i].match(/^Đúng\s*:\s*(Đúng|Sai)\s*$/i);
      if (correctWordMatch) { correctWord = correctWordMatch[1].toLowerCase(); continue; }
      const acceptedMatch = lines[i].match(/^Đáp án\s*:\s*(.+)$/i);
      if (acceptedMatch) { acceptedAnswers = acceptedMatch[1].trim(); continue; }
      const explainMatch = lines[i].match(/^Giải thích\s*:\s*(.+)$/i);
      if (explainMatch) { explain = explainMatch[1].trim(); continue; }
    }

    if (acceptedAnswers) {
      questions.push({ q, type: 'text', acceptedAnswers, explain });
      return;
    }
    if (!options.length && correctWord) {
      questions.push({ q, type: 'truefalse', options: ['Đúng', 'Sai'], correct: correctWord === 'đúng' ? 0 : 1, explain });
      return;
    }
    if (options.length !== 4 || options.some((o) => !o)) {
      throw new Error(`Câu hỏi thứ ${idx + 1} ("${q.slice(0, 40)}...") cần đủ 4 đáp án A) B) C) D), hoặc dòng "Đúng: Đúng/Sai", hoặc dòng "Đáp án: ..."`);
    }
    if (correctLetter < 0 || correctLetter > 3) {
      throw new Error(`Câu hỏi thứ ${idx + 1} ("${q.slice(0, 40)}...") thiếu dòng "Đúng: A/B/C/D" hợp lệ`);
    }
    questions.push({ q, type: 'abcd', options, correct: correctLetter, explain });
  });

  if (!questions.length) {
    throw new Error('Không tìm thấy câu hỏi nào — kiểm tra lại đúng định dạng mẫu (xem gợi ý phía trên nút nạp file).');
  }
  return questions;
}
