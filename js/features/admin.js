// Trang "Quản trị" — CHỈ tài khoản admin (MONETIZATION_ADMIN_EMAIL, xem monetization.js) truy cập
// được. Kiểm tra ở đây chỉ để ẩn/hiện giao diện đúng người — bảo mật THẬT nằm ở firestore.rules
// (isAdmin() chặn ghi config/subscriptions/studentSubscriptions/commissions, và chặn đọc
// paymentSubmissions/commissions của người khác), nên dù ai đó lách qua được UI này cũng không ghi/
// đọc được gì ngoài quyền thật của họ.
//
// Bố cục: 1 lưới nút (giống nút hành động ở "Nhóm học sinh") — bấm nút nào thì CHỈ mở đúng khung nội
// dung của mục đó vào #adminSectionPanel (đóng khung đang mở trước, nếu có), thay vì hiện hết tất cả
// các mục cùng lúc như trước — đỡ phải cuộn dài. Mỗi mục tự tải dữ liệu MỖI LẦN mở (không cache lại
// giữa các lần mở) — đơn giản, đủ nhanh vì quy mô dữ liệu nhỏ (1 admin, vài chục giáo viên).

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
    let openSection = null;

    // cfg tải NỀN (không await ở đây) — nút bấm phải gắn được NGAY, không chờ mạng, để tránh cảnh
    // "bấm nút vài giây đầu không thấy phản ứng gì" nếu mạng chậm. Các mục cần cfg (plans/payment/
    // locked) tự "await cfgReady" bên trong khi mở, mục khác (stats/roster/pending/commissions) không
    // cần chờ gì cả.
    let cfg = null;
    const cfgReady = getMonetizationConfig(true).then((c) => {
      cfg = c;
      $('#monetizationEnabledToggle').classList.toggle('on', cfg.enabled);
      return c;
    }).catch((e) => {
      cfg = { teacherPlan: {}, studentPlan: {}, commission: {}, payment: {}, lockedFeatures: {}, enabled: false };
      throw e;
    });

    $('#monetizationEnabledToggle').addEventListener('click', async () => {
      try {
        await cfgReady;
      } catch (e) { alert('Chưa tải được cấu hình: ' + e.message); return; }
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

    // Số yêu cầu đang chờ duyệt — hiện chấm đỏ trên nút "Duyệt thanh toán" để admin biết có việc cần
    // làm mà không cần mở ra xem. Chạy NỀN (không await), không chặn việc gắn nút bấm bên dưới.
    db.collection('paymentSubmissions').where('status', '==', 'pending').get().then((pendingSnap) => {
      if (pendingSnap.size) {
        const badge = $('#pendingCountBadge');
        badge.textContent = pendingSnap.size > 99 ? '99+' : String(pendingSnap.size);
        badge.style.display = 'flex';
      }
    }).catch(() => { /* ignore */ });

    // ---------- Điều hướng: 1 khung nội dung duy nhất, đổi theo nút vừa bấm ----------
    // Gắn nút bấm NGAY LẬP TỨC (đồng bộ, không chờ awit nào ở trên) — đây là phần quan trọng nhất
    // của trang nên phải chắc chắn hoạt động dù mạng chậm hay cfg tải lỗi.
    const NEEDS_CFG = { plans: true, payment: true, locked: true };
    const SECTION_BUILDERS = {
      stats: buildStatsSection,
      roster: buildRosterSection,
      locked: buildLockedFeaturesSection,
      plans: buildPlansSection,
      payment: buildPaymentSection,
      pending: buildPendingSection,
      commissions: buildCommissionsSection
    };

    $$('.admin-menu-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.section;
        const panel = $('#adminSectionPanel');
        if (openSection === key) {
          panel.style.display = 'none';
          panel.innerHTML = '';
          btn.classList.remove('has-open');
          openSection = null;
          return;
        }
        $$('.admin-menu-btn').forEach((b) => b.classList.remove('has-open'));
        btn.classList.add('has-open');
        openSection = key;
        panel.style.display = 'block';
        panel.innerHTML = '<div class="card"><p class="hint">⏳ Đang tải...</p></div>';
        // Bọc try/catch quanh TOÀN BỘ bước dựng khung — lỗi bất ngờ nào cũng phải hiện ra thấy được,
        // không được để khung bị kẹt mãi ở "Đang tải..." mà không rõ vì sao.
        try {
          if (NEEDS_CFG[key]) await cfgReady;
          await SECTION_BUILDERS[key](panel);
        } catch (e) {
          panel.innerHTML = `<div class="card"><p class="hint">⚠️ ${escapeHtml(e.message)}</p></div>`;
        }
      });
    });

    // ---------- 📈 Thống kê nhanh ----------
    async function buildStatsSection(panel) {
      panel.innerHTML = `<div class="card"><h2><span class="icon">📈</span>Thống kê nhanh</h2><div id="adminStatsBody"><p class="hint">⏳ Đang tải...</p></div></div>`;
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

    // ---------- 👥 Danh sách giáo viên (báo cáo tổng hợp) ----------
    // Đọc từ các collection CÔNG KHAI (teacherProfiles/subscriptions/groups/students) + commissions
    // (chỉ admin đọc được toàn bộ) — KHÔNG đọc "teachers" (có email, chỉ chính chủ đọc được).
    async function buildRosterSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">👥</span>Danh sách giáo viên</h2>
          <p class="hint" style="margin-top:-4px;">Bấm 1 dòng để xem danh sách học sinh của giáo viên đó.</p>
          <div id="teacherRosterBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
      `;
      const box = $('#teacherRosterBody');
      try {
        const [profilesSnap, subsSnap, groupsSnap, studentsSnap, commissionsSnap] = await Promise.all([
          db.collection('teacherProfiles').get(),
          db.collection('subscriptions').get(),
          db.collection('groups').get(),
          db.collection('students').get(),
          db.collection('commissions').get()
        ]);

        const subsByUid = new Map(subsSnap.docs.map((d) => [d.id, d.data()]));
        const groupTeacherByCode = new Map(groupsSnap.docs.map((d) => [d.data().groupCode, d.data().teacherUid]));
        const studentCountByUid = new Map();
        studentsSnap.docs.forEach((d) => {
          const s = d.data();
          const uid = s.teacherUid || groupTeacherByCode.get(s.groupCode);
          if (!uid) return;
          studentCountByUid.set(uid, (studentCountByUid.get(uid) || 0) + 1);
        });
        const commissionByUid = new Map();
        commissionsSnap.docs.forEach((d) => {
          const c = d.data();
          const cur = commissionByUid.get(c.beneficiaryTeacherUid) || { paid: 0, pending: 0 };
          if (c.status === 'paid') cur.paid += Number(c.amount) || 0; else cur.pending += Number(c.amount) || 0;
          commissionByUid.set(c.beneficiaryTeacherUid, cur);
        });

        const rows = profilesSnap.docs.map((d) => {
          const p = d.data();
          const sub = subsByUid.get(d.id) || { tier: 'free' };
          const comm = commissionByUid.get(d.id) || { paid: 0, pending: 0 };
          return {
            uid: d.id, teacherCode: p.teacherCode || '—', name: p.displayName || '(chưa đặt tên)',
            tier: sub.tier || 'free', expiresAt: sub.expiresAt || '',
            studentCount: studentCountByUid.get(d.id) || 0, comm
          };
        }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

        if (!rows.length) { box.innerHTML = '<p class="hint">Chưa có giáo viên nào đăng nhập.</p>'; return; }

        box.innerHTML = `
          <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
          <div class="roster-table-wrap">
            <table class="roster-table">
              <thead>
                <tr><th>Mã GV</th><th>Tên</th><th>Trạng thái gói</th><th>Số học sinh</th><th>Hoa hồng đã trả</th><th>Hoa hồng chờ trả</th><th></th></tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td>${escapeHtml(r.teacherCode)}</td>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${r.tier === 'pro' ? `Pro (hết hạn ${escapeHtml(r.expiresAt.slice(0, 10))})` : 'Miễn phí'}</td>
                    <td>${r.studentCount}</td>
                    <td>${formatVnd(r.comm.paid)}</td>
                    <td>${formatVnd(r.comm.pending)}</td>
                    <td><button class="btn roster-expand-btn" type="button" data-uid="${r.uid}">👥 Xem học sinh</button></td>
                  </tr>
                  <tr id="roster-students-${r.uid}" style="display:none;"><td colspan="7"></td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        $$('.roster-expand-btn', box).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const uid = btn.dataset.uid;
            const row = document.getElementById(`roster-students-${uid}`);
            const open = row.style.display !== 'none';
            if (open) { row.style.display = 'none'; btn.textContent = '👥 Xem học sinh'; return; }
            row.style.display = 'table-row';
            btn.textContent = '👥 Ẩn học sinh';
            const cell = row.querySelector('td');
            if (row.dataset.loaded) return;
            row.dataset.loaded = '1';
            cell.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
            const teacherGroupCodes = new Set(groupsSnap.docs.filter((d) => d.data().teacherUid === uid).map((d) => d.data().groupCode));
            const students = studentsSnap.docs.filter((d) => teacherGroupCodes.has(d.data().groupCode))
              .map((d) => Object.assign({ id: d.id }, d.data()))
              .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'vi'));
            if (!students.length) { cell.innerHTML = '<p class="hint">Chưa có học sinh nào.</p>'; return; }
            const subs = await Promise.all(students.map((s) => getStudentSubscription(s.deviceId)));
            cell.innerHTML = `
              <div class="roster-table-wrap">
                <table class="roster-table">
                  <thead>
                    <tr><th>STT</th><th>Họ tên</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Gói</th></tr>
                  </thead>
                  <tbody>
                    ${students.map((s, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td>${escapeHtml(s.studentName || '—')}</td>
                        <td>${escapeHtml(s.school || '—')}</td>
                        <td>${escapeHtml(s.className || '—')}</td>
                        <td>${escapeHtml(s.address || '—')}</td>
                        <td>${escapeHtml(s.phone || '—')}</td>
                        <td>${subs[i].tier === 'premium' ? '⭐ Premium' : 'Miễn phí'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;
          });
        });
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    }

    // ---------- 🔒 Khoá tính năng ----------
    async function buildLockedFeaturesSection(panel) {
      const any = LOCKABLE_FEATURES.filter((f) => f.audience === 'any');
      const teacherOnly = LOCKABLE_FEATURES.filter((f) => f.audience !== 'any');
      const rowHtml = (f) => `
        <div class="free-mode-row" style="margin:8px 0;padding:10px 12px;">
          <div class="fm-text"><div class="fm-title">${escapeHtml(f.label)}</div></div>
          <div class="switch locked-feature-toggle ${cfg.lockedFeatures[f.id] ? 'on' : ''}" data-feature="${f.id}"><div class="knob"></div></div>
        </div>
      `;
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">🔒</span>Tính năng chỉ dành cho gói Pro</h2>
          <p class="hint" style="margin-top:-4px;">Bật tính năng nào thì gói miễn phí KHÔNG dùng được tính năng đó nữa. Chỉ có tác dụng khi công tắc tổng ở trên đang bật.</p>
          <div class="hint" style="font-weight:700;margin:6px 0;">Trang chủ (giáo viên &amp; học sinh đều thấy)</div>
          ${any.map(rowHtml).join('')}
          <div class="hint" style="font-weight:700;margin:14px 0 6px;">Chỉ dành cho giáo viên</div>
          ${teacherOnly.map(rowHtml).join('')}
        </div>
      `;
      $$('.locked-feature-toggle', panel).forEach((el) => {
        el.addEventListener('click', async () => {
          const featureId = el.dataset.feature;
          const next = !cfg.lockedFeatures[featureId];
          el.classList.toggle('on', next);
          try {
            const lockedFeatures = Object.assign({}, cfg.lockedFeatures, { [featureId]: next });
            await saveMonetizationConfig({ lockedFeatures });
            cfg.lockedFeatures = lockedFeatures;
          } catch (e) {
            el.classList.toggle('on', !next);
            alert('Không lưu được: ' + e.message);
          }
        });
      });
    }

    // ---------- 💳 Gói & giá ----------
    async function buildPlansSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">💳</span>Gói &amp; giá</h2>
          <div class="field"><label for="planTeacherPrice">Giá gói Pro cho giáo viên (đ/kỳ)</label><input type="number" id="planTeacherPrice" min="0" step="1000" /></div>
          <div class="field"><label for="planTeacherPeriod">Thời hạn 1 kỳ (số ngày)</label><input type="number" id="planTeacherPeriod" min="1" step="1" /></div>
          <div class="field"><label for="planMaxGroups">Gói miễn phí: tối đa số nhóm</label><input type="number" id="planMaxGroups" min="0" step="1" /></div>
          <div class="field"><label for="planMaxStudents">Gói miễn phí: tối đa số học sinh</label><input type="number" id="planMaxStudents" min="0" step="1" /></div>
          <div class="field"><label for="planMaxChapters">Gói miễn phí: tối đa số chương tự soạn</label><input type="number" id="planMaxChapters" min="0" step="1" /></div>
          <div class="field"><label for="planStudentPrice">Giá gói Premium cho học sinh (đ/kỳ)</label><input type="number" id="planStudentPrice" min="0" step="1000" /></div>
          <div class="field"><label for="planStudentPeriod">Thời hạn 1 kỳ (số ngày)</label><input type="number" id="planStudentPeriod" min="1" step="1" /></div>
          <div class="field"><label for="commissionTeacher">Hoa hồng giới thiệu giáo viên (%)</label><input type="number" id="commissionTeacher" min="0" max="100" step="1" /></div>
          <div class="field"><label for="commissionStudent">Hoa hồng khi học sinh (trong nhóm) mua Premium (%)</label><input type="number" id="commissionStudent" min="0" max="100" step="1" /></div>
          <button class="btn primary block" id="savePlansBtn">Lưu gói &amp; giá &amp; hoa hồng</button>
          <div class="result-box" id="savePlansResult"></div>
        </div>
      `;
      $('#planTeacherPrice').value = cfg.teacherPlan.price;
      $('#planTeacherPeriod').value = cfg.teacherPlan.periodDays;
      $('#planMaxGroups').value = cfg.teacherPlan.maxGroupsFree;
      $('#planMaxStudents').value = cfg.teacherPlan.maxStudentsFree;
      $('#planMaxChapters').value = cfg.teacherPlan.maxCustomChaptersFree;
      $('#planStudentPrice').value = cfg.studentPlan.price;
      $('#planStudentPeriod').value = cfg.studentPlan.periodDays;
      $('#commissionTeacher').value = cfg.commission.teacherReferralPercent;
      $('#commissionStudent').value = cfg.commission.studentReferralPercent;

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
    }

    // ---------- 🏦 Thông tin chuyển khoản ----------
    async function buildPaymentSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">🏦</span>Thông tin chuyển khoản</h2>
          <p class="hint" style="margin-top:-4px;">Hiện cho giáo viên/học sinh khi bấm nâng cấp gói.</p>
          <div class="field"><label for="payBank">Ngân hàng</label><input type="text" id="payBank" placeholder="VD: Vietcombank" /></div>
          <div class="field"><label for="payAccount">Số tài khoản</label><input type="text" id="payAccount" /></div>
          <div class="field"><label for="payHolder">Chủ tài khoản</label><input type="text" id="payHolder" /></div>
          <div class="field"><label for="payMomo">Số MoMo (nếu có)</label><input type="text" id="payMomo" /></div>
          <div class="field"><label for="payNote">Ghi chú thêm</label><textarea id="payNote" rows="2" placeholder="VD: Ghi rõ nội dung chuyển khoản là tên + số điện thoại"></textarea></div>
          <button class="btn primary block" id="savePaymentInfoBtn">Lưu thông tin chuyển khoản</button>
          <div class="result-box" id="savePaymentInfoResult"></div>
        </div>
      `;
      $('#payBank').value = cfg.payment.bankName;
      $('#payAccount').value = cfg.payment.accountNumber;
      $('#payHolder').value = cfg.payment.accountHolder;
      $('#payMomo').value = cfg.payment.momoNumber;
      $('#payNote').value = cfg.payment.note;

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
    }

    // ---------- 🧾 Duyệt thanh toán ----------
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

    async function buildPendingSection(panel) {
      panel.innerHTML = `<div class="card"><h2><span class="icon">🧾</span>Duyệt thanh toán</h2><div id="pendingPaymentsBody"><p class="hint">⏳ Đang tải...</p></div></div>`;
      await renderPendingPayments();
    }

    async function renderPendingPayments() {
      const box = $('#pendingPaymentsBody');
      if (!box) return;
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
              await renderPendingPayments();
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

    // ---------- 💰 Hoa hồng cần trả ----------
    async function buildCommissionsSection(panel) {
      panel.innerHTML = `<div class="card"><h2><span class="icon">💰</span>Hoa hồng cần trả</h2><div id="commissionsBody"><p class="hint">⏳ Đang tải...</p></div></div>`;
      await renderCommissions();
    }

    async function renderCommissions() {
      const box = $('#commissionsBody');
      if (!box) return;
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
              await renderCommissions();
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
  });
})();
