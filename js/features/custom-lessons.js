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

// Lưu nhiều bài giảng cùng lúc (VD: nhiều phần trích từ 1 file nạp lên) bằng batch write —
// CHỈ 1 round-trip mạng cho toàn bộ, thay vì 1 round-trip riêng cho mỗi phần.
async function addCustomLessonBatch(chapterId, lessons) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm bài giảng.');
  const { db } = ensureFirebase();
  const batch = db.batch();
  const col = db.collection('teachers').doc(teacher.uid).collection('customLessons');
  lessons.forEach((lesson) => {
    const ref = col.doc();
    batch.set(ref, Object.assign({ chapterId, addedAt: new Date().toISOString() }, lesson));
  });
  await batch.commit();
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
