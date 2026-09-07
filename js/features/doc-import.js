// Trích xuất nội dung từ file ngay trên trình duyệt (không cần server).
// - Nạp bài giảng (extractFileToLessons): CHỈ nhận .pdf — vẽ mỗi trang thành 1 ảnh bằng pdf.js (đóng
//   gói sẵn trong app, js/vendor/pdfjs) để giữ đúng 100% hình thức bản in, vẫn hoạt động offline.
// - Nạp câu hỏi trắc nghiệm từ Word (extractDocxPlainText, dùng ở chapter-detail.js): vẫn đọc .docx —
//   tự đọc cấu trúc ZIP + XML bằng API sẵn có của trình duyệt (DecompressionStream, DOMParser), vì chỉ
//   cần trích chữ thô theo dòng, không cần giữ định dạng phức tạp như bài giảng.

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
// mới tách đúng được từng câu.
async function extractDocxPlainText(arrayBuffer) {
  const xmlText = await readZipEntryText(arrayBuffer, 'word/document.xml');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Không đọc được nội dung XML bên trong file .docx.');
  }
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  return paragraphs.map((p) => Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent).join('')).join('\n');
}

// ---------- Nạp bài giảng: CHỈ còn nhận file .pdf (xem extractFileToLessons bên dưới) ----------
// Từng có 1 bộ đọc .docx riêng (đọc XML, giữ đậm/nghiêng/màu/bảng...) nhưng bị bỏ theo yêu cầu giáo
// viên sau nhiều lần vá vẫn không triệt để: Word cho phép chèn 1 công thức/mũi tên bằng rất nhiều cách
// khác nhau (Equation Editor/MathType dạng OLE, ký tự Symbol, nhiều công thức chung 1 dòng...), sửa
// hết trường hợp này lại lòi trường hợp khác. Chuyển hẳn sang vẽ nguyên trang PDF thành ảnh (xem
// extractPdf) giải quyết dứt điểm vì không cần "hiểu" cấu trúc file nữa, chỉ vẽ lại y hệt bản in.

// Ngân sách dung lượng ảnh MỖI TRANG/PHẦN (mỗi phần = 1 tài liệu Firestore riêng khi lưu, xem
// addCustomLessonBatch trong custom-lessons.js) — tính theo độ dài chuỗi base64, chừa chỗ cho phần chữ
// trong hạn mức 1MiB/tài liệu của Firestore.
const LESSON_IMAGE_BUDGET_PER_SECTION = 700000;

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

// Vẽ MỖI TRANG PDF thành 1 ẢNH (giữ đúng pixel-by-pixel — mũi tên, công thức, bảng, màu... y hệt bản
// in) thay vì trích văn bản như trước. Trích văn bản từng làm mất/lẫn lộn hoàn toàn định dạng phức tạp
// (công thức Equation Editor, mũi tên phản ứng, bảng, màu...) vì PDF không có cấu trúc "đoạn/bảng" rõ
// ràng như .docx (chỉ là vị trí từng chữ trên trang) — nên đổi hẳn sang cách vẽ nguyên trang ra ảnh:
// KHÔNG còn rủi ro mất/sai định dạng nữa, đánh đổi là ảnh (không bôi đen/copy chữ được, không tự co
// giãn theo nút cỡ chữ của app). Mỗi trang lưu thành 1 bài giảng riêng ("Trang N"), batch lưu kèm field
// "order" (xem custom-lessons.js) nên hiện đúng thứ tự dù Firestore không tự giữ thứ tự chèn.
// Giáo viên phản hồi bản đầu (1000px/chất lượng 0.75) nặng — hạ xuống mức vừa (~40-50% nhẹ hơn), vẫn
// đọc được chữ/công thức bình thường, chỉ hơi mờ hơn khi phóng to hết cỡ.
const PDF_PAGE_TARGET_WIDTH = 800;
const PDF_PAGE_MIN_WIDTH = 420;

async function renderPdfPageToDataUri(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  let targetWidth = PDF_PAGE_TARGET_WIDTH;
  let quality = 0.55;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const dataUri = canvas.toDataURL('image/jpeg', quality);
    if (dataUri.length <= LESSON_IMAGE_BUDGET_PER_SECTION || targetWidth <= PDF_PAGE_MIN_WIDTH) {
      return dataUri;
    }
    // Vẫn quá lớn so với hạn mức 1 tài liệu Firestore — giảm dần chất lượng nén, hết mức thì giảm tiếp
    // độ phân giải, để cố nhét vừa mà chữ vẫn đọc được nhiều nhất có thể.
    if (quality > 0.45) quality -= 0.15;
    else targetWidth = Math.round(targetWidth * 0.8);
  }
  throw new Error('Không nén được 1 trang PDF về đủ nhỏ để lưu.');
}

async function extractPdf(arrayBuffer, fileName) {
  const pdfjsLib = await ensurePdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const sections = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const dataUri = await renderPdfPageToDataUri(page);
    sections.push({ title: `Trang ${pageNum}`, points: [{ type: 'image', dataUri, alt: `Trang ${pageNum}` }] });
  }
  if (!sections.length) throw new Error('Không đọc được trang nào trong file PDF.');
  return sections;
}

// Chỉ nhận .pdf — thông báo rõ cách khắc phục khi giáo viên trót chọn nhầm file khác (Word, ảnh...)
// thay vì chỉ báo "sai định dạng" chung chung.
async function extractFileToLessons(file) {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.pdf')) {
    const isWord = /\.(docx?|rtf|odt)$/i.test(lowerName);
    throw new Error(
      isWord
        ? 'Chỉ nạp được file .pdf. File bạn chọn là file Word — hãy mở file đó, chọn "File → Save As / Lưu dưới dạng", đổi mục "Save as type" sang "PDF", lưu lại rồi nạp file .pdf vừa lưu.'
        : `Chỉ nạp được file .pdf (file bạn chọn là "${file.name}"). Nếu đang có file Word, hãy lưu thành PDF (File → Save As → chọn PDF) rồi nạp file .pdf đó.`
    );
  }
  const buffer = await file.arrayBuffer();
  return extractPdf(buffer, file.name);
}
