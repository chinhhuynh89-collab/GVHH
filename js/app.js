// Tiện ích dùng chung cho toàn bộ app + đăng ký service worker (offline).

// Trước đây bản cập nhật mới chỉ được ÁP DỤNG khi trình duyệt tự ý kiểm tra lại service worker
// (thường chỉ xảy ra khi mở lại app sau khi đã đóng hẳn) — vì vậy người tự tay xoá cache (VD tác
// giả app) thấy bản mới ngay, còn giáo viên/học sinh khác cứ để app mở/chạy nền thì rất lâu mới
// nhận được, có khi vài ngày. 2 việc dưới đây khắc phục: (1) CHỦ ĐỘNG hỏi trình duyệt kiểm tra bản
// mới định kỳ + mỗi khi quay lại tab thay vì bị động chờ; (2) khi bản mới đã giành quyền kiểm soát
// trang (service-worker.js đã gọi sẵn skipWaiting + clients.claim), báo ngay cho người dùng biết
// bằng 1 banner để họ tự bấm tải lại — không cần biết cách xoá cache thủ công nữa.
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const base = window.APP_BASE_PATH || './';
    navigator.serviceWorker
      .register(base + 'service-worker.js')
      .then((reg) => {
        const checkForUpdate = () => reg.update().catch(() => { /* offline — bỏ qua, thử lại lần sau */ });
        setInterval(checkForUpdate, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
      })
      .catch((err) => console.warn('Không đăng ký được service worker:', err));

    // Bản mới đã giành quyền kiểm soát trang — TỰ tải lại ngay (không cần người dùng biết mà bấm),
    // trừ khi họ đang gõ dở gì đó (1 ô nhập/textarea đang focus VÀ có nội dung) thì chỉ hiện banner
    // để họ tự chọn lúc tải lại, tránh mất nội dung đang soạn (VD tạo đề kiểm tra, viết bài giảng).
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      const active = document.activeElement;
      const isTyping = active && /^(TEXTAREA|INPUT)$/.test(active.tagName) && active.type !== 'checkbox' && active.type !== 'radio' && active.value;
      if (isTyping) { showUpdateAvailableBanner(); return; }
      refreshed = true;
      window.location.reload();
    });
  });
})();

// Trình duyệt (đặc biệt Chrome trên điện thoại) có thể phục hồi trang từ "bfcache" (back/forward
// cache) khi bấm nút back/forward hoặc vuốt lùi — toàn bộ DOM + trạng thái JS được ĐÓNG BĂNG rồi trả
// lại Y NGUYÊN, KHÔNG chạy lại bất kỳ đoạn script nào, kể cả các bước kiểm tra đăng nhập/vai trò lúc
// tải trang. Nếu trang này từng được tải lúc CÒN đăng nhập/CÒN vai trò khác, rồi ở tab/phiên khác đã
// đăng xuất/đổi vai trò, vuốt lùi quay lại trang sẽ thấy Y HỆT giao diện/nội dung CŨ (VD vẫn thấy
// đúng chương trình học của tài khoản đã đăng xuất) — lỗi thực tế đã gặp. Buộc tải lại thật mỗi khi
// phát hiện trang vừa được phục hồi kiểu này, để mọi kiểm tra đăng nhập/vai trò chạy lại đúng với
// trạng thái mới nhất thay vì hiện lại ảnh chụp cũ.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

