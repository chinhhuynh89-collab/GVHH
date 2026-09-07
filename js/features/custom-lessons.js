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
//
// Mỗi bài giảng luôn dưới 1MiB (giới hạn 1 TÀI LIỆU của Firestore, xem LESSON_IMAGE_BUDGET_PER_SECTION
// ở doc-import.js) NHƯNG cả 1 lượt batch.commit() còn bị giới hạn RIÊNG về tổng dung lượng CẢ YÊU CẦU
// (~10MB) — nạp file có nhiều trang ảnh (VD PDF nhiều trang, mỗi trang gần 1MB) rất dễ vượt dù từng
// bài giảng vẫn hợp lệ, Firestore báo "Request payload size exceeds the limit". Vì vậy chia thành
// NHIỀU LƯỢT commit nhỏ hơn theo cả số lượng LẪN tổng dung lượng ước tính, không dồn hết vào 1 lượt.
async function addCustomLessonBatch(chapterId, lessons) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên để thêm bài giảng.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  const col = db.collection('teachers').doc(teacher.uid).collection('customLessons');
  const base = Date.now();
  const docs = lessons.map((lesson, index) =>
    Object.assign({ chapterId, addedAt: new Date().toISOString(), order: base + index }, lesson)
  );

  const MAX_BATCH_OPS = 400; // Firestore giới hạn cứng 500 thao tác/batch — chừa dư cho an toàn.
  const MAX_BATCH_BYTES = 8 * 1024 * 1024; // chừa dư so với hạn mức thực tế ~10-11MB/lượt ghi.
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

// Xoá TOÀN BỘ bài giảng tự thêm/nạp từ file trong 1 chương — cần khi 1 lần nạp file cũ đã lưu sai
// (thiếu định dạng/sai thứ tự do lỗi đã sửa) và giáo viên muốn nạp lại từ đầu thay vì xoá tay từng
// mục một (có thể tới hàng trăm mục với file lớn). KHÔNG đụng tới bài giảng có sẵn trong app (builtin).
// Firestore giới hạn 500 thao tác/batch — chia nhỏ 400/lần cho an toàn.
async function deleteAllCustomLessons(chapterId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const col = db.collection('teachers').doc(teacher.uid).collection('customLessons');
  const snap = await col.where('chapterId', '==', chapterId).get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}
