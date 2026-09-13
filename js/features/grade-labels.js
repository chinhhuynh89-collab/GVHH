// Giáo viên đổi tên hiển thị 1 khối lớp mặc định (VD "Lớp 10" -> "Khối 10 nâng cao") — lưu Firestore
// tại teachers/{uid}/gradeLabels/{grade}. Ai cũng đọc được (học sinh trong nhóm cần thấy đúng tên
// giáo viên đã đổi), chỉ chính giáo viên mới ghi được. KHÔNG đổi dữ liệu chương trình thật (vẫn dùng
// đúng nội dung lớp N có sẵn) — chỉ đổi CHỮ hiển thị trên tab.

async function getGradeLabels(ownerUid) {
  if (!ownerUid) return {};
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('gradeLabels').get();
  const map = {};
  snap.docs.forEach((d) => {
    const label = d.data().label;
    if (label) map[d.id] = label;
  });
  return map;
}

async function setGradeLabel(grade, label) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const ref = db.collection('teachers').doc(teacher.uid).collection('gradeLabels').doc(String(grade));
  if (!label) await ref.delete();
  else await ref.set({ label });
}
