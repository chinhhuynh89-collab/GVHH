// Đề xuất/góp ý/báo lỗi từ giáo viên hoặc học sinh — gửi thẳng vào Firestore collection "feedback"
// để admin xem tổng hợp ở trang Quản trị (buildFeedbackSection, admin.js) và kịp thời hồi đáp/nâng
// cấp sản phẩm. Chỉ admin đọc được (có thể chứa nội dung riêng tư về trải nghiệm sử dụng của từng
// người) — ai đã đăng nhập (giáo viên lẫn học sinh) cũng gửi được, xem firestore.rules.

async function submitFeedback({ uid, role, name, code, category, content }) {
  if (!uid) throw new Error('Cần đăng nhập trước khi gửi góp ý.');
  if (!content || !content.trim()) throw new Error('Nhập nội dung góp ý.');
  const { db } = ensureFirebase();
  await db.collection('feedback').add({
    uid, role: role || 'unknown', name: name || '', code: code || '',
    category: category || 'suggestion', content: content.trim(),
    status: 'new', createdAt: new Date().toISOString()
  });
}

// Mới nhất lên đầu — orderBy 1 field duy nhất, không kết hợp where() nên không cần tạo composite
// index thủ công (khác kiểu truy vấn ở fetchTeacherProvisionedStudents, teacher-student-accounts.js).
async function listAllFeedback() {
  const { db } = ensureFirebase();
  const snap = await db.collection('feedback').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function setFeedbackStatus(id, status) {
  const { db } = ensureFirebase();
  await db.collection('feedback').doc(id).update({ status });
}
