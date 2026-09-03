// Học sinh tham gia nhóm — định danh CHÍNH bằng tài khoản Google (Firebase Auth, xem
// js/features/auth.js: requireStudentAuth), KHÔNG còn dùng "deviceId" ngẫu nhiên lưu trong
// localStorage như trước (đổi điện thoại/máy tính là mất sạch nhóm/tiến độ học/gói đã mua — xem
// lịch sử trò chuyện). Nhóm/gói/tiến độ giờ gắn với uid tài khoản, sống sót qua mọi lần đổi thiết bị,
// chỉ cần đăng nhập lại đúng tài khoản Google đó.
//
// 1 tài khoản có thể ở NHIỀU NHÓM của NHIỀU GIÁO VIÊN khác nhau cùng lúc (mỗi nhóm là 1 bản ghi
// "students" riêng, cùng studentUid) — khác hẳn cơ chế cũ (chỉ nhớ được 1 nhóm "đang hoạt động" tại
// 1 thời điểm, vào nhóm mới là ghi đè mất nhóm cũ). "Membership" bên dưới vẫn cache 1 bản trong
// localStorage (nhóm đang xem/học) để các trang khác (kiem-tra.html, hoc-theo-chuong.html,
// index.html...) đọc nhanh, đồng bộ — nhưng nguồn SỰ THẬT luôn là Firestore, đọc lại mỗi khi mở
// trang "Vào nhóm" để phát hiện thay đổi (giáo viên thêm/xoá, tự vào nhóm mới...).

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

// getMembership() chỉ đọc CACHE cục bộ (đồng bộ, để các trang hiện nhanh không phải chờ mạng) —
// KHÔNG tự kiểm tra cache đó có còn khớp với tài khoản Google ĐANG đăng nhập hay không. Trên thiết
// bị dùng chung (VD điện thoại nhiều học sinh thay nhau đăng nhập để test/dùng), nếu không kiểm tra
// lại thì trang có thể hiện NHẦM dữ liệu của tài khoản trước đó (tiến độ học, trạng thái gói, tên
// nhóm...) dù đã đổi sang tài khoản Google khác — đây là lỗi thực tế đã gặp (tiến độ học giống nhau
// dù đăng nhập tài khoản khác nhau). Dùng hàm này (async) ở bất kỳ đâu sắp hiển thị dữ liệu gắn với
// tài khoản: nếu tài khoản đang đăng nhập KHÔNG khớp studentUid đã cache, tự xoá cache cũ và trả về
// null (trang sẽ hiện lại đúng trạng thái "chưa vào nhóm nào" thay vì dữ liệu sai chủ).
async function getVerifiedMembership() {
  const m = getMembership();
  if (!m || !m.studentUid) return m;
  const user = (typeof waitForAuthReady === 'function') ? await waitForAuthReady() : null;
  if (!user || user.uid !== m.studentUid) {
    clearMembership();
    return null;
  }
  return m;
}

// Toàn bộ nhóm tài khoản này ĐÃ được duyệt vào — xem chú thích đầu file (multi-group).
async function listMyGroups(studentUid) {
  const { db } = ensureFirebase();
  const snap = await db.collection('students').where('studentUid', '==', studentUid).get();
  return snap.docs.map((d) => Object.assign({ studentId: d.id }, d.data()))
    .sort((a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || ''));
}

// Xin vào nhóm bằng mã nhóm: tìm nhóm theo groupCode, rồi:
// - Nếu tài khoản này ĐÃ là thành viên chính thức của đúng nhóm đó (đã được duyệt từ trước) -> coi
//   như vào lại luôn, không bắt xin duyệt lại.
// - Ngược lại -> tạo 1 yêu cầu CHỜ DUYỆT (studentRegistrations, có kèm groupCode/groupName), giáo
//   viên nhận thông báo và tự duyệt/từ chối — xem js/features/manage-students.js.
// info = { studentName, school, className, address, phone } — đủ thông tin để giáo viên liên lạc.
async function requestJoinGroupByCode(groupCode, info, studentUid) {
  const { db } = ensureFirebase();
  const groupSnap = await db.collection('groups').where('groupCode', '==', groupCode).limit(1).get();
  if (groupSnap.empty) throw new Error(`Không tìm thấy nhóm với mã "${groupCode}"`);
  const groupDoc = groupSnap.docs[0];
  const group = groupDoc.data();

  const existingSnap = await db.collection('students')
    .where('groupCode', '==', groupCode).where('studentUid', '==', studentUid).limit(1).get();
  if (!existingSnap.empty) {
    return {
      status: 'approved', studentId: existingSnap.docs[0].id, groupId: groupDoc.id, groupCode,
      groupName: group.groupName, grade: group.grade, teacherUid: group.teacherUid
    };
  }

  await db.collection('studentRegistrations').add(Object.assign(
    { teacherUid: group.teacherUid, groupCode, groupName: group.groupName, studentUid,
      status: 'pending', createdAt: new Date().toISOString() },
    info
  ));
  return { status: 'pending', groupCode, groupName: group.groupName };
}

