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

// ---------- Nhận diện tiêu đề đánh số thủ công (I., 1., a)...) ----------
// Nhiều giáo án KHÔNG dùng kiểu "Heading" có sẵn của Word mà tự đánh số thủ công (I. MỤC LỚN / 1. Mục
// con / a) Mục nhỏ hơn). Chỉ coi là tiêu đề nếu NGẮN (dưới 100 ký tự) để tránh nhầm 1 câu văn dài tình
// cờ bắt đầu bằng số/chữ cái + dấu chấm/ngoặc (VD "1. Một số ví dụ cho thấy...").
const NUMBERED_HEADING_RE = /^([IVXLCDM]+\.|[0-9]+\.|[a-zđ]\))\s+\S/i;
function looksLikeNumberedHeading(text) {
  return text.length <= 100 && NUMBERED_HEADING_RE.test(text);
}

// ---------- Ảnh nhúng trong .docx (word/_rels/document.xml.rels: rId -> đường dẫn media) ----------
// Không throw nếu thiếu/lỗi — tài liệu không có ảnh nào (hoặc rels đọc lỗi) vẫn nạp được bình thường
// phần chữ, chỉ là không có ảnh nào để nhúng.
async function readDocxRelationships(arrayBuffer) {
  let relsXml;
  try { relsXml = await readZipEntryText(arrayBuffer, 'word/_rels/document.xml.rels'); }
  catch (e) { return {}; }
  const map = {};
  const re = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
  let m;
  while ((m = re.exec(relsXml))) map[m[1]] = m[2];
  return map;
}

// Biến thể của readZipEntryText nhưng trả về BYTES thô (ảnh là dữ liệu nhị phân — TextDecoder ở
// readZipEntryText sẽ làm hỏng dữ liệu) — trả null nếu không tìm thấy/lỗi thay vì throw, để 1 ảnh
// thiếu/hỏng không chặn việc nạp cả file.
async function readZipEntryBytes(arrayBuffer, entryName) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const entry = zipFindCentralEntry(view, bytes, entryName);
    if (!entry) return null;
    const loc = entry.localHeaderOffset;
    if (view.getUint32(loc, true) !== ZIP_LOC_SIG) return null;
    const nameLen = view.getUint16(loc + 26, true);
    const extraLen = view.getUint16(loc + 28, true);
    const dataStart = loc + 30 + nameLen + extraLen;
    const compressed = bytes.subarray(dataStart, dataStart + entry.compSize);
    return entry.compMethod === 0 ? compressed : await inflateRawBytes(compressed);
  } catch (e) { return null; }
}

