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

async function createGroupForCurrentTeacher(groupName, grade, chapterIds, zaloGroupLink) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();

  await enforceTeacherGroupLimit(teacher.uid);

  let code, attempts = 0;
  do {
    code = genGroupCodeClient();
    const clash = await db.collection('groups').where('groupCode', '==', code).limit(1).get();
    if (clash.empty) break;
    attempts++;
  } while (attempts < 5);

  const group = {
    teacherUid: teacher.uid, groupCode: code, groupName, grade,
    chapterIds: chapterIds || [], zaloGroupLink: zaloGroupLink || '', createdAt: new Date().toISOString()
  };
  await db.collection('groups').add(group);
  return group;
}

// Sửa/thêm link nhóm Zalo cho 1 nhóm đã tồn tại (VD nhóm tạo trước khi có tính năng này, hoặc giáo
// viên đổi link nhóm Zalo mới). Chỉ giáo viên dùng để nhắn tin nhanh cho cả nhóm — học sinh không
// thấy link này trong app.
async function updateGroupZaloLink(groupId, zaloGroupLink) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('groups').doc(groupId).update({ zaloGroupLink: zaloGroupLink || '' });
}

// Xoá hẳn 1 nhóm — CHỈ xoá bản ghi "groups", KHÔNG đụng tới học sinh (trước đây có xoá kèm toàn bộ
// "students" của nhóm — SAI: xoá nhầm nhóm là mất luôn danh sách học sinh không cứu được, học sinh
// vẫn còn tài khoản/tiến độ nhưng "biến mất" khỏi trang Quản lý học sinh). Học sinh của nhóm đã xoá
// vẫn hiện đầy đủ ở "Quản lý học sinh" (xem getAllStudentsForCurrentTeacher() — không còn duyệt qua
// từng nhóm nữa, đọc thẳng theo teacherUid) để giáo viên xếp lại vào nhóm khác nếu muốn — xoá HẲN 1
// học sinh giờ CHỈ làm được ở đúng trang đó (nút "🗑️ Xoá học sinh"), không còn là tác dụng phụ của
// việc xoá nhóm nữa. Đề kiểm tra/kết quả cũ của nhóm vẫn không bị xoá như trước (ngoài phạm vi cần
// thiết ở đây).
async function deleteGroup(groupId, groupCode) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('groups').doc(groupId).delete();
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
  const students = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'vi'));
  // Bản ghi cũ (tạo trước khi có trường teacherUid) tự "nhận sở hữu" ngay khi giáo viên xem đúng
  // nhóm của mình — để nút Xoá học sinh dùng được cả với học sinh đăng ký từ trước (xem firestore.rules).
  const teacher = getCurrentTeacher();
  if (teacher) {
    students.forEach((s) => {
      if (!s.teacherUid) {
        s.teacherUid = teacher.uid;
        db.collection('students').doc(s.id).update({ teacherUid: teacher.uid }).catch(() => {});
      }
    });
  }
  return students;
}

// Giáo viên thêm thẳng 1 học sinh đã có sẵn trong danh sách (VD từ nhóm khác) vào 1 nhóm CỤ THỂ —
// dùng lúc tạo nhóm (chọn học sinh có sẵn) và khi duyệt đăng ký (assignRegistrationToGroup bên dưới).
async function addStudentToGroup(groupCode, student) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();

  await enforceTeacherStudentLimit(teacher.uid);

  await db.collection('students').add(Object.assign({
    groupCode, teacherUid: teacher.uid, studentUid: student.studentUid, joinedAt: new Date().toISOString(),
    studentName: student.studentName, school: student.school,
    className: student.className, address: student.address, phone: student.phone,
    email: student.email || ''
    // loginCode: chỉ có ở tài khoản do giáo viên cấp (mã "MãGV.số" — xem
    // teacher-student-accounts.js), không có ở học sinh tự đăng ký bằng Google.
  }, student.loginCode ? { loginCode: student.loginCode } : {}));
}

// Xếp 1 học sinh "Chưa xếp nhóm" (nạp lên chọn "Chưa xếp nhóm" lúc đó, hoặc bị bỏ rơi vì lý do khác)
// vào 1 nhóm cụ thể — tạo bản ghi MỚI đúng nhóm đó (dùng lại addStudentToGroup(), qua đúng luồng
// kiểm tra giới hạn gói đã có sẵn) rồi XOÁ bản ghi "Chưa xếp nhóm" cũ, tránh còn thừa 2 dòng ("Chưa
// xếp nhóm" + nhóm mới) cho cùng 1 học sinh. KHÔNG sửa trực tiếp groupCode trên bản ghi cũ vì
// firestore.rules chỉ cho giáo viên sửa field "teacherUid" của bản ghi CŨ CHƯA có teacherUid (tự
// nhận sở hữu bản ghi thời trước khi có field này), không cho sửa groupCode — tạo mới + xoá cũ dùng
// đúng quyền create/delete đã có sẵn, không cần xin thêm quyền mới trong Firestore Rules.
async function assignUnassignedStudentToGroup(unassignedDocId, groupCode, student) {
  await addStudentToGroup(groupCode, student);
  await deleteStudent(unassignedDocId);
}

