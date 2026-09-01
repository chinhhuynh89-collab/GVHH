// Nạp hàng loạt câu hỏi trắc nghiệm từ file .txt theo mẫu cố định — phân tích tất định, không đoán mò.
//
// Mẫu (mỗi câu cách nhau bởi 1 dòng trống):
// Câu hỏi ở đây?
// A) Đáp án A
// B) Đáp án B
// C) Đáp án C
// D) Đáp án D
// Đúng: B
// Giải thích: nội dung giải thích (tuỳ chọn)

function parseQuizTemplate(text) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const questions = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const q = lines[0];
    const options = [];
    let correct = -1;
    let explain = '';

    for (let i = 1; i < lines.length; i++) {
      const optMatch = lines[i].match(/^([A-D])[).]\s*(.+)$/i);
      if (optMatch) { options[optMatch[1].toUpperCase().charCodeAt(0) - 65] = optMatch[2].trim(); continue; }
      const correctMatch = lines[i].match(/^Đúng\s*:\s*([A-D])/i);
      if (correctMatch) { correct = correctMatch[1].toUpperCase().charCodeAt(0) - 65; continue; }
      const explainMatch = lines[i].match(/^Giải thích\s*:\s*(.+)$/i);
      if (explainMatch) { explain = explainMatch[1].trim(); continue; }
    }

    if (options.length !== 4 || options.some((o) => !o)) {
      throw new Error(`Câu hỏi thứ ${idx + 1} ("${q.slice(0, 40)}...") cần đủ 4 đáp án A) B) C) D)`);
    }
    if (correct < 0 || correct > 3) {
      throw new Error(`Câu hỏi thứ ${idx + 1} ("${q.slice(0, 40)}...") thiếu dòng "Đúng: A/B/C/D" hợp lệ`);
    }
    questions.push({ q, options, correct, explain });
  });

  if (!questions.length) {
    throw new Error('Không tìm thấy câu hỏi nào — kiểm tra lại đúng định dạng mẫu (xem gợi ý phía trên nút nạp file).');
  }
  return questions;
}
