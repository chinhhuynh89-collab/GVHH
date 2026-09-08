// Trích xuất nội dung từ file ngay trên trình duyệt (không cần server).
// - Nạp bài giảng (extractFileToLessons): CHỈ nhận .pdf — vẽ mỗi trang thành 1 ảnh bằng pdf.js (đóng
//   gói sẵn trong app, js/vendor/pdfjs) để giữ đúng 100% hình thức bản in, vẫn hoạt động offline.
// - Nạp câu hỏi trắc nghiệm: từ .pdf (extractQuizFromPdf, cắt ảnh) hoặc .xlsx (quiz-excel.js, dùng lại
//   bộ đọc ZIP/XML bên dưới — readZipEntryText — để đọc .xlsx mà không cần thư viện ngoài).

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
// Phương án dự phòng CUỐI CÙNG khi hoàn toàn không có dòng thật nào đứng trước mốc để tính điểm giữa
// (cực hiếm — trang chỉ có đúng 1 dòng duy nhất là chính dòng mốc) — lùi 1 khoảng cố định thay vì để
// ranh giới trùng khớp mốc (sẽ cắt mất chính dòng đó).
const QUIZ_MARKER_VERTICAL_PAD = 24;
// Ranh giới tính theo điểm GIỮA 2 dòng (xem findPrevRealLineY/computeLineBands) đôi khi sát ngay đỉnh
// dấu tiếng Việt cao (ệ, ẫ, ữ...) của dòng phía dưới, hụt mất vài pixel đỉnh dấu — CHỈ xảy ra ở 2 MÉP
// NGOÀI CÙNG của 1 cụm cắt (đầu dòng đầu tiên/cuối dòng cuối cùng của đề hay 1 đáp án), không phải ở
// ranh giới NỘI BỘ giữa các dòng tràn trong CÙNG 1 đề/đáp án (nới rộng ở đó dễ dính lặp nội dung dòng
// bên cạnh). Nới thêm 1 tỉ lệ nhỏ so với chiều cao dòng đó ở 2 mép ngoài LUÔN AN TOÀN vì
// cropPageCanvasRect tự bỏ lề trắng thừa lại — nới ra mà không có gì để hụt thì phần nới chỉ là
// khoảng trắng, tự bị cắt bỏ ngay sau đó — xem padOuterEdges.
const QUIZ_CROP_EDGE_PAD_RATIO = 0.22;
// Toạ độ 1 mốc "Câu N." là VỊ TRÍ DÒNG CƠ SỞ (baseline) của dòng chữ đó — dấu tiếng Việt (ệ, ẫ, ỡ...)
// và các nét chữ vươn lên đều nằm PHÍA TRÊN baseline, cao thấp KHÁC NHAU tuỳ cỡ chữ/kiểu chữ từng câu.
// Từng thử trừ lùi 1 khoảng PIXEL CỐ ĐỊNH cho ranh giới — không ổn (đã kiểm chứng bằng file giả lập).
// Từng thử "tìm khoảng trắng PIXEL lớn nhất" giữa 2 mốc — cũng SAI trên đề thật: nhiều đề canh dòng
// ĐỀU NHAU tuyệt đối (không có khoảng cách dư giữa các câu so với giữa các dòng CÙNG 1 câu), nên
// "khoảng trắng lớn nhất" trong cả vùng giữa 2 mốc dễ rơi đúng vào khoảng cách NỘI BỘ của câu trước
// (VD giữa dòng đề và dòng đáp án của CHÍNH câu đó) thay vì đúng ranh giới giữa 2 câu — đã thấy tận
// mắt: đáp án câu trước bị dính vào đầu ảnh câu sau, còn đáp án của chính câu đó lại bị đẩy sang ảnh
// câu kế tiếp. Cách ĐÚNG: dùng luôn TOẠ ĐỘ DÒNG CHỮ THẬT (pdf.js cho biết chính xác, không cần đoán)
// — cắt đúng GIỮA dòng cuối cùng THẬT SỰ đứng trước mốc và chính dòng mốc đó.
function quizRowBlank(data, width, y) {
  for (let x = 0; x < width; x += 3) {
    const i = (y * width + x) * 4;
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
  }
  return true;
}

// Ước lượng khoảng cách dòng-dòng "bình thường" trên 1 trang bằng số TRUNG VỊ (median) của mọi khoảng
// cách dòng liền kề — chọn trung vị để không bị lệch bởi vài dòng công thức/kí hiệu trên-dưới dòng
// (superscript/subscript, VD dấu "+" của ion H+) xen giữa có khoảng cách NHỎ HƠN HẲN dòng thường.
function estimateLineHeight(lines) {
  if (lines.length < 2) return null;
  const deltas = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i].y - lines[i - 1].y;
    if (d > 0) deltas.push(d);
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

// Tìm toạ độ Y của dòng CHỮ THẬT gần nhất đứng trước dòng tại chỉ số `idx` trong mảng `lines` — bỏ qua
// những "dòng" thật ra chỉ là MẢNH VỠ kí hiệu trên/dưới dòng (superscript/subscript) bị tách nhầm thành
// dòng riêng vì pdf.js đặt nó lệch Y so với dòng chữ chính (dấu hiệu: khoảng cách xuống dòng kế tiếp
// nhỏ hơn HẲN 1 dòng thật — dưới nửa khoảng cách dòng bình thường của trang). Trả về null nếu dòng
// mốc này đã là dòng ĐẦU TIÊN của trang (không có gì đứng trước để cắt ranh giới).
function findPrevRealLineY(lines, idx, lineHeight) {
  if (idx <= 0) return null;
  const minGap = lineHeight ? lineHeight * 0.5 : 6;
  let j = idx - 1;
  while (j > 0 && (lines[j + 1].y - lines[j].y) < minGap) j--;
  return lines[j].y;
}

