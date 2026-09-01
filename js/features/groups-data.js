// Hàm dùng chung để tạo/đọc nhóm học sinh trên Firestore — dùng bởi group-manager.js,
// exam-creator.js, exam-stats.js. KHÔNG chứa logic gắn với 1 trang cụ thể (không có IIFE thao tác DOM)
// để có thể nạp an toàn trên nhiều trang khác nhau.

function genGroupCodeClient() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0,O,1,I)
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

async function createGroupForCurrentTeacher(groupName, grade, chapterIds) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();

  let code, attempts = 0;
  do {
    code = genGroupCodeClient();
    const clash = await db.collection('groups').where('groupCode', '==', code).limit(1).get();
    if (clash.empty) break;
    attempts++;
  } while (attempts < 5);

  const group = {
    teacherUid: teacher.uid, groupCode: code, groupName, grade,
    chapterIds: chapterIds || [], createdAt: new Date().toISOString()
  };
  await db.collection('groups').add(group);
  return group;
}

async function listGroupsForCurrentTeacher() {
  const teacher = getCurrentTeacher();
  if (!teacher) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('groups').where('teacherUid', '==', teacher.uid).get();
  const groups = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  for (const g of groups) {
    const studentsSnap = await db.collection('students').where('groupCode', '==', g.groupCode).get();
    g.studentCount = studentsSnap.size;
  }
  return groups;
}
