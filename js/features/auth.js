// Đăng nhập bằng tài khoản Google (Firebase Authentication) — DÙNG CHUNG cho cả giáo viên lẫn học
// sinh, cùng 1 hệ Firebase Auth (xem resolveEffectiveTeacherUid bên dưới: 1 tài khoản Google có thể
// vừa là giáo viên vừa xem thử/là học sinh của nhóm khác, phân biệt qua membership chứ không phải
// qua auth). Trước đây học sinh KHÔNG cần đăng nhập (chỉ dùng tên + mã thiết bị ngẫu nhiên) — đã đổi
// sang bắt buộc đăng nhập Google (xem join-group.js) để gói đã mua/nhóm/tiến độ học không bị mất khi
// học sinh đổi thiết bị (trước đó gắn vào 1 chuỗi ngẫu nhiên lưu trong localStorage, đổi máy là mất).
//
// asStudent = true: chỉ đăng nhập Google thuần t, KHÔNG tự tạo hồ sơ giáo viên (teachers/{uid}) —
// học sinh không cần hồ sơ kiểu đó, dữ liệu của các em nằm ở collection "students" (1 bản ghi/nhóm).
//
// 1 TÀI KHOẢN GOOGLE CHỈ ĐƯỢC LÀ 1 VAI TRÒ (giáo viên HOẶC học sinh), không được lẫn lộn — xem
// enforceExclusiveRole() bên dưới: vai trò được khoá CỨNG vào "accountRoles/{uid}" ngay lần đầu tài
// khoản đó đăng nhập ở MỘT trong hai luồng, không đổi được sau đó (kể cả từ trong app). Nếu 1 tài
// khoản đã khoá vai trò A mà cố đăng nhập/đang đăng nhập ở luồng B -> bị đăng xuất ngay + báo lỗi.

// Ưu tiên signInWithPopup: không cần rời trang nên không phụ thuộc trình duyệt lưu đúng trạng thái
// "đang chờ đăng nhập" qua vòng chuyển trang đi-về — vòng này rất dễ bị các trình duyệt hiện đại
// chặn cookie/storage bên thứ 3 làm mất, khiến signInWithRedirect quay về im lặng, không báo lỗi gì.
// Chỉ khi popup bị chặn (thường gặp khi app được cài như PWA trên điện thoại) mới rơi về
// signInWithRedirect như phương án dự phòng.
// Khoá CỨNG 1 tài khoản Google chỉ dùng được cho 1 vai trò — xem chú thích đầu file. Ghi vào
// "accountRoles/{uid}" (rules: create 1 lần, không update/delete được — xem firestore.rules) NGAY
// LẦN ĐẦU xác định được, các lần sau chỉ đọc lại để đối chiếu.
// - Đã có bản ghi vai trò: khớp thì thôi (return); không khớp -> ném lỗi role-conflict.
// - Chưa có bản ghi: có thể là tài khoản THẬT đã dùng từ TRƯỚC KHI có cơ chế này (giáo viên/học sinh
//   cũ) — suy luận lại từ dữ liệu sẵn có (đã có "teachers/{uid}" -> giáo viên; đã có bản ghi
//   "students" nào đó -> học sinh) thay vì khoá nhầm luôn theo luồng đang đăng nhập, tránh khoá oan
//   người dùng cũ. Hoàn toàn MỚI (chưa từng dùng luồng nào) -> khoá theo đúng luồng đang đăng nhập.
async function enforceExclusiveRole(user, wantedRole) {
  const { db } = ensureFirebase();
  const ref = db.collection('accountRoles').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    if (snap.data().role !== wantedRole) throw roleConflictError(snap.data().role, wantedRole);
    return;
  }

  let inferredRole = wantedRole;
  try {
    const teacherDoc = await db.collection('teachers').doc(user.uid).get();
    if (teacherDoc.exists) {
      inferredRole = 'teacher';
    } else {
      const studentSnap = await db.collection('students').where('studentUid', '==', user.uid).limit(1).get();
      if (!studentSnap.empty) inferredRole = 'student';
    }
  } catch (e) { /* không tra được thì cứ khoá theo đúng luồng đang đăng nhập */ }

  // Mã cố định — sinh CÙNG LÚC với việc khoá vai trò, lưu luôn vào accountRoles để mọi nơi cần tra
  // "mã của tài khoản X" (VD cột "Mã" trong danh sách giáo viên/học sinh ở trang quản trị/quản lý
  // học sinh) chỉ cần đọc 1 chỗ, không cần biết trước đó là giáo viên hay học sinh.
  const code = inferredRole === 'teacher' ? deriveTeacherCode(user.uid) : deriveStudentCode(user.uid);

  try {
    await ref.set({ role: inferredRole, code, createdAt: new Date().toISOString() });
  } catch (e) {
    // signInWithGoogle() và onAuthChange() (requireTeacherAuth/requireStudentAuth) đều gọi hàm này
    // ngay khi vừa đăng nhập xong -> có thể ĐỤNG ĐỘ cùng ghi lần đầu, bên kia đã tạo xong trước khi
    // ghi này tới nơi (rules chỉ cho "create", bên thua cuộc bị từ chối vì lúc đó doc đã tồn tại).
    // Đọc lại bản đã có thay vì coi đây là lỗi thật.
    const raced = await ref.get();
    if (raced.exists) {
      if (raced.data().role !== wantedRole) throw roleConflictError(raced.data().role, wantedRole);
      return;
    }
    throw e; // lỗi khác thật sự (VD mất mạng) -- giữ nguyên để báo cho người dùng
  }
  if (inferredRole !== wantedRole) throw roleConflictError(inferredRole, wantedRole);
}

