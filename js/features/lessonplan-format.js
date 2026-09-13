// Định dạng + in giáo án AI theo mẫu Công văn 5512/BGDĐT-GDTrH — dùng CHUNG giữa chapter-detail.js
// (xem/in ngay sau khi vừa tạo) và lessonplan-bank.js (trang "Kho giáo án", xem/in giáo án đã lưu
// trước đó). Tách riêng file này để không phải viết trùng 2 nơi.

function formatLessonPlanHtml(plan) {
  if (!plan) return '';
  const list = (arr) => ((Array.isArray(arr) && arr.length) ? `<ul style="margin:4px 0;padding-left:20px;">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="hint">(không có)</p>');
  const hoatDong = (Array.isArray(plan.tienTrinh) ? plan.tienTrinh : []).map((h, i) => `
    <h4 style="margin:14px 0 4px;">${escapeHtml(h.tenHoatDong || `Hoạt động ${i + 1}`)}</h4>
    <p><strong>a) Mục tiêu:</strong> ${escapeHtml(h.mucTieu || '')}</p>
    <p><strong>b) Nội dung:</strong> ${escapeHtml(h.noiDung || '')}</p>
    <p><strong>c) Sản phẩm:</strong> ${escapeHtml(h.sanPham || '')}</p>
    <p><strong>d) Tổ chức thực hiện:</strong> ${escapeHtml(h.toChucThucHien || '')}</p>
  `).join('');
  return `
    <h2 style="margin-top:0;">KẾ HOẠCH BÀI DẠY</h2>
    <p><strong>Tên bài:</strong> ${escapeHtml(plan.tenBai || '')} &nbsp; <strong>Môn:</strong> ${escapeHtml(plan.monHoc || '')} &nbsp; <strong>Lớp:</strong> ${escapeHtml(String(plan.lop || ''))} &nbsp; <strong>Số tiết:</strong> ${escapeHtml(String(plan.soTiet || ''))}</p>
    <h3>I. Mục tiêu</h3>
    <p><strong>1. Kiến thức</strong></p>${list(plan.mucTieu && plan.mucTieu.kienThuc)}
    <p><strong>2. Năng lực</strong></p>${list(plan.mucTieu && plan.mucTieu.nangLuc)}
    <p><strong>3. Phẩm chất</strong></p>${list(plan.mucTieu && plan.mucTieu.phamChat)}
    <h3>II. Thiết bị dạy học và học liệu</h3>
    ${list(plan.thietBiDayHoc)}
    <h3>III. Tiến trình dạy học</h3>
    ${hoatDong}
  `;
}

function printLessonPlan(plan) {
  const html = formatLessonPlanHtml(plan);
  const w = window.open('', '_blank');
  if (!w) { if (typeof showToast === 'function') showToast('Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.'); return; }
  w.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>${escapeHtml(plan.tenBai || 'Giáo án')}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;max-width:800px;margin:24px auto;padding:0 16px;}
      h2{text-align:center;} h3{margin-top:20px;border-bottom:1px solid #ccc;padding-bottom:4px;}
      ul{margin:4px 0;} li{margin-bottom:2px;}
    </style>
    </head><body>${html}</body></html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
