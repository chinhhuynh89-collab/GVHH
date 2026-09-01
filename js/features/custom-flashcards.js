// Flashcard do giáo viên tự thêm — lưu Firestore tại teachers/{uid}/customFlashcards/{id}.
// Ai cũng đọc được (để học sinh trong nhóm thấy), chỉ chính giáo viên mới ghi được.

async function addCustomFlashcard(chapterId, card) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm flashcard.');
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString() }, card)
  );
  return ref.id;
}

async function updateCustomFlashcard(id, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').doc(id).update(patch);
}

async function getCustomFlashcards(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customFlashcards')
    .where('chapterId', '==', chapterId).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function deleteCustomFlashcard(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').doc(id).delete();
}
