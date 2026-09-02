// Học sinh nhập tên + mã nhóm để XIN vào nhóm — lưu trên thiết bị (không cần tài khoản). Yêu cầu
// tạo ra chỉ là bản ghi CHỜ DUYỆT (studentRegistrations); giáo viên phải duyệt (xem
// js/features/manage-students.js) thì mới thực sự được thêm vào nhóm (bản ghi "students").
// File này định nghĩa hàm dùng chung (getMembership...) + initJoinGroupPage() cho trang vao-nhom.html.

const STUDENT_MEMBERSHIP_KEY = 'hoahoc_student_membership';
const PENDING_JOIN_KEY = 'hoahoc_pending_join';

function getMembership() {
  try { return JSON.parse(localStorage.getItem(STUDENT_MEMBERSHIP_KEY)); } catch (e) { return null; }
}

function setMembership(m) {
  localStorage.setItem(STUDENT_MEMBERSHIP_KEY, JSON.stringify(m));
}

function clearMembership() {
  localStorage.removeItem(STUDENT_MEMBERSHIP_KEY);
}

function getPendingJoin() {
  try { return JSON.parse(localStorage.getItem(PENDING_JOIN_KEY)); } catch (e) { return null; }
}

function setPendingJoin(p) {
  localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify(p));
}

function clearPendingJoin() {
  localStorage.removeItem(PENDING_JOIN_KEY);
}

// Xin vào nhóm bằng mã nhóm: tìm nhóm theo groupCode, rồi:
// - Nếu thiết bị này ĐÃ là thành viên chính thức của đúng nhóm đó (đã được duyệt từ trước) -> coi
//   như vào lại luôn, không bắt xin duyệt lại.
// - Ngược lại -> tạo 1 yêu cầu CHỜ DUYỆT (studentRegistrations, có kèm groupCode/groupName), giáo
//   viên nhận thông báo và tự duyệt/từ chối — xem js/features/manage-students.js.
// info = { studentName, school, className, address, phone } — đủ thông tin để giáo viên liên lạc.
async function requestJoinGroupByCode(groupCode, info, deviceId) {
  const { db } = ensureFirebase();
  const groupSnap = await db.collection('groups').where('groupCode', '==', groupCode).limit(1).get();
  if (groupSnap.empty) throw new Error(`Không tìm thấy nhóm với mã "${groupCode}"`);
  const groupDoc = groupSnap.docs[0];
  const group = groupDoc.data();

  const existingSnap = await db.collection('students')
    .where('groupCode', '==', groupCode).where('deviceId', '==', deviceId).limit(1).get();
  if (!existingSnap.empty) {
    return {
      status: 'approved', studentId: existingSnap.docs[0].id, groupId: groupDoc.id, groupCode,
      groupName: group.groupName, grade: group.grade, teacherUid: group.teacherUid
    };
  }

  await db.collection('studentRegistrations').add(Object.assign(
    { teacherUid: group.teacherUid, groupCode, groupName: group.groupName, deviceId,
      status: 'pending', createdAt: new Date().toISOString() },
    info
  ));
  return { status: 'pending', groupCode, groupName: group.groupName };
}

// Kiểm tra 1 yêu cầu đang chờ đã được giáo viên duyệt chưa — dựa vào việc thiết bị này đã xuất hiện
// trong "students" của đúng nhóm đó hay chưa (KHÔNG đọc studentRegistrations vì học sinh chưa đăng
// nhập, không có quyền đọc collection đó — xem firestore.rules).
async function checkPendingJoinStatus(pending) {
  const { db } = ensureFirebase();
  const snap = await db.collection('students')
    .where('groupCode', '==', pending.groupCode).where('deviceId', '==', pending.deviceId).limit(1).get();
  if (snap.empty) return { status: 'pending' };
  const doc = snap.docs[0];
  const s = doc.data();
  return { status: 'approved', studentId: doc.id, groupCode: pending.groupCode, groupName: s.groupName || pending.groupName, ...s };
}

// Đăng ký "chờ xếp nhóm" bằng MÃ GIÁO VIÊN (không cần biết mã nhóm cụ thể) — dùng cho nút "Đăng ký
// học cùng thầy (cô)" ở trang chủ. Giáo viên nhận thông báo rồi tự xếp học sinh vào 1 nhóm sau, xem
// js/features/groups-data.js (getPendingRegistrationsForCurrentTeacher/assignRegistrationToGroup).
// info = { studentName, school, className, address, phone }.
async function registerWithTeacherCode(teacherCode, info, deviceId) {
  const { db } = ensureFirebase();
  const code = (teacherCode || '').trim().toUpperCase();
  const profileSnap = await db.collection('teacherProfiles').where('teacherCode', '==', code).limit(1).get();
  if (profileSnap.empty) throw new Error(`Không tìm thấy giáo viên với mã "${code}"`);
  const teacherDoc = profileSnap.docs[0];
  const teacherProfile = teacherDoc.data();

  const ref = await db.collection('studentRegistrations').add(Object.assign(
    { teacherUid: teacherDoc.id, teacherCode: code, deviceId, status: 'pending', createdAt: new Date().toISOString() },
    info
  ));
  return { registrationId: ref.id, teacherUid: teacherDoc.id, teacherName: teacherProfile.displayName || '' };
}

