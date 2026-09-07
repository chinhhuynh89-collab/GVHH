// Bài giảng do giáo viên tự nạp (từ file) hoặc tự viết thủ công — lưu trong Firestore
// tại teachers/{uid}/customLessons/{id}. Ai cũng đọc được (để học sinh trong nhóm thấy),
// chỉ chính giáo viên (đã đăng nhập, đúng uid) mới ghi được — do Security Rules đảm bảo.
//
// Mỗi bài giảng lưu kèm "order" (số, tăng dần theo thời điểm thêm) để getCustomLessons sắp xếp lại
// ĐÚNG THỨ TỰ đã thêm — Firestore .where() KHÔNG tự giữ thứ tự chèn (trả về theo thứ tự nội bộ tuỳ ý),
// nên nạp 1 file Word thành hàng trăm bài giảng riêng (addCustomLessonBatch) mà không có field này sẽ
// hiện ra LỘN XỘN, sai hẳn thứ tự trong giáo án gốc dù dữ liệu từng phần vẫn đúng. KHÔNG dùng
// .orderBy('order') phía Firestore (cần lập chỉ mục kết hợp — composite index — phải vào tay Firebase
// Console mới tạo được) mà sắp xếp ngay trên trình duyệt sau khi tải về, tránh phát sinh yêu cầu đó.

async function addCustomLesson(chapterId, lesson) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm bài giảng.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const ref = await db.collection('teachers').doc(teacher.uid).collection('customLessons').add(
    Object.assign({ chapterId, addedAt: new Date().toISOString(), order: Date.now() }, lesson)
  );
  return ref.id;
}

// Lưu nhiều bài giảng cùng lúc (VD: nhiều phần trích từ 1 file nạp lên) bằng batch write —
// CHỈ 1 round-trip mạng cho toàn bộ, thay vì 1 round-trip riêng cho mỗi phần. "order" cộng thêm chỉ số
// trong mảng (base + index) để chắc chắn TĂNG DẦN ĐÚNG THEO THỨ TỰ TRONG FILE GỐC dù Date.now() có thể
// trả về cùng 1 mốc mili-giây cho nhiều phần tử liền nhau khi vòng lặp chạy quá nhanh.
async function addCustomLessonBatch(chapterId, lessons) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm bài giảng.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const batch = db.batch();
  const col = db.collection('teachers').doc(teacher.uid).collection('customLessons');
  const base = Date.now();
  lessons.forEach((lesson, index) => {
    const ref = col.doc();
    batch.set(ref, Object.assign({ chapterId, addedAt: new Date().toISOString(), order: base + index }, lesson));
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
  const items = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  // Bài giảng lưu TRƯỚC khi có field "order" (không có field này) xếp theo addedAt, sau tất cả bài có
  // "order" — vẫn ổn định, chỉ ảnh hưởng lessons cũ vốn dĩ không có khái niệm "đúng thứ tự file gốc".
  items.sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Infinity;
    const bo = typeof b.order === 'number' ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return (a.addedAt || '').localeCompare(b.addedAt || '');
  });
  return items;
}

async function deleteCustomLesson(id) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('customLessons').doc(id).delete();
}