// Tính sẵn "dải dòng" (top/bottom) cho MỌI dòng trên trang — khái quát findPrevRealLineY (vốn chỉ
// tính cho riêng dòng mốc) thành ranh giới CHUNG dùng được cho bất kỳ dòng nào (đề, đáp án...), tránh
// viết trùng logic tính ranh giới dọc ở nhiều chỗ.
function computeLineBands(lines, lineHeight, canvasHeight) {
  const boundaries = new Array(lines.length + 1);
  boundaries[0] = 0;
  for (let i = 1; i < lines.length; i++) {
    const prevY = findPrevRealLineY(lines, i, lineHeight);
    boundaries[i] = prevY !== null ? (prevY + lines[i].y) / 2 : boundaries[i - 1];
  }
  boundaries[lines.length] = canvasHeight;
  return lines.map((_, i) => ({ top: boundaries[i], bottom: boundaries[i + 1] }));
}

// Tìm toạ độ X ngay SAU nhãn (VD "Câu 17." hoặc "A.") trên 1 dòng, dựa vào toạ độ X THẬT của từng mảnh
// chữ pdf.js (không đoán) — trả về null nếu nhãn DÍNH LIỀN nội dung trong CÙNG 1 mảnh text (hiếm, do
// pdf.js không cho biết vị trí X theo TỪNG KÝ TỰ, chỉ theo từng mảnh — không thể cắt sạch pixel trong
// trường hợp này, nơi gọi tự rơi về phương án dự phòng an toàn hơn thay vì cắt liều).
function findLabelEndX(line, markerRe) {
  let acc = '';
  for (let k = 0; k < line.items.length; k++) {
    acc += line.items[k].str;
    const leadingWs = acc.length - acc.replace(/^\s+/, '').length;
    const trimmed = acc.slice(leadingWs);
    const m = trimmed.match(markerRe);
    if (m && m.index === 0) {
      // Cho phép phần THỪA sau nhãn (nếu có) chỉ là khoảng trắng (VD mảnh cuối là ". " có dấu cách
      // theo sau dấu chấm) — vẫn coi là cắt SẠCH; chỉ khi có CHỮ THẬT dính liền mới không cắt được.
      const rest = acc.slice(leadingWs + m[0].length);
      const cleanCut = /^\s*$/.test(rest);
      return cleanCut ? (line.items[k].x + line.items[k].width) : null;
    }
  }
  return null;
}

// Tìm MỌI điểm bắt đầu 1 đáp án A/B/C/D trên 1 dòng — không chỉ đầu dòng, vì 2 đáp án có thể nằm
// CHUNG 1 dòng ngang (đã gặp thực tế, VD "A. HCl trong C6H6. C. Ca(OH)2 trong nước." trên cùng 1
// dòng). Chỉ ghi nhận khi cắt SẠCH được nhãn (xem findLabelEndX) — bỏ qua các điểm khớp nhưng nhãn
// dính liền nội dung, để nơi gọi đối chiếu số lượng tìm được với số lượng đếm thuần theo chữ
// (countOptionLetterSequence) rồi tự quyết định có tin kết quả tách pixel này hay không.
function findOptionMarkStartsOnLine(line) {
  const marks = [];
  for (let s = 0; s < line.items.length; s++) {
    // Bỏ qua mảnh CHỈ có khoảng trắng làm điểm bắt đầu — nếu không, khoảng trắng đứng NGAY TRƯỚC 1
    // đáp án (VD dấu cách rộng giữa 2 đáp án chung 1 dòng) cũng bị tính thành 1 điểm bắt đầu GIẢ (do
    // khoảng trắng đầu chuỗi tự động bị loại khi kiểm tra khớp mẫu) — trùng với điểm bắt đầu THẬT của
    // chính đáp án đó, làm sai số lượng đếm được rồi rơi nhầm về Tầng 2 dù đáng lẽ tách sạch được.
    if (!line.items[s].str.trim().length) continue;
    let acc = '';
    for (let k = s; k < line.items.length && acc.length <= 8; k++) {
      acc += line.items[k].str;
      const leadingWs = acc.length - acc.replace(/^\s+/, '').length;
      const trimmed = acc.slice(leadingWs);
      const m = trimmed.match(QUIZ_OPTION_MARKER_RE);
      if (m && m.index === 0) {
        const rest = acc.slice(leadingWs + m[0].length);
        if (/^\s*$/.test(rest)) {
          marks.push({ x: line.items[s].x, labelEndX: line.items[k].x + line.items[k].width, letter: trimmed[0].toUpperCase() });
        }
        break;
      }
    }
  }
  return marks;
}

// Đếm THUẦN THEO CHỮ (không phụ thuộc cách pdf.js chia mảnh) có đúng 4 đáp án A,B,C,D xuất hiện theo
// thứ tự hay không — dùng làm "đối chiếu an toàn": nếu số lượng tách được bằng pixel (findOptionMark
// StartsOnLine) không khớp con số đếm thuần theo chữ ở đây, nghĩa là có nhãn dính liền nội dung không
// tách sạch pixel được dù đếm chữ vẫn thấy đủ — KHÔNG được tin kết quả tách pixel, phải rơi về phương
// án gộp chung an toàn (Tầng 2) thay vì cắt liều ra kết quả sai.
function countOptionLetterSequence(text) {
  const matches = text.match(/[A-D][\.\):]/g) || [];
  return matches.map((m) => m[0]);
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
  out.getContext('2d', { willReadFrequently: true }).drawImage(pageCanvas, 0, top + innerTop, width, h, 0, 0, width, h);
  return out;
}

