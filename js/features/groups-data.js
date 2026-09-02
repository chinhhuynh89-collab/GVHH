// Hàm dùng chung để tạo/đọc nhóm học sinh trên Firestore — dùng bởi group-manager.js,
// exam-creator.js, exam-stats.js. KHÔNG chứa logic gắn với 1 trang cụ thể (không có IIFE thao tác DOM)
// để có thể nạp an toàn trên nhiều trang khác nhau.

// Khớp QUIZ_PASS_PERCENT trong progress.js — tách riêng vì trang Nhóm học sinh không luôn nạp progress.js.
const QUIZ_PASS_PERCENT_DEFAULT = 70;

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
  // Đếm số học sinh của tất cả nhóm CÙNG LÚC (Promise.all) thay vì lần lượt từng nhóm —
  // trước đây chờ tuần tự nên có bao nhiêu nhóm là mất bấy nhiêu lượt round-trip mạng, rất chậm.
  await Promise.all(groups.map(async (g) => {
    const studentsSnap = await db.collection('students').where('groupCode', '==', g.groupCode).get();
    g.studentCount = studentsSnap.size;
  }));
  return groups;
}

// Danh sách đầy đủ học sinh của 1 nhóm (họ tên, trường, lớp, địa chỉ, SĐT...) — chỉ tải khi giáo
// viên thực sự bấm xem, không tải kèm lúc liệt kê danh sách nhóm để tránh chậm không cần thiết.
async function getStudentsForGroup(groupCode) {
  const { db } = ensureFirebase();
  const snap = await db.collection('students').where('groupCode', '==', groupCode).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'vi'));
}

// Sửa chương trình học (chapterIds) của 1 nhóm đã tồn tại — dùng khi giáo viên muốn thêm/bớt
// chương sau khi đã tạo nhóm (VD: bồi dưỡng thêm chương nâng cao giữa kỳ học).
async function updateGroupChapters(groupId, chapterIds, grade) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('groups').doc(groupId).update({ chapterIds, grade });
}

// Bật/tắt "Học tự do" cho cả 1 nhóm — do giáo viên quyết định thay vì để từng học sinh tự bật/tắt
// (xem progress.js: setGroupFreeModeOverride). Mặc định (chưa từng đặt) coi như tắt, tức học tuần tự.
async function updateGroupFreeMode(groupId, freeMode) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('groups').doc(groupId).update({ freeMode });
}

// Kết quả học tập của 1 nhóm: với mỗi học sinh — số chương đã hoàn thành (bài giảng + flashcard +
// trắc nghiệm đạt ≥70%), số đợt kiểm tra đã làm, điểm trung bình và điểm cao nhất (thang 10) —
// sắp xếp theo điểm trung bình giảm dần (học sinh chưa làm bài kiểm tra nào xếp cuối).
async function getGroupLearningResults(group) {
  const { db } = ensureFirebase();
  const [studentsSnap, examsSnap] = await Promise.all([
    db.collection('students').where('groupCode', '==', group.groupCode).get(),
    db.collection('exams').where('groupCode', '==', group.groupCode).get()
  ]);
  const students = studentsSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const examIds = examsSnap.docs.map((d) => d.id);

  const [subsSnaps, progressSnaps] = await Promise.all([
    Promise.all(examIds.map((examId) => db.collection('submissions').where('examId', '==', examId).get())),
    Promise.all(students.map((s) => db.collection('progress').doc(s.id).get()))
  ]);
  const allSubmissions = subsSnaps.flatMap((snap) => snap.docs.map((d) => d.data()));
  const progressByStudentId = new Map(students.map((s, i) => [s.id, progressSnaps[i].exists ? progressSnaps[i].data() : null]));
  const totalAssigned = (group.chapterIds || []).length;

  const results = students.map((s) => {
    const subs = allSubmissions.filter((sub) => sub.studentId === s.id);
    const scores10 = subs.map((sub) => Math.round(sub.score) / 10);
    const avgScore10 = scores10.length ? Math.round((scores10.reduce((a, b) => a + b, 0) / scores10.length) * 10) / 10 : null;
    const bestScore10 = scores10.length ? Math.max(...scores10) : null;

    const prog = progressByStudentId.get(s.id);
    const chaptersMap = prog && prog.chapters ? prog.chapters : {};
    const chaptersDone = (group.chapterIds || []).filter((id) => {
      const c = chaptersMap[id];
      return c && c.lessonViewed && c.flashcardsViewed && (c.quizBestPercent || 0) >= QUIZ_PASS_PERCENT_DEFAULT;
    }).length;

    return {
      studentId: s.id, studentName: s.studentName,
      chaptersDone, totalAssigned,
      examCount: subs.length, avgScore10, bestScore10
    };
  });

  results.sort((a, b) => {
    if (a.avgScore10 === null && b.avgScore10 === null) return a.studentName.localeCompare(b.studentName, 'vi');
    if (a.avgScore10 === null) return 1;
    if (b.avgScore10 === null) return -1;
    return b.avgScore10 - a.avgScore10;
  });
  return results;
}

