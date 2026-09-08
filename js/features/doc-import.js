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
// Giáo viên yêu cầu 2 trang dính liền hẳn, không còn khoảng trắng nào — cắt sát luôn, không chừa lề.
const PDF_PAGE_TRIM_MARGIN = 0;

// Trang PDF luôn có lề trắng riêng (thường 2-2.5cm mỗi cạnh, theo chuẩn Word) — xếp nhiều trang liền
// nhau (xem chapter-detail.js: đã bỏ khoảng cách CSS giữa các trang) vẫn còn hở khoảng trắng LỚN ở mối
// nối vì CỘNG DỒN lề dưới của trang trước + lề trên của trang sau. Quét pixel để cắt bớt phần lề trắng
// THỪA trên/dưới mỗi trang (không đụng lề trái/phải, tránh lệch khung ảnh) trước khi nén — vừa đọc liền
// mạch hơn, vừa nhẹ hơn 1 chút vì ảnh nhỏ đi.
function trimCanvasWhitespace(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, width, height).data;
  const isRowBlank = (y) => {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
    }
    return true;
  };
  let top = 0;
  while (top < height && isRowBlank(top)) top++;
  let bottom = height - 1;
  while (bottom > top && isRowBlank(bottom)) bottom--;
  top = Math.max(0, top - PDF_PAGE_TRIM_MARGIN);
  bottom = Math.min(height - 1, bottom + PDF_PAGE_TRIM_MARGIN);
  if (top <= 0 && bottom >= height - 1) return canvas; // không có gì để cắt
  const trimmedHeight = bottom - top + 1;
  if (trimmedHeight <= 0) return canvas; // phòng hờ trang trắng hoàn toàn — giữ nguyên, không cắt lố
  const trimmed = document.createElement('canvas');
  trimmed.width = width;
  trimmed.height = trimmedHeight;
  trimmed.getContext('2d').drawImage(canvas, 0, -top);
  return trimmed;
}

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
    const trimmedCanvas = trimCanvasWhitespace(canvas);
    const dataUri = trimmedCanvas.toDataURL('image/jpeg', quality);
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