// Kiểm tra 1 yêu cầu đang chờ đã được giáo viên duyệt chưa — dựa vào việc tài khoản này đã xuất
// hiện trong "students" của đúng nhóm đó hay chưa (KHÔNG đọc studentRegistrations vì học sinh không
// có quyền đọc collection đó, chỉ giáo viên sở hữu mới đọc được — xem firestore.rules).
async function checkPendingJoinStatus(pending) {
  const { db } = ensureFirebase();
  const snap = await db.collection('students')
    .where('groupCode', '==', pending.groupCode).where('studentUid', '==', pending.studentUid).limit(1).get();
  if (snap.empty) return { status: 'pending' };
  const doc = snap.docs[0];
  const s = doc.data();
  return { status: 'approved', studentId: doc.id, groupCode: pending.groupCode, groupName: s.groupName || pending.groupName, ...s };
}

// Đăng ký "chờ xếp nhóm" bằng MÃ GIÁO VIÊN (không cần biết mã nhóm cụ thể) — dùng cho nút "Đăng ký
// học cùng thầy (cô)" ở trang chủ. Giáo viên nhận thông báo rồi tự xếp học sinh vào 1 nhóm sau, xem
// js/features/groups-data.js (getPendingRegistrationsForCurrentTeacher/assignRegistrationToGroup).
// info = { studentName, school, className, address, phone }.
async function registerWithTeacherCode(teacherCode, info, studentUid) {
  const { db } = ensureFirebase();
  const code = (teacherCode || '').trim().toUpperCase();
  const profileSnap = await db.collection('teacherProfiles').where('teacherCode', '==', code).limit(1).get();
  if (profileSnap.empty) throw new Error(`Không tìm thấy giáo viên với mã "${code}"`);
  const teacherDoc = profileSnap.docs[0];
  const teacherProfile = teacherDoc.data();

  const ref = await db.collection('studentRegistrations').add(Object.assign(
    { teacherUid: teacherDoc.id, teacherCode: code, studentUid, status: 'pending', createdAt: new Date().toISOString() },
    info
  ));
  return { registrationId: ref.id, teacherUid: teacherDoc.id, teacherName: teacherProfile.displayName || '' };
}

function initJoinGroupPage() {
  if (!isFirebaseConfigured()) {
    $('#joinBody').innerHTML = `<div class="card"><p class="hint">⚠️ Tính năng nhóm chưa được giáo viên bật (chưa kết nối Firebase).</p></div>`;
    return;
  }
  requireStudentAuth((user) => renderJoinPage(user.uid));
}

