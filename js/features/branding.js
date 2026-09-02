// Cá nhân hoá trang chủ theo giáo viên: tên hiển thị + khẩu hiệu (đặt ở trang "Hồ sơ") + ảnh đại
// diện — giúp giáo viên xây dựng thương hiệu riêng. Học sinh trong nhóm của giáo viên đó sẽ thấy
// đúng những gì giáo viên đã thiết đặt; giáo viên xem trang chủ của chính mình cũng thấy y hệt.
// Khách vãng lai (chưa chọn vai trò, chưa đăng nhập/chưa vào nhóm) không xác định được là của
// giáo viên nào nên giữ nguyên thương hiệu mặc định của app — không đổi gì.

(async function () {
  if (!isFirebaseConfigured()) return;

  let teacherUid = null;
  try {
    const teacher = await waitForAuthReady();
    if (teacher) teacherUid = teacher.uid;
  } catch (e) { /* ignore */ }
  if (!teacherUid) {
    const membership = typeof getMembership === 'function' ? getMembership() : null;
    if (membership && membership.teacherUid) teacherUid = membership.teacherUid;
  }
  if (!teacherUid) return;

  let profile = null;
  try {
    const { db } = ensureFirebase();
    const snap = await db.collection('teacherProfiles').doc(teacherUid).get();
    if (snap.exists) profile = snap.data();
  } catch (e) { return; }
  if (!profile || !profile.displayName) return;

  const title = `Học cùng ${profile.displayName}`;
  const heroTitle = document.getElementById('heroTitle');
  const topTitle = document.getElementById('topHeaderTitle');
  if (heroTitle) heroTitle.textContent = title;
  if (topTitle) topTitle.textContent = title;
  document.title = title;

  if (profile.bio) {
    const heroSub = document.getElementById('heroSubtitle');
    if (heroSub) heroSub.textContent = profile.bio;
  }

  if (profile.photoURL) {
    const topAvatar = document.getElementById('topHeaderAvatar');
    if (topAvatar) {
      topAvatar.src = profile.photoURL;
      topAvatar.style.display = 'block';
    }
    const logoMark = document.getElementById('heroLogoMark');
    if (logoMark) {
      logoMark.innerHTML = `<img src="${escapeHtml(profile.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:18px;" referrerpolicy="no-referrer" />`;
    }
  }

  renderContactButton(profile);
})();

// Chuẩn hoá 1 giá trị người dùng nhập thành URL đầy đủ (tự thêm https:// nếu thiếu).
function normalizeContactUrl(v) {
  const trimmed = (v || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Link Zalo: nếu giáo viên nhập số điện thoại thì tự tạo link zalo.me/{số}; nếu đã nhập link thì giữ nguyên.
function normalizeZaloUrl(v) {
  const trimmed = (v || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^0-9]/g, '');
  return digits ? `https://zalo.me/${digits}` : normalizeContactUrl(trimmed);
}

function renderContactButton(profile) {
  const wrap = document.getElementById('contactTeacherWrap');
  if (!wrap) return;
  const phone = (profile.phone || '').trim();
  const zalo = normalizeZaloUrl(profile.zaloLink);
  const fb = normalizeContactUrl(profile.facebookLink);
  if (!phone && !zalo && !fb) return;

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <button class="btn" id="contactToggleBtn" type="button">📞 Liên hệ với thầy (cô)</button>
    <div class="btn-row" id="contactOptions" style="display:none;margin-top:10px;justify-content:center;flex-wrap:wrap;">
      ${phone ? `<a class="btn primary" href="tel:${escapeHtml(phone)}">📞 Gọi điện</a>` : ''}
      ${zalo ? `<a class="btn primary" href="${escapeHtml(zalo)}" target="_blank" rel="noopener">💬 Nhắn Zalo</a>` : ''}
      ${fb ? `<a class="btn primary" href="${escapeHtml(fb)}" target="_blank" rel="noopener">📘 Nhắn Facebook</a>` : ''}
    </div>
  `;
  const toggleBtn = document.getElementById('contactToggleBtn');
  const options = document.getElementById('contactOptions');
  toggleBtn.addEventListener('click', () => {
    options.style.display = options.style.display === 'none' ? 'flex' : 'none';
  });
}