// Chỉ 2 định dạng ảnh này trình duyệt hiển thị được trực tiếp — các định dạng cũ (.wmf/.emf/.wdp, hay
// gặp ở công thức dán từ Equation Editor/MathType) không có cách đọc được, phải báo cảnh báo thay vì
// nhúng (xem findEmbeddedImageRid + nhánh xử lý trong groupDocxParagraphs).
const DOCX_IMAGE_MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// Thu nhỏ + nén ảnh về cỡ vừa đủ hiển thị trên điện thoại rồi nhúng thẳng vào tài liệu Firestore dạng
// base64 — không cần giữ nguyên độ phân giải gốc (thường lớn hơn nhiều lần mức cần thiết), và không
// cần bật thêm dịch vụ lưu file riêng (Firebase Storage) chỉ để hiển thị vài chục ảnh nhỏ mỗi bài.
async function resizeImageToDataUri(bytes, mimeType, maxWidth) {
  const blob = new Blob([bytes], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (typeof bitmap.close === 'function') bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

// ---------- Giữ định dạng chữ (đậm/nghiêng/gạch chân/màu/tô sáng/chỉ số trên-dưới) khi nạp bài giảng ----------
// Giáo viên yêu cầu giữ đúng "hình dạng, màu sắc" như trong giáo án gốc — quan trọng nhất với Hoá học là
// chỉ số dưới/trên trong công thức (H₂O, Fe²⁺...), và màu/tô sáng giáo viên dùng để nhấn mạnh ý chính.
// KHÔNG giữ font chữ/cỡ chữ (không đáng kể so với nội dung, và không phải máy nào cũng có đúng font đó).
const WORD_HIGHLIGHT_COLOR = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff',
  red: '#ff0000', darkBlue: '#00008b', darkCyan: '#008b8b', darkGreen: '#006400',
  darkMagenta: '#8b008b', darkRed: '#8b0000', darkYellow: '#808000', darkGray: '#a9a9a9',
  lightGray: '#d3d3d3', black: '#000000', white: '#ffffff'
};

// true nếu thẻ bật (có mặt và KHÔNG bị tắt tường minh bằng w:val="false"/"0") — theo đúng quy ước OOXML:
// 1 thẻ bật (VD <w:b/>) mà không có w:val nghĩa là BẬT, chỉ TẮT khi ghi rõ w:val="false"/"0"/"none".
function ooxmlFlagOn(rPr, tag) {
  const el = rPr.getElementsByTagName(tag)[0];
  if (!el) return false;
  const val = el.getAttribute('w:val');
  return val !== 'false' && val !== '0' && val !== 'none';
}

// Dựng HTML AN TOÀN (đã escape phần chữ) cho 1 run — dùng escapeHtml (js/app.js) rồi mới bọc thẻ định
// dạng, tuyệt đối không escape SAU khi đã có thẻ (sẽ biến thẻ thật thành chữ "<b>" hiển thị trên màn hình).
function runToHtml(rEl) {
  let text = '';
  Array.from(rEl.children).forEach((child) => {
    const tag = child.tagName;
    if (tag === 'w:t') text += child.textContent;
    else if (tag === 'w:br' || tag === 'w:cr') text += '\n';
    else if (tag === 'w:tab') text += '\t';
  });
  if (!text) return '';
  let html = escapeHtml(text).replace(/\n/g, '<br>').replace(/\t/g, '&emsp;');
  const rPr = rEl.getElementsByTagName('w:rPr')[0];
  if (!rPr) return html;
  const vertAlign = rPr.getElementsByTagName('w:vertAlign')[0];
  const vertVal = vertAlign ? vertAlign.getAttribute('w:val') : null;
  if (vertVal === 'subscript') html = `<sub>${html}</sub>`;
  else if (vertVal === 'superscript') html = `<sup>${html}</sup>`;
  if (ooxmlFlagOn(rPr, 'w:b')) html = `<b>${html}</b>`;
  if (ooxmlFlagOn(rPr, 'w:i')) html = `<i>${html}</i>`;
  if (ooxmlFlagOn(rPr, 'w:u')) html = `<u>${html}</u>`;
  if (ooxmlFlagOn(rPr, 'w:strike')) html = `<s>${html}</s>`;
  const colorEl = rPr.getElementsByTagName('w:color')[0];
  const colorVal = colorEl ? colorEl.getAttribute('w:val') : null;
  const highlightEl = rPr.getElementsByTagName('w:highlight')[0];
  const highlightVal = highlightEl ? highlightEl.getAttribute('w:val') : null;
  const styles = [];
  if (colorVal && /^[0-9a-fA-F]{6}$/.test(colorVal)) styles.push(`color:#${colorVal}`);
  if (highlightVal && WORD_HIGHLIGHT_COLOR[highlightVal]) styles.push(`background:${WORD_HIGHLIGHT_COLOR[highlightVal]}`);
  if (styles.length) html = `<span style="${styles.join(';')}">${html}</span>`;
  return html;
}

function paragraphRunsToHtml(pEl) {
  return Array.from(pEl.getElementsByTagName('w:r')).map(runToHtml).join('');
}

// Tìm rId ảnh nhúng trong 1 đoạn văn (nếu có) — soi bên trong <w:drawing>/<w:pict>/<w:object> (không soi
// cả đoạn văn) để tránh nhầm với "r:id" ở chỗ khác không liên quan (VD <w:hyperlink r:id="...">).
// <w:object> là công thức chèn qua Equation Editor/MathType (OLE) — Word lưu kèm 1 ảnh xem trước
// (thường .wmf, qua <v:imagedata r:id="...">) NGAY TRƯỚC phần OLE nhị phân thật trong cùng thẻ, nên
// regex bên dưới luôn khớp đúng ảnh xem trước trước tiên. Thiếu nhánh này khiến toàn bộ công thức/mũi
// tên phản ứng chèn bằng Equation Editor (rất phổ biến trong tài liệu Hoá học) biến mất im lặng, kể cả
// khi nằm giữa 1 câu chữ bình thường (VD "CH3COOH ⇌ CH3COO⁻" mất mũi tên) hoặc chiếm trọn 1 ô bảng.
function findEmbeddedImageRid(pEl) {
  const holder = pEl.getElementsByTagName('w:drawing')[0]
    || pEl.getElementsByTagName('w:pict')[0]
    || pEl.getElementsByTagName('w:object')[0];
  if (!holder) return null;
  const xml = new XMLSerializer().serializeToString(holder);
  const m = xml.match(/r:embed="(rId\d+)"/) || xml.match(/r:id="(rId\d+)"/);
  return m ? m[1] : null;
}

// ---------- Bảng thật (<w:tbl>) — giữ đúng cấu trúc hàng/cột thay vì băm thành các dòng rời rạc ----------
// Ô bảng có thể chứa ảnh (VD các ô "Ví dụ N" kèm hình/công thức minh hoạ) — không thể nhúng thật 1 ảnh
// base64 vào giữa 1 ô kiểu chuỗi, nên chỉ chèn 1 dòng đánh dấu NGẮN NGAY TRONG Ô đó — vẫn hơn hẳn việc
// im lặng bỏ qua hoàn toàn như trước (giáo viên biết đúng ô nào có ảnh cần xem lại file gốc).
// Firestore KHÔNG cho phép mảng lồng mảng trực tiếp (chỉ mảng chứa map/chuỗi/số) — mỗi hàng phải bọc
// thành 1 object { cells: [...] } thay vì mảng trần, nếu không WriteBatch.set() sẽ báo lỗi "Nested
// arrays are not supported" (đã gặp thực tế khi giáo viên nạp thử).
// Mỗi ô giữ { html, bg? } — html đã escape/định dạng sẵn (xem runToHtml), bg là màu tô nền ô (nếu giáo
// án có tô màu ô, VD bảng so sánh) lấy từ <w:tcPr><w:shd w:fill="RRGGBB"/></w:tcPr>.
// fill="FFFFFF" (trắng) không tính là tô màu — hầu hết template Word để mặc định thế, coi là "không tô"
// để tránh vẽ nhầm khối trắng trên nền tối của app.
function readShdFillColor(propsEl) {
  const shd = propsEl ? propsEl.getElementsByTagName('w:shd')[0] : null;
  const fill = shd ? shd.getAttribute('w:fill') : null;
  return (fill && /^[0-9a-fA-F]{6}$/.test(fill) && fill.toLowerCase() !== 'ffffff') ? '#' + fill : null;
}

function extractDocxTableCellShading(tc) {
  return readShdFillColor(tc.getElementsByTagName('w:tcPr')[0]);
}

// Nhiều giáo án tô màu NGUYÊN 1 ĐOẠN VĂN làm khối nhấn mạnh (VD băng "Dạng 1: ..." nền xanh chữ trắng)
// qua <w:pPr><w:shd fill="RRGGBB"/></w:pPr> — khác với màu CHỮ (<w:color>, đã xử lý ở runToHtml). Không
// giữ lại thì chữ trắng/sáng mất nền sẽ khó đọc hoặc biến mất trên nền app.
function extractParagraphShading(pEl) {
  return readShdFillColor(pEl.getElementsByTagName('w:pPr')[0]);
}

function extractDocxTableRows(tblEl) {
  return Array.from(tblEl.getElementsByTagName('w:tr')).map((tr) => ({
    cells: Array.from(tr.getElementsByTagName('w:tc')).map((tc) => {
      const paraHtml = Array.from(tc.getElementsByTagName('w:p')).map((p) => {
        const runHtml = paragraphRunsToHtml(p);
        return findEmbeddedImageRid(p) ? (runHtml + ' [Hình ảnh/công thức — xem file gốc]').trim() : runHtml;
      });
      const html = paraHtml.join('<br>');
      const bg = extractDocxTableCellShading(tc);
      return bg ? { html, bg } : { html };
    })
  }));
}

// Ngân sách dung lượng ảnh nhúng cho MỖI PHẦN (mỗi phần = 1 tài liệu Firestore riêng khi lưu, xem
// addCustomLessonBatch trong custom-lessons.js) — tính theo độ dài chuỗi base64, chừa chỗ cho phần chữ
// trong hạn mức 1MiB/tài liệu của Firestore. Vượt ngưỡng thì các ảnh còn lại trong phần đó chuyển
// thành cảnh báo thay vì nhúng tiếp, để không làm hỏng cả việc lưu.
const LESSON_IMAGE_BUDGET_PER_SECTION = 700000;

async function groupDocxParagraphs(xmlText, arrayBuffer, relMap) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Không đọc được nội dung XML bên trong file .docx.');
  }
  // Duyệt trực tiếp con của <w:body> theo ĐÚNG THỨ TỰ xuất hiện (thay vì getElementsByTagName('w:p')
  // phẳng như trước — cách đó lấy luôn các đoạn văn NẰM TRONG Ô BẢNG như đoạn văn thường, băm mất cấu
  // trúc hàng/cột) — nhờ vậy tách đúng nhánh xử lý theo từng loại thẻ con (w:p thường / w:tbl).
  const bodyEl = doc.getElementsByTagName('w:body')[0];
  const children = bodyEl ? Array.from(bodyEl.children) : [];
  const sections = [];
  let current = { title: null, points: [] };
  let imageBudgetUsed = 0;

  function startNewSection(title) {
    if (current.title || current.points.length) sections.push(current);
    current = { title, points: [] };
    imageBudgetUsed = 0;
  }

  for (const el of children) {
    const tag = el.tagName;
    if (tag === 'w:tbl') {
      const rows = extractDocxTableRows(el);
      if (rows.length) current.points.push({ type: 'table', rows });
      continue;
    }
    if (tag !== 'w:p') continue; // bỏ qua w:sectPr và các thẻ hiếm gặp khác ở cấp thân tài liệu

    const styleEl = el.getElementsByTagName('w:pStyle')[0];
    const styleVal = styleEl ? (styleEl.getAttribute('w:val') || '') : '';
    const text = Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent).join('').trim();
    const isHeading = /^(Heading|Title)/i.test(styleVal) || (!!text && looksLikeNumberedHeading(text));

    if (isHeading) { startNewSection(text); continue; }

    const rid = findEmbeddedImageRid(el);
    if (rid && relMap[rid]) {
      const target = relMap[rid].replace(/^\.\.\//, '');
      const ext = (target.split('.').pop() || '').toLowerCase();
      const mime = DOCX_IMAGE_MIME_BY_EXT[ext];
      let handled = false;
      if (mime) {
        const bytes = await readZipEntryBytes(arrayBuffer, 'word/' + target);
        if (bytes) {
          if (imageBudgetUsed < LESSON_IMAGE_BUDGET_PER_SECTION) {
            try {
              const dataUri = await resizeImageToDataUri(bytes, mime, 640);
              imageBudgetUsed += dataUri.length;
              current.points.push({ type: 'image', dataUri, alt: 'Hình minh hoạ' });
              handled = true;
            } catch (e) { /* rơi xuống nhánh cảnh báo bên dưới nếu giải mã ảnh lỗi */ }
          } else {
            current.points.push({ type: 'warning', message: 'Ảnh minh hoạ tại đây đã vượt giới hạn dung lượng của bài giảng — không nhúng được, cần bổ sung thủ công.' });
            handled = true;
          }
        }
      }
      if (!handled) {
        current.points.push({ type: 'warning', message: 'Có hình ảnh/công thức tại đây trong bản gốc (định dạng ảnh cũ, trình duyệt không đọc được) — cần bổ sung thủ công.' });
      }
    }

    if (text) {
      const bg = extractParagraphShading(el);
      current.points.push(bg ? { type: 'text', html: paragraphRunsToHtml(el), bg } : { type: 'text', html: paragraphRunsToHtml(el) });
    }
  }
  if (current.title || current.points.length) sections.push(current);
  return sections;
}

async function extractDocx(arrayBuffer, fileName) {
  const xmlText = await readZipEntryText(arrayBuffer, 'word/document.xml');
  const relMap = await readDocxRelationships(arrayBuffer);
  const sections = await groupDocxParagraphs(xmlText, arrayBuffer, relMap);
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
