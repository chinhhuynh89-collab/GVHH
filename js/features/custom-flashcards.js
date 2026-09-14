// Flashcard do giáo viên tự thêm — lưu Firestore tại teachers/{uid}/customFlashcards/{id}.
// Ai cũng đọc được (để học sinh trong nhóm thấy), chỉ chính giáo viên mới ghi được.

async function addCustomFlashcard(chapterId, card) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm flashcard.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString() }, card)
  );
  if (typeof contentCacheBump === 'function') contentCacheBump('flashcards', teacher.uid);
  return ref.id;
}

async function updateCustomFlashcard(id, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').doc(id).update(patch);
  if (typeof contentCacheBump === 'function') contentCacheBump('flashcards', teacher.uid);
}

// Cache theo chapterId (xem contentCacheGet/Set, firebase-init.js) — chỉ có hiệu lực trong CÙNG 1 tab,
// tự động hết hạn ngay khi bất kỳ hàm ghi nào ở trên chạy (add/sửa/xoá), không cần lo dữ liệu cũ.
async function getCustomFlashcards(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const cached = typeof contentCacheGet === 'function' ? contentCacheGet('flashcards', ownerUid, chapterId) : null;
  if (cached) return cached;
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customFlashcards')
    .where('chapterId', '==', chapterId).get();
  const items = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  if (typeof contentCacheSet === 'function') contentCacheSet('flashcards', ownerUid, chapterId, items);
  return items;
}

async function deleteCustomFlashcard(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customFlashcards').doc(id).delete();
  if (typeof contentCacheBump === 'function') contentCacheBump('flashcards', teacher.uid);
}
