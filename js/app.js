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
