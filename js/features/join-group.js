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
//
// Kiểm tra THÊM: bản ghi "students" (m.studentId) có còn tồn tại thật trên Firestore không. CÙNG 1
// tài khoản Google (uid không đổi) vẫn có thể bị "cache sai" nếu dữ liệu server đã bị xoá — VD admin
// dùng công cụ "Đặt lại tài khoản" (trang quản trị) xoá sạch dữ liệu để tự test lại: chỉ riêng kiểm
// tra uid ở trên sẽ KHÔNG phát hiện được trường hợp này (uid vẫn khớp, chỉ có dữ liệu server đã mất),
// khiến trang tiếp tục hiện tiến độ/chương trình học CŨ đọc từ cache cục bộ dù đã "đặt lại" xong.
async function getVerifiedMembership() {
  const m = getMembership();
  const user = (typeof waitForAuthReady === 'function') ? await waitForAuthReady() : null;
  if (!m || !m.studentUid) {
    // Chưa có cache trên thiết bị này — thường gặp khi học sinh vừa đăng nhập thẳng ở trang chủ (mã
    // học sinh do giáo viên cấp, hoặc Google) mà CHƯA từng tự mở "Vào nhóm học tập" 1 lần nào (trang
    // đó mới là nơi trước đây tự điền cache này). Giáo viên thường đã xếp sẵn học sinh vào nhóm ngay
    // lúc nạp danh sách nên học sinh CÓ SẴN nhóm trên Firestore dù thiết bị chưa biết — nếu không tự
    // dò ở đây, trang chủ sẽ không nhận diện được là học sinh của giáo viên nào (không hiện đúng
    // thương hiệu "Học cùng {tên giáo viên}", tên nhóm...) cho tới khi tự mở "Vào nhóm" 1 lần, rất dễ
    // gây hiểu nhầm là lỗi. Tự dò và điền cache luôn nếu đang đăng nhập 1 tài khoản đã có sẵn nhóm.
    if (user) {
      try {
        const groups = await listMyGroups(user.uid);
        if (groups.length) {
          const auto = Object.assign({}, groups[0], { studentUid: user.uid });
          setMembership(auto);
          return auto;
        }
      } catch (e) { /* lỗi mạng tạm thời -> coi như chưa có nhóm, không chặn trang */ }
    }
    return m;
  }
  if (!user || user.uid !== m.studentUid) {
    clearMembership();
    return null;
  }
  if (m.studentId) {
    try {
      const { db } = ensureFirebase();
      const snap = await db.collection('students').doc(m.studentId).get();
      if (!snap.exists) {
        clearMembership();
        return null;
      }
    } catch (e) { /* lỗi mạng tạm thời -> vẫn tạm dùng cache cũ, không chặn trang vì 1 lần lỗi mạng */ }
  }
  return m;
}

