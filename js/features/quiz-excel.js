// Nạp hàng loạt câu hỏi trắc nghiệm từ file Excel (.xlsx) hoặc CSV theo mẫu cột cố định.
// Đọc .xlsx bằng cách tái sử dụng bộ đọc ZIP/XML đã có trong doc-import.js (readZipEntryText) — không cần thư viện ngoài.
//
// Mẫu cột (theo đúng thứ tự): Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | Đáp án đúng | Giải thích | Loại câu
//
// Cột "Loại câu" (CUỐI CÙNG, không chèn giữa) — để trống = ABCD (giữ nguyên tương thích file mẫu CŨ
// tải từ trước, thiếu hẳn cột này). Ghi "DungSai" -> để trống 4 cột đáp án A-D, cột "Đáp án đúng" ghi
// "Đúng" hoặc "Sai". Ghi "TuLuan" -> để trống 4 cột đáp án A-D, cột "Đáp án đúng" ghi đáp án chấp
// nhận được (nhiều đáp án cách nhau bởi dấu "|").

const QUIZ_TEMPLATE_HEADERS = ['Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng', 'Giải thích (tuỳ chọn)', 'Loại câu (để trống = ABCD, hoặc ghi DungSai / TuLuan)'];

function csvEscapeField(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadQuizTemplateCSV() {
  const rows = [
    QUIZ_TEMPLATE_HEADERS,
    ['Nguyên tử trung hoà về điện vì:', 'Số proton = số neutron', 'Số electron = số neutron', 'Số electron = số proton', 'Nguyên tử không có electron', 'C', 'Điện tích proton và electron cân bằng khi số lượng hai loại hạt bằng nhau.', ''],
    ['Kim loại nào ở thể lỏng tại nhiệt độ thường?', 'Sắt', 'Thuỷ ngân', 'Nhôm', 'Kẽm', 'B', '', ''],
    ['Công thức hoá học của khí oxi là:', 'O', 'O2', 'O3', '2O', 'B', '', ''],
    ['Trong bảng tuần hoàn, các nguyên tố được sắp xếp theo chiều tăng dần của:', 'Số khối', 'Số neutron', 'Điện tích hạt nhân', 'Khối lượng nguyên tử', 'C', '', ''],
    ['Liên kết hoá học trong phân tử NaCl là:', 'Liên kết cộng hoá trị', 'Liên kết ion', 'Liên kết kim loại', 'Liên kết hydrogen', 'B', '', ''],
    ['Chất nào sau đây là oxit axit?', 'CaO', 'Na2O', 'CO2', 'Fe2O3', 'C', '', ''],
    ['Dung dịch nào làm quỳ tím chuyển sang màu đỏ?', 'NaOH', 'HCl', 'NaCl', 'Ca(OH)2', 'B', '', ''],
    ['Ở điều kiện tiêu chuẩn, 22,4 lít khí CO2 tương ứng với số mol là:', '0,5 mol', '1 mol', '2 mol', '1,5 mol', 'B', '', ''],
    ['Kim loại nào tác dụng được với nước ở nhiệt độ thường?', 'Fe', 'Cu', 'Na', 'Ag', 'C', '', ''],
    ['Công thức phân tử của methane (khí thiên nhiên) là:', 'CH4', 'C2H6', 'C2H4', 'C2H2', 'A', '', ''],
    ['Dãy chất nào sau đây đều là muối?', 'NaCl, CaCO3, KNO3', 'NaOH, HCl, H2SO4', 'CO2, SO2, NO2', 'Fe, Cu, Zn', 'A', '', ''],
    ['Hiện tượng nào sau đây là hiện tượng hoá học?', 'Nước đá tan chảy', 'Đinh sắt bị gỉ trong không khí ẩm', 'Hoà tan đường vào nước', 'Cồn bay hơi', 'B', 'Gỉ sắt tạo ra chất mới (oxit sắt), khác các hiện tượng còn lại chỉ đổi trạng thái.', ''],
    ['Chất xúc tác có vai trò gì trong phản ứng hoá học?', 'Làm tăng khối lượng sản phẩm', 'Làm thay đổi bản chất phản ứng', 'Làm tăng tốc độ phản ứng nhưng không bị biến đổi', 'Làm giảm tốc độ phản ứng', 'C', '', ''],
    ['Trong công nghiệp, ammonia (NH3) được điều chế chủ yếu bằng phương pháp nào?', 'Điện phân', 'Tổng hợp trực tiếp từ N2 và H2', 'Nhiệt phân muối amoni', 'Cho kim loại tác dụng với axit', 'B', '', ''],
    ['NaOH là 1 bazơ mạnh.', '', '', '', '', 'Đúng', '', 'DungSai'],
    ['Kim loại đồng (Cu) tác dụng được với dung dịch HCl loãng, giải phóng khí H2.', '', '', '', '', 'Sai', 'Cu đứng sau H trong dãy hoạt động hoá học nên không phản ứng với HCl loãng.', 'DungSai'],
    ['Phản ứng oxi hoá - khử luôn có sự thay đổi số oxi hoá của các nguyên tố.', '', '', '', '', 'Đúng', '', 'DungSai'],
    ['Công thức hoá học của muối ăn?', '', '', '', '', 'NaCl | natri clorua', '', 'TuLuan'],
    ['Kí hiệu hoá học của nguyên tố sắt là gì?', '', '', '', '', 'Fe', '', 'TuLuan'],
    ['Chất khí sinh ra khi cho kim loại kẽm (Zn) tác dụng với dung dịch axit clohydric (HCl) là gì?', '', '', '', '', 'H2 | khí hidro | khí hydro | hidro | hydro', '', 'TuLuan']
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

// Chuẩn hoá cột "Loại câu" (cột cuối, có thể thiếu hẳn ở file mẫu CŨ) — thiếu/để trống/không nhận
// diện được -> mặc định "abcd" (giữ nguyên tương thích ngược hoàn toàn).
function normalizeQuizTypeCell(raw) {
  const v = (raw || '').toString().trim().toLowerCase().replace(/[\s/]+/g, '');
  if (['dungsai', 'đúngsai', 'truefalse'].includes(v)) return 'truefalse';
  if (['tuluan', 'tựluận', 'nhậpđápán', 'nhapdapan', 'text'].includes(v)) return 'text';
  return 'abcd';
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
    const correctRaw = (row[5] || '').toString().trim();
    const explain = (row[6] || '').toString().trim();
    const type = normalizeQuizTypeCell(row[7]);

    if (type === 'text') {
      if (!correctRaw) { errors.push(`Dòng ${lineNo}: thiếu đáp án đúng ở cột "Đáp án đúng" cho câu Nhập đáp án`); return; }
      questions.push({ q, type: 'text', acceptedAnswers: correctRaw, explain });
      return;
    }
    if (type === 'truefalse') {
      const v = correctRaw.toLowerCase();
      let correct = -1;
      if (['đúng', 'dung', 'true', 'd'].includes(v)) correct = 0;
      else if (['sai', 'false', 's'].includes(v)) correct = 1;
      if (correct === -1) { errors.push(`Dòng ${lineNo}: cột "Đáp án đúng" phải ghi Đúng hoặc Sai (đang là "${correctRaw || '(trống)'}")`); return; }
      questions.push({ q, type: 'truefalse', options: ['Đúng', 'Sai'], correct, explain });
      return;
    }

    const options = [1, 2, 3, 4].map((i) => (row[i] || '').toString().trim());
    if (options.some((o) => !o)) { errors.push(`Dòng ${lineNo}: thiếu 1 trong 4 đáp án A/B/C/D`); return; }
    const correctUpper = correctRaw.toUpperCase();
    let correct = -1;
    if (/^[A-D]$/.test(correctUpper)) correct = correctUpper.charCodeAt(0) - 65;
    else if (/^[1-4]$/.test(correctUpper)) correct = parseInt(correctUpper, 10) - 1;
    if (correct === -1) { errors.push(`Dòng ${lineNo}: cột "Đáp án đúng" phải là A/B/C/D hoặc 1-4 (đang là "${correctRaw || '(trống)'}")`); return; }
    questions.push({ q, type: 'abcd', options, correct, explain });
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
