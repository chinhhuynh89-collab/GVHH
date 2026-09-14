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
  if (typeof contentCacheBump === 'function') contentCacheBump('lessonplans', teacher.uid);
  return ref.id;
}

// Cache theo chapterId (xem contentCacheGet/Set, firebase-init.js) — chỉ có hiệu lực trong CÙNG 1 tab,
// tự động hết hạn ngay khi bất kỳ hàm ghi nào ở dưới chạy (add/xoá), không cần lo dữ liệu cũ.
async function getCustomLessonPlans(ownerUid, chapterId) {
  if (!ownerUid) return [];
  const cached = typeof contentCacheGet === 'function' ? contentCacheGet('lessonplans', ownerUid, chapterId) : null;
  if (cached) return cached;
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customLessonPlans')
    .where('chapterId', '==', chapterId).get();
  const items = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  if (typeof contentCacheSet === 'function') contentCacheSet('lessonplans', ownerUid, chapterId, items);
  return items;
}

// Lấy TOÀN BỘ giáo án của 1 giáo viên, gộp từ MỌI chương — dùng cho trang "Kho giáo án"
// (lessonplan-bank.js), khác getCustomLessonPlans ở trên vốn chỉ lấy đúng 1 chương cho
// chapter-detail.js.
async function getAllCustomLessonPlansForTeacher(ownerUid) {
  if (!ownerUid) return [];
  // subKey "all" riêng với key theo chapterId của getCustomLessonPlans — cùng chung "phiên bản" loại
  // 'lessonplans' nên vẫn tự hết hạn đúng lúc khi có bất kỳ thay đổi nào (add/xoá ở chương bất kỳ).
  const cached = typeof contentCacheGet === 'function' ? contentCacheGet('lessonplans', ownerUid, 'all') : null;
  if (cached) return cached;
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('customLessonPlans').get();
  const items = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  if (typeof contentCacheSet === 'function') contentCacheSet('lessonplans', ownerUid, 'all', items);
  return items;
}

async function deleteCustomLessonPlan(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customLessonPlans').doc(id).delete();
  if (typeof contentCacheBump === 'function') contentCacheBump('lessonplans', teacher.uid);
}
