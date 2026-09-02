// Học sinh nhập tên + mã nhóm để tham gia — lưu trên thiết bị (không cần tài khoản).
// File này định nghĩa hàm dùng chung (getMembership...) + initJoinGroupPage() cho trang vao-nhom.html.

const STUDENT_MEMBERSHIP_KEY = 'hoahoc_student_membership';

function getMembership() {
  try { return JSON.parse(localStorage.getItem(STUDENT_MEMBERSHIP_KEY)); } catch (e) { return null; }
}

function setMembership(m) {
  localStorage.setItem(STUDENT_MEMBERSHIP_KEY, JSON.stringify(m));
}

function clearMembership() {
  localStorage.removeItem(STUDENT_MEMBERSHIP_KEY);
}

// Tham gia nhóm bằng mã: tìm nhóm theo groupCode, tạo (hoặc lấy lại) bản ghi học sinh cho thiết bị này.
// info = { studentName, school, className, address, phone } — đủ thông tin để giáo viên liên lạc.
async function joinGroupByCode(groupCode, info, deviceId) {
  const { db } = ensureFirebase();
  const groupSnap = await db.collection('groups').where('groupCode', '==', groupCode).limit(1).get();
  if (groupSnap.empty) throw new Error(`Không tìm thấy nhóm với mã "${groupCode}"`);
  const groupDoc = groupSnap.docs[0];
  const group = groupDoc.data();

  const existingSnap = await db.collection('students')
    .where('groupCode', '==', groupCode).where('deviceId', '==', deviceId).limit(1).get();
  let studentId;
  if (!existingSnap.empty) {
    studentId = existingSnap.docs[0].id;
  } else {
    const ref = await db.collection('students').add(Object.assign(
      { groupCode, deviceId, joinedAt: new Date().toISOString() }, info
    ));
    studentId = ref.id;
  }
  return {
    studentId, groupId: groupDoc.id, groupCode,
    groupName: group.groupName, grade: group.grade, teacherUid: group.teacherUid
  };
}

function initJoinGroupPage() {
  if (!isFirebaseConfigured()) {
    $('#joinBody').innerHTML = `<div class="card"><p class="hint">⚠️ Tính năng nhóm chưa được giáo viên bật (chưa kết nối Firebase).</p></div>`;
    return;
  }

  function renderCurrentMembership() {
    const m = getMembership();
    const box = $('#currentMembership');
    if (!m) { box.style.display = 'none'; return; }
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
    showResult(box, '⏳ Đang tham gia nhóm...');
    try {
      const info = { studentName, school, className, address, phone };
      const data = await joinGroupByCode(groupCode, info, getDeviceId());
      setMembership(Object.assign(
        { studentId: data.studentId, groupCode: data.groupCode, groupName: data.groupName,
          grade: data.grade, teacherUid: data.teacherUid },
        info
      ));
      showResult(box, `✓ Đã tham gia nhóm "${escapeHtml(data.groupName)}"!`);
      renderCurrentMembership();
    } catch (e) {
      showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });

  renderCurrentMembership();
}
