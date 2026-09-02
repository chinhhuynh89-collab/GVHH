// Chương trình đào tạo riêng do giáo viên tự tạo (VD: "Bồi dưỡng đại học") — ngoài chương trình
// mặc định lớp 6-12 có sẵn trong app. Mỗi chương trình gồm 1 hay nhiều chương do giáo viên tự
// soạn HOÀN TOÀN MỚI (không dựa trên nội dung có sẵn nào). "Chương" ở đây chỉ là 1 khung rỗng
// (tên, mô tả, biểu tượng) — nội dung thật (bài giảng/flashcard/câu hỏi) vẫn đi qua đúng hệ thống
// customLessons/customQuiz/customFlashcards đã có sẵn (xem chapter-detail.js): các collection đó
// vốn nhận bất kỳ chapterId nào chứ không chỉ chương có sẵn trong app, nên tái dùng được ngay
// không cần thêm gì — giáo viên bấm "+ Thêm bài giảng/câu hỏi/flashcard" như với chương bình
// thường sau khi mở chương chương trình riêng ra.

async function createProgram(name, icon, description) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  if (typeof enforceFeatureLock === 'function') await enforceFeatureLock(teacher.uid, 'customPrograms');
  const { db } = ensureFirebase();
  const ref = await db.collection('programs').add({
    teacherUid: teacher.uid, name, icon: icon || '🎓', description: description || '',
    createdAt: new Date().toISOString()
  });
  return ref.id;
}

async function updateProgram(programId, patch) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('programs').doc(programId).update(patch);
}

async function deleteProgram(programId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('programs').doc(programId).delete();
}

async function listProgramsForCurrentTeacher() {
  const teacher = getCurrentTeacher();
  if (!teacher) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('programs').where('teacherUid', '==', teacher.uid).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

// Lấy thông tin nhiều chương trình theo id (dùng khi lọc theo chapterIds của 1 nhóm — cần biết
// tên/biểu tượng chương trình để hiện tab, dù người xem không phải giáo viên sở hữu).
async function getProgramsByIds(programIds) {
  if (!programIds.length) return [];
  const { db } = ensureFirebase();
  const docs = await Promise.all(programIds.map((id) => db.collection('programs').doc(id).get()));
  return docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, d.data()));
}

async function addProgramChapter(programId, info) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const existing = await db.collection('programChapters').where('programId', '==', programId).get();
  const ref = await db.collection('programChapters').add({
    programId, teacherUid: teacher.uid, order: existing.size + 1,
    icon: info.icon || '📘', title: info.title, description: info.description || '',
    createdAt: new Date().toISOString()
  });
  return ref.id;
}

async function deleteProgramChapter(chapterId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('programChapters').doc(chapterId).delete();
}

async function getProgramChapters(programId) {
  const { db } = ensureFirebase();
  const snap = await db.collection('programChapters').where('programId', '==', programId).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.order - b.order);
}

// Song song với findChapterAnywhere() (chương mặc định lớp 6-12, tra đồng bộ trong dữ liệu tĩnh) —
// dùng khi 1 chapterId không có trong chương trình mặc định, có thể là chương thuộc chương trình
// riêng. Trả về đối tượng cùng hình dạng {id, order, icon, title, description, lessons, flashcards,
// quiz} như chương mặc định để chapter-detail.js dùng lại được nguyên logic hiện có — lessons/
// flashcards/quiz để rỗng vì nội dung thật nằm ở customLessons/customQuiz/customFlashcards.
async function findProgramChapter(chapterId) {
  const { db } = ensureFirebase();
  const doc = await db.collection('programChapters').doc(chapterId).get();
  if (!doc.exists) return null;
  const d = doc.data();
  return {
    id: chapterId, order: d.order, icon: d.icon || '📘', title: d.title,
    description: d.description || '', lessons: [], flashcards: [], quiz: [],
    programId: d.programId, isProgramChapter: true
  };
}
