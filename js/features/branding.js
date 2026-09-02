// Cá nhân hoá trang chủ theo giáo viên: tên hiển thị + khẩu hiệu (đặt ở trang "Hồ sơ") + ảnh đại
// diện — giúp giáo viên xây dựng thương hiệu riêng. Học sinh trong nhóm của giáo viên đó sẽ thấy
// đúng những gì giáo viên đã thiết đặt; giáo viên xem trang chủ của chính mình cũng thấy y hệt.
// Khách vãng lai (chưa chọn vai trò, chưa đăng nhập/chưa vào nhóm) không xác định được là của
// giáo viên nào nên giữ nguyên thương hiệu mặc định của app — không đổi gì.

(async function () {
  if (!isFirebaseConfigured()) return;

  let teacherUid = null;
  let isOwnTeacher = false; // true nếu người xem CHÍNH LÀ giáo viên đang đăng nhập (xem trang của mình)
  try {
    const teacher = await waitForAuthReady();
    if (teacher) { teacherUid = teacher.uid; isOwnTeacher = true; }
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

  const honorific = getHonorific(profile);
  const registerBtn = document.getElementById('registerToggleBtn');
  if (registerBtn) registerBtn.textContent = `📝 Đăng ký học cùng ${honorific}`;

  // Nút "Liên hệ" chỉ dành cho học sinh liên hệ giáo viên — ẩn khi chính giáo viên đang xem trang
  // của mình (không cần nút gọi/nhắn cho chính mình).
  if (!isOwnTeacher) renderContactButton(profile, honorific);
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