// Gộp học sinh của nhiều nhóm thành 1 danh sách theo SĐT (vì 1 học sinh có thể học cùng lúc nhiều
// nhóm — mỗi nhóm là 1 bản ghi "students" riêng). groupsWithStudents = [{ group, students }, ...].
function mergeStudentsAcrossGroups(groupsWithStudents) {
  const byKey = new Map();
  groupsWithStudents.forEach(({ group, students }) => {
    students.forEach((s) => {
      const key = (s.phone || '').trim() || s.id;
      if (!byKey.has(key)) {
        byKey.set(key, Object.assign({}, s, { groups: [], latestJoinedAt: s.joinedAt }));
      }
      const merged = byKey.get(key);
      merged.groups.push({ groupCode: group.groupCode, groupName: group.groupName, joinedAt: s.joinedAt });
      if ((s.joinedAt || '') > (merged.latestJoinedAt || '')) merged.latestJoinedAt = s.joinedAt;
    });
  });
  return Array.from(byKey.values()).sort((a, b) => (b.latestJoinedAt || '').localeCompare(a.latestJoinedAt || ''));
}

// Toàn bộ học sinh đã đăng ký ở TẤT CẢ nhóm của giáo viên hiện tại — tải 1 lần (dùng cho trang
// "Quản lý học sinh"). Sắp xếp theo lần đăng ký gần nhất giảm dần (mới nhất lên đầu).
async function getAllStudentsForCurrentTeacher() {
  const groups = await listGroupsForCurrentTeacher();
  if (!groups.length) return [];
  const perGroup = await Promise.all(groups.map((g) => getStudentsForGroup(g.groupCode)));
  return mergeStudentsAcrossGroups(groups.map((group, i) => ({ group, students: perGroup[i] })));
}

// ---------- Học sinh đăng ký bằng MÃ GIÁO VIÊN, chờ xếp vào 1 nhóm cụ thể ----------
// Khác với students/joinGroupByCode (đăng ký thẳng vào 1 nhóm bằng MÃ NHÓM): học sinh chỉ cần MÃ
// GIÁO VIÊN — giáo viên nhận thông báo ngay (xem watchPendingRegistrationsForCurrentTeacher), rồi
// mới tự xếp học sinh vào đúng nhóm (assignRegistrationToGroup). Xem js/features/join-group.js.

