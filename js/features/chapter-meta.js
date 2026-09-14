// Tiêu đề / mô tả chương do giáo viên tự sửa — lưu Firestore tại teachers/{uid}/chapterMeta/{chapterId}.
// Ai cũng đọc được, chỉ chính giáo viên mới ghi được.

async function getChapterMeta(ownerUid, chapterId) {
  if (!ownerUid) return null;
  const { db } = ensureFirebase();
  const doc = await db.collection('teachers').doc(ownerUid).collection('chapterMeta').doc(chapterId).get();
  return doc.exists ? doc.data() : null;
}

// Chuyển key dạng "a.b" (dấu chấm, VD "lessonOverrides.3") trong patch thành object LỒNG NHAU thật
// {a:{b:...}} trước khi .set(...,{merge:true}) — ĐÃ CÓ BUG THẬT vì set() (khác update()) không tự
// hiểu key có dấu chấm là đường dẫn lồng nhau, mà tạo ra 1 field có TÊN THẬT chứa dấu chấm; đọc lại
// sau khi tải trang thì không thấy field lessonOverrides/flashcardOverrides/quizOverrides nào cả,
// coi như chưa từng ẩn/sửa (đã kiểm chứng lỗi này qua Firestore Emulator lúc sửa). Set với
// {merge:true} trên object lồng nhau THẬT thì merge đúng, không đè mất các key khác đã có trong
// cùng field (đã kiểm chứng: ẩn 1 bài không làm mất override của bài khác).
function unflattenDottedKeys(patch) {
  const nested = {};
  Object.keys(patch).forEach((key) => {
    const parts = key.split('.');
    let cur = nested;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = patch[key];
  });
  return nested;
}

async function setChapterMeta(chapterId, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  if (typeof enforceCustomChapterLimit === 'function') await enforceCustomChapterLimit(teacher.uid, chapterId);
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('chapterMeta').doc(chapterId).set(unflattenDottedKeys(patch), { merge: true });
  if (typeof contentCacheBump === 'function') contentCacheBump('chapterMeta', teacher.uid);
}

// Xoá 1 field cụ thể (VD: "lessonOverrides.3") khỏi chapterMeta — dùng để "khôi phục mặc định"
// cho 1 mục đã sửa/ẩn, thay vì phải đọc-sửa-ghi lại cả object overrides.
async function deleteChapterMetaField(chapterId, fieldPath) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('chapterMeta').doc(chapterId)
    .update({ [fieldPath]: firebase.firestore.FieldValue.delete() });
  if (typeof contentCacheBump === 'function') contentCacheBump('chapterMeta', teacher.uid);
}

// Đánh dấu 1 chương có nội dung tự thêm (bài giảng/câu hỏi/flashcard) — dùng để tính ĐÚNG % tiến độ +
// khoá chương cho các chương lớp 6-12 mặc định CHƯA có bài giảng sẵn trong app nhưng giáo viên đã tự
// soạn ĐẦY ĐỦ nội dung riêng (xem progress.js: hasContent() chỉ biết kiểm tra nội dung TĨNH có sẵn
// trong app, không biết gì về nội dung tự thêm — lỗi thật đã gặp, y hệt lỗi "Chương trình riêng" đã sửa
// trước đó). Gọi từ MỌI hàm addCustomLesson*/addCustomQuiz*/addCustomFlashcard ngay sau khi ghi thành
// công. Cờ chỉ ĐƯỢC ĐẶT, KHÔNG bao giờ tự xoá khi giáo viên xoá hết nội dung — đơn giản + an toàn hơn
// hẳn (chấp nhận 1 chương đã TỪNG có nội dung vẫn tính là "có nội dung" mãi mãi, kể cả sau khi xoá
// hết, còn hơn lỡ tính sai chiều ngược lại). KHÔNG qua setChapterMeta() (sẽ gọi
// enforceCustomChapterLimit() THÊM 1 LẦN NỮA dư thừa — hàm add* gọi hàm đó rồi) — ghi thẳng, vẫn
// merge:true để không đụng các field override khác đã có trong cùng tài liệu. Lỗi ghi (hiếm, VD mất
// mạng) chỉ bỏ qua êm — không chặn luồng thêm nội dung chính, chỉ ảnh hưởng đúng phần hiển thị % sau đó.
async function markChapterHasCustomContent(teacherUid, chapterId) {
  try {
    const { db } = ensureFirebase();
    await db.collection('teachers').doc(teacherUid).collection('chapterMeta').doc(chapterId)
      .set({ hasCustomContent: true }, { merge: true });
    if (typeof contentCacheBump === 'function') contentCacheBump('chapterMeta', teacherUid);
  } catch (e) { /* không chặn luồng thêm nội dung chính nếu lỗi ghi cờ này */ }
}

// Đọc TOÀN BỘ chapterMeta của 1 giáo viên trong 1 LƯỢT (không phải từng chương riêng — xem
// chapter-overview.js: dùng để biết chương nào có nội dung tự thêm mà KHÔNG tốn 1 lượt đọc/chương).
// Tài liệu chapterMeta rất nhỏ (không chứa ảnh/nội dung thật) nên đọc gộp cả collection vẫn rẻ.
async function getAllChapterMetaForTeacher(ownerUid) {
  if (!ownerUid) return {};
  const cached = typeof contentCacheGet === 'function' ? contentCacheGet('chapterMeta', ownerUid, 'all') : null;
  if (cached) return cached;
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(ownerUid).collection('chapterMeta').get();
  const map = {};
  snap.docs.forEach((d) => { map[d.id] = d.data(); });
  if (typeof contentCacheSet === 'function') contentCacheSet('chapterMeta', ownerUid, 'all', map);
  return map;
}
