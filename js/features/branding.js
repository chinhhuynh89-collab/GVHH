// Cá nhân hoá trang chủ theo giáo viên: tên hiển thị + khẩu hiệu (đặt ở trang "Hồ sơ") + ảnh đại
// diện — giúp giáo viên xây dựng thương hiệu riêng. Học sinh trong nhóm của giáo viên đó sẽ thấy
// đúng những gì giáo viên đã thiết đặt; giáo viên xem trang chủ của chính mình cũng thấy y hệt.
// Khách vãng lai (chưa chọn vai trò, chưa đăng nhập/chưa vào nhóm, chưa mở qua link chia sẻ) không
// xác định được là của giáo viên nào nên giữ nguyên thương hiệu mặc định của app — không đổi gì.

(async function () {
  if (!isFirebaseConfigured()) return;

  let teacherUid = null;
  let isOwnTeacher = false; // true nếu người xem CHÍNH LÀ giáo viên đang đăng nhập (xem trang của mình)
  try {
    // resolveEffectiveTeacherUid (auth.js) tự trả về null nếu thiết bị đã vào nhóm của 1 giáo viên
    // KHÁC với tài khoản Google đang đăng nhập — tránh học sinh có tài khoản Google riêng bị hiểu
    // nhầm thành "chính giáo viên", che mất thương hiệu/nút liên hệ thật của giáo viên nhóm đó.
    const effectiveUid = await resolveEffectiveTeacherUid();
    if (effectiveUid) { teacherUid = effectiveUid; isOwnTeacher = true; }
  } catch (e) { /* ignore */ }
  if (!teacherUid) {
    const membership = typeof getMembership === 'function' ? getMembership() : null;
    if (membership && membership.teacherUid) teacherUid = membership.teacherUid;
  }
  if (!teacherUid) {
    // Mở qua link chia sẻ "?tc=MÃ" (xem index.html) — chưa vào nhóm nhưng đã biết mã giáo viên.
    const sharedCode = localStorage.getItem('hoahoc_shared_teacher_code');
    if (sharedCode) {
      try {
        const { db } = ensureFirebase();
        const snap = await db.collection('teacherProfiles').where('teacherCode', '==', sharedCode).limit(1).get();
        if (!snap.empty) teacherUid = snap.docs[0].id;
      } catch (e) { /* ignore */ }
    }
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
    // 1 ảnh đại diện duy nhất, tròn kiểu Facebook, đặt ngay vị trí biểu tượng mặc định của app —
    // bấm vào xem toàn màn hình (xem openImageLightbox bên dưới).
    const logoMark = document.getElementById('heroLogoMark');
    if (logoMark) {
      logoMark.classList.add('has-photo');
      logoMark.innerHTML = `<img src="${escapeHtml(profile.photoURL)}" alt="" referrerpolicy="no-referrer" />`;
      logoMark.addEventListener('click', () => openImageLightbox(profile.photoURL));
    }
  }

  const honorific = getHonorific(profile);
  const registerBtn = document.getElementById('registerToggleBtn');
  if (registerBtn) registerBtn.textContent = `📝 Đăng ký học cùng ${honorific}`;

  // Nút "Liên hệ" chỉ dành cho học sinh liên hệ giáo viên — ẩn khi chính giáo viên đang xem trang
  // của mình (không cần nút gọi/nhắn cho chính mình).
  if (!isOwnTeacher) renderContactButton(profile, honorific);
})();

// Bấm ảnh đại diện ở trang chủ để xem toàn màn hình. Wiring đóng lại (bấm nền hoặc nút ✕) chạy
// ngay khi nạp trang, không phụ thuộc việc có xác định được giáo viên hay không.
function openImageLightbox(src) {
  const box = document.getElementById('imageLightbox');
  const img = document.getElementById('imageLightboxImg');
  if (!box || !img || !src) return;
  img.src = src;
  box.style.display = 'flex';
}
(function () {
  const box = document.getElementById('imageLightbox');
  const closeBtn = document.getElementById('imageLightboxClose');
  if (!box) return;
  const close = () => { box.style.display = 'none'; };
  box.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
})();

// Giới tính giáo viên (đặt ở trang Hồ sơ) → xưng hô "Thầy"/"Cô" đúng cho các nút mời học sinh liên
// hệ/đăng ký. Hồ sơ cũ chưa từng chọn giới tính thì dùng lại cách gọi chung "thầy (cô)".
function getHonorific(profile) {
  if (profile.gender === 'female') return 'Cô';
  if (profile.gender === 'male') return 'Thầy';
  return 'thầy (cô)';
}

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

function renderContactButton(profile, honorific) {
  const wrap = document.getElementById('contactTeacherWrap');
  const optionsRow = document.getElementById('contactOptionsRow');
  if (!wrap) return;
  const phone = (profile.phone || '').trim();
  const zalo = normalizeZaloUrl(profile.zaloLink);
  const fb = normalizeContactUrl(profile.facebookLink);
  if (!phone && !zalo && !fb) return;

  wrap.style.display = 'block';
  wrap.innerHTML = `<button class="btn primary block" id="contactToggleBtn" type="button">📞 Liên hệ với ${honorific}</button>`;
  if (optionsRow) {
    optionsRow.innerHTML = `
      ${phone ? `<a class="btn primary" href="tel:${escapeHtml(phone)}">📞 Gọi điện</a>` : ''}
      ${zalo ? `<a class="btn primary" href="${escapeHtml(zalo)}" target="_blank" rel="noopener">💬 Nhắn Zalo</a>` : ''}
      ${fb ? `<a class="btn primary" href="${escapeHtml(fb)}" target="_blank" rel="noopener">📘 Nhắn Facebook</a>` : ''}
    `;
  }
  const toggleBtn = document.getElementById('contactToggleBtn');
  toggleBtn.addEventListener('click', () => {
    if (!optionsRow) return;
    optionsRow.style.display = optionsRow.style.display === 'none' ? 'flex' : 'none';
  });
}