function initJoinGroupPage() {
  if (!isFirebaseConfigured()) {
    $('#joinBody').innerHTML = `<div class="card"><p class="hint">⚠️ Tính năng nhóm chưa được giáo viên bật (chưa kết nối Firebase).</p></div>`;
    return;
  }

  async function renderCurrentMembership() {
    const box = $('#currentMembership');
    const m = getMembership();
    if (m) {
      box.style.display = 'block';
      box.innerHTML = `
        <h2><span class="icon">✅</span>Bạn đang ở nhóm</h2>
        <p><strong>${escapeHtml(m.studentName)}</strong> · Lớp ${escapeHtml(String(m.grade))} · Nhóm "${escapeHtml(m.groupName)}" (mã ${escapeHtml(m.groupCode)})</p>
        <div class="btn-row">
          <a class="btn primary" href="kiem-tra.html">Xem bài kiểm tra</a>
          <button class="btn" id="leaveGroupBtn">Rời nhóm này</button>
        </div>
      `;
      $('#leaveGroupBtn').addEventListener('click', () => {
        clearMembership();
        renderCurrentMembership();
      });
      return;
    }

    const pending = getPendingJoin();
    if (pending) {
      box.style.display = 'block';
      box.innerHTML = `
        <h2><span class="icon">⏳</span>Đang chờ giáo viên duyệt</h2>
        <p>Bạn đã gửi yêu cầu xin vào nhóm "${escapeHtml(pending.groupName)}" (mã ${escapeHtml(pending.groupCode)}). Giáo viên cần duyệt trước khi bạn vào học được.</p>
        <div class="btn-row">
          <button class="btn primary" id="recheckPendingBtn">🔄 Kiểm tra lại</button>
        </div>
        <div class="result-box" id="pendingCheckResult"></div>
      `;
      $('#recheckPendingBtn').addEventListener('click', async () => {
        const rbox = $('#pendingCheckResult');
        showResult(rbox, '⏳ Đang kiểm tra...');
        try {
          const result = await checkPendingJoinStatus(pending);
          if (result.status === 'approved') {
            clearPendingJoin();
            setMembership({
              studentId: result.studentId, groupCode: result.groupCode, groupName: result.groupName,
              grade: result.grade, teacherUid: result.teacherUid,
              studentName: result.studentName, school: result.school, className: result.className,
              address: result.address, phone: result.phone
            });
            renderCurrentMembership();
          } else {
            hideResult(rbox);
          }
        } catch (e) {
          showResult(rbox, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });
      return;
    }

    box.style.display = 'none';
  }

  $('#joinGroupBtn').addEventListener('click', async () => {
    const studentName = $('#joinName').value.trim();
    const school = $('#joinSchool').value.trim();
    const className = $('#joinClassName').value.trim();
    const address = $('#joinAddress').value.trim();
    const phone = $('#joinPhone').value.trim();
    const groupCode = $('#joinCode').value.trim().toUpperCase();
    const box = $('#joinResult');
    if (!studentName || !school || !className || !address || !phone || !groupCode) {
      showResult(box, 'Điền đầy đủ tất cả các mục (đánh dấu *) trước khi tham gia.', true);
      return;
    }
    showResult(box, '⏳ Đang gửi yêu cầu...');
    try {
      const info = { studentName, school, className, address, phone };
      const deviceId = getDeviceId();
      const data = await requestJoinGroupByCode(groupCode, info, deviceId);
      if (data.status === 'approved') {
        setMembership(Object.assign(
          { studentId: data.studentId, groupCode: data.groupCode, groupName: data.groupName,
            grade: data.grade, teacherUid: data.teacherUid },
          info
        ));
        showResult(box, `✓ Đã tham gia nhóm "${escapeHtml(data.groupName)}"!`);
      } else {
        setPendingJoin({ groupCode: data.groupCode, groupName: data.groupName, deviceId });
        showResult(box, `✓ Đã gửi yêu cầu xin vào nhóm "${escapeHtml(data.groupName)}"! Chờ giáo viên duyệt nhé.`);
      }
      renderCurrentMembership();
    } catch (e) {
      showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });

  renderCurrentMembership();
}