async function renderJoinPage(studentUid) {
  const groupsBox = $('#currentMembership');
  let pendingInfo = null; // { groupCode, groupName } — chỉ tồn tại trong phiên đang mở trang, không
                           // cần lưu bền: mở lại trang là listMyGroups() tự thấy đã duyệt hay chưa.

  async function refreshGroupsList() {
    let groups;
    try {
      groups = await listMyGroups(studentUid);
    } catch (e) {
      groupsBox.style.display = 'block';
      groupsBox.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      return;
    }
    if (!groups.length) {
      groupsBox.style.display = 'none';
      return;
    }
    const membership = getMembership();
    groupsBox.style.display = 'block';
    groupsBox.innerHTML = `
      <h2><span class="icon">✅</span>Nhóm của bạn</h2>
      <p class="hint" style="margin-top:-4px;">Bạn có thể ở nhiều nhóm cùng lúc — chọn 1 nhóm để học/làm bài.</p>
      ${groups.map((g) => {
        const active = membership && membership.studentId === g.studentId;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border);">
          <span class="hint"><strong>${escapeHtml(g.groupName)}</strong> (mã ${escapeHtml(g.groupCode)}) · Lớp ${escapeHtml(String(g.grade || ''))}${active ? ' <strong style="color:var(--brand);">— đang xem</strong>' : ''}</span>
          <button class="btn ${active ? '' : 'primary'} select-group-btn" type="button" data-id="${g.studentId}" style="flex-shrink:0;">${active ? 'Đang chọn' : 'Chọn nhóm này'}</button>
        </div>
      `;
      }).join('')}
      <div class="btn-row" style="margin-top:10px;">
        <a class="btn primary" href="kiem-tra.html">Xem bài kiểm tra</a>
      </div>
    `;
    $$('.select-group-btn', groupsBox).forEach((btn) => {
      btn.addEventListener('click', () => {
        const g = groups.find((x) => x.studentId === btn.dataset.id);
        setMembership(Object.assign({}, g, { studentUid }));
        refreshGroupsList();
      });
    });
  }

  function renderPendingCheckButton(resultBox) {
    const old = document.getElementById('pendingCheckBtn');
    if (old) old.remove();
    const btn = document.createElement('button');
    btn.id = 'pendingCheckBtn';
    btn.className = 'btn block';
    btn.type = 'button';
    btn.style.marginTop = '8px';
    btn.textContent = '🔄 Kiểm tra lại';
    btn.addEventListener('click', async () => {
      showResult(resultBox, '⏳ Đang kiểm tra...');
      try {
        const result = await checkPendingJoinStatus(Object.assign({ studentUid }, pendingInfo));
        if (result.status === 'approved') {
          setMembership({
            studentId: result.studentId, groupCode: result.groupCode, groupName: result.groupName,
            grade: result.grade, teacherUid: result.teacherUid, studentUid,
            studentName: result.studentName, school: result.school, className: result.className,
            address: result.address, phone: result.phone
          });
          pendingInfo = null;
          btn.remove();
          showResult(resultBox, `✓ Đã được duyệt vào nhóm "${escapeHtml(result.groupName)}"!`);
          await refreshGroupsList();
        } else {
          showResult(resultBox, '⏳ Vẫn đang chờ giáo viên duyệt...');
        }
      } catch (e) {
        showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
    resultBox.insertAdjacentElement('afterend', btn);
  }

  $('#joinGroupBtn').addEventListener('click', async () => {
    const studentName = $('#joinName').value.trim();
    const school = $('#joinSchool').value.trim();
    const className = $('#joinClassName').value.trim();
    const address = $('#joinAddress').value.trim();
    const phone = $('#joinPhone').value.trim();
    const groupCode = $('#joinCode').value.trim().toUpperCase();
    const resultBox = $('#joinResult');
    if (!studentName || !school || !className || !address || !phone || !groupCode) {
      showResult(resultBox, 'Điền đầy đủ tất cả các mục (đánh dấu *) trước khi tham gia.', true);
      return;
    }
    showResult(resultBox, '⏳ Đang gửi yêu cầu...');
    try {
      const info = { studentName, school, className, address, phone };
      const data = await requestJoinGroupByCode(groupCode, info, studentUid);
      if (data.status === 'approved') {
        setMembership(Object.assign(
          { studentId: data.studentId, groupCode: data.groupCode, groupName: data.groupName,
            grade: data.grade, teacherUid: data.teacherUid, studentUid },
          info
        ));
        showResult(resultBox, `✓ Đã tham gia nhóm "${escapeHtml(data.groupName)}"!`);
        await refreshGroupsList();
      } else {
        pendingInfo = { groupCode: data.groupCode, groupName: data.groupName };
        showResult(resultBox, `✓ Đã gửi yêu cầu xin vào nhóm "${escapeHtml(data.groupName)}"! Chờ giáo viên duyệt rồi bấm "Kiểm tra lại" bên dưới.`);
        renderPendingCheckButton(resultBox);
      }
    } catch (e) {
      showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });

  await refreshGroupsList();
}