// ---------- Nạp câu hỏi trắc nghiệm từ PDF: cắt ẢNH nguyên từng câu theo mốc "Câu N." ----------
// Vì sao cắt ảnh thay vì trích chữ: câu hỏi thật thường kèm đồ thị/hình minh hoạ (chính là nội dung câu
// hỏi, không thể thay bằng chữ) và đáp án dạng công thức chèn qua Equation Editor (không đọc/giải mã
// được — đã thử 2 thư viện WMF/EMF thật, cả 2 đều thất bại vì MathType nhúng dữ liệu vẽ theo định dạng
// riêng độc quyền bên trong record "Escape" của WMF). Cắt ảnh giữ đúng 100% pixel như file gốc, không
// cần "hiểu" nội dung công thức nữa.
// Đánh đổi PHẢI CHẤP NHẬN:
//  - KHÔNG đọc được đáp án đúng — không có tín hiệu nào trong file để đọc (đã kiểm tra tận gốc XML thật,
//    không tô màu/đậm/tô sáng khác biệt, không có bảng đáp án). Giáo viên BẮT BUỘC tự chọn đáp án đúng
//    sau khi nạp (sửa câu hỏi như bình thường).
//  - Câu ABCD dùng nhãn A/B/C/D CHUNG CHUNG (nội dung thật nằm trong ảnh) — vì vậy các câu này phải gắn
//    "noShuffle: true" để lúc thi thật (exam-taker.js) KHÔNG xáo thứ tự nút bấm, nếu không nút "A" hiện
//    ra có thể không khớp với chữ "A." trong ảnh nữa, học sinh chọn sai vì bối rối chứ không phải sai
//    kiến thức.
//  - Câu hỏi tràn từ cuối trang này sang đầu trang sau (rất hay gặp) được ghép lại làm 1 ảnh liền (xem
//    stackCanvasesVertically) — nhưng chỉ ghép được 2 phần LIỀN KỀ NHAU, không xử lý được câu tràn quá
//    2 trang (hiếm khi xảy ra với 1 câu hỏi thi thông thường).
const QUIZ_QUESTION_MARKER_RE = /^C[aâ]u\s*(\d+)\s*[\.\):]/i;
// PHẦN II (đúng/sai kiểu mới, chữ thường a) b) c) d)) không khớp mẫu A-D này nên tự rơi vào nhánh
// "không có lựa chọn" (type: 'text', giáo viên tự bổ sung đáp án/sửa lại loại câu sau khi nạp).
const QUIZ_OPTION_MARKER_RE = /^[A-D]\s*[\.\):]/;
// Đề thi chuẩn 2025 chia nhiều "PHẦN" (I/II/III/IV...), MỖI PHẦN ĐÁNH SỐ LẠI TỪ "Câu 1" — đã xác nhận
// qua thực tế (Phần I 1..30, Phần II lại 1.., Phần III/IV cũng vậy). Nếu coi cả file là 1 dãy số liên
// tục, phần sau sẽ báo "trùng số" giả hàng loạt so với phần trước, che mất cảnh báo thật. Nhận diện
// mốc "PHẦN" để tính thiếu/trùng số RIÊNG cho từng phần.
const QUIZ_PART_MARKER_RE = /^PH[ẦA]N\s+([IVXLCDM]+)\s*[.:]?\s*(.*)$/i;
// PHẦN "tự luận" (câu hỏi mở, không có đáp án A-D/đúng-sai để chấm tự động) — giáo viên đã xác nhận
// KHÔNG đưa vào kho câu hỏi trắc nghiệm (không phù hợp kiểu "chấm tự động" của kho câu hỏi). Nhận diện
// qua chữ "tự luận" trong dòng PHẦN đó (không đoán cứng luôn là phần cuối/phần số mấy, để còn đúng cả
// khi thứ tự các phần trong 1 file khác đổi khác đi).
const QUIZ_ESSAY_PART_RE = /tự\s*luận/i;
// Toạ độ 1 mốc "Câu N." là VỊ TRÍ DÒNG CƠ SỞ (baseline) của dòng chữ đó — dấu tiếng Việt (ệ, ẫ, ỡ...)
// và các nét chữ vươn lên đều nằm PHÍA TRÊN baseline, cao thấp KHÁC NHAU tuỳ cỡ chữ/kiểu chữ từng câu.
// Từng thử trừ lùi 1 khoảng PIXEL CỐ ĐỊNH cho ranh giới — không ổn: đoán thiếu thì vẫn cắt cụt/dính
// chữ, đoán dư thì lại lấn sang đúng câu bên cạnh (đã kiểm chứng cả 2 kiểu lỗi này bằng file giả lập).
// Cách ĐÚNG hơn: tìm NGAY khoảng trắng thật giữa 2 câu (quét pixel thật, không đoán cỡ chữ) rồi cắt
// đúng GIỮA khoảng trắng đó — luôn đúng bất kể cỡ chữ/dấu cao thấp thế nào, vì dựa vào pixel thật.
function quizRowBlank(data, width, y) {
  for (let x = 0; x < width; x += 3) {
    const i = (y * width + x) * 4;
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
  }
  return true;
}

