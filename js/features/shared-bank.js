// Ngân hàng nội dung dùng chung giữa các giáo viên — giáo viên TỰ NGUYỆN chia sẻ từng bài giảng/câu
// hỏi/flashcard mình soạn (KHÔNG tự động công khai), giáo viên khác duyệt qua rồi NHẬP BẢN SAO vào
// chương của mình (không phải tham chiếu sống — chia sẻ hay xoá bản gốc không ảnh hưởng bản đã nhập).
// Lưu Firestore tại "sharedContentBank" — 1 collection DÙNG CHUNG cho cả 3 loại nội dung (phân biệt
// qua field "contentType"), xem firestore.rules để hiểu quyền đọc/ghi.
//
// CHỈ chia sẻ được nội dung của chương CHÍNH KHOÁ (chapterId dạng "c<khối>-<số>", VD "c10-3") — chương
// thuộc 1 chương trình riêng do giáo viên tự tạo (programChapters) có id ngẫu nhiên chỉ có ý nghĩa với
// riêng giáo viên đó, chia sẻ ra sẽ không giáo viên nào khác tìm thấy được để nhập.

function isCurriculumChapter(chapterId) {
  return /^c\d+-/.test(String(chapterId || ''));
}

async function shareToBank(contentType, sourceId, chapterId, payload) {
  if (!isCurriculumChapter(chapterId)) throw new Error('Chỉ chia sẻ được nội dung của chương chính khoá (lớp 6-12), không chia sẻ được chương trình riêng.');
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const ref = await db.collection('sharedContentBank').add({
    contentType, chapterId, payload,
    sharedByTeacherUid: teacher.uid,
    sharedByName: teacher.displayName || teacher.email || 'Giáo viên',
    sharedAt: new Date().toISOString(),
    importCount: 0
  });
  await updateSourceSharedBankId(contentType, sourceId, ref.id);
  return ref.id;
}

// Gỡ khỏi kho chung — CHỈ ảnh hưởng bản GỐC còn hiện trong kho, KHÔNG rút lại các bản sao giáo viên
// khác đã nhập trước đó (đã tách rời hoàn toàn khi nhập, xem importFromBank).
async function unshareFromBank(bankId, contentType, sourceId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const snap = await db.collection('sharedContentBank').doc(bankId).get();
  if (snap.exists && snap.data().sharedByTeacherUid !== teacher.uid) {
    throw new Error('Bạn không phải người đã chia sẻ mục này.');
  }
  await db.collection('sharedContentBank').doc(bankId).delete();
  try { await updateSourceSharedBankId(contentType, sourceId, null); } catch (e) { /* nguồn có thể đã bị xoá trước đó, bỏ qua */ }
}

async function updateSourceSharedBankId(contentType, sourceId, sharedBankId) {
  if (contentType === 'lesson') return updateCustomLesson(sourceId, { sharedBankId });
  if (contentType === 'quiz') return updateCustomQuiz(sourceId, { sharedBankId });
  if (contentType === 'flashcard') return updateCustomFlashcard(sourceId, { sharedBankId });
  throw new Error('Loại nội dung không hợp lệ: ' + contentType);
}

async function listBankItemsForChapter(chapterId, contentType) {
  const { db } = ensureFirebase();
  const snap = await db.collection('sharedContentBank')
    .where('chapterId', '==', chapterId).where('contentType', '==', contentType).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => (b.importCount || 0) - (a.importCount || 0));
}

// Nhập 1 mục từ kho chung — TÁI DÙNG đúng hàm ghi đã có cho từng loại (addCustomLesson/addCustomQuiz/
// addCustomFlashcard), nên tự động đi qua đúng enforceCustomChapterLimit (hạn mức "số chương tự
// soạn") giống hệt khi giáo viên tự soạn — không cần viết thêm logic giới hạn riêng cho đường này.
async function importFromBank(bankItem) {
  let newId;
  if (bankItem.contentType === 'lesson') newId = await addCustomLesson(bankItem.chapterId, bankItem.payload);
  else if (bankItem.contentType === 'quiz') newId = await addCustomQuiz(bankItem.chapterId, bankItem.payload);
  else if (bankItem.contentType === 'flashcard') newId = await addCustomFlashcard(bankItem.chapterId, bankItem.payload);
  else throw new Error('Loại nội dung không hợp lệ: ' + bankItem.contentType);
  // Chỉ là số liệu tham khảo (xem mục nào được nhập nhiều) — lỗi ở bước này không nên coi là nhập thất bại.
  incrementBankImportCount(bankItem.id).catch(() => {});
  return newId;
}

async function incrementBankImportCount(bankId) {
  const { db } = ensureFirebase();
  await db.collection('sharedContentBank').doc(bankId).update({
    importCount: firebase.firestore.FieldValue.increment(1)
  });
}
