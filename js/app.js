// Tiện ích dùng chung cho toàn bộ app + đăng ký service worker (offline).

(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const base = window.APP_BASE_PATH || './';
      navigator.serviceWorker
        .register(base + 'service-worker.js')
        .catch((err) => console.warn('Không đăng ký được service worker:', err));
    });
  }
})();

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