// Tìm khoảng TRẮNG LIÊN TỤC dài nhất trong dải [fromY, toY) của trang — đó chính là khoảng cách thật
// giữa cuối câu này và đầu câu sau. Trả về điểm GIỮA khoảng trắng đó để cắt, hoặc null nếu không tìm
// thấy khoảng trắng nào đủ dài (bố cục quá sát, hiếm gặp) — khi đó nơi gọi sẽ tự có phương án dự phòng.
function findBlankGapSplitY(pageCanvas, fromY, toY) {
  const width = pageCanvas.width;
  fromY = Math.max(0, Math.round(fromY));
  toY = Math.min(pageCanvas.height, Math.round(toY));
  if (toY <= fromY) return null;
  const data = pageCanvas.getContext('2d').getImageData(0, fromY, width, toY - fromY).data;
  const bandHeight = toY - fromY;
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  for (let y = 0; y <= bandHeight; y++) {
    const blank = y < bandHeight && quizRowBlank(data, width, y);
    if (blank && curStart === -1) curStart = y;
    if (!blank && curStart !== -1) {
      const len = y - curStart;
      if (len > bestLen) { bestLen = len; bestStart = curStart; }
      curStart = -1;
    }
  }
  if (bestStart === -1) return null;
  return fromY + bestStart + Math.floor(bestLen / 2);
}

// Cắt vùng dọc [top, bottom) của canvas trang thành 1 canvas riêng, tự bỏ lề trắng thừa 2 đầu (giống
// trimCanvasWhitespace ở phần PDF bài giảng) để không dư khoảng trắng quanh câu hỏi.
function cropPageCanvasVertical(pageCanvas, top, bottom) {
  const width = pageCanvas.width;
  top = Math.max(0, Math.round(top));
  bottom = Math.min(pageCanvas.height, Math.round(bottom));
  if (bottom <= top) return null;
  const data = pageCanvas.getContext('2d').getImageData(0, top, width, bottom - top).data;
  const bandHeight = bottom - top;
  let innerTop = 0;
  while (innerTop < bandHeight && quizRowBlank(data, width, innerTop)) innerTop++;
  let innerBottom = bandHeight - 1;
  while (innerBottom > innerTop && quizRowBlank(data, width, innerBottom)) innerBottom--;
  const h = innerBottom - innerTop + 1;
  if (h <= 0) return null;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = h;
  out.getContext('2d').drawImage(pageCanvas, 0, top + innerTop, width, h, 0, 0, width, h);
  return out;
}