// Mã cố định của 1 tài khoản (GV... hoặc HS...) — đọc lại từ accountRoles (đã lưu lúc khoá vai trò).
// Không có bản ghi (VD tài khoản chưa từng qua enforceExclusiveRole, dữ liệu rất cũ) -> trả về null,
// nơi gọi tự quyết định hiện gì (thường là "—").
async function getAccountCode(uid) {
  if (!uid) return null;
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('accountRoles').doc(uid).get();
    return snap.exists ? (snap.data().code || null) : null;
  } catch (e) { return null; }
}

function roleConflictError(existingRole, wantedRole) {
  const err = new Error(
    wantedRole === 'teacher'
      ? 'Tài khoản Google này đã dùng làm tài khoản HỌC SINH trước đó, không thể dùng làm giáo viên. Hãy đăng nhập bằng 1 tài khoản Google khác.'
      : 'Tài khoản Google này đã dùng làm tài khoản GIÁO VIÊN trước đó, không thể dùng để vào nhóm học sinh. Hãy đăng nhập bằng 1 tài khoản Google khác.'
  );
  err.code = 'role-conflict';
  return err;
}

async function signInWithGoogle(asStudent) {
  const { auth } = ensureFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    if (result && result.user) {
      await enforceExclusiveRole(result.user, asStudent ? 'student' : 'teacher');
      _lastRedirectError = null;
      if (!asStudent) await ensureTeacherProfile(result.user);
    }
    return result;
  } catch (e) {
    if (e && e.code === 'role-conflict') {
      try { await auth.signOut(); } catch (e2) { /* ignore */ }
      throw e;
    }
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      return auth.signInWithRedirect(provider);
    }
    throw e;
  }
}

// Gọi 1 lần khi trang tải xong để xử lý kết quả sau khi Google chuyển hướng về (nếu có).
// Lỗi (nếu có) được lưu lại qua getLastRedirectError() để trang hiện cho người dùng thấy —
// trước đây lỗi này chỉ ghi ra console nên người dùng không biết vì sao đăng nhập thất bại.
let _lastRedirectError = null;
function getLastRedirectError() {
  return _lastRedirectError;
}

