// Trang "Nâng cấp gói" — DÙNG CHUNG cho cả giáo viên (nâng cấp Pro) và học sinh (nâng cấp Premium),
// tránh viết trùng form "Tôi đã chuyển khoản" ở 2 nơi. Tự nhận diện đang là giáo viên hay học sinh
// giống hệt cách trang chủ (index.html) đang làm: resolveEffectiveTeacherUid() (auth.js) kết hợp vai
// trò đang chọn (role.js) — xem chú thích trong resolveContentOwner() (auth.js) để hiểu đầy đủ lý do.

(async function () {
  const main = $('#upgradeMain');

  if (!isFirebaseConfigured()) {
    main.innerHTML = `<div class="card"><p class="hint">⚠️ Chưa kết nối Firebase.</p></div>`;
    return;
  }

  const cfg = await getMonetizationConfig();
  if (!cfg.enabled) {
    main.innerHTML = `<div class="card"><p class="hint">Chưa mở tính năng nâng cấp gói vào lúc này. Quay lại sau nhé!</p></div>`;
    return;
  }

  const role = getRole();
  const effectiveTeacherUid = await resolveEffectiveTeacherUid();
  const membership = getMembership();

  if (effectiveTeacherUid && role !== 'student') {
    await renderTeacherUpgrade(effectiveTeacherUid);
  } else if (membership && membership.groupCode) {
    await renderStudentUpgrade(membership);
  } else {
    main.innerHTML = `
      <div class="card">
        <p class="hint">Cần đăng nhập bằng tài khoản Google (giáo viên) hoặc đã vào 1 nhóm học tập (học sinh) trước khi nâng cấp gói.</p>
        <a class="btn primary block" href="../index.html" style="margin-top:8px;">Quay lại trang chủ</a>
      </div>
    `;
  }

  // Vào trang này vì bấm 1 tile đang bị khoá ở trang chủ (?locked=featureId) — báo rõ lý do, tránh
  // người dùng thấy lạ "tự nhiên nhảy sang trang nâng cấp".
  const lockedFeatureId = new URLSearchParams(location.search).get('locked');
  const lockedFeature = lockedFeatureId && LOCKABLE_FEATURES.find((f) => f.id === lockedFeatureId);
  if (lockedFeature) {
    const note = document.createElement('div');
    note.className = 'card';
    note.innerHTML = `<p class="hint">⭐ "${escapeHtml(lockedFeature.label)}" hiện chỉ dành cho gói trả phí.</p>`;
    main.prepend(note);
  }

  function paymentInfoHtml() {
    if (!cfg.payment.bankName && !cfg.payment.accountNumber && !cfg.payment.momoNumber) {
      return `<p class="hint">⚠️ Chưa có thông tin chuyển khoản — liên hệ admin để được hướng dẫn.</p>`;
    }
    return `
      <div class="hint" style="line-height:1.8;">
        ${cfg.payment.bankName ? `Ngân hàng: <strong>${escapeHtml(cfg.payment.bankName)}</strong><br/>` : ''}
        ${cfg.payment.accountNumber ? `Số tài khoản: <strong>${escapeHtml(cfg.payment.accountNumber)}</strong><br/>` : ''}
        ${cfg.payment.accountHolder ? `Chủ tài khoản: <strong>${escapeHtml(cfg.payment.accountHolder)}</strong><br/>` : ''}
        ${cfg.payment.momoNumber ? `MoMo: <strong>${escapeHtml(cfg.payment.momoNumber)}</strong><br/>` : ''}
        ${cfg.payment.note ? `${escapeHtml(cfg.payment.note)}` : ''}
      </div>
    `;
  }

  function renderSuccess() {
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">✅</span>Đã gửi yêu cầu</h2>
        <p class="hint">Cảm ơn bạn! Yêu cầu nâng cấp đang chờ admin duyệt (thường trong vòng 24 giờ). Gói sẽ tự động kích hoạt ngay khi được duyệt.</p>
        <a class="btn primary block" href="../index.html">Quay lại trang chủ</a>
      </div>
    `;
  }

  async function renderTeacherUpgrade(uid) {
    const user = getCurrentTeacher();
    const [sub, profile] = await Promise.all([getTeacherSubscription(uid), fetchTeacherProfile(uid).catch(() => null)]);
    const plan = cfg.teacherPlan;
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">⭐</span>Gói Pro cho giáo viên</h2>
        <p class="hint">Trạng thái hiện tại: <strong>${sub.tier === 'pro' ? `Pro (hết hạn ${escapeHtml((sub.expiresAt || '').slice(0, 10))})` : 'Miễn phí'}</strong></p>
        <p class="hint">Không giới hạn số nhóm, số học sinh, số chương tự soạn. Giá: <strong>${formatVnd(plan.price)}</strong> / ${plan.periodDays} ngày.</p>
      </div>
      <div class="card">
        <h2><span class="icon">🏦</span>Chuyển khoản</h2>
        ${paymentInfoHtml()}
      </div>
      <div class="card">
        <h2><span class="icon">✍️</span>Xác nhận đã chuyển khoản</h2>
        <div class="field">
          <label for="upgradeContact">Số điện thoại/Zalo để admin liên hệ nếu cần</label>
          <input type="tel" id="upgradeContact" placeholder="VD: 0912345678" />
        </div>
        <div class="field">
          <label for="upgradeNote">Ghi chú (VD: đã chuyển khoản lúc mấy giờ, mã giao dịch...)</label>
          <textarea id="upgradeNote" rows="2"></textarea>
        </div>
        <button class="btn primary block" id="upgradeSubmitBtn">Tôi đã chuyển khoản</button>
        <div class="result-box" id="upgradeResult"></div>
      </div>
    `;
    $('#upgradeSubmitBtn').addEventListener('click', async () => {
      const box = $('#upgradeResult');
      showResult(box, '⏳ Đang gửi...');
      try {
        let referrerTeacherUid = null;
        if (profile && profile.referredBy) referrerTeacherUid = await findTeacherUidByCode(profile.referredBy);
        await submitPaymentRequest({
          type: 'teacher_upgrade',
          submitterUid: uid,
          submitterName: (profile && profile.displayName) || user.displayName || user.email || '',
          submitterContact: $('#upgradeContact').value.trim(),
          note: $('#upgradeNote').value.trim(),
          amount: plan.price,
          referrerTeacherUid
        });
        renderSuccess();
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
  }

  async function renderStudentUpgrade(m) {
    const deviceId = getDeviceId();
    const sub = await getStudentSubscription(deviceId);
    const plan = cfg.studentPlan;
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">⭐</span>Gói Premium cho học sinh</h2>
        <p class="hint">Trạng thái hiện tại: <strong>${sub.tier === 'premium' ? `Premium (hết hạn ${escapeHtml((sub.expiresAt || '').slice(0, 10))})` : 'Miễn phí'}</strong></p>
        <p class="hint">Mở khoá tính năng nâng cao. Giá: <strong>${formatVnd(plan.price)}</strong> / ${plan.periodDays} ngày.</p>
      </div>
      <div class="card">
        <h2><span class="icon">🏦</span>Chuyển khoản</h2>
        ${paymentInfoHtml()}
      </div>
      <div class="card">
        <h2><span class="icon">✍️</span>Xác nhận đã chuyển khoản</h2>
        <div class="field">
          <label for="upgradeContact">Số điện thoại/Zalo để admin liên hệ nếu cần</label>
          <input type="tel" id="upgradeContact" value="${escapeHtml(m.phone || '')}" placeholder="VD: 0912345678" />
        </div>
        <div class="field">
          <label for="upgradeNote">Ghi chú (VD: đã chuyển khoản lúc mấy giờ, mã giao dịch...)</label>
          <textarea id="upgradeNote" rows="2"></textarea>
        </div>
        <button class="btn primary block" id="upgradeSubmitBtn">Tôi đã chuyển khoản</button>
        <div class="result-box" id="upgradeResult"></div>
      </div>
    `;
    $('#upgradeSubmitBtn').addEventListener('click', async () => {
      const box = $('#upgradeResult');
      showResult(box, '⏳ Đang gửi...');
      try {
        await submitPaymentRequest({
          type: 'student_upgrade',
          submitterDeviceId: deviceId,
          submitterName: m.studentName || '',
          submitterContact: $('#upgradeContact').value.trim(),
          note: $('#upgradeNote').value.trim(),
          amount: plan.price,
          referrerTeacherUid: m.teacherUid || null
        });
        renderSuccess();
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
  }
})();