function stackCanvasesVertically(canvases) {
  if (canvases.length === 1) return canvases[0];
  const width = Math.max(...canvases.map((c) => c.width));
  const totalHeight = canvases.reduce((s, c) => s + c.height, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = totalHeight;
  const ctx = out.getContext('2d');
  let y = 0;
  canvases.forEach((c) => { ctx.drawImage(c, 0, y); y += c.height; });
  return out;
}

// Ngân sách RIÊNG cho ảnh câu hỏi trắc nghiệm — nhỏ hơn NHIỀU so với ảnh trang bài giảng
// (LESSON_IMAGE_BUDGET_PER_SECTION, ~700KB): lúc TẠO ĐỀ THI, NHIỀU câu hỏi bị gộp vào CHUNG 1 tài
// liệu Firestore duy nhất (mảng "questions" — xem createExamForCurrentTeacher, exam-creator.js), nếu
// mỗi câu vẫn được phép nặng tới mức của 1 trang bài giảng thì 1 đề vài chục câu ảnh sẽ vượt hạn mức
// 1MiB/tài liệu ngay lập tức. Đã kiểm chứng bằng mắt (phóng to 3 lần, so trực tiếp) — chữ đen/trắng
// thường (không có hình vẽ/đồ thị) vẫn SẮC NÉT ở chất lượng nén thấp (0.3-0.4), vì JPEG chỉ mất nét ở
// vùng có màu/gradient chứ không phải chữ đơn sắc — hạ hẳn mức khởi điểm so với 0.7 trước đây mà không
// ảnh hưởng gì tới việc đọc chữ/công thức.
const QUIZ_IMAGE_BUDGET_PER_QUESTION = 150000;

function canvasToBudgetedJpeg(canvas) {
  let quality = 0.4;
  let dataUri = canvas.toDataURL('image/jpeg', quality);
  while (dataUri.length > QUIZ_IMAGE_BUDGET_PER_QUESTION && quality > 0.15) {
    quality -= 0.05;
    dataUri = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUri;
}

// Câu hỏi cắt ra chỉ cao vài dòng (không phải cả trang) nên vẫn nhẹ dù render trang gốc ở độ phân giải
// CAO HƠN hẳn mức dùng cho bài giảng (800px, ưu tiên nhẹ vì hiện NGUYÊN TRANG dài) — ở đây ưu tiên
// ĐỌC RÕ TỪNG CHỮ trong 1 câu hỏi ngắn, nên dùng riêng 1 mức phân giải cao hơn.
const QUIZ_PAGE_RENDER_WIDTH = 1500;

// pdf.js trả về chữ theo TỪNG MẢNH nhỏ (VD "Câu ", "5", ". " tách riêng nếu khác định dạng trong file
// Word gốc — đã gặp thực tế) — so khớp mẫu "Câu N." trên TỪNG MẢNH riêng lẻ dễ BỎ SÓT câu hỏi vì không
// mảnh nào có đủ cả cụm. Ghép các mảnh THEO ĐÚNG VỊ TRÍ thành từng DÒNG hoàn chỉnh trước khi so khớp.
function groupTextItemsIntoLines(items, viewportHeight, scale) {
  const positioned = items
    .filter((it) => it.str.length)
    .map((it) => ({ str: it.str, x: it.transform[4], y: (viewportHeight - it.transform[5]) * scale }));
  positioned.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [];
  positioned.forEach((it) => {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= 3) last.text += it.str;
    else lines.push({ y: it.y, text: it.str });
  });
  return lines;
}

// Trả về { questions, warnings } thay vì mảng trần — "warnings" liệt kê MỌI vấn đề gặp phải lúc nạp
// (trang lỗi, câu không cắt được ảnh, số câu bị nhảy cóc/trùng...) để báo NGAY cho giáo viên biết chỗ
// nào cần tự kiểm tra lại, thay vì im lặng bỏ qua rồi giáo viên chỉ phát hiện ra khi đã trễ (đề thiếu
// câu mà không biết thiếu đúng câu nào).
async function extractQuizFromPdf(arrayBuffer) {
  const pdfjsLib = await ensurePdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const questions = [];
  const foundNums = []; // { num, part } — xem ghi chú QUIZ_PART_MARKER_RE (tính thiếu/trùng RIÊNG từng phần)
  const warnings = [];
  let openQuestion = null; // { num, part, canvases: [...], hasOptions }
  let partIndex = 0; // tăng mỗi khi gặp 1 mốc "PHẦN" mới — file không chia phần thì luôn = 0, vẫn đúng
  let essayMode = false; // đang ở phần "tự luận" — bỏ qua hẳn, không đưa vào kho câu hỏi (đã hỏi ý kiến)

  function flushQuestion() {
    if (!openQuestion) return;
    try {
      const canvas = stackCanvasesVertically(openQuestion.canvases);
      const dataUri = canvasToBudgetedJpeg(canvas);
      const qLabel = `Câu ${openQuestion.num} (xem ảnh)`;
      if (openQuestion.hasOptions) {
        questions.push({ q: qLabel, qImage: dataUri, type: 'abcd', options: ['A', 'B', 'C', 'D'], correct: null, noShuffle: true });
      } else {
        questions.push({ q: qLabel, qImage: dataUri, type: 'text', acceptedAnswers: '', noShuffle: true });
      }
      foundNums.push({ num: parseInt(openQuestion.num, 10), part: openQuestion.part, partLabel: openQuestion.partLabel });
    } catch (e) {
      warnings.push(`Câu ${openQuestion.num}: lỗi khi dựng ảnh (${e.message}) — câu này bị bỏ qua, cần bổ sung thủ công.`);
    }
    openQuestion = null;
  }

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = QUIZ_PAGE_RENDER_WIDTH / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const lines = groupTextItemsIntoLines(content.items, baseViewport.height, scale);

      // Duyệt CẢ mốc "PHẦN" lẫn mốc "Câu" theo ĐÚNG THỨ TỰ xuất hiện trên trang (không chỉ theo mốc
      // Câu như trước) — để biết chính xác câu nào thuộc phần nào, và BỎ QUA hẳn câu thuộc phần "tự
      // luận" (giáo viên đã xác nhận không đưa vào kho câu hỏi trắc nghiệm — không có đáp án để chấm).
      const events = [];
      lines.forEach((line) => {
        const text = line.text.trim();
        const partM = text.match(QUIZ_PART_MARKER_RE);
        if (partM) { events.push({ y: line.y, kind: 'part', label: partM[1].toUpperCase(), essay: QUIZ_ESSAY_PART_RE.test(partM[2]) }); return; }
        const qM = text.match(QUIZ_QUESTION_MARKER_RE);
        if (qM) events.push({ y: line.y, kind: 'question', num: qM[1] });
      });
      events.sort((a, b) => a.y - b.y);

      const markers = [];
      let partEventSeenOnPage = false;
      let currentPartLabel = 'I'; // mặc định khi file không chia phần nào cả (vẫn dùng chung 1 nhãn)
      events.forEach((ev) => {
        if (ev.kind === 'part') { partIndex++; essayMode = ev.essay; currentPartLabel = ev.label; partEventSeenOnPage = true; return; }
        if (essayMode) return; // câu thuộc phần tự luận -> bỏ qua, không cắt ảnh, không đưa vào kho
        markers.push({ y: ev.y, num: ev.num, part: partIndex, partLabel: currentPartLabel });
      });

      const hasOptionsBetween = (top, bottom) => lines.some((line) => {
        if (line.y < top || line.y >= bottom) return false;
        return QUIZ_OPTION_MARKER_RE.test(line.text.trim());
      });

      if (!markers.length) {
        // Cả trang không có "Câu N." nào mới (thuộc phần đang nạp) — CHỈ coi là phần TIẾP THEO của câu
        // đang mở (tràn trang) khi trang này KHÔNG có mốc "PHẦN" nào — nếu có (VD cả trang chỉ là dòng
        // tiêu đề "PHẦN II. ...") thì không có gì để nối, tránh dính nhầm tiêu đề phần mới vào câu cuối
        // của phần trước.
        if (openQuestion && !essayMode && !partEventSeenOnPage) {
          const cropped = cropPageCanvasVertical(canvas, 0, canvas.height);
          if (cropped) {
            openQuestion.canvases.push(cropped);
            openQuestion.hasOptions = openQuestion.hasOptions || hasOptionsBetween(0, canvas.height);
          }
        }
        continue;
      }

      // Tính sẵn MỌI ranh giới giữa các câu trên trang bằng cách tìm khoảng trắng thật (không đoán cỡ
      // chữ) — mỗi ranh giới tính ĐÚNG 1 LẦN rồi dùng chung làm "cuối câu trước" VÀ "đầu câu sau", nên
      // không bao giờ hở (mất chữ) hay chồng (dính chữ câu bên cạnh) giữa 2 câu liền nhau.
      // Có mốc "PHẦN" trước mốc "Câu" đầu tiên trên trang -> KHÔNG nối câu đang mở với phần mới này.
      const partBeforeFirstMarker = events.some((e) => e.kind === 'part' && e.y < markers[0].y);
      const leadingSplit = (openQuestion && !partBeforeFirstMarker)
        ? (findBlankGapSplitY(canvas, 0, markers[0].y) ?? Math.max(0, markers[0].y - QUIZ_MARKER_VERTICAL_PAD))
        : 0;
      const boundaries = new Array(markers.length + 1);
      boundaries[0] = leadingSplit;
      for (let i = 1; i < markers.length; i++) {
        const gap = findBlankGapSplitY(canvas, markers[i - 1].y, markers[i].y);
        boundaries[i] = gap !== null ? gap : Math.max(boundaries[i - 1], markers[i].y - QUIZ_MARKER_VERTICAL_PAD);
      }
      boundaries[markers.length] = canvas.height;

      // Phần TRƯỚC mốc "Câu" đầu tiên trên trang (nếu có) là phần cuối của câu đang mở từ trang trước.
      if (openQuestion && !partBeforeFirstMarker && markers[0].y > 4) {
        const cropped = cropPageCanvasVertical(canvas, 0, leadingSplit);
        if (cropped) {
          openQuestion.canvases.push(cropped);
          openQuestion.hasOptions = openQuestion.hasOptions || hasOptionsBetween(0, leadingSplit);
        }
      }
      flushQuestion();

      for (let i = 0; i < markers.length; i++) {
        const top = boundaries[i];
        const bottom = boundaries[i + 1];
        const cropped = cropPageCanvasVertical(canvas, top, bottom);
        if (!cropped) {
          warnings.push(`Câu ${markers[i].num} (trang ${pageNum}): không cắt được ảnh — có thể trang này bị lỗi hiển thị, cần bổ sung thủ công.`);
          continue;
        }
        openQuestion = { num: markers[i].num, part: markers[i].part, partLabel: markers[i].partLabel, canvases: [cropped], hasOptions: hasOptionsBetween(top, bottom) };
        if (i < markers.length - 1) flushQuestion(); // còn câu sau trên cùng trang -> câu này chắc chắn đã khép
      }
    } catch (e) {
      warnings.push(`Trang ${pageNum}: lỗi khi xử lý (${e.message}) — cả trang này bị bỏ qua, cần kiểm tra lại.`);
    }
  }
  flushQuestion(); // câu cuối cùng của cả file
  if (!questions.length) throw new Error('Không tìm thấy câu hỏi nào dạng "Câu 1.", "Câu 2."... trong file PDF.');

  // Đề thi thường đánh số liên tục — số bị nhảy cóc/trùng gần như chắc chắn là dấu hiệu bỏ sót/lỗi
  // nhận diện, báo rõ ĐÚNG SỐ nào để giáo viên biết chỗ cần kiểm tra lại trong file gốc.
  // Đề chuẩn 2025 chia nhiều "PHẦN" và MỖI PHẦN ĐÁNH SỐ LẠI TỪ "Câu 1" — nên phải tính thiếu/trùng
  // RIÊNG TỪNG PHẦN (gộp theo `part`), nếu không sẽ báo trùng giả hàng loạt giữa các phần khác nhau.
  const numsByPart = new Map();
  foundNums.forEach((entry) => {
    if (!numsByPart.has(entry.part)) numsByPart.set(entry.part, { partLabel: entry.partLabel, nums: [] });
    numsByPart.get(entry.part).nums.push(entry.num);
  });
  const partWarningPrefix = (partLabel) => (partLabel ? `⚠️ Phần ${partLabel}: ` : '⚠️ ');
  Array.from(numsByPart.keys()).sort((a, b) => a - b).forEach((partKey) => {
    const { partLabel, nums } = numsByPart.get(partKey);
    const sortedNums = nums.slice().sort((a, b) => a - b);
    const seen = new Set();
    const duplicates = new Set();
    sortedNums.forEach((n) => { if (seen.has(n)) duplicates.add(n); seen.add(n); });
    if (duplicates.size) {
      warnings.unshift(`${partWarningPrefix(partLabel)}Trùng số thứ tự: Câu ${Array.from(duplicates).join(', Câu ')} — kiểm tra lại các câu này, có thể 1 câu bị cắt thành 2 ảnh.`);
    }
    const missing = [];
    for (let n = sortedNums[0]; n <= sortedNums[sortedNums.length - 1]; n++) {
      if (!seen.has(n)) missing.push(n);
    }
    if (missing.length) {
      warnings.unshift(`${partWarningPrefix(partLabel)}Thiếu số thứ tự: Câu ${missing.join(', Câu ')} — kiểm tra lại các câu này trong file gốc rồi bổ sung thủ công nếu cần.`);
    }
  });

  return { questions, warnings };
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