async function checkRedirectResult(asStudent) {
  if (!isFirebaseConfigured()) return null;
  try {
    const { auth } = ensureFirebase();
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      await enforceExclusiveRole(result.user, asStudent ? 'student' : 'teacher');
      _lastRedirectError = null;
      if (!asStudent) await ensureTeacherProfile(result.user);
      return result.user;
    }
  } catch (e) {
    if (e && e.code === 'role-conflict') {
      try { const { auth } = ensureFirebase(); await auth.signOut(); } catch (e2) { /* ignore */ }
    }
    console.warn('Lỗi đăng nhập:', e.code, e.message);
    _lastRedirectError = e;
  }
  return null;
}

function signOutTeacher() {
  const { auth } = ensureFirebase();
  return auth.signOut();
}

// Đăng xuất do NGƯỜI DÙNG CHỦ ĐỘNG bấm nút "Đăng xuất" (khác signOutTeacher() gọi ÂM THẦM khi phát
// hiện xung đột vai trò tài khoản ở enforceExclusiveRole — trường hợp đó không phải người dùng đang
// chủ động đăng xuất nên KHÔNG đụng tới lựa chọn dưới đây). XOÁ LUÔN vai trò đã ghi nhớ trên máy này
// (role.js: hoahoc_role) — trước đây đăng xuất xong vai trò vẫn giữ nguyên, trang chủ tiếp tục hiện
// đúng giao diện CŨ (VD vẫn giao diện giáo viên dù đã đăng xuất), không có cách quay lại màn "Bạn là
// ai?" để đổi sang đăng nhập vai trò KHÁC (VD học sinh) trên CÙNG 1 máy. Dùng ở CẢ 3 nút "Đăng xuất"
// trong app (trang chủ, khung đăng nhập giáo viên, khung đăng nhập học sinh) để sửa triệt để.
async function signOutAndResetRole() {
  try {
    await signOutTeacher();
  } finally {
    try { localStorage.removeItem('hoahoc_role'); } catch (e) { /* ignore */ }
  }
}

function onAuthChange(callback) {
  const { auth } = ensureFirebase();
  return auth.onAuthStateChanged(callback);
}

function getCurrentTeacher() {
  const { auth } = ensureFirebase();
  return auth.currentUser;
}

// Firebase khôi phục phiên đăng nhập KHÔNG đồng bộ — đọc auth.currentUser ngay khi trang vừa tải
// có thể trả về null dù người dùng thực ra đã đăng nhập. Gọi hàm này và chờ trước khi quyết định
// hiển thị nội dung theo vai trò.
function waitForAuthReady() {
  return new Promise((resolve) => {
    if (!isFirebaseConfigured()) { resolve(null); return; }
    try {
      const { auth } = ensureFirebase();
      const unsub = auth.onAuthStateChanged((user) => { unsub(); resolve(user); });
    } catch (e) { resolve(null); }
  });
}

// Tài khoản Google đang đăng nhập trên thiết bị này có ĐÚNG bằng uid truyền vào không — dùng để xác
// nhận phiên đăng nhập vẫn khớp trước khi cho ghi dữ liệu cần request.auth.uid == uid đó (VD mua gói
// Premium — xem js/features/upgrade.js — hoặc nộp bài kiểm tra — xem js/features/exam-taker.js).
async function isSignedInAs(uid) {
  const user = await waitForAuthReady();
  return !!(user && user.uid === uid);
}

// Tài khoản Google ĐANG đăng nhập trên thiết bị này có thực sự là giáo viên đang xem/sửa nội dung
// của CHÍNH HỌ hay không — không chỉ đơn thuần "có đăng nhập Google hay không". Lý do cần hàm riêng:
// bất kỳ ai cũng có thể đăng nhập Google (kể cả học sinh dùng tài khoản Google riêng của các em) —
// nếu thiết bị đã vào nhóm của 1 giáo viên khác (membership.teacherUid khác với uid đang đăng nhập),
// đó chắc chắn là học sinh, KHÔNG được xem là giáo viên dù đang đăng nhập Google thật.
async function resolveEffectiveTeacherUid() {
  const user = await waitForAuthReady();
  if (!user) return null;
  const membership = (typeof getMembership === 'function') ? getMembership() : null;
  if (membership && membership.teacherUid && membership.teacherUid !== user.uid) return null;
  return user.uid;
}