async function getPendingRegistrationsForCurrentTeacher() {
  const teacher = getCurrentTeacher();
  if (!teacher) return [];
  const { db } = ensureFirebase();
  const snap = await db.collection('studentRegistrations')
    .where('teacherUid', '==', teacher.uid).where('status', '==', 'pending').get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// Theo dõi TRỰC TIẾP (Firestore onSnapshot) học sinh đang chờ xếp nhóm của giáo viên hiện tại — gọi
// lại callback(registrations) mỗi khi có thay đổi, để trang ĐANG MỞ (VD trang chủ trên điện thoại
// giáo viên) tự hiện thông báo ngay, không cần tải lại trang. Lưu ý: đây KHÔNG phải push notification
// hệ thống (không dùng Cloud Functions/FCM nên không làm được) — chỉ cập nhật khi trang đang mở.
function watchPendingRegistrationsForCurrentTeacher(teacherUid, callback) {
  const { db } = ensureFirebase();
  return db.collection('studentRegistrations')
    .where('teacherUid', '==', teacherUid).where('status', '==', 'pending')
    .onSnapshot((snap) => {
      callback(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    }, () => { /* im lặng bỏ qua lỗi mạng */ });
}

// Giáo viên xếp 1 học sinh đang chờ vào 1 nhóm cụ thể: tạo bản ghi "students" bình thường (giống hệt
// học sinh tự vào nhóm bằng mã) rồi xoá khỏi danh sách chờ.
async function assignRegistrationToGroup(registration, groupCode) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('students').add({
    groupCode, deviceId: registration.deviceId, joinedAt: new Date().toISOString(),
    studentName: registration.studentName, school: registration.school,
    className: registration.className, address: registration.address, phone: registration.phone
  });
  await db.collection('studentRegistrations').doc(registration.id).delete();
}

// Từ chối/xoá 1 đăng ký chờ (VD đăng ký nhầm, spam) — không tạo học sinh vào nhóm nào cả.
async function rejectRegistration(registrationId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('studentRegistrations').doc(registrationId).delete();
}

// Hoạt động học tập theo từng chương, GỘP TẤT CẢ NHÓM của giáo viên hiện tại — dùng để hiện
// "N nhóm đang học · M học sinh" ngay trên trang "Học theo chương" khi giáo viên xem, để dễ quan
// sát nhóm nào đang học chương nào mà không cần vào từng nhóm riêng lẻ.
// Trả về { [chapterId]: { groupCount, studentCount } } — chỉ gồm chương có ít nhất 1 học sinh đã
// động tới (xem bài giảng, xem flashcard, hoặc làm ít nhất 1 câu trắc nghiệm).
async function getTeacherChapterActivity() {
  const groups = await listGroupsForCurrentTeacher();
  if (!groups.length) return {};
  const { db } = ensureFirebase();

  const studentsPerGroup = await Promise.all(groups.map((g) => getStudentsForGroup(g.groupCode)));
  const allStudentIds = [];
  const studentGroupCode = new Map();
  groups.forEach((g, i) => {
    studentsPerGroup[i].forEach((s) => { allStudentIds.push(s.id); studentGroupCode.set(s.id, g.groupCode); });
  });
  if (!allStudentIds.length) return {};

  const progressSnaps = await Promise.all(allStudentIds.map((id) => db.collection('progress').doc(id).get()));

  const activity = {};
  allStudentIds.forEach((studentId, i) => {
    const snap = progressSnaps[i];
    if (!snap.exists) return;
    const chapters = snap.data().chapters || {};
    const groupCode = studentGroupCode.get(studentId);
    Object.keys(chapters).forEach((chapterId) => {
      const c = chapters[chapterId];
      const touched = c.lessonViewed || c.flashcardsViewed || (c.quizBestPercent || 0) > 0;
      if (!touched) return;
      if (!activity[chapterId]) activity[chapterId] = { groupCodes: new Set(), studentCount: 0 };
      activity[chapterId].groupCodes.add(groupCode);
      activity[chapterId].studentCount++;
    });
  });
  Object.keys(activity).forEach((id) => {
    activity[id].groupCount = activity[id].groupCodes.size;
    delete activity[id].groupCodes;
  });
  return activity;
}
