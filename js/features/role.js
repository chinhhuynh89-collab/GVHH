// Vai trò người dùng (giáo viên / học sinh) — chỉ để tổ chức giao diện trang chủ theo đúng nhu cầu,
// không phải cơ chế bảo mật thật (không có đăng nhập/mật khẩu).

const ROLE_KEY = 'hoahoc_role';

function getRole() {
  return localStorage.getItem(ROLE_KEY) || null;
}

function setRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

// "Xem thử với vai trò học sinh" (previewAsStudentBtn, index.html): giáo viên vẫn đăng nhập bằng
// chính tài khoản Google của mình, chỉ tạm đổi role='student' để mô phỏng góc nhìn học sinh (chỉ
// xem, không sửa được — xem resolveContentOwner() trong auth.js). 2 cờ dưới đây giúp các trang khác
// (chapter-overview.js) phân biệt RÕ "giáo viên đang xem thử" với "học sinh thật" dù cả 2 đều có
// role='student':
// - hoahoc_teacher_preview: có mặt = đang xem thử, không có = học sinh thật (hoặc chưa từng bật xem thử).
// - hoahoc_preview_group_code: nhóm CỤ THỂ giáo viên chọn để xem thử góc nhìn học sinh trong nhóm đó
//   (chỉ thấy đúng những chương đã giao cho nhóm đó, giống hệt học sinh thật) — rỗng/không có nghĩa
//   là mô phỏng "học sinh mới, chưa vào nhóm nào" (bị chặn xem chương trình, giống học sinh thật chưa vào nhóm).
function isTeacherPreviewingAsStudent() {
  try { return getRole() === 'student' && !!localStorage.getItem('hoahoc_teacher_preview'); } catch (e) { return false; }
}

function getPreviewGroupCode() {
  try { return localStorage.getItem('hoahoc_preview_group_code') || null; } catch (e) { return null; }
}

function setPreviewGroupCode(code) {
  try {
    if (code) localStorage.setItem('hoahoc_preview_group_code', code);
    else localStorage.removeItem('hoahoc_preview_group_code');
  } catch (e) { /* ignore */ }
}
