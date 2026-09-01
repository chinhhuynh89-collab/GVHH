// Định danh thiết bị (không cần đăng nhập) — dùng để giáo viên biết bài nộp nào của học sinh nào,
// và tránh học sinh nộp bài trùng lặp trên cùng 1 máy.

function getDeviceId() {
  var key = 'hoahoc_device_id';
  var id = localStorage.getItem(key);
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, id);
  }
  return id;
}
