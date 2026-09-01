// Câu hỏi trắc nghiệm do giáo viên tự thêm (thủ công / nạp .txt / nạp Excel-CSV) — lưu Firestore
// tại teachers/{uid}/customQuiz/{id}. Ai cũng đọc được, chỉ chính giáo viên mới ghi được.

async function addCustomQuiz(chapterId, question) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm câu hỏi.');
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customQuiz').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString() }, question)
  );
  return ref.id;
}

async function addCustomQuizBatch(chapterId, questions) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để nạp câu hỏi.');
  const { db } = ensureFirebase();
  const batch = db.batch();
  const col = db.collection('teachers').doc(teacher.uid).collection('customQuiz');
  questions.forEach((q) => {
    const ref = col.doc();
    batch.set(ref, Object.assign({ chapterId, addedAt: new Date().toISOString() }, q));
  });
  await batch.commit();
}

async function updateCustomQuiz(id, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customQuiz').doc(id).update(patch);
}

async function getCustomQuiz(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customQuiz')
    .where('chapterId', '==', chapterId).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function deleteCustomQuiz(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customQuiz').doc(id).delete();
}