// Xoá 1 học sinh khỏi 1 nhóm cụ thể (chỉ xoá bản ghi "students" đó — nếu học sinh này học nhiều
// nhóm khác, các nhóm kia không bị ảnh hưởng).
async function deleteStudent(studentId) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  await db.collection('students').doc(studentId).delete();
}

// Xoá HẲN 1 học sinh khỏi TẤT CẢ nhóm — nhận thẳng DANH SÁCH ID các bản ghi "students" cần xoá
// (docIds, đã gộp sẵn lúc tải danh sách — xem mergeStudentsAcrossGroups() bên dưới) thay vì tự dò
// lại qua studentUid. Trước đây dò theo .where('studentUid','==',...): 1 số bản ghi "students" CŨ
// (tạo từ trước khi bắt học sinh đăng nhập Google, dùng deviceId ngẫu nhiên) thiếu hẳn field
// studentUid — dò kiểu đó KHÔNG tìm thấy gì (snap rỗng), batch.commit() trên batch RỖNG vẫn coi là
// "thành công" (không báo lỗi) mà KHÔNG xoá được gì cả — lỗi thực tế đã gặp: bấm xoá báo đã xoá
// nhưng tải lại trang học sinh vẫn còn nguyên. Xoá thẳng theo ID chắc chắn đúng bản ghi đang hiển
// thị, không phụ thuộc field nào khác có thiếu hay không.
async function deleteStudentEverywhere(docIds) {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  if (!docIds || !docIds.length) throw new Error('Không tìm thấy bản ghi học sinh để xoá.');
  const { db } = ensureFirebase();
  const batch = db.batch();
  docIds.forEach((id) => batch.delete(db.collection('students').doc(id)));
  await batch.commit();
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

// Gộp học sinh thành 1 danh sách theo TÀI KHOẢN (studentUid, xem js/features/auth.js:
// requireStudentAuth) — vì 1 học sinh có thể học cùng lúc nhiều nhóm, mỗi nhóm là 1 bản ghi
// "students" riêng trên CÙNG 1 tài khoản. KHÔNG gộp theo SĐT như trước: 2 học sinh khác nhau (VD anh
// chị em) hoàn toàn có thể dùng chung 1 số điện thoại (của bố/mẹ) — gộp theo SĐT sẽ làm mất hẳn 1
// học sinh khỏi danh sách (chỉ còn thấy 1 trong 2). studentUid gắn với tài khoản Google thật của
// từng em nên đáng tin hơn nhiều so với SĐT có thể dùng chung trong gia đình.
// docs = mảng bản ghi "students" thô (đã gồm field "docId"); groupNameByCode = Map(groupCode ->
// groupName CỦA NHÓM CÒN TỒN TẠI) — nhóm đã bị xoá sẽ không có trong Map này, groupName trả về null
// để nơi hiển thị tự biết ghi "(Nhóm đã xoá)" thay vì để trống khó hiểu.
function mergeStudentsAcrossGroups(docs, groupNameByCode) {
  const byKey = new Map();
  docs.forEach((s) => {
    const key = (s.studentUid || '').trim() || s.docId;
    if (!byKey.has(key)) {
      byKey.set(key, Object.assign({}, s, { groups: [], docIds: [], latestJoinedAt: s.joinedAt }));
    }
    const merged = byKey.get(key);
    // groupCode rỗng = học sinh nạp lên nhưng chưa xếp vào nhóm nào (xem bulkImportProvisionedStudents,
    // teacher-student-accounts.js) — khác với "nhóm đã xoá" (groupCode có giá trị nhưng không còn khớp
    // nhóm nào đang tồn tại), cần đánh dấu riêng (unassigned: true) để nơi hiển thị ghi đúng "Chưa xếp
    // nhóm" thay vì nhầm thành "(Nhóm đã xoá)".
    merged.groups.push(!s.groupCode ? {
      groupCode: '', groupName: null, joinedAt: s.joinedAt, unassigned: true, docId: s.docId
    } : {
      groupCode: s.groupCode,
      groupName: groupNameByCode.has(s.groupCode) ? groupNameByCode.get(s.groupCode) : null,
      joinedAt: s.joinedAt, docId: s.docId
    });
    merged.docIds.push(s.docId);
    if ((s.joinedAt || '') > (merged.latestJoinedAt || '')) merged.latestJoinedAt = s.joinedAt;
  });
  return Array.from(byKey.values()).sort((a, b) => (b.latestJoinedAt || '').localeCompare(a.latestJoinedAt || ''));
}

// Toàn bộ học sinh của giáo viên hiện tại — tải 1 lần (dùng cho trang "Quản lý học sinh"). Đọc
// TRỰC TIẾP theo teacherUid (1 field duy nhất, không cần composite index — xem chú thích tương tự ở
// teacher-student-accounts.js) thay vì duyệt qua từng nhóm rồi truy vấn riêng: vừa nhanh hơn (1 lượt
// đọc thay vì N+1), vừa không bỏ sót học sinh có nhóm ĐÃ BỊ XOÁ (xoá nhóm không còn xoá học sinh nữa
// — xem deleteGroup()) — trước đây duyệt qua danh sách nhóm HIỆN CÓ nên nhóm đã xoá coi như mất
// luôn học sinh của nhóm đó khỏi trang này, dù dữ liệu học sinh vẫn còn nguyên trong Firestore.
// Sắp xếp theo lần đăng ký gần nhất giảm dần (mới nhất lên đầu).
async function getAllStudentsForCurrentTeacher() {
  const teacher = getCurrentTeacher();
  if (!teacher) return [];
  const { db } = ensureFirebase();
  const [studentsSnap, groupsSnap] = await Promise.all([
    db.collection('students').where('teacherUid', '==', teacher.uid).get(),
    db.collection('groups').where('teacherUid', '==', teacher.uid).get()
  ]);
  if (!studentsSnap.size) return [];
  const groupNameByCode = new Map(groupsSnap.docs.map((d) => [d.data().groupCode, d.data().groupName]));
  const docs = studentsSnap.docs.map((d) => Object.assign({ docId: d.id }, d.data()));
  return mergeStudentsAcrossGroups(docs, groupNameByCode);
}

// Dọn 1 LẦN các bản ghi "Chưa xếp nhóm" (groupCode rỗng) THỪA của những học sinh ĐÃ CÓ bản ghi khác
// ở 1 nhóm THẬT — tính năng "chọn học sinh có sẵn" lúc tạo nhóm mới (group-manager.js) TỪNG có lỗi
// không xoá bản ghi "Chưa xếp nhóm" cũ sau khi thêm vào nhóm mới (đã sửa), để sót lại các bản ghi thừa
// này từ trước khi sửa — khiến 1 học sinh nhìn như xuất hiện lẫn với "Chưa xếp nhóm" dù đã có nhóm
// thật. CHỈ xoá bản ghi groupCode RỖNG khi CÙNG studentUid đó đã có ÍT NHẤT 1 bản ghi khác groupCode
// KHÔNG rỗng — học sinh THẬT SỰ chưa vào nhóm nào (chỉ có đúng 1 bản ghi rỗng, không có bản ghi thật
// nào khác) không bị đụng tới. Trả về số bản ghi đã xoá.
async function cleanupOrphanedUnassignedDuplicates() {
  const teacher = getCurrentTeacher();
  if (!teacher) throw new Error('Cần đăng nhập giáo viên.');
  const { db } = ensureFirebase();
  const snap = await db.collection('students').where('teacherUid', '==', teacher.uid).get();
  const docs = snap.docs.map((d) => Object.assign({ docId: d.id }, d.data()));
  const byKey = new Map();
  docs.forEach((d) => {
    const key = d.studentUid || d.docId;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(d);
  });
  const toDeleteIds = [];
  byKey.forEach((list) => {
    if (list.length < 2 || !list.some((d) => d.groupCode)) return;
    list.filter((d) => !d.groupCode).forEach((d) => toDeleteIds.push(d.docId));
  });
  if (!toDeleteIds.length) return 0;
  const batch = db.batch();
  toDeleteIds.forEach((id) => batch.delete(db.collection('students').doc(id)));
  await batch.commit();
  return toDeleteIds.length;
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
  await addStudentToGroup(groupCode, registration);
  const { db } = ensureFirebase();
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

// ---------- Giới hạn gói miễn phí (xem js/features/monetization.js) ----------
// Chỉ áp dụng khi admin đã bật công tắc tổng VÀ giáo viên vẫn đang ở gói miễn phí — bật/tắt tự do,
// không cần đợi deploy lại vì đọc thẳng config/monetization mỗi lần tạo nhóm/thêm học sinh.
async function enforceTeacherGroupLimit(teacherUid) {
  if (typeof getMonetizationConfig !== 'function') return; // trang chưa nạp monetization.js
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled) return;
  const sub = await getTeacherSubscription(teacherUid);
  if (sub.tier === 'pro') return;
  const groups = await listGroupsForCurrentTeacher();
  if (groups.length >= cfg.teacherFreeLimits.maxGroupsFree) {
    throw new Error(`Gói miễn phí chỉ được tối đa ${cfg.teacherFreeLimits.maxGroupsFree} nhóm. Vào trang "Hồ sơ" để nâng cấp gói Pro (không giới hạn).`);
  }
}

async function enforceTeacherStudentLimit(teacherUid) {
  if (typeof getMonetizationConfig !== 'function') return;
  const cfg = await getMonetizationConfig();
  if (!cfg.enabled) return;
  const sub = await getTeacherSubscription(teacherUid);
  if (sub.tier === 'pro') return;
  const groups = await listGroupsForCurrentTeacher();
  const totalStudents = groups.reduce((sum, g) => sum + (g.studentCount || 0), 0);
  if (totalStudents >= cfg.teacherFreeLimits.maxStudentsFree) {
    throw new Error(`Gói miễn phí chỉ được tối đa ${cfg.teacherFreeLimits.maxStudentsFree} học sinh. Vào trang "Hồ sơ" để nâng cấp gói Pro (không giới hạn).`);
  }
}