function stackCanvasesVertically(canvases) {
  if (canvases.length === 1) return canvases[0];
  const width = Math.max(...canvases.map((c) => c.width));
  const totalHeight = canvases.reduce((s, c) => s + c.height, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = totalHeight;
  // willReadFrequently: canvas ghép này thường bị đọc lại (getImageData) ngay sau đó để xoá màu tô sẵn
  // (xem analyzeAndStripHighlight) — khai báo từ lúc tạo context để trình duyệt tối ưu đường đọc-lại.
  const ctx = out.getContext('2d', { willReadFrequently: true });
  let y = 0;
  canvases.forEach((c) => { ctx.drawImage(c, 0, y); y += c.height; });
  return out;
}

// Tổng quát hoá cropPageCanvasVertical: cắt 1 dải HÌNH CHỮ NHẬT [top,bottom) x [left,right) của canvas
// trang, tự bỏ lề trắng thừa CẢ 4 CẠNH (không chỉ trên/dưới) — dùng để cắt riêng đề/từng đáp án SAU KHI
// đã trừ bỏ phần nhãn "Câu N."/"A./B./C./D." theo toạ độ X thật (xem findLabelEndX). KHÔNG thay
// cropPageCanvasVertical hiện có (giữ nguyên cho Tầng 3 — vẫn đang hoạt động đúng, tránh đổi hành vi
// ảnh cũ ngoài ý muốn).
function cropPageCanvasRect(pageCanvas, top, bottom, left, right) {
  const pageWidth = pageCanvas.width;
  top = Math.max(0, Math.round(top));
  bottom = Math.min(pageCanvas.height, Math.round(bottom));
  left = Math.max(0, Math.round(left));
  right = Math.min(pageWidth, Math.round(right));
  if (bottom <= top || right <= left) return null;
  const width = right - left;
  const height = bottom - top;
  const data = pageCanvas.getContext('2d').getImageData(left, top, width, height).data;
  let innerTop = 0;
  while (innerTop < height && quizRowBlank(data, width, innerTop)) innerTop++;
  let innerBottom = height - 1;
  while (innerBottom > innerTop && quizRowBlank(data, width, innerBottom)) innerBottom--;
  const colBlank = (x) => {
    for (let y = innerTop; y <= innerBottom; y += 3) {
      const i = (y * width + x) * 4;
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
    }
    return true;
  };
  let innerLeft = 0;
  while (innerLeft < width && colBlank(innerLeft)) innerLeft++;
  let innerRight = width - 1;
  while (innerRight > innerLeft && colBlank(innerRight)) innerRight--;
  const h = innerBottom - innerTop + 1;
  const w = innerRight - innerLeft + 1;
  if (h <= 0 || w <= 0) return null;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d', { willReadFrequently: true }).drawImage(pageCanvas, left + innerLeft, top + innerTop, w, h, 0, 0, w, h);
  return out;
}

// Cắt NHIỀU dải hình chữ nhật (mỗi dải tự chọn top/bottom/left/right riêng) rồi nối dọc thành 1 ảnh
// DUY NHẤT — dùng cho cả đề (dòng đầu cắt bỏ nhãn "Câu N." + các dòng tràn tiếp theo nếu đề dài) LẪN
// từng đáp án riêng (dòng đầu cắt bỏ nhãn "A./B./C./D." + phần tràn dòng nếu đáp án dài).
function cropRegionStrips(canvas, strips) {
  const pieces = [];
  for (const s of strips) {
    const piece = cropPageCanvasRect(canvas, s.top, s.bottom, s.left, s.right);
    if (piece) pieces.push(piece);
  }
  if (!pieces.length) return null;
  return stackCanvasesVertically(pieces);
}

// Nới thêm MÉP TRÊN của dòng ĐẦU TIÊN trong 1 nhóm dải cắt — xem QUIZ_CROP_EDGE_PAD_RATIO. CHỈ nới
// mép trên (không nới mép dưới): dấu tiếng Việt vươn CAO phía TRÊN baseline (ệ, ẫ, á...) cần thêm chỗ,
// còn phía dưới hầu như không có nét nào vươn sâu tương tự — nới thêm mép dưới từng thử nhưng bị THỪA
// QUÁ NHIỀU, dính lấn sang chữ của câu/đáp án kế tiếp (đã có giáo viên phản ánh cụ thể). Không đụng
// ranh giới nội bộ giữa các dòng tràn ở giữa (đã đúng vị trí, nới thêm ở đó dễ dính lặp nội dung).
function padOuterEdges(strips) {
  if (!strips.length) return strips;
  const first = strips[0];
  first.top -= (first.bottom - first.top) * QUIZ_CROP_EDGE_PAD_RATIO;
  return strips;
}

// Giáo viên thường TÔ SẴN màu (nền vàng/xanh highlight, hoặc chữ đỏ/xanh) để tự đánh dấu đáp án đúng
// trong file gốc lúc soạn đề — đã kiểm chứng thực tế trên file thật (đáp án đúng tô nền vàng). Nếu giữ
// nguyên màu đó khi cắt vào app, học sinh nhìn thấy ngay đáp án mà không cần suy nghĩ. 1 pixel coi là
// "có màu" khi lệch giữa kênh màu lớn nhất/nhỏ nhất (r,g,b) đủ lớn — chữ/nền đen-trắng-xám bình thường
// luôn có r≈g≈b, không bị tính nhầm.
// Gộp 2 việc vào CHUNG 1 lượt đọc/ghi pixel: (1) đo tỉ lệ pixel "có màu" TRƯỚC khi xoá (dùng để so
// sánh đáp án nào được tô sẵn — xem detectAndStripHighlight), (2) xoá luôn màu đó NGAY trong cùng lượt
// duyệt — pixel có màu chuyển thành ĐEN (chữ tô màu) hoặc TRẮNG (nền tô màu/highlight) tuỳ độ sáng gốc,
// giữ nguyên hình dạng chữ/nét. Giảm 1 nửa số lần đọc/ghi pixel so với tách riêng 2 bước — đáng kể vì
// hàm này chạy cho MỌI ảnh câu hỏi/đáp án cắt ra, ảnh hưởng trực tiếp tốc độ nạp cả đề dài. Sửa TRỰC
// TIẾP trên canvas truyền vào.
function analyzeAndStripHighlight(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return 0;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  let colored = 0;
  let sampled = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const isColored = Math.max(r, g, b) - Math.min(r, g, b) > 30;
    if ((i >> 2) % 3 === 0) { sampled++; if (isColored) colored++; } // lấy mẫu 1/3 pixel để tính tỉ lệ, đủ chính xác mà nhanh hơn quét hết
    if (isColored) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const v = lum > 150 ? 255 : 0;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return sampled ? colored / sampled : 0;
}

// Trong 1 nhóm canvas (4 đáp án), XOÁ MÀU khỏi cả 4 (luôn làm, bất kể có nhận diện được đáp án nào hay
// không) rồi tìm chỉ số đáp án có tỉ lệ pixel màu (đo được TRƯỚC khi xoá) VƯỢT TRỘI hẳn 3 đáp án còn
// lại (dấu hiệu chính là đáp án được giáo viên tô sẵn) — đòi hỏi cả "đủ nhiều màu" (>3% pixel mẫu) LẪN
// "vượt trội rõ rệt" (gấp ít nhất 3 lần đáp án có màu nhiều thứ nhì) để tránh nhận nhầm nếu nhiều đáp
// án cùng có chút màu (VD công thức hoá học có kí hiệu đặc biệt) — không chắc chắn thì thà bỏ qua (trả
// null) còn hơn tự ý chọn sai đáp án, giáo viên vẫn tự chọn lại bằng nút chọn nhanh như bình thường.
function detectAndStripHighlight(optionCanvases) {
  const fractions = optionCanvases.map(analyzeAndStripHighlight);
  const maxVal = Math.max(...fractions);
  if (maxVal < 0.03) return null;
  const maxIdx = fractions.indexOf(maxVal);
  const secondVal = Math.max(...fractions.filter((_, i) => i !== maxIdx));
  if (secondVal > 0 && maxVal < secondVal * 3) return null;
  return maxIdx;
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

// Câu hỏi tách riêng đề + từng đáp án (Tầng 1/2 — xem buildTieredQuestionImages) có NHIỀU ảnh/câu thay
// vì 1 — chia CHUNG 1 ngân sách QUIZ_IMAGE_BUDGET_PER_QUESTION cho cả cụm theo TỈ LỆ CHIỀU CAO canvas
// gốc (đề thường cao hơn hẳn 1 đáp án ngắn) thay vì áp nguyên ngân sách cho MỖI ảnh riêng (sẽ vượt xa
// tổng dung lượng cũ của 1 câu). Đặt sàn tối thiểu để ảnh quá ngắn (1 đáp án vài chữ) không bị ép nén
// xuống chất lượng thấp không cần thiết dù bản thân đã rất nhẹ.
function canvasesToBudgetedJpegs(canvases, totalBudget) {
  const totalHeight = canvases.reduce((s, c) => s + c.height, 0) || 1;
  return canvases.map((c) => {
    const budget = Math.max(20000, Math.round(totalBudget * (c.height / totalHeight)));
    let quality = 0.4;
    let dataUri = c.toDataURL('image/jpeg', quality);
    while (dataUri.length > budget && quality > 0.15) {
      quality -= 0.05;
      dataUri = c.toDataURL('image/jpeg', quality);
    }
    return dataUri;
  });
}

// Câu hỏi cắt ra chỉ cao vài dòng (không phải cả trang) nên vẫn nhẹ dù render trang gốc ở độ phân giải
// CAO HƠN hẳn mức dùng cho bài giảng (800px, ưu tiên nhẹ vì hiện NGUYÊN TRANG dài) — ở đây ưu tiên
// ĐỌC RÕ TỪNG CHỮ trong 1 câu hỏi ngắn, nên dùng riêng 1 mức phân giải cao hơn.
const QUIZ_PAGE_RENDER_WIDTH = 1500;

// pdf.js trả về chữ theo TỪNG MẢNH nhỏ (VD "Câu ", "5", ". " tách riêng nếu khác định dạng trong file
// Word gốc — đã gặp thực tế) — so khớp mẫu "Câu N." trên TỪNG MẢNH riêng lẻ dễ BỎ SÓT câu hỏi vì không
// mảnh nào có đủ cả cụm. Ghép các mảnh THEO ĐÚNG VỊ TRÍ thành từng DÒNG hoàn chỉnh trước khi so khớp.
// Giữ lại CẢ toạ độ X + bề rộng từng mảnh chữ (không chỉ Y) — cần để sau này cắt bỏ nhãn "Câu N."/
// "A./B./C./D." theo đúng ranh giới pixel thật (xem findLabelEndX/findOptionMarkStartsOnLine), thay vì
// chỉ dùng để sắp xếp thứ tự trước khi gộp thành text như trước đây. Nhân theo `scale` GIỐNG HỆT cách
// `y` đang làm để cùng hệ toạ độ pixel canvas — bản cũ CHỈ nhân scale cho y (x giữ nguyên đơn vị PDF
// point), vô hại lúc đó vì x chỉ dùng để SẮP XẾP (không đổi thứ tự dù có nhân scale hay không), nhưng
// giờ x dùng để CẮT PIXEL nên bắt buộc phải cùng đơn vị với canvas.
function groupTextItemsIntoLines(items, viewportHeight, scale) {
  const positioned = items
    .filter((it) => it.str.length)
    .map((it) => ({ str: it.str, x: it.transform[4] * scale, width: it.width * scale, y: (viewportHeight - it.transform[5]) * scale }));
  positioned.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [];
  positioned.forEach((it) => {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= 3) { last.text += it.str; last.items.push(it); }
    else lines.push({ y: it.y, text: it.str, items: [it] });
  });
  return lines;
}

// Cố cắt 1 câu hỏi thành dạng KHÔNG kèm nhãn "Câu N."/"A./B./C./D." để sau này TRỘN được vị trí câu
// và/hoặc trộn được thứ tự đáp án — CHỈ gọi khi câu hỏi gọn trong 1 trang (không tràn trang, xem nơi
// gọi trong extractQuizFromPdf). Trả về null nếu KHÔNG tách sạch được cả nhãn "Câu N." (hiếm — nhãn
// dính liền nội dung trong cùng 1 mảnh text pdf.js, không có ranh giới pixel để cắt) — khi đó nơi gọi
// tự dùng cách cũ (1 ảnh gộp, không trộn được) làm lưới an toàn, KHÔNG BAO GIỜ tệ hơn hiện tại.
//
// Trả về { stemCanvas, hasOptions, optionCanvases, optionsCanvas }:
// - hasOptions=false: câu "Nhập đáp án" (không có lựa chọn A-D) — chỉ có stemCanvas.
// - hasOptions=true, optionCanvases (mảng 4 canvas): TẦNG 1 — tách sạch cả 4 đáp án riêng, trộn được
//   cả câu lẫn đáp án.
// - hasOptions=true, optionCanvases=null, optionsCanvas: TẦNG 2 — đề tách sạch nhưng KHÔNG tách riêng
//   được từng đáp án (VD 2 đáp án chung 1 dòng mà nhãn dính liền nội dung) — gộp cả 4 đáp án (giữ
//   NGUYÊN nhãn gốc, không cắt gì thêm) vào 1 ảnh, trộn được vị trí câu nhưng KHÔNG trộn được đáp án.
function buildTieredQuestionImages(canvas, lines, bands, bottom, markerLineIdx) {
  const stemLine = lines[markerLineIdx];
  const labelEndX = findLabelEndX(stemLine, QUIZ_QUESTION_MARKER_RE);
  if (labelEndX === null) return null;

  // Dòng ĐẦU TIÊN (từ dòng mốc trở đi, trong phạm vi câu này) có mốc đáp án A-D đánh dấu ranh giới
  // giữa "đề" và "đáp án".
  let firstOptionLineIdx = -1;
  for (let i = markerLineIdx; i < lines.length && lines[i].y < bottom; i++) {
    if (findOptionMarkStartsOnLine(lines[i]).length) { firstOptionLineIdx = i; break; }
  }
  let stemLastLineIdx = markerLineIdx;
  if (firstOptionLineIdx === -1) {
    for (let i = markerLineIdx; i < lines.length && lines[i].y < bottom; i++) stemLastLineIdx = i;
  } else {
    stemLastLineIdx = firstOptionLineIdx - 1;
  }

  const stemStrips = [{ top: bands[markerLineIdx].top, bottom: bands[markerLineIdx].bottom, left: labelEndX, right: canvas.width }];
  for (let i = markerLineIdx + 1; i <= stemLastLineIdx; i++) {
    stemStrips.push({ top: bands[i].top, bottom: bands[i].bottom, left: 0, right: canvas.width });
  }
  // Đề tràn NHIỀU DÒNG (biết chắc chắn ngay tại đây — bằng đúng số dòng đã nối, không cần đoán qua tỉ
  // lệ ảnh) cần hiển thị KHÁC với đề 1 dòng (xem CSS .quiz-question-image) — ép theo bề rộng khung như
  // đề 1 dòng sẽ làm chữ co lại quá nhỏ, vỡ nét trông như bị cắt cụt.
  const stemMultiline = stemStrips.length > 1;
  padOuterEdges(stemStrips);
  const stemCanvas = cropRegionStrips(canvas, stemStrips);
  if (!stemCanvas) return null;
  analyzeAndStripHighlight(stemCanvas);

  if (firstOptionLineIdx === -1) {
    return { stemCanvas, hasOptions: false, optionCanvases: null, optionsCanvas: null, detectedCorrect: null, stemMultiline };
  }

  const optionLinesIdx = [];
  for (let i = firstOptionLineIdx; i < lines.length && lines[i].y < bottom; i++) optionLinesIdx.push(i);

  // Ảnh gộp CHUNG toàn bộ vùng đáp án (giữ NGUYÊN nhãn gốc, y hệt cách cắt cũ) — CHỈ tính khi THẬT SỰ
  // cần dùng làm lưới an toàn Tầng 2 (tách riêng từng đáp án bên dưới thất bại) — đọc pixel 2 LẦN cho
  // cùng 1 vùng (vừa cắt gộp vừa cắt riêng) tốn thời gian đáng kể khi nạp đề dài, nên chỉ cắt khi cần.
  // Vẫn xoá màu tô sẵn (nếu có) dù không xác định được CHÍNH XÁC đáp án nào — ít nhất học sinh không
  // nhìn thấy dấu vết màu, dù trường hợp này giáo viên vẫn cần tự chọn đáp án đúng bằng tay.
  const getOptionsCanvasFallback = () => {
    const optTop = bands[firstOptionLineIdx];
    const optBottom = bands[optionLinesIdx[optionLinesIdx.length - 1]];
    // Chỉ nới mép TRÊN (xem padOuterEdges) — nới mép dưới dễ dính lấn sang câu/đáp án kế tiếp.
    const top = optTop.top - (optTop.bottom - optTop.top) * QUIZ_CROP_EDGE_PAD_RATIO;
    const c = cropPageCanvasVertical(canvas, top, optBottom.bottom);
    if (c) analyzeAndStripHighlight(c);
    return c;
  };

  const optionsText = optionLinesIdx.map((i) => lines[i].text).join(' ');
  const expectedLetters = countOptionLetterSequence(optionsText);
  if (expectedLetters.length !== 4 || expectedLetters.join('') !== 'ABCD') {
    return { stemCanvas, hasOptions: true, optionCanvases: null, optionsCanvas: getOptionsCanvasFallback(), detectedCorrect: null, stemMultiline };
  }

  const marks = [];
  optionLinesIdx.forEach((i) => {
    findOptionMarkStartsOnLine(lines[i]).forEach((m) => marks.push({ lineIdx: i, x: m.x, labelEndX: m.labelEndX, letter: m.letter }));
  });
  // ĐỐI CHIẾU AN TOÀN: số lượng/thứ tự nhãn tách sạch được bằng pixel PHẢI khớp CHÍNH XÁC với số đếm
  // thuần theo chữ ở trên — lệch nghĩa là có nhãn dính liền nội dung không tách sạch pixel được (dù
  // đếm chữ vẫn thấy đủ 4) — KHÔNG được tin, rơi về Tầng 2 an toàn thay vì cắt liều ra kết quả sai.
  if (marks.length !== 4 || marks.map((m) => m.letter).join('') !== 'ABCD') {
    return { stemCanvas, hasOptions: true, optionCanvases: null, optionsCanvas: getOptionsCanvasFallback(), detectedCorrect: null, stemMultiline };
  }

  const optionCanvases = [];
  for (let k = 0; k < 4; k++) {
    const mark = marks[k];
    const nextMark = marks[k + 1]; // undefined với đáp án D (cuối cùng)
    const strips = [];
    if (nextMark && nextMark.lineIdx === mark.lineIdx) {
      // 2 đáp án chung 1 dòng ngang — cắt NGANG đúng khoảng giữa 2 nhãn trên CÙNG dòng.
      strips.push({ top: bands[mark.lineIdx].top, bottom: bands[mark.lineIdx].bottom, left: mark.labelEndX, right: nextMark.x });
    } else {
      // Đáp án nằm cuối dòng hiện tại, có thể TRÀN sang các dòng tiếp theo (đầy đủ chiều rộng) tới
      // ngay trước dòng chứa đáp án kế tiếp (hoặc hết vùng đáp án nếu là đáp án D).
      strips.push({ top: bands[mark.lineIdx].top, bottom: bands[mark.lineIdx].bottom, left: mark.labelEndX, right: canvas.width });
      const endLineIdx = nextMark ? nextMark.lineIdx : optionLinesIdx[optionLinesIdx.length - 1];
      for (let i = mark.lineIdx + 1; i < endLineIdx; i++) {
        strips.push({ top: bands[i].top, bottom: bands[i].bottom, left: 0, right: canvas.width });
      }
      if (nextMark && nextMark.lineIdx > mark.lineIdx && nextMark.x > 0) {
        strips.push({ top: bands[nextMark.lineIdx].top, bottom: bands[nextMark.lineIdx].bottom, left: 0, right: nextMark.x });
      }
    }
    padOuterEdges(strips);
    const cropped = cropRegionStrips(canvas, strips);
    if (!cropped) return { stemCanvas, hasOptions: true, optionCanvases: null, optionsCanvas: getOptionsCanvasFallback(), detectedCorrect: null, stemMultiline };
    optionCanvases.push(cropped);
  }

  // Nhận diện đáp án được TÔ SẴN màu (giáo viên tự đánh dấu đáp án đúng trong file gốc) TRƯỚC KHI xoá
  // màu — cần màu gốc để so sánh, xoá xong sẽ không còn phân biệt được nữa.
  const detectedCorrect = detectAndStripHighlight(optionCanvases);

  return { stemCanvas, hasOptions: true, optionCanvases, optionsCanvas: null, detectedCorrect, stemMultiline };
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
  // { num, part, canvases: [...], hasOptions, singlePageCtx }. `singlePageCtx` (canvas/lines/bands/
  // markerLineIdx/bottom của ĐÚNG 1 trang) chỉ tồn tại khi câu hỏi CHƯA từng bị nối thêm nội dung từ
  // trang khác — mất hiệu lực (set về null) NGAY khi có nội dung tràn trang được ghép thêm (2 chỗ
  // "openQuestion.canvases.push" bên dưới) — dùng để thử cắt tách nhãn (buildTieredQuestionImages) lúc
  // flush, CHỈ khi chắc chắn câu hỏi gọn trong 1 trang (tách nhãn khi tràn trang phức tạp/rủi ro hơn
  // nhiều, trong khi thực tế hầu hết câu hỏi đều gọn 1 trang — không đáng đánh đổi).
  let openQuestion = null;
  let partIndex = 0; // tăng mỗi khi gặp 1 mốc "PHẦN" mới — file không chia phần thì luôn = 0, vẫn đúng
  let essayMode = false; // đang ở phần "tự luận" — bỏ qua hẳn, không đưa vào kho câu hỏi (đã hỏi ý kiến)

  function flushQuestion() {
    if (!openQuestion) return;
    try {
      const qLabel = `Câu ${openQuestion.num} (xem ảnh)`;
      const tiered = openQuestion.singlePageCtx
        ? buildTieredQuestionImages(openQuestion.singlePageCtx.canvas, openQuestion.singlePageCtx.lines, openQuestion.singlePageCtx.bands, openQuestion.singlePageCtx.bottom, openQuestion.singlePageCtx.markerLineIdx)
        : null;

      if (tiered && tiered.hasOptions && tiered.optionCanvases) {
        // Tầng 1 — tách sạch cả đề lẫn TỪNG đáp án, trộn được cả câu lẫn đáp án tự do. Nếu nhận diện
        // được đáp án giáo viên đã TÔ SẴN màu trong file gốc (xem detectAndStripHighlight), tự
        // điền luôn đáp án đúng — đỡ phải bấm chọn nhanh cho câu này; không chắc thì để trống như cũ.
        const [stemImage, ...optionImages] = canvasesToBudgetedJpegs([tiered.stemCanvas, ...tiered.optionCanvases], QUIZ_IMAGE_BUDGET_PER_QUESTION);
        const q1 = { q: qLabel, stemImage, optionImages, type: 'abcd', options: ['A', 'B', 'C', 'D'], correct: tiered.detectedCorrect };
        if (tiered.stemMultiline) q1.stemMultiline = true;
        questions.push(q1);
      } else if (tiered && tiered.hasOptions && tiered.optionsCanvas) {
        // Tầng 2 — đề tách sạch (trộn được VỊ TRÍ CÂU) nhưng không tách riêng được từng đáp án (VD 2
        // đáp án chung 1 dòng, nhãn dính liền nội dung) — gộp cả 4 đáp án (giữ nguyên nhãn gốc) vào 1
        // ảnh, khoá thứ tự đáp án.
        const [stemImage, optionsImage] = canvasesToBudgetedJpegs([tiered.stemCanvas, tiered.optionsCanvas], QUIZ_IMAGE_BUDGET_PER_QUESTION);
        const q2 = { q: qLabel, stemImage, optionsImage, type: 'abcd', options: ['A', 'B', 'C', 'D'], correct: null, optionsLocked: true };
        if (tiered.stemMultiline) q2.stemMultiline = true;
        questions.push(q2);
        warnings.push(`Câu ${openQuestion.num}: không tách riêng được từng đáp án (có thể 2 đáp án chung 1 dòng) — vẫn nạp được, đề có thể trộn VỊ TRÍ CÂU nhưng KHÔNG trộn được thứ tự đáp án A/B/C/D của câu này.`);
      } else if (tiered && !tiered.hasOptions) {
        // Câu "Nhập đáp án" — không có lựa chọn A-D, chỉ cần đề (đã tách sạch nhãn "Câu N.").
        const [stemImage] = canvasesToBudgetedJpegs([tiered.stemCanvas], QUIZ_IMAGE_BUDGET_PER_QUESTION);
        const q3 = { q: qLabel, stemImage, type: 'text', acceptedAnswers: '' };
        if (tiered.stemMultiline) q3.stemMultiline = true;
        questions.push(q3);
      } else {
        // Tầng 3 — cách cũ (1 ảnh gộp kèm "Câu N.", không trộn được vị trí câu lẫn đáp án) — dùng khi
        // câu hỏi tràn trang, HOẶC (hiếm) không tách sạch được nhãn "Câu N." khỏi nội dung. Vẫn xoá màu
        // tô sẵn (nếu có) để học sinh không nhìn thấy dấu vết đáp án, dù không tự điền được đáp án nào.
        const canvas = stackCanvasesVertically(openQuestion.canvases);
        analyzeAndStripHighlight(canvas);
        const dataUri = canvasToBudgetedJpeg(canvas);
        if (openQuestion.hasOptions) {
          questions.push({ q: qLabel, qImage: dataUri, type: 'abcd', options: ['A', 'B', 'C', 'D'], correct: null, noShuffle: true });
        } else {
          questions.push({ q: qLabel, qImage: dataUri, type: 'text', acceptedAnswers: '', noShuffle: true });
        }
        if (openQuestion.singlePageCtx) {
          warnings.push(`Câu ${openQuestion.num}: không tách được nhãn "Câu N." khỏi nội dung (hiếm gặp) — vẫn nạp được nhưng KHÔNG trộn được vị trí câu này khi tạo đề.`);
        }
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
      // willReadFrequently: canvas này bị đọc lại (getImageData) RẤT NHIỀU LẦN sau đó — mỗi câu hỏi cắt
      // riêng đề + từng đáp án đều đọc pixel từ CHÍNH canvas trang này (xem cropPageCanvasRect) — khai
      // báo ngay từ lúc tạo context để trình duyệt tối ưu đường đọc-lại thay vì tối ưu cho vẽ (mặc định).
      await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;

      const lines = groupTextItemsIntoLines(content.items, baseViewport.height, scale);

      // Duyệt CẢ mốc "PHẦN" lẫn mốc "Câu" theo ĐÚNG THỨ TỰ xuất hiện trên trang (không chỉ theo mốc
      // Câu như trước) — để biết chính xác câu nào thuộc phần nào, và BỎ QUA hẳn câu thuộc phần "tự
      // luận" (giáo viên đã xác nhận không đưa vào kho câu hỏi trắc nghiệm — không có đáp án để chấm).
      const events = [];
      lines.forEach((line, idx) => {
        const text = line.text.trim();
        const partM = text.match(QUIZ_PART_MARKER_RE);
        if (partM) { events.push({ y: line.y, idx, kind: 'part', label: partM[1].toUpperCase(), essay: QUIZ_ESSAY_PART_RE.test(partM[2]) }); return; }
        const qM = text.match(QUIZ_QUESTION_MARKER_RE);
        if (qM) events.push({ y: line.y, idx, kind: 'question', num: qM[1] });
      });
      events.sort((a, b) => a.y - b.y);

      const markers = [];
      let partEventSeenOnPage = false;
      let currentPartLabel = 'I'; // mặc định khi file không chia phần nào cả (vẫn dùng chung 1 nhãn)
      events.forEach((ev) => {
        if (ev.kind === 'part') { partIndex++; essayMode = ev.essay; currentPartLabel = ev.label; partEventSeenOnPage = true; return; }
        if (essayMode) return; // câu thuộc phần tự luận -> bỏ qua, không cắt ảnh, không đưa vào kho
        markers.push({ y: ev.y, idx: ev.idx, num: ev.num, part: partIndex, partLabel: currentPartLabel });
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
            openQuestion.singlePageCtx = null; // đã tràn sang trang khác — không còn gọn 1 trang nữa
          }
        }
        continue;
      }

      // Tính sẵn MỌI ranh giới giữa các câu trên trang bằng TOẠ ĐỘ DÒNG CHỮ THẬT (không đoán bằng
      // khoảng trắng pixel — nhiều đề canh dòng đều tăm tắp, không có khoảng dư giữa 2 câu so với giữa
      // 2 dòng NỘI BỘ 1 câu, nên "tìm khoảng trắng lớn nhất" dễ chọn nhầm ranh giới nội bộ của câu
      // trước, đã thấy tận mắt: đáp án câu trước dính sang câu sau, đáp án câu này lại lạc sang câu kế
      // tiếp). Mỗi ranh giới tính ĐÚNG 1 LẦN rồi dùng chung làm "cuối câu trước" VÀ "đầu câu sau", nên
      // không bao giờ hở (mất chữ) hay chồng (dính chữ câu bên cạnh) giữa 2 câu liền nhau.
      // Có mốc "PHẦN" trước mốc "Câu" đầu tiên trên trang -> KHÔNG nối câu đang mở với phần mới này.
      const lineHeight = estimateLineHeight(lines);
      // Dải dòng CHUNG cho mọi dòng trên trang (đề/đáp án của TỪNG câu sẽ tra lại mảng này thay vì tự
      // tính lại) — xem buildTieredQuestionImages.
      const bands = computeLineBands(lines, lineHeight, canvas.height);
      const partBeforeFirstMarker = events.some((e) => e.kind === 'part' && e.y < markers[0].y);
      // Ranh giới TRƯỚC mốc "Câu" đầu tiên trên trang: LUÔN tính bằng dòng chữ thật đứng ngay trước nó
      // (có thể chính là dòng "PHẦN ..." nếu có) — dùng CHUNG 1 cách dù trang có mốc "PHẦN" hay không,
      // để tiêu đề/hướng dẫn/dòng "PHẦN ..." KHÔNG bị nuốt vào ảnh câu đầu tiên. Biến `partBeforeFirstMarker`
      // chỉ dùng để quyết định có NỐI vùng này vào câu đang mở dở từ trang trước hay không (xem bên dưới).
      const boundary0 = (() => {
        const prevY = findPrevRealLineY(lines, markers[0].idx, lineHeight);
        return prevY !== null ? (prevY + markers[0].y) / 2 : 0;
      })();
      const boundaries = new Array(markers.length + 1);
      boundaries[0] = boundary0;
      for (let i = 1; i < markers.length; i++) {
        const prevY = findPrevRealLineY(lines, markers[i].idx, lineHeight);
        boundaries[i] = prevY !== null ? (prevY + markers[i].y) / 2 : Math.max(boundaries[i - 1], markers[i].y - QUIZ_MARKER_VERTICAL_PAD);
      }
      boundaries[markers.length] = canvas.height;

      // Phần TRƯỚC mốc "Câu" đầu tiên trên trang CHỈ được nối vào câu đang mở khi THẬT SỰ có câu đang mở
      // (tràn trang từ trang trước) — nếu đây là mốc "Câu" đầu tiên của CẢ FILE (chưa mở câu nào), phần
      // trước đó (tiêu đề/hướng dẫn đầu file) không thuộc câu nào, bỏ qua không nạp vào đâu cả.
      if (openQuestion && !partBeforeFirstMarker && markers[0].y > 4) {
        const cropped = cropPageCanvasVertical(canvas, 0, boundary0);
        if (cropped) {
          openQuestion.canvases.push(cropped);
          openQuestion.hasOptions = openQuestion.hasOptions || hasOptionsBetween(0, boundary0);
          openQuestion.singlePageCtx = null; // đã nối thêm nội dung tràn từ trang trước — không còn gọn 1 trang
        }
      }
      flushQuestion();

      // Nới thêm MÉP TRÊN 1 khoảng nhỏ (tính theo 1 dòng, KHÔNG theo cả khối) trước khi cắt — xem
      // QUIZ_CROP_EDGE_PAD_RATIO/padOuterEdges — tránh hụt đỉnh dấu tiếng Việt cao ở dòng đầu tiên của
      // câu. KHÔNG nới mép dưới (từng thử, bị THỪA QUÁ NHIỀU, dính lấn sang câu kế tiếp — đã có giáo
      // viên phản ánh cụ thể). cropPageCanvasVertical tự bỏ lề trắng thừa lại nên nới mép trên không
      // hại gì nếu không cần đến.
      const edgePad = (lineHeight || 10) * QUIZ_CROP_EDGE_PAD_RATIO;
      for (let i = 0; i < markers.length; i++) {
        const top = boundaries[i];
        const bottom = boundaries[i + 1];
        const cropped = cropPageCanvasVertical(canvas, top - edgePad, bottom);
        if (!cropped) {
          warnings.push(`Câu ${markers[i].num} (trang ${pageNum}): không cắt được ảnh — có thể trang này bị lỗi hiển thị, cần bổ sung thủ công.`);
          continue;
        }
        openQuestion = {
          num: markers[i].num, part: markers[i].part, partLabel: markers[i].partLabel,
          canvases: [cropped], hasOptions: hasOptionsBetween(top, bottom),
          singlePageCtx: { canvas, lines, bands, markerLineIdx: markers[i].idx, bottom }
        };
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
