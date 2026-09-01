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

// Xác định nội dung biên soạn (bài giảng/câu hỏi tự thêm) đang xem là của giáo viên nào:
// - Nếu đang đăng nhập giáo viên -> chính họ (và được sửa).
// - Nếu là học sinh đã vào nhóm -> giáo viên của nhóm đó (chỉ xem, không sửa).
// - Ngoài ra (duyệt tự do, chưa vào nhóm) -> không có nội dung tự biên soạn nào để hiện.
async function resolveContentOwner() {
  const user = await waitForAuthReady();
  if (user) return { uid: user.uid, isOwner: true };
  const membership = (typeof getMembership === 'function') ? getMembership() : null;
  if (membership && membership.teacherUid) return { uid: membership.teacherUid, isOwner: false };
  return { uid: null, isOwner: false };
}

async function ensureTeacherProfile(user) {
  const { db } = ensureFirebase();
  const ref = db.collection('teachers').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      createdAt: new Date().toISOString()
    });
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

  function renderSignedIn(user) {
    mainChildren.forEach((el) => { el.style.display = ''; });
    gate.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        ${user.photoURL ? `<img src="${user.photoURL}" alt="" style="width:36px;height:36px;border-radius:50%;" referrerpolicy="no-referrer" />` : ''}
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${escapeHtml(user.displayName || user.email || 'Giáo viên')}</div>
          <div class="hint">${escapeHtml(user.email || '')}</div>
        </div>
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