// Xác định nội dung biên soạn (bài giảng/câu hỏi tự thêm) đang xem là của giáo viên nào, và có
// được SỬA hay không:
// - Nếu đang đăng nhập ĐÚNG giáo viên (resolveEffectiveTeacherUid) VÀ vai trò hiện tại (xem
//   index.html) không phải "học sinh" -> chính họ, được sửa.
// - Nếu vai trò đang chọn là "học sinh" (kể cả khi trình duyệt này vẫn đang đăng nhập Google của
//   giáo viên — VD chính giáo viên bật thử giao diện học sinh để xem trước) -> KHÔNG được sửa.
//   Vai trò chỉ là lựa chọn giao diện (role.js), không phải đăng nhập thật, nhưng phải tôn trọng nó
//   ở đây để giáo viên xem thử vai trò học sinh thấy đúng trải nghiệm chỉ-xem như học sinh thật.
// - Nếu là học sinh đã vào nhóm -> LUÔN hiện nội dung của giáo viên nhóm đó (chỉ xem, không sửa),
//   kể cả khi thiết bị này đang đăng nhập Google bằng 1 tài khoản KHÁC (không phải giáo viên đó).
// - Ngoài ra (duyệt tự do, chưa vào nhóm, chưa đăng nhập) -> không có nội dung tự biên soạn nào để hiện.
async function resolveContentOwner() {
  const role = (typeof getRole === 'function') ? getRole() : null;
  const effectiveTeacherUid = await resolveEffectiveTeacherUid();
  if (effectiveTeacherUid && role !== 'student') return { uid: effectiveTeacherUid, isOwner: true };
  const membership = (typeof getMembership === 'function') ? getMembership() : null;
  if (membership && membership.teacherUid) return { uid: membership.teacherUid, isOwner: false };
  if (effectiveTeacherUid) return { uid: effectiveTeacherUid, isOwner: false };
  return { uid: null, isOwner: false };
}

// Đọc hồ sơ tuỳ chỉnh giáo viên tự lưu (tên hiển thị, đơn vị công tác, giới thiệu, ảnh đại diện
// riêng — xem trang "Hồ sơ giáo viên"). Trả về null nếu giáo viên chưa từng lưu gì thêm, khi đó
// nơi gọi nên dùng lại thông tin gốc từ tài khoản Google.
async function fetchTeacherProfile(uid) {
  const { db } = ensureFirebase();
  const snap = await db.collection('teachers').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

// Mã tài khoản CỐ ĐỊNH — tính thẳng từ uid (không random, không cần dò trùng qua Firestore, không
// có rủi ro 2 tài khoản đăng ký cùng lúc bị trùng mã như cách random+kiểm tra cũ): cùng 1 tài khoản
// luôn ra đúng 1 mã, vĩnh viễn không đổi. Vì uid Firebase vốn đã duy nhất tuyệt đối nên 2 tài khoản
// khác nhau gần như không thể ra trùng mã (không gian mã 32^6 ≈ 1 tỷ tổ hợp, đủ an toàn cho quy mô
// app này). Dùng CHUNG cho cả giáo viên (tiền tố "GV") và học sinh (tiền tố "HS") — xem
// deriveTeacherCode/deriveStudentCode bên dưới và enforceExclusiveRole() (lưu mã học sinh).
function deriveAccountCode(uid) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ ký tự dễ nhầm (0,O,1,I)
  let hash = 5381;
  for (let i = 0; i < uid.length; i++) hash = ((hash * 33) ^ uid.charCodeAt(i)) >>> 0;
  // Cắt 6 lát 5-bit KHÔNG chồng nhau từ hash 32-bit (bit 0-4, 5-9, ... 25-29) thay vì lặp lại phép
  // nhân/mod 32 nhiều vòng — vì 32 là luỹ thừa của 2, phép nhân/mod 32 lặp lại chỉ phụ thuộc 5 bit
  // thấp nhất của hash (bỏ phí gần hết 32 bit), khiến toàn bộ mã chỉ còn 32 khả năng thay vì ~1 tỷ.
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt((hash >>> (i * 5)) & 31);
  return code;
}

