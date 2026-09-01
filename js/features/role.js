// Vai trò người dùng (giáo viên / học sinh) — chỉ để tổ chức giao diện trang chủ theo đúng nhu cầu,
// không phải cơ chế bảo mật thật (không có đăng nhập/mật khẩu).

const ROLE_KEY = 'hoahoc_role';

function getRole() {
  return localStorage.getItem(ROLE_KEY) || null;
}

function setRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

function clearRole() {
  localStorage.removeItem(ROLE_KEY);
}
