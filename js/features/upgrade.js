// Trang "Nâng cấp gói" — DÙNG CHUNG cho cả giáo viên (nâng cấp Pro) và học sinh (nâng cấp Premium),
// tránh viết trùng form "Tôi đã chuyển khoản" ở 2 nơi. Tự nhận diện đang là giáo viên hay học sinh
// giống hệt cách trang chủ (index.html) đang làm: resolveEffectiveTeacherUid() (auth.js) kết hợp vai
// trò đang chọn (role.js) — xem chú thích trong resolveContentOwner() (auth.js) để hiểu đầy đủ lý do.
//
// Mỗi đối tượng (giáo viên/học sinh) có 3 mức thời hạn (1 tháng/6 tháng/1 năm, xem
// MONETIZATION_DEFAULTS.teacherPlans/studentPlans trong monetization.js) — người mua tự chọn 1 mức
// bằng lưới nút trước khi xác nhận chuyển khoản, mã "planId" được gửi kèm để admin biết đúng thời
// hạn cần cấp khi duyệt (xem approvePayment() trong admin.js).

const PLAN_TIER_ORDER = ['month1', 'month6', 'year1'];

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
    await renderUpgradeFlow({
      plans: cfg.teacherPlans,
      title: 'Gói Pro cho giáo viên',
      currentSub: await getTeacherSubscription(effectiveTeacherUid),
      currentTierLabel: 'Pro',
      extraDesc: 'Không giới hạn số nhóm, số học sinh, số chương tự soạn.',
      submit: async (plan, planId, contact, note) => {
        const user = getCurrentTeacher();
        const profile = await fetchTeacherProfile(effectiveTeacherUid).catch(() => null);
        let referrerTeacherUid = null;
        if (profile && profile.referredBy) referrerTeacherUid = await findTeacherUidByCode(profile.referredBy);
        return submitPaymentRequest({
          type: 'teacher_upgrade',
          planId,
          submitterUid: effectiveTeacherUid,
          submitterName: (profile && profile.displayName) || user.displayName || user.email || '',
          amount: plan.price,
          referrerTeacherUid,
          submitterContact: contact,
          note
        });
      }
    });
  } else if (membership && membership.groupCode && membership.studentUid && (await isSignedInAs(membership.studentUid))) {
    await renderUpgradeFlow({
      plans: cfg.studentPlans,
      title: 'Gói Premium cho học sinh',
      currentSub: await getStudentSubscription(membership.studentUid),
      currentTierLabel: 'Premium',
      extraDesc: 'Mở khoá tính năng nâng cao.',
      defaultContact: membership.phone || '',
      submit: async (plan, planId, contact, note) => submitPaymentRequest({
        type: 'student_upgrade',
        planId,
        submitterStudentUid: membership.studentUid,
        submitterName: membership.studentName || '',
        amount: plan.price,
        referrerTeacherUid: membership.teacherUid || null,
        submitterContact: contact,
        note
      })
    });
  } else if (membership && membership.groupCode) {
    // Có nhóm trong bộ nhớ đệm nhưng phiên đăng nhập Google hiện tại không khớp (VD hết hạn đăng
    // nhập) — mua gói sẽ bị Firestore Rules từ chối vì cần đúng request.auth.uid, nên chặn sớm ở
    // đây và hướng dẫn đăng nhập lại thay vì để lỗi khó hiểu lúc bấm "Tôi đã chuyển khoản".
    main.innerHTML = `
      <div class="card">
        <p class="hint">⚠️ Cần đăng nhập lại đúng tài khoản Google đã dùng để vào nhóm "${escapeHtml(membership.groupName || '')}" trước khi mua gói.</p>
        <a class="btn primary block" href="vao-nhom.html" style="margin-top:8px;">Vào nhóm học tập</a>
      </div>
    `;
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

  function paymentInfoHtml(orderCode) {
    if (!cfg.payment.bankName && !cfg.payment.accountNumber && !cfg.payment.momoNumber) {
      return `<p class="hint">⚠️ Chưa có thông tin chuyển khoản — liên hệ admin để được hướng dẫn.</p>`;
    }
    return `
      <div style="text-align:center;background:rgba(20,184,166,0.1);border:1px dashed var(--brand);border-radius:10px;padding:10px;margin-bottom:10px;">
        <div class="hint">Mã đơn hàng — <strong>bắt buộc ghi đúng mã này vào nội dung chuyển khoản</strong> để đối soát:</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:0.08em;color:var(--brand);">${escapeHtml(orderCode)}</div>
      </div>
      <div class="hint" style="line-height:1.8;">
        ${cfg.payment.bankName ? `Ngân hàng: <strong>${escapeHtml(cfg.payment.bankName)}</strong><br/>` : ''}
        ${cfg.payment.accountNumber ? `Số tài khoản: <strong>${escapeHtml(cfg.payment.accountNumber)}</strong><br/>` : ''}
        ${cfg.payment.accountHolder ? `Chủ tài khoản: <strong>${escapeHtml(cfg.payment.accountHolder)}</strong><br/>` : ''}
        ${cfg.payment.momoNumber ? `MoMo: <strong>${escapeHtml(cfg.payment.momoNumber)}</strong><br/>` : ''}
        ${cfg.payment.note ? `${escapeHtml(cfg.payment.note)}` : ''}
      </div>
    `;
  }

  function renderSuccess(orderCode) {
    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">✅</span>Đã gửi yêu cầu</h2>
        <p class="hint">Cảm ơn bạn! Mã đơn hàng của bạn là <strong style="color:var(--brand);">${escapeHtml(orderCode)}</strong> — admin sẽ đối chiếu mã này với nội dung chuyển khoản trước khi duyệt (thường trong vòng 24 giờ). Gói sẽ tự động kích hoạt ngay khi được duyệt.</p>
        <a class="btn primary block" href="../index.html">Quay lại trang chủ</a>
      </div>
    `;
  }

  // opts = { plans: {month1,month6,year1}, title, currentSub, currentTierLabel, extraDesc,
  //          defaultContact, submit(plan, planId) }
  async function renderUpgradeFlow(opts) {
    const orderCode = await genOrderCode();
    let selectedId = PLAN_TIER_ORDER.find((id) => opts.plans[id]) || 'month1';

    function currentPlan() { return opts.plans[selectedId]; }

    main.innerHTML = `
      <div class="card">
        <h2><span class="icon">⭐</span>${escapeHtml(opts.title)}</h2>
        <p class="hint">Trạng thái hiện tại: <strong>${opts.currentSub.tier === 'pro' || opts.currentSub.tier === 'premium' ? `${opts.currentTierLabel} (hết hạn ${escapeHtml((opts.currentSub.expiresAt || '').slice(0, 10))})` : 'Miễn phí'}</strong></p>
        <p class="hint" style="margin-top:-4px;">${escapeHtml(opts.extraDesc)} Chọn thời hạn:</p>
        <div class="action-grid" id="planPicker">
          ${PLAN_TIER_ORDER.filter((id) => opts.plans[id]).map((id) => `
            <button class="btn plan-pick-btn ${id === selectedId ? 'has-open' : ''}" type="button" data-plan="${id}">
              ${escapeHtml(opts.plans[id].label)}<br/><strong>${formatVnd(opts.plans[id].price)}</strong>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h2><span class="icon">🏦</span>Chuyển khoản</h2>
        <p class="hint">Số tiền cần chuyển: <strong id="planAmountDisplay" style="color:var(--brand);">${formatVnd(currentPlan().price)}</strong></p>
        ${paymentInfoHtml(orderCode)}
      </div>
      <div class="card">
        <h2><span class="icon">✍️</span>Xác nhận đã chuyển khoản</h2>
        <div class="field">
          <label for="upgradeContact">Số điện thoại/Zalo để admin liên hệ nếu cần</label>
          <input type="tel" id="upgradeContact" value="${escapeHtml(opts.defaultContact || '')}" placeholder="VD: 0912345678" />
        </div>
        <div class="field">
          <label for="upgradeNote">Ghi chú (VD: đã chuyển khoản lúc mấy giờ)</label>
          <textarea id="upgradeNote" rows="2"></textarea>
        </div>
        <button class="btn primary block" id="upgradeSubmitBtn">Tôi đã chuyển khoản</button>
        <div class="result-box" id="upgradeResult"></div>
      </div>
    `;

    $$('.plan-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedId = btn.dataset.plan;
        $$('.plan-pick-btn').forEach((b) => b.classList.toggle('has-open', b.dataset.plan === selectedId));
        $('#planAmountDisplay').textContent = formatVnd(currentPlan().price);
      });
    });

    $('#upgradeSubmitBtn').addEventListener('click', async () => {
      const box = $('#upgradeResult');
      showResult(box, '⏳ Đang gửi...');
      try {
        const plan = currentPlan();
        const contact = $('#upgradeContact').value.trim();
        const note = $('#upgradeNote').value.trim();
        await opts.submit(plan, selectedId, contact, note);
        renderSuccess(orderCode);
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });
  }
})();
