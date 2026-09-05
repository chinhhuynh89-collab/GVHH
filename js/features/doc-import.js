// Trích xuất văn bản từ file .docx / .pdf ngay trên trình duyệt (không cần server).
// .docx: tự đọc cấu trúc ZIP + XML bằng API sẵn có của trình duyệt (DecompressionStream, DOMParser).
// .pdf: dùng thư viện pdf.js đóng gói sẵn trong app (js/vendor/pdfjs) để vẫn hoạt động offline.

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CEN_SIG = 0x02014b50;
const ZIP_LOC_SIG = 0x04034b50;

function zipFindCentralEntry(view, bytes, entryName) {
  let eocdOffset = -1;
  const searchFloor = Math.max(0, view.byteLength - 66000);
  for (let i = view.byteLength - 22; i >= searchFloor; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('File không đúng định dạng .docx (thiếu cấu trúc ZIP hợp lệ)');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  let offset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== ZIP_CEN_SIG) break;
    const compMethod = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    const name = decoder.decode(nameBytes);
    if (name === entryName) return { compMethod, compSize, localHeaderOffset };
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function inflateRawBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Trình duyệt chưa hỗ trợ giải nén file .docx — hãy cập nhật lên phiên bản Chrome mới hơn.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  chunks.forEach((c) => { out.set(c, pos); pos += c.length; });
  return out;
}

async function readZipEntryText(arrayBuffer, entryName) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const entry = zipFindCentralEntry(view, bytes, entryName);
  if (!entry) throw new Error(`Không tìm thấy "${entryName}" trong file — file .docx có thể bị lỗi hoặc không đúng định dạng.`);

  const loc = entry.localHeaderOffset;
  if (view.getUint32(loc, true) !== ZIP_LOC_SIG) throw new Error('Cấu trúc ZIP trong file không hợp lệ.');
  const nameLen = view.getUint16(loc + 26, true);
  const extraLen = view.getUint16(loc + 28, true);
  const dataStart = loc + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compSize);

  const raw = entry.compMethod === 0 ? compressed : await inflateRawBytes(compressed);
  return new TextDecoder('utf-8').decode(raw);
}

// ---------- Ghi file .xlsx thật (ngược lại với đọc ở trên) ----------
// Lý do cần: Excel lưu .csv theo bảng mã ANSI của hệ điều hành (không phải UTF-8), có thể làm mất
// chữ có dấu tiếng Việt không có trong bảng mã đó (xem ghi chú readCsvFileSmart ở teacher-student-
// accounts.js). File .xlsx thì KHÔNG gặp rủi ro này — nội dung chữ trong .xlsx luôn là UTF-8 chuẩn
// trong XML bất kể bảng mã hệ thống. Tự ghi ZIP bằng tay (không dùng thư viện ngoài) — chỉ dùng nén
// "STORED" (không nén) cho đơn giản/chắc chắn vì file mẫu rất nhỏ, không cần DEFLATE; dùng ô kiểu
// "inlineStr" để khỏi phải xây thêm bảng sharedStrings.xml riêng — cả 2 lựa chọn này đã được chính
// bộ đọc sẵn có (readZipEntryText, readXlsxGrid) hỗ trợ, đảm bảo file ghi ra đọc lại đúng.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Ghép các phần (tên + nội dung chữ) thành 1 file ZIP hoàn chỉnh (toàn STORED, không nén).
function buildZipStored(parts) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralEntries = [];
  let offset = 0;

  parts.forEach((part) => {
    const nameBytes = encoder.encode(part.name);
    const dataBytes = encoder.encode(part.text);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, ZIP_LOC_SIG, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, dataBytes);
    centralEntries.push({ nameBytes, crc, size: dataBytes.length, offset });
    offset += localHeader.length + dataBytes.length;
  });

  const cdStart = offset;
  centralEntries.forEach((entry) => {
    const central = new Uint8Array(46 + entry.nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, ZIP_CEN_SIG, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.size, true);
    cv.setUint32(24, entry.size, true);
    cv.setUint16(28, entry.nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, entry.offset, true);
    central.set(entry.nameBytes, 46);
    chunks.push(central);
    offset += central.length;
  });
  const cdSize = offset - cdStart;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, ZIP_EOCD_SIG, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralEntries.length, true);
  ev.setUint16(10, centralEntries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);
  chunks.push(eocd);

  return chunks;
}

function xlsxXmlEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xlsxColLetter(idx) {
  let n = idx + 1, s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function buildXlsxSheetXml(rows) {
  const rowsXml = rows.map((row, ri) => {
    const cellsXml = row.map((val, ci) => {
      const text = val == null ? '' : String(val);
      if (text === '') return '';
      const ref = xlsxColLetter(ci) + (ri + 1);
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxXmlEscape(text)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cellsXml}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

// Tạo Blob file .xlsx từ dữ liệu dạng lưới (mảng các hàng, mỗi hàng là mảng chuỗi/số).
function buildXlsxBlob(rows) {
  const parts = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', text: buildXlsxSheetXml(rows) }
  ];
  const chunks = buildZipStored(parts);
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function downloadXlsx(rows, filename) {
  const blob = buildXlsxBlob(rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// Trích xuất TOÀN BỘ văn bản trong file .docx thành các dòng thuần — mỗi đoạn văn Word (kể cả đoạn
// TRỐNG) thành đúng 1 dòng, nối lại bởi "\n". Dùng để nạp câu hỏi trắc nghiệm từ file Word theo ĐÚNG
// mẫu .txt đã có sẵn (parseQuizTemplate — các câu cách nhau bởi 1 dòng trống): giữ nguyên đoạn trống
// mới tách đúng được từng câu, khác với groupDocxParagraphs (dùng nạp bài giảng — bỏ qua đoạn trống,
// tách theo tiêu đề, không phù hợp cho mẫu câu hỏi).
async function extractDocxPlainText(arrayBuffer) {
  const xmlText = await readZipEntryText(arrayBuffer, 'word/document.xml');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Không đọc được nội dung XML bên trong file .docx.');
  }
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  return paragraphs.map((p) => Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent).join('')).join('\n');
}

function groupDocxParagraphs(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Không đọc được nội dung XML bên trong file .docx.');
  }
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const sections = [];
  let current = { title: null, points: [] };

  paragraphs.forEach((p) => {
    const styleEl = p.getElementsByTagName('w:pStyle')[0];
    const styleVal = styleEl ? (styleEl.getAttribute('w:val') || '') : '';
    const isHeading = /^(Heading|Title)/i.test(styleVal);
    const text = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent).join('').trim();
    if (!text) return;

    if (isHeading) {
      if (current.title || current.points.length) sections.push(current);
      current = { title: text, points: [] };
    } else {
      current.points.push(text);
    }
  });
  if (current.title || current.points.length) sections.push(current);
  return sections;
}

async function extractDocx(arrayBuffer, fileName) {
  const xmlText = await readZipEntryText(arrayBuffer, 'word/document.xml');
  const sections = groupDocxParagraphs(xmlText);
  if (!sections.length) throw new Error('Không tìm thấy nội dung văn bản nào trong file .docx.');
  if (sections.length === 1 && !sections[0].title) sections[0].title = fileName;
  return sections;
}

let _pdfjsReady = null;
function ensurePdfJs() {
  if (_pdfjsReady) return _pdfjsReady;
  _pdfjsReady = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const base = window.APP_BASE_PATH || './';
    const script = document.createElement('script');
    script.src = base + 'js/vendor/pdfjs/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Không tải được thư viện đọc file PDF.'));
    document.head.appendChild(script);
  });
  return _pdfjsReady;
}

async function extractPdf(arrayBuffer, fileName) {
  const pdfjsLib = await ensurePdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY = null;
    let currentLine = '';
    content.items.forEach((item) => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        currentLine += item.str;
      }
      lastY = y;
    });
    if (currentLine.trim()) lines.push(currentLine.trim());
  }
  if (!lines.length) {
    throw new Error('Không trích xuất được văn bản từ file PDF (có thể là bản scan ảnh — cần OCR, chưa hỗ trợ).');
  }
  return [{ title: fileName.replace(/\.pdf$/i, ''), points: lines }];
}

async function extractFileToLessons(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    throw new Error('File .doc (Word 2003 cũ) chưa được hỗ trợ. Hãy mở file bằng Word, chọn "Save As" sang định dạng .docx rồi nạp lại.');
  }
  const buffer = await file.arrayBuffer();
  if (lowerName.endsWith('.docx')) return extractDocx(buffer, file.name.replace(/\.docx$/i, ''));
  if (lowerName.endsWith('.pdf')) return extractPdf(buffer, file.name);
  throw new Error('Chỉ hỗ trợ file .docx hoặc .pdf.');
}
