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
