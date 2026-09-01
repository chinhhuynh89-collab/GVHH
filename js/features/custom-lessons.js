// Bài giảng do giáo viên tự nạp (từ file) hoặc tự viết thủ công — lưu trong Firestore
// tại teachers/{uid}/customLessons/{id}. Ai cũng đọc được (để học sinh trong nhóm thấy),
// chỉ chính giáo viên (đã đăng nhập, đúng uid) mới ghi được — do Security Rules đảm bảo.

async function addCustomLesson(chapterId, lesson) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm bài giảng.');
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customLessons').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString() }, lesson)
  );
  return ref.id;
}

async function updateCustomLesson(id, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customLessons').doc(id).update(patch);
}

async function getCustomLessons(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customLessons')
    .where('chapterId', '==', chapterId).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function deleteCustomLesson(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customLessons').doc(id).delete();
}
