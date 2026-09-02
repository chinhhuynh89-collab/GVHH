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
})();