function deriveTeacherCode(uid) {
  return 'GV' + deriveAccountCode(uid);
}

function deriveStudentCode(uid) {
  return 'HS' + deriveAccountCode(uid);
}

async function ensureTeacherProfile(user) {
  const { db } = ensureFirebase();
  const ref = db.collection('teachers').doc(user.uid);
  const snap = await ref.get();
  const isNew = !snap.exists;

  // Gieo hồ sơ mặc định — CHỈ 1 LẦN DUY NHẤT lúc tài khoản "teachers" hoàn toàn chưa có doc nào, để
  // không đè mất tên/ảnh/khẩu hiệu giáo viên đã tự chỉnh sau này ở trang "Hồ sơ".
  if (isNew) {
    const teacherCode = deriveTeacherCode(user.uid);
    await Promise.all([
      ref.set({
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
        teacherCode, createdAt: new Date().toISOString()
      }),
      // Gieo sẵn bản công khai (không có email) bằng tên/ảnh Google — để trang chủ cá nhân hoá
      // được ngay từ lần đăng nhập đầu tiên, giáo viên có thể tự đổi sau ở trang "Hồ sơ".
      db.collection('teacherProfiles').doc(user.uid).set({
        displayName: user.displayName || '', photoURL: user.photoURL || '', bio: '', teacherCode,
        createdAt: new Date().toISOString()
      })
    ]);
  }

  // Gán người giới thiệu (referredBy/referredByUid) — thử ở MỌI LẦN ĐĂNG NHẬP có mã giới thiệu đang
  // lưu sẵn (từ link chia sẻ "?ref=MÃ" vừa mở, xem index.html), MIỄN LÀ tài khoản CHƯA từng có
  // referredByUid — không chỉ đúng 1 lần lúc "teachers" hoàn toàn chưa có doc như trước. Lý do: tách
  // riêng khỏi khối "gieo hồ sơ" ở trên để không mất cơ hội gán vĩnh viễn nếu lần đầu đó tra mã thất
  // bại (mất mạng), HOẶC tài khoản có doc "teachers" từ TRƯỚC (VD dùng công cụ "Đặt lại tài khoản" ở
  // trang quản trị — chỉ mở khoá vai trò, không xoá hồ sơ) khiến isNew=false dù thực chất đang đăng
  // nhập lại qua đúng link giới thiệu mới. referredByUid resolve KHÔNG được (mã sai/mạng lỗi) thì GIỮ
  // NGUYÊN hoahoc_referred_by trong localStorage để tự thử lại ở lần đăng nhập kế tiếp.
  const referredBy = localStorage.getItem('hoahoc_referred_by') || '';
  if (referredBy) {
    const alreadyHasReferrer = !isNew && !!snap.data().referredByUid;
    if (alreadyHasReferrer) {
      localStorage.removeItem('hoahoc_referred_by');
    } else {
      try {
        const referredByUid = typeof findTeacherUidByCode === 'function' ? await findTeacherUidByCode(referredBy) : null;
        if (referredByUid && referredByUid !== user.uid) {
          await Promise.all([
            ref.set({ referredBy, referredByUid }, { merge: true }),
            db.collection('teacherProfiles').doc(user.uid).set({ referredByUid }, { merge: true })
          ]);
          localStorage.removeItem('hoahoc_referred_by');
        }
        // referredByUid null (không tra được mã) hoặc == chính mình -> giữ nguyên localStorage, thử lại sau.
      } catch (e) { /* lỗi mạng -> giữ nguyên hoahoc_referred_by, thử lại lần đăng nhập sau */ }
    }
  }
}