// ---------- Hồ sơ học sinh (tên/trường/lớp/địa chỉ/SĐT) ----------
// Lưu 1 LẦN DUY NHẤT theo tài khoản, dùng lại cho MỌI lần đăng ký học cùng thầy (cô)/xin vào nhóm
// sau này — khỏi phải gõ lại từ đầu mỗi lần xin vào 1 nhóm mới. Riêng tư (chỉ chính học sinh đó đọc/
// sửa được — xem firestore.rules). Vẫn SỬA được nếu thông tin cũ sai/đã đổi (trường mới, SĐT mới...).
async function getStudentProfile(uid) {
  const { db } = ensureFirebase();
  const snap = await db.collection('studentProfiles').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function saveStudentProfile(uid, info) {
  const { db } = ensureFirebase();
  await db.collection('studentProfiles').doc(uid).set({
    studentName: info.studentName, school: info.school, className: info.className,
    address: info.address, phone: info.phone, updatedAt: new Date().toISOString()
  }, { merge: true });
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
// info = { studentName, school, className, address, phone, email } — đủ thông tin để giáo viên liên
// lạc; email lấy từ tài khoản Google đang đăng nhập (xem initJoinGroupPage), dùng để hiện trong danh
// sách học sinh cho giáo viên đối chiếu chính xác (2 em trùng tên/trùng SĐT gia đình vẫn phân biệt được).
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

  // Dùng ID CỐ ĐỊNH theo studentUid+groupCode (KHÔNG dùng .add() tự sinh id ngẫu nhiên) — gửi lại
  // yêu cầu (VD sửa lại thông tin gõ nhầm, hoặc lỡ tay bấm gửi 2 lần) trong lúc CÒN chờ duyệt sẽ chỉ
  // GHI ĐÈ đúng 1 bản ghi này, không tạo thêm bản ghi chờ duyệt trùng. Trước đây dùng .add() nên 1
  // tài khoản có thể gửi nhiều yêu cầu chờ duyệt cùng lúc (khai tên khác nhau mỗi lần) cho CÙNG 1
  // nhóm — nếu giáo viên không để ý duyệt nhầm nhiều yêu cầu, tài khoản đó chiếm nhiều "suất" học
  // sinh trong cùng 1 nhóm dù thực ra chỉ là 1 người. Yêu cầu đã được duyệt/từ chối thì bị XOÁ hẳn
  // (xem assignRegistrationToGroup/rejectRegistration trong groups-data.js) nên ID này rảnh lại ngay
  // sau đó, không cản trở lần đăng ký MỚI hợp lệ sau này.
  await db.collection('studentRegistrations').doc(`${studentUid}_group_${groupCode}`).set(Object.assign(
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
// info = { studentName, school, className, address, phone, email }.
async function registerWithTeacherCode(teacherCode, info, studentUid) {
  const { db } = ensureFirebase();
  const code = (teacherCode || '').trim().toUpperCase();
  const profileSnap = await db.collection('teacherProfiles').where('teacherCode', '==', code).limit(1).get();
  if (profileSnap.empty) throw new Error(`Không tìm thấy giáo viên với mã "${code}"`);
  const teacherDoc = profileSnap.docs[0];
  const teacherProfile = teacherDoc.data();

  // ID CỐ ĐỊNH theo studentUid+teacherCode — cùng lý do như requestJoinGroupByCode() ở trên: gửi lại
  // trong lúc còn chờ duyệt chỉ ghi đè, không tạo thêm bản ghi chờ trùng cho cùng 1 giáo viên.
  const regId = `${studentUid}_teacher_${code}`;
  await db.collection('studentRegistrations').doc(regId).set(Object.assign(
    { teacherUid: teacherDoc.id, teacherCode: code, studentUid, status: 'pending', createdAt: new Date().toISOString() },
    info
  ));
  return { registrationId: regId, teacherUid: teacherDoc.id, teacherName: teacherProfile.displayName || '' };
}

function initJoinGroupPage() {
  if (!isFirebaseConfigured()) {
    $('#joinBody').innerHTML = `<div class="card"><p class="hint">⚠️ Tính năng nhóm chưa được giáo viên bật (chưa kết nối Firebase).</p></div>`;
    return;
  }
  requireStudentAuth((user) => renderJoinPage(user.uid, user.email || ''));
}

// Thông tin cá nhân "khoá cứng" dùng để xin vào nhóm MỚI — ưu tiên hồ sơ tự lưu (studentProfiles);
// nếu chưa có (VD tài khoản do giáo viên cấp, nạp hàng loạt, chưa từng tự đăng ký/xin vào nhóm nào
// qua app) thì lấy tạm từ bất kỳ nhóm nào ĐÃ có sẵn của chính tài khoản này (giáo viên đã nhập lúc
// nạp danh sách) — không có nguồn nào cả thì coi như chưa có thông tin gì (xem renderJoinPage).
async function getLockedStudentIdentity(studentUid) {
  const profile = await getStudentProfile(studentUid).catch(() => null);
  if (profile) return profile;
  try {
    const groups = await listMyGroups(studentUid);
    if (groups.length) {
      const g = groups[0];
      return { studentName: g.studentName, school: g.school, className: g.className, address: g.address, phone: g.phone };
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function renderJoinPage(studentUid, studentEmail) {
  let pendingInfo = null; // { groupCode, groupName } — chỉ tồn tại trong phiên đang mở trang, không
                           // cần lưu bền: mở lại trang là listMyGroups() tự thấy đã duyệt hay chưa.

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
          showResult(resultBox, `✓ Đã được duyệt vào nhóm "${escapeHtml(result.groupName)}"! Vào trang chủ để bắt đầu học/làm bài.`);
        } else {
          showResult(resultBox, '⏳ Vẫn đang chờ giáo viên duyệt...');
        }
      } catch (e) {
        showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
    resultBox.insertAdjacentElement('afterend', btn);
  }

  // Điền sẵn thông tin cá nhân (KHOÁ CỨNG, không cho sửa ở đây) từ hồ sơ đã lưu hoặc từ nhóm có sẵn —
  // xem getLockedStudentIdentity(). Học sinh ĐÃ đăng nhập không còn tự gõ tay thông tin này ở màn
  // "Xin vào nhóm" nữa (trước đây có thể sửa tự do, kể cả khi đã có hồ sơ) — tránh 1 tài khoản khai
  // nhiều tên khác nhau để xin vào nhiều nhóm dưới nhiều danh tính giả. Hoàn toàn CHƯA có thông tin
  // gì (chưa từng đăng ký/chưa từng ở nhóm nào) -> bắt về trang chủ đăng ký trước, ẩn hẳn phần "Mã
  // nhóm" + nút gửi (không có thông tin thật để gửi kèm).
  let lockedIdentity = null;
  try { lockedIdentity = await getLockedStudentIdentity(studentUid); } catch (e) { /* ignore */ }
  if (lockedIdentity) {
    $('#joinName').value = lockedIdentity.studentName || '';
    $('#joinSchool').value = lockedIdentity.school || '';
    $('#joinClassName').value = lockedIdentity.className || '';
    $('#joinAddress').value = lockedIdentity.address || '';
    $('#joinPhone').value = lockedIdentity.phone || '';
    $('#joinProfileText').textContent = `${lockedIdentity.studentName || ''} — ${lockedIdentity.school || ''}, lớp ${lockedIdentity.className || ''}`;
    $('#joinProfileSummary').style.display = 'block';
    $('#joinActionFields').style.display = 'block';
  } else {
    $('#joinNoProfileNotice').style.display = 'block';
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
      const info = { studentName, school, className, address, phone, email: studentEmail };
      // Lưu lại hồ sơ (kể cả khi vừa sửa lại thông tin cũ) để lần xin vào nhóm KHÁC sau này khỏi
      // phải gõ lại — lỗi mạng ở bước này không nên chặn cả yêu cầu vào nhóm nên bỏ qua nếu hỏng.
      saveStudentProfile(studentUid, info).catch(() => {});
      const data = await requestJoinGroupByCode(groupCode, info, studentUid);
      if (data.status === 'approved') {
        setMembership(Object.assign(
          { studentId: data.studentId, groupCode: data.groupCode, groupName: data.groupName,
            grade: data.grade, teacherUid: data.teacherUid, studentUid },
          info
        ));
        showResult(resultBox, `✓ Đã tham gia nhóm "${escapeHtml(data.groupName)}"! Vào trang chủ để bắt đầu học/làm bài.`);
      } else {
        pendingInfo = { groupCode: data.groupCode, groupName: data.groupName };
        showResult(resultBox, `✓ Đã gửi yêu cầu xin vào nhóm "${escapeHtml(data.groupName)}"! Chờ giáo viên duyệt rồi bấm "Kiểm tra lại" bên dưới.`);
        renderPendingCheckButton(resultBox);
      }
    } catch (e) {
      showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });
}
