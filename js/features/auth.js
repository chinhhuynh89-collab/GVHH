// Đăng nhập giáo viên bằng tài khoản Google (Firebase Authentication).
// Học sinh KHÔNG cần đăng nhập — vẫn dùng tên + mã nhóm như trước.

// Ưu tiên signInWithPopup: không cần rời trang nên không phụ thuộc trình duyệt lưu đúng trạng thái
// "đang chờ đăng nhập" qua vòng chuyển trang đi-về — vòng này rất dễ bị các trình duyệt hiện đại
// chặn cookie/storage bên thứ 3 làm mất, khiến signInWithRedirect quay về im lặng, không báo lỗi gì.
// Chỉ khi popup bị chặn (thường gặp khi app được cài như PWA trên điện thoại) mới rơi về
// signInWithRedirect như phương án dự phòng.
async function signInWithGoogle() {
  const { auth } = ensureFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    if (result && result.user) {
      _lastRedirectError = null;
      await ensureTeacherProfile(result.user);
    }
    return result;
  } catch (e) {
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

async function checkRedirectResult() {
  if (!isFirebaseConfigured()) return null;
  try {
    const { auth } = ensureFirebase();
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      _lastRedirectError = null;
      await ensureTeacherProfile(result.user);
      return result.user;
    }
  } catch (e) {
    console.warn('Lỗi đăng nhập:', e.code, e.message);
    _lastRedirectError = e;
  }
  return null;
}

function signOutTeacher() {
  const { auth } = ensureFirebase();
  return auth.signOut();
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

// Mã giáo viên CỐ ĐỊNH — tính thẳng từ uid tài khoản (không random, không cần dò trùng qua
// Firestore, không có rủi ro 2 giáo viên đăng nhập cùng lúc bị trùng mã như cách random+kiểm tra cũ):
// cùng 1 tài khoản luôn ra đúng 1 mã, vĩnh viễn không đổi. Vì uid Firebase vốn đã duy nhất tuyệt đối
// nên 2 tài khoản khác nhau gần như không thể ra trùng mã (không gian mã 32^6 ≈ 1 tỷ tổ hợp, đủ an
// toàn cho quy mô số giáo viên dùng app này).
function deriveTeacherCode(uid) {
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

async function ensureTeacherProfile(user) {
  const { db } = ensureFirebase();
  const ref = db.collection('teachers').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const teacherCode = deriveTeacherCode(user.uid);
    // Đăng nhập lần đầu qua link chia sẻ "?ref=MÃ" của giáo viên khác (xem index.html) — lưu lại
    // riêng tư (chỉ chính chủ đọc được) để dùng cho mục đích kinh doanh/giới thiệu sau này.
    const referredBy = localStorage.getItem('hoahoc_referred_by') || '';
    await Promise.all([
      ref.set(Object.assign({
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        teacherCode,
        createdAt: new Date().toISOString()
      }, referredBy ? { referredBy } : {})),
      // Gieo sẵn bản công khai (không có email) bằng tên/ảnh Google — để trang chủ cá nhân hoá
      // được ngay từ lần đăng nhập đầu tiên, giáo viên có thể tự đổi sau ở trang "Hồ sơ".
      db.collection('teacherProfiles').doc(user.uid).set({
        displayName: user.displayName || '', photoURL: user.photoURL || '', bio: '', teacherCode,
        createdAt: new Date().toISOString()
      })
    ]);
    if (referredBy) localStorage.removeItem('hoahoc_referred_by');
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
    gate.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        ${photoURL ? `<img src="${photoURL}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer" />` : ''}
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${escapeHtml(displayName)}</div>
          <div class="hint">${escapeHtml(user.email || '')}</div>
        </div>
        <a class="btn" href="ho-so.html">✏️ Hồ sơ</a>
        <button class="btn" id="teacherSignOutBtn">Đăng xuất</button>
      </div>
    `;
    $('#teacherSignOutBtn').addEventListener('click', () => signOutTeacher());
  }

  (async () => {
    try {
      // Chờ xử lý xong kết quả chuyển hướng (và lỗi, nếu có) TRƯỚC khi vẽ giao diện lần đầu —
      // nếu không đợi, màn hình "chưa đăng nhập" có thể vẽ ra trước khi lỗi kịp ghi nhận.
      await checkRedirectResult();
      onAuthChange((user) => {
        if (user) { renderSignedIn(user); if (onReady) onReady(user); }
        else renderSignedOut();
      });
    } catch (e) {
      gate.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  })();
}