// Gắn vào phần tử #teacherAuthGate: hiện nút đăng nhập nếu chưa đăng nhập, ẩn nội dung phía sau;
// hiện lại nội dung + tên giáo viên khi đã đăng nhập. Dùng ở đầu mỗi trang giáo viên.
function requireTeacherAuth(onReady) {
  if (!isFirebaseConfigured()) {
    $('main').innerHTML = `
      <div class="card">
        <p class="hint">⚠️ Chưa kết nối Firebase. <a href="ket-noi-dong-bo.html">Thiết lập kết nối đồng bộ</a> trước.</p>
      </div>
    `;
    return;
  }
  const gate = document.createElement('div');
  gate.id = 'teacherAuthGate';
  gate.className = 'card';
  document.querySelector('main').prepend(gate);

  const mainChildren = Array.from(document.querySelector('main').children).filter((el) => el !== gate);

  function renderSignedOut() {
    mainChildren.forEach((el) => { el.style.display = 'none'; });
    gate.innerHTML = `
      <h2><span class="icon">🔐</span>Đăng nhập giáo viên</h2>
      <p class="hint">Cần đăng nhập bằng tài khoản Google để dùng tính năng này.</p>
      <button class="btn primary block" id="teacherSignInBtn">Đăng nhập bằng Google</button>
      <div class="result-box" id="teacherAuthResult"></div>
    `;
    const lastErr = getLastRedirectError();
    if (lastErr) {
      showResult($('#teacherAuthResult'), `⚠️ Đăng nhập thất bại: ${escapeHtml(lastErr.message)}${lastErr.code ? ' (mã lỗi: ' + escapeHtml(lastErr.code) + ')' : ''}`, true);
    }
    $('#teacherSignInBtn').addEventListener('click', async () => {
      const box = $('#teacherAuthResult');
      showResult(box, '⏳ Đang chuyển sang trang đăng nhập Google...');
      try {
        await signInWithGoogle();
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
  }

  async function renderSignedIn(user) {
    mainChildren.forEach((el) => { el.style.display = ''; });
    const profile = await fetchTeacherProfile(user.uid).catch(() => null);
    const displayName = (profile && profile.displayName) || user.displayName || user.email || 'Giáo viên';
    const photoURL = (profile && profile.photoURL) || user.photoURL || '';
    // Tên/email + 2 nút Hồ sơ/Đăng xuất tách làm 2 HÀNG (trước gộp chung 1 hàng) — email dài (phổ
    // biến với Gmail) cộng thêm 2 nút chữ trên cùng 1 dòng dễ tràn ra ngoài màn hình, nhất là trên
    // điện thoại. Hàng dưới đặt 2 nút để riêng, không chung với tên/email nữa.
    gate.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        ${photoURL ? `<img src="${photoURL}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer" />` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(displayName)}</div>
          <div class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(user.email || '')}</div>
        </div>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <a class="btn" href="ho-so.html" style="flex:1;">✏️ Hồ sơ</a>
        <button class="btn" id="teacherSignOutBtn" style="flex:1;">Đăng xuất</button>
      </div>
    `;
    $('#teacherSignOutBtn').addEventListener('click', () => signOutAndResetRole());
  }

  (async () => {
    try {
      // Chờ xử lý xong kết quả chuyển hướng (và lỗi, nếu có) TRƯỚC khi vẽ giao diện lần đầu —
      // nếu không đợi, màn hình "chưa đăng nhập" có thể vẽ ra trước khi lỗi kịp ghi nhận.
      await checkRedirectResult();
      // Kiểm tra vai trò ở ĐÂY nữa (không chỉ trong signInWithGoogle/checkRedirectResult) vì Firebase
      // Auth tự khôi phục phiên đăng nhập CŨ (đã đăng nhập từ trước, không qua nút bấm lần này) —
      // trường hợp đó không đi qua 2 hàm trên nên nếu không kiểm tra lại ở đây, 1 tài khoản đã khoá
      // vai trò học sinh vẫn lọt được vào thẳng giao diện giáo viên chỉ bằng cách mở đúng trang.
      onAuthChange(async (user) => {
        if (!user) { renderSignedOut(); return; }
        try {
          await enforceExclusiveRole(user, 'teacher');
          renderSignedIn(user);
          if (onReady) onReady(user);
        } catch (e) {
          _lastRedirectError = e;
          try { await signOutTeacher(); } catch (e2) { /* ignore */ } // kích onAuthChange chạy lại với user=null -> renderSignedOut() tự hiện lỗi
        }
      });
    } catch (e) {
      gate.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  })();
}

// Gắn vào phần tử #studentAuthGate: y hệt requireTeacherAuth nhưng dành cho học sinh — dùng CHUNG 1
// hệ đăng nhập Google (không có hệ tài khoản riêng), KHÔNG tự tạo hồ sơ giáo viên (asStudent=true).
// Mục đích DUY NHẤT của việc bắt đăng nhập: có 1 uid ổn định gắn với nhóm/tiến độ học/gói đã mua
// của học sinh, không mất khi đổi điện thoại/máy tính (khác trước đây dùng deviceId ngẫu nhiên lưu
// trong localStorage — mất theo trình duyệt). Dùng ở đầu các trang học sinh (vao-nhom, kiem-tra,
// hoc-theo-chuong, nang-cap — xem js/features/join-group.js: initJoinGroupPage()).
function requireStudentAuth(onReady) {
  if (!isFirebaseConfigured()) {
    $('main').innerHTML = `
      <div class="card">
        <p class="hint">⚠️ Chưa kết nối Firebase. Liên hệ giáo viên để được hướng dẫn.</p>
      </div>
    `;
    return;
  }

  // Giáo viên đang "xem thử với vai trò học sinh" (index.html: previewAsStudentBtn) — trang này đòi
  // hỏi 1 tài khoản HỌC SINH THẬT (enforceExclusiveRole bên dưới sẽ từ chối tài khoản giáo viên đang
  // xem thử vì đã khoá cứng vai trò 'teacher', rồi ĐĂNG XUẤT để ép đăng nhập lại bằng tài khoản khác
  // — rất khó hiểu và không cần thiết chỉ để xem thử). Chặn sớm ở đây, không chạy qua bước xác thực
  // thật: đây là 1 HÀNH ĐỘNG thật (vào nhóm/nộp bài), không phải nội dung để xem, nên không mô phỏng
  // được — chỉ báo rõ lý do thay vì âm thầm đăng xuất.
  if (typeof isTeacherPreviewingAsStudent === 'function' && isTeacherPreviewingAsStudent()) {
    $('main').innerHTML = `
      <div class="card">
        <p class="hint">👁️ Bạn đang ở chế độ xem thử với vai trò học sinh. Đây là 1 hành động thật (không phải nội dung để xem), cần tài khoản học sinh thật để thực hiện — không mô phỏng được.</p>
        <a class="btn primary block" href="../index.html">Quay lại trang chủ</a>
      </div>
    `;
    return;
  }
  const gate = document.createElement('div');
  gate.id = 'studentAuthGate';
  gate.className = 'card';
  document.querySelector('main').prepend(gate);

  const mainChildren = Array.from(document.querySelector('main').children).filter((el) => el !== gate);

  // Bấm "Đăng nhập" CHỈ mở ra 2 lựa chọn (🔐 Google — học sinh tự có tài khoản; 🔑 Mã học sinh —
  // tài khoản do giáo viên cấp khi nạp cả danh sách lớp, xem teacher-student-accounts.js), KHÔNG tự
  // chọn thay — 2 nhóm học sinh hoàn toàn khác nhau nên không thể đoán trước ai dùng cách nào.
  function renderSignedOut() {
    mainChildren.forEach((el) => { el.style.display = 'none'; });
    gate.innerHTML = `
      <h2><span class="icon">🔐</span>Đăng nhập</h2>
      <p class="hint">Cần đăng nhập để vào nhóm học tập — nhóm, tiến độ học và gói đã mua sẽ gắn với tài khoản này, không mất khi đổi điện thoại/máy tính.</p>
      <button class="btn primary block" id="studentAuthChooserBtn" type="button">Đăng nhập</button>
      <div id="studentAuthChoices" style="display:none;margin-top:10px;">
        <button class="btn block" id="studentSignInBtn" type="button">🔐 Đăng nhập bằng Google</button>
        <button class="btn block" id="studentCodeToggleBtn" type="button" style="margin-top:8px;">🔑 Đăng nhập bằng mã học sinh</button>
        <div id="studentCodeLoginForm" style="display:none;margin-top:10px;text-align:left;">
          <div class="field">
            <label for="studentLoginCodeInput">Mã học sinh</label>
            <input type="text" id="studentLoginCodeInput" placeholder="VD: ABC123.07" style="text-transform:uppercase;letter-spacing:0.03em;" />
          </div>
          <div class="field">
            <label for="studentLoginPasswordInput">Mật khẩu</label>
            <input type="password" id="studentLoginPasswordInput" />
          </div>
          <button class="btn primary block" id="studentCodeSignInBtn" type="button">Đăng nhập</button>
        </div>
      </div>
      <div class="result-box" id="studentAuthResult"></div>
    `;
    const lastErr = getLastRedirectError();
    if (lastErr) {
      showResult($('#studentAuthResult'), `⚠️ Đăng nhập thất bại: ${escapeHtml(lastErr.message)}${lastErr.code ? ' (mã lỗi: ' + escapeHtml(lastErr.code) + ')' : ''}`, true);
    }

    $('#studentAuthChooserBtn').addEventListener('click', () => {
      const choices = $('#studentAuthChoices');
      choices.style.display = choices.style.display === 'none' ? 'block' : 'none';
    });

    $('#studentSignInBtn').addEventListener('click', async () => {
      const box = $('#studentAuthResult');
      showResult(box, '⏳ Đang chuyển sang trang đăng nhập Google...');
      try {
        await signInWithGoogle(true);
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    $('#studentCodeToggleBtn').addEventListener('click', () => {
      const form = $('#studentCodeLoginForm');
      const opening = form.style.display === 'none';
      form.style.display = opening ? 'block' : 'none';
      // Gợi ý sẵn mã học sinh đã dùng lần trước trên máy này — đỡ phải gõ lại mỗi lần, chỉ cần gõ
      // mật khẩu (xem teacher-student-accounts.js: KHÔNG lưu mật khẩu, chỉ lưu mã).
      if (opening) {
        const saved = localStorage.getItem('hoahoc_last_student_login_code');
        if (saved) $('#studentLoginCodeInput').value = saved;
      }
    });

    $('#studentCodeSignInBtn').addEventListener('click', async () => {
      const code = normalizeLoginCode($('#studentLoginCodeInput').value);
      const password = $('#studentLoginPasswordInput').value;
      const box = $('#studentAuthResult');
      if (!code || !password) { showResult(box, 'Nhập đủ mã học sinh và mật khẩu.', true); return; }
      showResult(box, '⏳ Đang đăng nhập...');
      try {
        await signInWithStudentCode(code, password);
        localStorage.setItem('hoahoc_last_student_login_code', code);
      } catch (e) {
        const friendly = ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e.code)
          ? 'Sai mã học sinh hoặc mật khẩu.'
          : e.message;
        showResult(box, `⚠️ ${escapeHtml(friendly)}`, true);
      }
    });
  }

  function renderSignedIn(user) {
    mainChildren.forEach((el) => { el.style.display = ''; });
    gate.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        ${user.photoURL ? `<img src="${user.photoURL}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer" />` : ''}
        <div style="flex:1;">
          <div class="hint">Đang đăng nhập: <strong>${escapeHtml(user.displayName || user.email || '')}</strong></div>
        </div>
        <button class="btn" id="studentSignOutBtn">Đăng xuất</button>
      </div>
    `;
    $('#studentSignOutBtn').addEventListener('click', () => signOutAndResetRole());
  }

  (async () => {
    try {
      await checkRedirectResult(true);
      // Xem chú thích tương ứng trong requireTeacherAuth — phiên đăng nhập cũ tự khôi phục không đi
      // qua signInWithGoogle/checkRedirectResult nên cần kiểm tra lại vai trò ở đây.
      onAuthChange(async (user) => {
        if (!user) { renderSignedOut(); return; }
        try {
          await enforceExclusiveRole(user, 'student');
          renderSignedIn(user);
          if (onReady) onReady(user);
        } catch (e) {
          _lastRedirectError = e;
          try { await signOutTeacher(); } catch (e2) { /* ignore */ }
        }
      });
    } catch (e) {
      gate.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  })();
}
