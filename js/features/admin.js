// Trang "Quản trị" — CHỈ tài khoản admin (MONETIZATION_ADMIN_EMAIL, xem monetization.js) truy cập
// được. Kiểm tra ở đây chỉ để ẩn/hiện giao diện đúng người — bảo mật THẬT nằm ở firestore.rules
// (isAdmin() chặn ghi config/subscriptions/studentSubscriptions/commissions, và chặn đọc
// paymentSubmissions/commissions của người khác), nên dù ai đó lách qua được UI này cũng không ghi/
// đọc được gì ngoài quyền thật của họ.

(function () {
  requireTeacherAuth(async (user) => {
    if (!isAdminUser(user)) {
      $('#adminMain').innerHTML = `
        <div class="card">
          <p class="hint">⛔ Tài khoản này không có quyền truy cập trang quản trị.</p>
        </div>
      `;
      return;
    }

    const { db } = ensureFirebase();
    let cfg = await getMonetizationConfig(true);

    function fillForm() {
      $('#monetizationEnabledToggle').classList.toggle('on', cfg.enabled);
      $('#planTeacherPrice').value = cfg.teacherPlan.price;
      $('#planTeacherPeriod').value = cfg.teacherPlan.periodDays;
      $('#planMaxGroups').value = cfg.teacherPlan.maxGroupsFree;
      $('#planMaxStudents').value = cfg.teacherPlan.maxStudentsFree;
      $('#planMaxChapters').value = cfg.teacherPlan.maxCustomChaptersFree;
      $('#planStudentPrice').value = cfg.studentPlan.price;
      $('#planStudentPeriod').value = cfg.studentPlan.periodDays;
      $('#commissionTeacher').value = cfg.commission.teacherReferralPercent;
      $('#commissionStudent').value = cfg.commission.studentReferralPercent;
      $('#payBank').value = cfg.payment.bankName;
      $('#payAccount').value = cfg.payment.accountNumber;
      $('#payHolder').value = cfg.payment.accountHolder;
      $('#payMomo').value = cfg.payment.momoNumber;
      $('#payNote').value = cfg.payment.note;
    }
    fillForm();

    $('#monetizationEnabledToggle').addEventListener('click', async () => {
      const next = !cfg.enabled;
      $('#monetizationEnabledToggle').classList.toggle('on', next); // phản hồi ngay
      try {
        await saveMonetizationConfig({ enabled: next });
        cfg.enabled = next;
      } catch (e) {
        $('#monetizationEnabledToggle').classList.toggle('on', cfg.enabled); // lỗi thì trả lại
        alert('Không lưu được: ' + e.message);
      }
    });

    $('#savePlansBtn').addEventListener('click', async () => {
      const box = $('#savePlansResult');
      showResult(box, '⏳ Đang lưu...');
      try {
        const partial = {
          teacherPlan: {
            price: Number($('#planTeacherPrice').value) || 0,
            periodDays: Math.max(1, Number($('#planTeacherPeriod').value) || 30),
            maxGroupsFree: Math.max(0, Number($('#planMaxGroups').value) || 0),
            maxStudentsFree: Math.max(0, Number($('#planMaxStudents').value) || 0),
            maxCustomChaptersFree: Math.max(0, Number($('#planMaxChapters').value) || 0)
          },
          studentPlan: {
            price: Number($('#planStudentPrice').value) || 0,
            periodDays: Math.max(1, Number($('#planStudentPeriod').value) || 30)
          },
          commission: {
            teacherReferralPercent: Math.min(100, Math.max(0, Number($('#commissionTeacher').value) || 0)),
            studentReferralPercent: Math.min(100, Math.max(0, Number($('#commissionStudent').value) || 0))
          }
        };
        await saveMonetizationConfig(partial);
        cfg = await getMonetizationConfig(true);
        showResult(box, '✅ Đã lưu.');
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    $('#savePaymentInfoBtn').addEventListener('click', async () => {
      const box = $('#savePaymentInfoResult');
      showResult(box, '⏳ Đang lưu...');
      try {
        await saveMonetizationConfig({
          payment: {
            bankName: $('#payBank').value.trim(),
            accountNumber: $('#payAccount').value.trim(),
            accountHolder: $('#payHolder').value.trim(),
            momoNumber: $('#payMomo').value.trim(),
            note: $('#payNote').value.trim()
          }
        });
        cfg = await getMonetizationConfig(true);
        showResult(box, '✅ Đã lưu.');
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    // ---------- Thống kê nhanh ----------
    async function renderStats() {
      const box = $('#adminStatsBody');
      try {
        const [subsSnap, studentSubsSnap, paymentsSnap, commissionsSnap] = await Promise.all([
          db.collection('subscriptions').where('tier', '==', 'pro').get(),
          db.collection('studentSubscriptions').where('tier', '==', 'premium').get(),
          db.collection('paymentSubmissions').where('status', '==', 'approved').get(),
          db.collection('commissions').where('status', '==', 'pending').get()
        ]);
        const totalRevenue = paymentsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
        const totalCommissionOwed = commissionsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
        box.innerHTML = `
          <div class="action-grid">
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${subsSnap.size}</div><div class="hint">Giáo viên Pro</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${studentSubsSnap.size}</div><div class="hint">Học sinh Premium</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${formatVnd(totalRevenue)}</div><div class="hint">Tổng ghi nhận đã duyệt</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${formatVnd(totalCommissionOwed)}</div><div class="hint">Hoa hồng chưa trả</div></div>
          </div>
        `;
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    }

    // ---------- Duyệt thanh toán ----------
    async function approvePayment(sub) {
      const freshCfg = await getMonetizationConfig(true);
      const now = new Date();
      const nowIso = now.toISOString();
      const batch = db.batch();

      if (sub.type === 'teacher_upgrade') {
        const expiresAt = new Date(now.getTime() + freshCfg.teacherPlan.periodDays * 86400000).toISOString();
        batch.set(db.collection('subscriptions').doc(sub.submitterUid),
          { tier: 'pro', expiresAt, updatedAt: nowIso, updatedBy: MONETIZATION_ADMIN_EMAIL }, { merge: true });
      } else {
        const expiresAt = new Date(now.getTime() + freshCfg.studentPlan.periodDays * 86400000).toISOString();
        batch.set(db.collection('studentSubscriptions').doc(sub.submitterDeviceId),
          { tier: 'premium', expiresAt, updatedAt: nowIso }, { merge: true });
      }

      if (sub.referrerTeacherUid) {
        const percent = sub.type === 'teacher_upgrade' ? freshCfg.commission.teacherReferralPercent : freshCfg.commission.studentReferralPercent;
        const amount = Math.round((Number(sub.amount) || 0) * percent / 100);
        batch.set(db.collection('commissions').doc(), {
          beneficiaryTeacherUid: sub.referrerTeacherUid,
          sourceType: sub.type === 'teacher_upgrade' ? 'teacher_referral' : 'student_referral',
          sourcePaymentId: sub.id, sourceName: sub.submitterName || '',
          amount, percent, status: 'pending', createdAt: nowIso
        });
      }

      batch.update(db.collection('paymentSubmissions').doc(sub.id), { status: 'approved', reviewedAt: nowIso, reviewedBy: MONETIZATION_ADMIN_EMAIL });
      await batch.commit();
    }

    async function rejectPayment(sub) {
      await db.collection('paymentSubmissions').doc(sub.id).update({
        status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: MONETIZATION_ADMIN_EMAIL
      });
    }

    async function renderPendingPayments() {
      const box = $('#pendingPaymentsBody');
      try {
        const snap = await db.collection('paymentSubmissions').where('status', '==', 'pending').get();
        const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        if (!list.length) { box.innerHTML = '<p class="hint">Không có yêu cầu nào đang chờ duyệt.</p>'; return; }
        box.innerHTML = list.map((sub) => `
          <div class="card" style="margin-top:10px;background:rgba(20,184,166,0.06);">
            <div style="font-weight:700;">${sub.type === 'teacher_upgrade' ? '👩‍🏫 Giáo viên nâng cấp Pro' : '🎓 Học sinh nâng cấp Premium'}</div>
            <div class="hint">${escapeHtml(sub.submitterName || '')} · ${escapeHtml(sub.submitterContact || '')}</div>
            <div class="hint">Số tiền: <strong>${formatVnd(sub.amount)}</strong>${sub.referrerTeacherUid ? ' · Có người giới thiệu (sẽ tự sinh hoa hồng khi duyệt)' : ''}</div>
            ${sub.note ? `<div class="hint">Ghi chú: ${escapeHtml(sub.note)}</div>` : ''}
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn primary approve-payment-btn" data-id="${sub.id}" type="button" style="flex:1;">✅ Duyệt</button>
              <button class="btn reject-payment-btn" data-id="${sub.id}" type="button">❌ Từ chối</button>
            </div>
            <div class="result-box" id="pay-result-${sub.id}"></div>
          </div>
        `).join('');
        $$('.approve-payment-btn', box).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const sub = list.find((s) => s.id === btn.dataset.id);
            const resultBox = document.getElementById(`pay-result-${sub.id}`);
            showResult(resultBox, '⏳ Đang duyệt...');
            btn.disabled = true;
            try {
              await approvePayment(sub);
              showResult(resultBox, '✅ Đã duyệt — gói đã được cấp.');
              await Promise.all([renderPendingPayments(), renderCommissions(), renderStats()]);
            } catch (e) {
              showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
              btn.disabled = false;
            }
          });
        });
        $$('.reject-payment-btn', box).forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Từ chối yêu cầu này?')) return;
            const sub = list.find((s) => s.id === btn.dataset.id);
            const resultBox = document.getElementById(`pay-result-${sub.id}`);
            showResult(resultBox, '⏳ Đang xử lý...');
            try {
              await rejectPayment(sub);
              await renderPendingPayments();
            } catch (e) {
              showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
            }
          });
        });
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    }

    // ---------- Hoa hồng cần trả ----------
    async function renderCommissions() {
      const box = $('#commissionsBody');
      try {
        const snap = await db.collection('commissions').get();
        const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (!list.length) { box.innerHTML = '<p class="hint">Chưa có hoa hồng nào phát sinh.</p>'; return; }
        box.innerHTML = list.map((c) => `
          <div class="card" style="margin-top:10px;${c.status === 'paid' ? 'opacity:0.6;' : ''}">
            <div style="font-weight:700;">${formatVnd(c.amount)} · ${c.sourceType === 'teacher_referral' ? 'Giới thiệu giáo viên' : 'Giới thiệu học sinh mua Premium'}</div>
            <div class="hint">Người hưởng (uid): ${escapeHtml(c.beneficiaryTeacherUid || '')}</div>
            <div class="hint">Nguồn: ${escapeHtml(c.sourceName || '')} · ${c.percent}%</div>
            <div class="hint">Trạng thái: <strong>${c.status === 'paid' ? 'Đã trả' : 'Chờ trả'}</strong></div>
            ${c.status !== 'paid' ? `<button class="btn primary mark-paid-btn" data-id="${c.id}" type="button" style="margin-top:8px;">Đánh dấu đã trả</button>` : ''}
          </div>
        `).join('');
        $$('.mark-paid-btn', box).forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = '⏳ Đang lưu...';
            try {
              await db.collection('commissions').doc(btn.dataset.id).update({ status: 'paid', paidAt: new Date().toISOString() });
              await Promise.all([renderCommissions(), renderStats()]);
            } catch (e) {
              alert('Không lưu được: ' + e.message);
              btn.disabled = false;
              btn.textContent = 'Đánh dấu đã trả';
            }
          });
        });
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    }

    await Promise.all([renderStats(), renderPendingPayments(), renderCommissions()]);
  });
})();
