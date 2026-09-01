// Nạp hàng loạt câu hỏi trắc nghiệm từ file Excel (.xlsx) hoặc CSV theo mẫu cột cố định.
// Đọc .xlsx bằng cách tái sử dụng bộ đọc ZIP/XML đã có trong doc-import.js (readZipEntryText) — không cần thư viện ngoài.
//
// Mẫu cột (theo đúng thứ tự): Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | Đáp án đúng (A/B/C/D) | Giải thích

const QUIZ_TEMPLATE_HEADERS = ['Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng (A/B/C/D)', 'Giải thích (tuỳ chọn)'];

function csvEscapeField(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadQuizTemplateCSV() {
  const rows = [
    QUIZ_TEMPLATE_HEADERS,
    ['Nguyên tử trung hoà về điện vì:', 'Số proton = số neutron', 'Số electron = số neutron', 'Số electron = số proton', 'Nguyên tử không có electron', 'C', 'Điện tích proton và electron cân bằng khi số lượng hai loại hạt bằng nhau.'],
    ['Kim loại nào ở thể lỏng tại nhiệt độ thường?', 'Sắt', 'Thuỷ ngân', 'Nhôm', 'Kẽm', 'B', '']
  ];
  const csv = rows.map((r) => r.map(csvEscapeField).join(',')).join('\r\n');
  // \uFEFF (BOM) để Excel nhận đúng bảng mã UTF-8, không lỗi font tiếng Việt khi mở lại.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-nap-cau-hoi-trac-nghiem.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCSVText(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function colLetterToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

async function readXlsxSharedStrings(arrayBuffer) {
  let xml;
  try { xml = await readZipEntryText(arrayBuffer, 'xl/sharedStrings.xml'); } catch (e) { return []; }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join('')
  );
}

async function readXlsxGrid(arrayBuffer) {
  const sharedStrings = await readXlsxSharedStrings(arrayBuffer);
  let xml;
  try {
    xml = await readZipEntryText(arrayBuffer, 'xl/worksheets/sheet1.xml');
  } catch (e) {
    throw new Error('Không đọc được sheet đầu tiên trong file Excel — hãy chắc chắn dữ liệu nằm ở sheet đầu tiên (sheet1).');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Không đọc được nội dung bên trong file Excel.');

  const grid = [];
  Array.from(doc.getElementsByTagName('row')).forEach((rowEl) => {
    const rowArr = [];
    Array.from(rowEl.getElementsByTagName('c')).forEach((c) => {
      const ref = c.getAttribute('r') || '';
      const m = ref.match(/[A-Z]+/i);
      const colIdx = m ? colLetterToIndex(m[0].toUpperCase()) : rowArr.length;
      const type = c.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        const isEl = c.getElementsByTagName('is')[0];
        value = isEl ? Array.from(isEl.getElementsByTagName('t')).map((t) => t.textContent).join('') : '';
      } else {
        const vEl = c.getElementsByTagName('v')[0];
        const raw = vEl ? vEl.textContent : '';
        value = type === 's' ? (sharedStrings[parseInt(raw, 10)] || '') : raw;
      }
      rowArr[colIdx] = value;
    });
    for (let i = 0; i < rowArr.length; i++) if (rowArr[i] === undefined) rowArr[i] = '';
    grid.push(rowArr);
  });
  return grid.filter((r) => r.some((c) => (c || '').toString().trim() !== ''));
}

function rowsToQuizQuestions(rows) {
  if (rows.length < 2) throw new Error('File chưa có dữ liệu câu hỏi (chỉ thấy dòng tiêu đề hoặc trống).');
  const dataRows = rows.slice(1); // bỏ dòng tiêu đề
  const questions = [];
  const errors = [];
  dataRows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const q = (row[0] || '').toString().trim();
    if (!q && row.every((c) => !(c || '').toString().trim())) return; // dòng trống hoàn toàn -> bỏ qua
    if (!q) { errors.push(`Dòng ${lineNo}: thiếu nội dung câu hỏi`); return; }
    const options = [1, 2, 3, 4].map((i) => (row[i] || '').toString().trim());
    if (options.some((o) => !o)) { errors.push(`Dòng ${lineNo}: thiếu 1 trong 4 đáp án A/B/C/D`); return; }
    const correctRaw = (row[5] || '').toString().trim().toUpperCase();
    let correct = -1;
    if (/^[A-D]$/.test(correctRaw)) correct = correctRaw.charCodeAt(0) - 65;
    else if (/^[1-4]$/.test(correctRaw)) correct = parseInt(correctRaw, 10) - 1;
    if (correct === -1) { errors.push(`Dòng ${lineNo}: cột "Đáp án đúng" phải là A/B/C/D hoặc 1-4 (đang là "${correctRaw || '(trống)'}")`); return; }
    const explain = (row[6] || '').toString().trim();
    questions.push({ q, options, correct, explain });
  });
  return { questions, errors };
}

async function parseQuizExcelFile(file) {
  const lowerName = file.name.toLowerCase();
  let rows;
  if (lowerName.endsWith('.csv')) {
    rows = parseCSVText(await file.text());
  } else if (lowerName.endsWith('.xlsx')) {
    rows = await readXlsxGrid(await file.arrayBuffer());
  } else {
    throw new Error('Chỉ hỗ trợ file .xlsx hoặc .csv.');
  }
  const { questions, errors } = rowsToQuizQuestions(rows);
  if (errors.length) {
    const err = new Error(`File có ${errors.length} dòng lỗi:\n` + errors.join('\n'));
    err.isMultiline = true;
    throw err;
  }
  if (!questions.length) throw new Error('Không tìm thấy câu hỏi hợp lệ nào trong file.');
  return questions;
}
