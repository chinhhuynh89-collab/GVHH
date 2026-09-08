// Câu hỏi trắc nghiệm do giáo viên tự thêm (thủ công / nạp .txt / nạp .docx / nạp .pdf) — lưu Firestore
// tại teachers/{uid}/customQuiz/{id}. Ai cũng đọc được, chỉ chính giáo viên mới ghi được.
//
// Mỗi câu lưu kèm "order" (số tăng dần) để getCustomQuiz sắp xếp lại ĐÚNG THỨ TỰ đã nạp — giống hệt
// lý do đã áp dụng cho customLessons (xem custom-lessons.js): Firestore .where() không tự giữ thứ tự
// chèn, nạp 1 file thành nhiều câu hỏi mà thiếu field này sẽ hiện ra lộn xộn.

async function addCustomQuiz(chapterId, question) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm câu hỏi.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customQuiz').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString(), order: Date.now() }, question)
  );
  return ref.id;
}

// Câu hỏi nạp từ PDF có thể kèm ảnh chụp nguyên câu (qImage, xem doc-import.js) — nặng hơn nhiều so
// với câu hỏi thuần chữ trước đây, nên 1 lượt batch.commit() dồn hết có thể vượt giới hạn ~10MB/lượt
// ghi của Firestore dù từng câu vẫn dưới 1MB (đã gặp đúng lỗi này với customLessons — xem
// addCustomLessonBatch). Chia nhỏ theo cả số lượng lẫn dung lượng ước tính, không dồn 1 lượt.
async function addCustomQuizBatch(chapterId, questions) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để nạp câu hỏi.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const col = db.collection('teachers').doc(teacher.uid).collection('customQuiz');
  const base = Date.now();
  const docs = questions.map((q, index) =>
    Object.assign({ chapterId, addedAt: new Date().toISOString(), order: base + index }, q)
  );

  const MAX_BATCH_OPS = 400;
  const MAX_BATCH_BYTES = 8 * 1024 * 1024;
  let batch = db.batch();
  let opCount = 0;
  let byteCount = 0;
  const commits = [];
  docs.forEach((doc) => {
    const size = JSON.stringify(doc).length;
    if (opCount > 0 && (opCount >= MAX_BATCH_OPS || byteCount + size > MAX_BATCH_BYTES)) {
      commits.push(batch.commit());
      batch = db.batch();
      opCount = 0;
      byteCount = 0;
    }
    batch.set(col.doc(), doc);
    opCount++;
    byteCount += size;
  });
  if (opCount > 0) commits.push(batch.commit());
  await Promise.all(commits);
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
  const items = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  items.sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Infinity;
    const bo = typeof b.order === 'number' ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return (a.addedAt || '').localeCompare(b.addedAt || '');
  });
  return items;
}

async function deleteCustomQuiz(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customQuiz').doc(id).delete();
}

// Xoá TOÀN BỘ câu hỏi tự thêm/nạp từ file trong 1 chương — giống hệt deleteAllCustomLessons (xem
// custom-lessons.js): cần khi 1 lần nạp cũ đã lưu sai (VD do lỗi vừa sửa) và giáo viên muốn nạp lại từ
// đầu, thay vì xoá tay từng câu một khi đề có hàng chục/hàng trăm câu. KHÔNG đụng câu hỏi có sẵn trong
// app (builtin). Firestore giới hạn 500 thao tác/batch — chia nhỏ 400/lần cho an toàn.
async function deleteAllCustomQuiz(chapterId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const col = db.collection('teachers').doc(teacher.uid).collection('customQuiz');
  const snap = await col.where('chapterId', '==', chapterId).get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}