// "Heartbeat" cho trạng thái online/offline của học sinh (xem getPresenceForStudentUids trong
// groups-data.js) — app này chỉ dùng Firestore (không dùng Firebase Realtime Database) nên không có
// cách nào báo ngay lúc đóng tab/mất mạng; thay vào đó cứ còn mở app (bất kỳ trang nào, app.js nạp ở
// mọi trang) thì định kỳ ghi lại "lần cuối còn thấy" — đóng tab thì tự nhiên hết ghi tiếp, quá 90
// giây không ghi thêm thì phía giáo viên tự coi là OFFLINE (xem PRESENCE_ONLINE_WINDOW_MS).
// Đặt trong window.onload (không chạy ngay khi file này tải) vì app.js nạp ở ĐẦU trang, trước cả
// firebase-init.js/auth.js/role.js — các hàm waitForAuthReady/getRole/ensureFirebase chưa tồn tại
// nếu gọi ngay tại đây; chờ tới lúc "load" thì mọi script khác của trang đã chạy xong.
// CHỈ ghi cho vai trò học sinh (getRole() === 'student') — giáo viên không cần theo dõi chính họ.
window.addEventListener('load', () => {
  if (typeof waitForAuthReady !== 'function' || typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) return;
  (async () => {
    const user = await waitForAuthReady();
    if (!user) return;
    if (typeof getRole === 'function' && getRole() !== 'student') return;
    let db;
    try { ({ db } = ensureFirebase()); } catch (e) { return; }
    const writeHeartbeat = () => {
      db.collection('presence').doc(user.uid).set({ lastSeenAt: new Date().toISOString() }).catch(() => {});
    };
    writeHeartbeat();
    setInterval(writeHeartbeat, 40000);
  })();
});

function showUpdateAvailableBanner() {
  if (document.getElementById('updateAvailableBanner')) return;
  const el = document.createElement('div');
  el.id = 'updateAvailableBanner';
  el.innerHTML = `
    <div>🔄 <strong>Đã có bản cập nhật mới!</strong> Tải lại để dùng phiên bản mới nhất.</div>
    <button class="btn primary" id="updateAvailableReloadBtn" type="button">Tải lại ngay</button>
  `;
  document.body.appendChild(el);
  document.getElementById('updateAvailableReloadBtn').addEventListener('click', () => window.location.reload());
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showResult(box, html, isError = false) {
  box.innerHTML = html;
  box.classList.add('show');
  box.classList.toggle('error', isError);
}

function hideResult(box) {
  box.classList.remove('show');
  box.classList.remove('error');
}

// Thông báo nổi ngắn gọn, THAY CHO alert() của trình duyệt — alert() chặn cả trang, hiện kèm tên miền
// ("...github.io cho biết") trông không chuyên nghiệp, nhất là trên điện thoại. Dùng ở mọi nơi chỉ cần
// báo 1 lỗi/kết quả ngắn (VD "Không xoá được: ...") mà KHÔNG có sẵn 1 khung .result-box gần đó (VD nút
// trong từng dòng của 1 danh sách) — nơi nào đã có sẵn khung result-box riêng thì vẫn nên dùng
// showResult() ở trên, gắn liền đúng vị trí thao tác, dễ theo dõi hơn là 1 thông báo nổi chung chung.
function showToast(message, isError = true) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = (isError ? '⚠️ ' : '✓ ') + message;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Định dạng số: bỏ số 0 thừa, giới hạn số chữ số thập phân
function formatNumber(n, maxDecimals = 6) {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs < 1e-12) return '0';
  if (abs >= 1e6 || abs < 1e-4) {
    return n.toExponential(4);
  }
  return parseFloat(n.toFixed(maxDecimals)).toString();
}

const _escapeHtmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => _escapeHtmlMap[c]);
}

// Dựng link trang chủ kèm query param chia sẻ (tc = mã giáo viên, để tự nhận diện thương hiệu +
// khoá mã khi đăng ký; ref = mã giới thiệu cho giáo viên khác) — dùng URL tương đối để ra đúng
// domain/đường dẫn app đang deploy (kể cả khi deploy dưới 1 thư mục con như GitHub Pages).
function buildShareUrl(params) {
  const url = new URL((window.APP_BASE_PATH || './') + 'index.html', window.location.href);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  return url.href;
}

// Chia sẻ 1 liên kết: dùng bảng chia sẻ gốc của điện thoại (Web Share API) nếu trình duyệt hỗ trợ;
// nếu không (đa số trình duyệt máy tính) thì copy link vào clipboard và báo cho người dùng biết.
async function shareOrCopyLink(title, text, url, resultBox) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // người dùng tự đóng bảng chia sẻ — không phải lỗi
      // các lỗi khác thì rơi xuống copy bên dưới
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    if (resultBox) showResult(resultBox, `✓ Đã copy link vào bộ nhớ tạm: ${escapeHtml(url)}`);
  } catch (e) {
    if (resultBox) showResult(resultBox, `Link: ${escapeHtml(url)}`);
  }
}

