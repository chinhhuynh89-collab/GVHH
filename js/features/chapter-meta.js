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
}

// Xoá 1 field cụ thể (VD: "lessonOverrides.3") khỏi chapterMeta — dùng để "khôi phục mặc định"
// cho 1 mục đã sửa/ẩn, thay vì phải đọc-sửa-ghi lại cả object overrides.
async function deleteChapterMetaField(chapterId, fieldPath) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('teachers').doc(teacher.uid).collection('chapterMeta').doc(chapterId)
    .update({ [fieldPath]: firebase.firestore.FieldValue.delete() });
}
