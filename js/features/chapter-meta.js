// Tiêu đề / mô tả chương do giáo viên tự sửa — lưu Firestore tại teachers/{uid}/chapterMeta/{chapterId}.
// Ai cũng đọc được, chỉ chính giáo viên mới ghi được.

async function getChapterMeta(ownerUid, chapterId) {
  if (!ownerUid) return null;
  const { db } = ensureFirebase();
  const doc = await db.collection('teachers').doc(ownerUid).collection('chapterMeta').doc(chapterId).get();
  return doc.exists ? doc.data() : null;
}

async function setChapterMeta(chapterId, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('chapterMeta').doc(chapterId).set(patch, { merge: true });
}