function initTabs(root) {
  const tabBtns = $$('.tab-btn', root);
  const panels = $$('.tab-panel', root);
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const target = $('#' + btn.dataset.tab, root);
      if (target) target.classList.add('active');
    });
  });
}

// Nút tăng/giảm cỡ chữ nổi ở góc màn hình — áp dụng cho toàn bộ app qua biến CSS --font-scale,
// lưu lựa chọn của người dùng vào localStorage nên giữ nguyên khi chuyển trang/mở lại app.
(function () {
  const FONT_SCALE_KEY = 'hoahoc_font_scale';
  const MIN_SCALE = 0.85, MAX_SCALE = 1.6, STEP = 0.1;

  function getFontScale() {
    const v = parseFloat(localStorage.getItem(FONT_SCALE_KEY));
    return isFinite(v) && v >= MIN_SCALE && v <= MAX_SCALE ? v : 1;
  }

  function applyFontScale(v) {
    document.documentElement.style.setProperty('--font-scale', v);
    const label = document.getElementById('fontSizeLabel');
    if (label) label.textContent = Math.round(v * 100) + '%';
  }

  function setFontScale(v) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 100) / 100));
    localStorage.setItem(FONT_SCALE_KEY, clamped);
    applyFontScale(clamped);
  }

  applyFontScale(getFontScale());

  function initFontSizeControl() {
    if (document.getElementById('fontSizeControl')) return;
    const wrap = document.createElement('div');
    wrap.id = 'fontSizeControl';
    wrap.innerHTML = `
      <button id="fontSizeDown" title="Chữ nhỏ hơn" aria-label="Chữ nhỏ hơn">A-</button>
      <span id="fontSizeLabel">${Math.round(getFontScale() * 100)}%</span>
      <button id="fontSizeUp" title="Chữ lớn hơn" aria-label="Chữ lớn hơn">A+</button>
    `;
    document.body.appendChild(wrap);
    document.getElementById('fontSizeDown').addEventListener('click', () => setFontScale(getFontScale() - STEP));
    document.getElementById('fontSizeUp').addEventListener('click', () => setFontScale(getFontScale() + STEP));
  }

  if (document.body) initFontSizeControl();
  else window.addEventListener('DOMContentLoaded', initFontSizeControl);
})();

// Cảnh báo khi mở app trong "trình duyệt trong ứng dụng" (Zalo, Messenger, Facebook...) — Google
// chủ động chặn đăng nhập Google trong các trình duyệt nhúng này (lý do bảo mật, không phải lỗi
// của app), khiến bước đăng nhập treo trắng không rõ nguyên nhân. Nhắc trước để giáo viên mở bằng
// trình duyệt thật (Chrome/Safari) ngay từ đầu, tránh mất công đoán lỗi.
(function () {
  const ua = navigator.userAgent || '';
  const isInAppBrowser = /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok/i.test(ua);
  if (!isInAppBrowser) return;

  function showWarning() {
    if (document.getElementById('inAppBrowserWarning')) return;
    const el = document.createElement('div');
    el.id = 'inAppBrowserWarning';
    el.innerHTML = `
      <div>
        <strong>⚠️ Bạn đang mở bằng trình duyệt trong ứng dụng khác</strong> (Zalo/Messenger/Facebook...).
        Đăng nhập Google sẽ không hoạt động ở đây. Bấm nút <strong>"⋯"</strong> góc màn hình →
        <strong>"Mở bằng trình duyệt"</strong> (Chrome/Safari) để dùng đầy đủ tính năng.
      </div>
      <button id="inAppBrowserWarningClose" aria-label="Đóng">✕</button>
    `;
    document.body.appendChild(el);
    document.getElementById('inAppBrowserWarningClose').addEventListener('click', () => el.remove());
  }

  if (document.body) showWarning();
  else window.addEventListener('DOMContentLoaded', showWarning);
})();
