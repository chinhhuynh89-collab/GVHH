// Giáo án do AI soạn (theo mẫu Công văn 5512) — lưu Firestore tại
// teachers/{uid}/customLessonPlans/{id}. CHỈ chính giáo viên đọc/ghi được (không như customLessons/
// customQuiz/customFlashcards) — đây là tài liệu soạn giảng riêng của giáo viên, không phải nội dung
// cho học sinh xem.

async function addCustomLessonPlan(chapterId, plan) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để lưu giáo án.');
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customLessonPlans').add(
    Object.assign({ chapterId, createdAt: new Date().toISOString() }, plan)
  );
  return ref.id;
}

async function getCustomLessonPlans(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customLessonPlans')
    .where('chapterId', '==', chapterId).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function deleteCustomLessonPlan(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customLessonPlans').doc(id).delete();
}
