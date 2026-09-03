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
//
// Hoa hồng 2 CẤP (F1/F2) — tính cho CẢ giáo viên mua Pro LẪN học sinh mua Premium, nhưng người NHẬN
// hoa hồng LUÔN LÀ giáo viên (xem mo-hinh-kinh-doanh-referral.md và createReferralCommissions() bên
// dưới). Tài khoản học sinh không bao giờ nhận hoa hồng dù có chia sẻ link cho ai.

const ADMIN_FRAUD_ORDER_THRESHOLD_24H = 5; // cảnh báo nếu 1 mã giới thiệu phát sinh > N đơn/24h
const PLAN_TIER_ORDER = ['month1', 'month6', 'year1'];

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
    // locked) tự "await cfgReady" bên trong khi mở, mục khác không cần chờ gì cả.
    let cfg = null;
    const cfgReady = getMonetizationConfig().then((c) => {
      cfg = c;
      $('#monetizationEnabledToggle').classList.toggle('on', cfg.enabled);
      return c;
    }).catch((e) => {
      cfg = { teacherFreeLimits: {}, teacherPlans: {}, studentPlans: {}, commission: {}, payment: {}, lockedFeatures: {}, enabled: false };
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
    // Gắn nút bấm NGAY LẬP TỨC (đồng bộ, không chờ await nào ở trên) — đây là phần quan trọng nhất
    // của trang nên phải chắc chắn hoạt động dù mạng chậm hay cfg tải lỗi.
    const NEEDS_CFG = { plans: true, payment: true, locked: true, commissions: true };
    const SECTION_BUILDERS = {
      stats: buildStatsSection,
      roster: buildRosterSection,
      locked: buildLockedFeaturesSection,
      plans: buildPlansSection,
      payment: buildPaymentSection,
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

    // ---------- 📈 Thống kê nhanh + Lịch sử giao dịch ----------
    async function buildStatsSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">📈</span>Thống kê nhanh</h2>
          <div id="adminStatsBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
        <div class="card">
          <h2><span class="icon">🧾</span>Lịch sử giao dịch</h2>
          <p class="hint" style="margin-top:-4px;">Toàn bộ yêu cầu nâng cấp đã gửi — chờ duyệt, đã duyệt, đã từ chối — mới nhất lên đầu.</p>
          <div id="txHistoryBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
      `;
      const statsBox = $('#adminStatsBody');
      const txBox = $('#txHistoryBody');
      try {
        const [subsSnap, studentSubsSnap, allSubmissionsSnap, commissionsSnap, profilesSnap] = await Promise.all([
          db.collection('subscriptions').where('tier', '==', 'pro').get(),
          db.collection('studentSubscriptions').where('tier', '==', 'premium').get(),
          db.collection('paymentSubmissions').get(),
          db.collection('commissions').where('status', 'in', ['pending_hold', 'available']).get(),
          db.collection('teacherProfiles').get()
        ]);

        const nameByUid = new Map(profilesSnap.docs.map((d) => [d.id, d.data().displayName || '(chưa đặt tên)']));

        const totalRevenue = allSubmissionsSnap.docs
          .filter((d) => d.data().status === 'approved')
          .reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
        const totalCommissionOwed = commissionsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
        statsBox.innerHTML = `
          <div class="action-grid">
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${subsSnap.size}</div><div class="hint">Giáo viên Pro</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${studentSubsSnap.size}</div><div class="hint">Học sinh Premium</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${formatVnd(totalRevenue)}</div><div class="hint">Tổng ghi nhận đã duyệt</div></div>
            <div class="chapter-card" style="text-align:center;"><div class="cc-title">${formatVnd(totalCommissionOwed)}</div><div class="hint">Hoa hồng chưa trả</div></div>
          </div>
        `;

        const txList = allSubmissionsSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (!txList.length) {
          txBox.innerHTML = '<p class="hint">Chưa có giao dịch nào.</p>';
        } else {
          const statusLabel = (s) => s === 'approved' ? '✅ Đã duyệt' : s === 'rejected' ? '❌ Từ chối' : '⏳ Chờ duyệt';
          txBox.innerHTML = `
            <p class="hint">👉 Kéo ngang bảng để xem đủ các cột. "Người giới thiệu" = người sẽ nhận hoa hồng F1 từ giao dịch này (giáo viên trực tiếp giới thiệu, hoặc giáo viên chủ nhóm nếu người nộp là học sinh).</p>
            <div class="roster-table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th>Thời gian</th><th>Loại</th><th>Người nộp</th><th>Liên hệ</th><th>Số tiền</th>
                    <th>Mã đơn</th><th>Người giới thiệu</th><th>Trạng thái</th><th>Xử lý lúc</th><th>Người xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  ${txList.map((t) => `
                    <tr>
                      <td>${escapeHtml((t.createdAt || '').replace('T', ' ').slice(0, 16))}</td>
                      <td>${t.type === 'teacher_upgrade' ? 'Giáo viên Pro' : 'Học sinh Premium'}</td>
                      <td>${escapeHtml(t.submitterName || '—')}</td>
                      <td>${escapeHtml(t.submitterContact || '—')}</td>
                      <td>${formatVnd(t.amount)}</td>
                      <td>${escapeHtml(t.orderCode || '—')}</td>
                      <td>${t.referrerTeacherUid ? escapeHtml(nameByUid.get(t.referrerTeacherUid) || t.referrerTeacherUid) : '—'}</td>
                      <td>${statusLabel(t.status)}</td>
                      <td>${t.reviewedAt ? escapeHtml(t.reviewedAt.replace('T', ' ').slice(0, 16)) : '—'}</td>
                      <td>${escapeHtml(t.reviewedBy || '—')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        }
      } catch (e) {
        statsBox.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
        txBox.innerHTML = '';
      }
    }

    // ---------- 👥 Danh sách giáo viên (báo cáo tổng hợp) ----------
    // Đọc từ các collection CÔNG KHAI (teacherProfiles/subscriptions/groups/students) + commissions/
    // paymentSubmissions (chỉ admin đọc được toàn bộ) — KHÔNG đọc "teachers" (có email) trừ lúc cần
    // tra F2 (xem approvePayment) vì đây là báo cáo tổng quan, không cần thông tin riêng tư đó.
    async function buildRosterSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">👥</span>Danh sách giáo viên</h2>
          <p class="hint" style="margin-top:-4px;">Bấm 1 dòng để xem danh sách học sinh của giáo viên đó. ⚠️ = mã giới thiệu phát sinh nhiều đơn bất thường trong 24h gần nhất.</p>
          <div id="teacherRosterBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
      `;
      const box = $('#teacherRosterBody');
      try {
        const [profilesSnap, teachersSnap, subsSnap, groupsSnap, studentsSnap, commissionsSnap, allOrdersSnap] = await Promise.all([
          db.collection('teacherProfiles').get(),
          db.collection('teachers').get(), // admin đọc được toàn bộ (xem firestore.rules) — lấy email
          db.collection('subscriptions').get(),
          db.collection('groups').get(),
          db.collection('students').get(),
          db.collection('commissions').get(),
          db.collection('paymentSubmissions').get()
        ]);

        const emailByUid = new Map(teachersSnap.docs.map((d) => [d.id, d.data().email || '']));
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
        // "Đã giới thiệu" — đếm qua referredByUid công khai (xem auth.js ensureTeacherProfile).
        const referredCountByUid = new Map();
        profilesSnap.docs.forEach((d) => {
          const ref = d.data().referredByUid;
          if (!ref) return;
          referredCountByUid.set(ref, (referredCountByUid.get(ref) || 0) + 1);
        });
        // Cảnh báo nhẹ: > N đơn (giáo viên HOẶC học sinh nâng cấp) trong 24h gần nhất do CÙNG 1
        // giáo viên đứng tên giới thiệu — cả 2 loại gói giờ đều sinh hoa hồng nên đều cần theo dõi.
        const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const recentOrderCountByReferrer = new Map();
        allOrdersSnap.docs.forEach((d) => {
          const o = d.data();
          if (!o.referrerTeacherUid || (o.createdAt || '') < since24h) return;
          recentOrderCountByReferrer.set(o.referrerTeacherUid, (recentOrderCountByReferrer.get(o.referrerTeacherUid) || 0) + 1);
        });

        const rows = profilesSnap.docs.map((d) => {
          const p = d.data();
          const sub = subsByUid.get(d.id) || { tier: 'free' };
          const comm = commissionByUid.get(d.id) || { paid: 0, pending: 0 };
          return {
            uid: d.id, teacherCode: p.teacherCode || '—', name: p.displayName || '(chưa đặt tên)',
            email: emailByUid.get(d.id) || '—',
            tier: sub.tier || 'free', expiresAt: sub.expiresAt || '', referralDisabled: !!sub.referralDisabled,
            studentCount: studentCountByUid.get(d.id) || 0, comm,
            referredCount: referredCountByUid.get(d.id) || 0,
            recentOrders: recentOrderCountByReferrer.get(d.id) || 0
          };
        }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

        if (!rows.length) { box.innerHTML = '<p class="hint">Chưa có giáo viên nào đăng nhập.</p>'; return; }

        box.innerHTML = `
          <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
          <div class="roster-table-wrap">
            <table class="roster-table">
              <thead>
                <tr><th>Mã GV</th><th>Tên</th><th>Email</th><th>Trạng thái gói</th><th>Số học sinh</th><th>Đã giới thiệu</th><th>Hoa hồng đã trả</th><th>Hoa hồng chưa trả</th><th></th><th></th></tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td>${escapeHtml(r.teacherCode)}</td>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${escapeHtml(r.email)}</td>
                    <td>${r.tier === 'pro' ? `Pro (hết hạn ${escapeHtml(r.expiresAt.slice(0, 10))})` : 'Miễn phí'}</td>
                    <td>${r.studentCount}</td>
                    <td>${r.referredCount}${r.recentOrders > ADMIN_FRAUD_ORDER_THRESHOLD_24H ? ` <span title="${r.recentOrders} đơn trong 24h qua">⚠️</span>` : ''}</td>
                    <td>${formatVnd(r.comm.paid)}</td>
                    <td>${formatVnd(r.comm.pending)}</td>
                    <td><button class="btn roster-expand-btn" type="button" data-uid="${r.uid}">👥 Xem học sinh</button></td>
                    <td><button class="btn referral-lock-btn" type="button" data-uid="${r.uid}" data-disabled="${r.referralDisabled ? '1' : '0'}">${r.referralDisabled ? '🔓 Mở lại mã' : '🔒 Khoá mã'}</button></td>
                  </tr>
                  <tr id="roster-students-${r.uid}" style="display:none;"><td colspan="10"></td></tr>
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
            const [subs, codes] = await Promise.all([
              Promise.all(students.map((s) => getStudentSubscription(s.studentUid))),
              Promise.all(students.map((s) => getAccountCode(s.studentUid)))
            ]);
            cell.innerHTML = `
              <div class="roster-table-wrap">
                <table class="roster-table">
                  <thead>
                    <tr><th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Email</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Gói</th></tr>
                  </thead>
                  <tbody>
                    ${students.map((s, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td>${escapeHtml(codes[i] || '—')}</td>
                        <td>${escapeHtml(s.studentName || '—')}</td>
                        <td>${escapeHtml(s.email || '—')}</td>
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

        $$('.referral-lock-btn', box).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const uid = btn.dataset.uid;
            const next = btn.dataset.disabled !== '1';
            const label = next ? 'khoá mã giới thiệu' : 'mở lại mã giới thiệu';
            if (!confirm(`Xác nhận ${label} của giáo viên này? Mã bị khoá sẽ không nhận hoa hồng cho các đơn duyệt sau này.`)) return;
            btn.disabled = true;
            try {
              await db.collection('subscriptions').doc(uid).set({ referralDisabled: next }, { merge: true });
              btn.dataset.disabled = next ? '1' : '0';
              btn.textContent = next ? '🔓 Mở lại mã' : '🔒 Khoá mã';
              btn.disabled = false;
            } catch (e) {
              alert('Không lưu được: ' + e.message);
              btn.disabled = false;
            }
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
    // Lưới nút phụ (giống kiểu điều hướng chính) — chỉ mở đúng 1 mục con vào #plansSubPanel.
    async function buildPlansSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">💳</span>Gói &amp; giá</h2>
          <p class="hint" style="margin-top:-4px;">Chọn 1 mục để chỉnh giá / giới hạn.</p>
          <div class="action-grid">
            <button class="btn plans-sub-btn" data-sub="teacher" type="button">🧑‍🏫 Gói giáo viên</button>
            <button class="btn plans-sub-btn" data-sub="student" type="button">🎓 Gói học sinh</button>
            <button class="btn plans-sub-btn" data-sub="free" type="button">🆓 Giới hạn miễn phí</button>
          </div>
        </div>
        <div id="plansSubPanel"></div>
      `;
      let openSub = null;
      $$('.plans-sub-btn', panel).forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.sub;
          const sub = $('#plansSubPanel');
          if (openSub === key) {
            sub.innerHTML = '';
            btn.classList.remove('has-open');
            openSub = null;
            return;
          }
          $$('.plans-sub-btn', panel).forEach((b) => b.classList.remove('has-open'));
          btn.classList.add('has-open');
          openSub = key;
          if (key === 'teacher') renderPlanTiersEditor(sub, 'teacherPlans', '🧑‍🏫 Gói giáo viên (Pro)');
          else if (key === 'student') renderPlanTiersEditor(sub, 'studentPlans', '🎓 Gói học sinh (Premium)');
          else renderFreeLimitsEditor(sub);
        });
      });
    }

    // Form 3 mức (1 tháng/6 tháng/1 năm) dùng chung cho cả gói giáo viên lẫn học sinh —
    // cfgKey là 'teacherPlans' hoặc 'studentPlans' (xem MONETIZATION_DEFAULTS trong monetization.js).
    function renderPlanTiersEditor(container, cfgKey, title) {
      const plans = cfg[cfgKey];
      container.innerHTML = `
        <div class="card">
          <h3 style="margin:0 0 8px;">${escapeHtml(title)}</h3>
          ${PLAN_TIER_ORDER.map((id) => `
            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">
              <p class="hint" style="font-weight:700;margin:0 0 6px;">${escapeHtml(plans[id].label)}</p>
              <div class="field"><label for="tier_${id}_price">Giá (đ)</label><input type="number" id="tier_${id}_price" min="0" step="1000" value="${plans[id].price}" /></div>
              <div class="field"><label for="tier_${id}_period">Số ngày</label><input type="number" id="tier_${id}_period" min="1" step="1" value="${plans[id].periodDays}" /></div>
            </div>
          `).join('')}
          <button class="btn primary block" id="saveTierBtn" style="margin-top:12px;">Lưu</button>
          <div class="result-box" id="saveTierResult"></div>
        </div>
      `;
      $('#saveTierBtn').addEventListener('click', async () => {
        const box = $('#saveTierResult');
        showResult(box, '⏳ Đang lưu...');
        try {
          const updated = {};
          PLAN_TIER_ORDER.forEach((id) => {
            updated[id] = {
              label: plans[id].label,
              price: Math.max(0, Number($(`#tier_${id}_price`).value) || 0),
              periodDays: Math.max(1, Number($(`#tier_${id}_period`).value) || 1)
            };
          });
          await saveMonetizationConfig({ [cfgKey]: updated });
          cfg = await getMonetizationConfig();
          showResult(box, '✅ Đã lưu.');
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });
    }

    function renderFreeLimitsEditor(container) {
      const lim = cfg.teacherFreeLimits;
      container.innerHTML = `
        <div class="card">
          <h3 style="margin:0 0 8px;">🆓 Giới hạn gói miễn phí (giáo viên)</h3>
          <div class="field"><label for="planMaxGroups">Tối đa số nhóm</label><input type="number" id="planMaxGroups" min="0" step="1" value="${lim.maxGroupsFree}" /></div>
          <div class="field"><label for="planMaxStudents">Tối đa số học sinh</label><input type="number" id="planMaxStudents" min="0" step="1" value="${lim.maxStudentsFree}" /></div>
          <div class="field"><label for="planMaxChapters">Tối đa số chương tự soạn</label><input type="number" id="planMaxChapters" min="0" step="1" value="${lim.maxCustomChaptersFree}" /></div>
          <button class="btn primary block" id="saveFreeLimitsBtn" style="margin-top:12px;">Lưu</button>
          <div class="result-box" id="saveFreeLimitsResult"></div>
        </div>
      `;
      $('#saveFreeLimitsBtn').addEventListener('click', async () => {
        const box = $('#saveFreeLimitsResult');
        showResult(box, '⏳ Đang lưu...');
        try {
          await saveMonetizationConfig({
            teacherFreeLimits: {
              maxGroupsFree: Math.max(0, Number($('#planMaxGroups').value) || 0),
              maxStudentsFree: Math.max(0, Number($('#planMaxStudents').value) || 0),
              maxCustomChaptersFree: Math.max(0, Number($('#planMaxChapters').value) || 0)
            }
          });
          cfg = await getMonetizationConfig();
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
          cfg = await getMonetizationConfig();
          showResult(box, '✅ Đã lưu.');
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });
    }

    // ---------- 🧾 Duyệt thanh toán ----------
    // Hoa hồng F1/F2 tạo cho CẢ 2 loại gói — người NHẬN luôn là giáo viên (F1/F2), KHÔNG BAO GIỜ là
    // học sinh (học sinh chỉ là kênh chia sẻ, xem monetization.js). Với gói giáo viên: F1 = người
    // giới thiệu trực tiếp giáo viên mua. Với gói học sinh: F1 = giáo viên chủ nhóm của học sinh đó
    // (chính là người đã đưa app tới tay em học sinh này, dù em có tự chia sẻ lại cho bạn khác thì
    // hoa hồng vẫn về giáo viên, không phải bạn học sinh kia). F2 luôn là người đã giới thiệu F1.
    async function createReferralCommissions(sub, freshCfg, f1Percent, f2Percent, holdDays, nowIso, batch) {
      const f1Uid = sub.referrerTeacherUid || null;
      let f2Uid = null;
      if (f1Uid) {
        try {
          const f1Doc = await db.collection('teachers').doc(f1Uid).get();
          const f1ReferredBy = f1Doc.exists ? f1Doc.data().referredBy : null;
          if (f1ReferredBy) f2Uid = await findTeacherUidByCode(f1ReferredBy);
        } catch (e) { /* không tra được F2 thì bỏ qua, F1 vẫn được trả bình thường */ }
      }

      const holdUntil = new Date(Date.now() + (Number(holdDays) || 0) * 86400000).toISOString();
      const tiers = [];
      if (f1Uid) tiers.push({ uid: f1Uid, tier: 'F1', percent: f1Percent });
      if (f2Uid && f2Uid !== f1Uid) tiers.push({ uid: f2Uid, tier: 'F2', percent: f2Percent });

      for (const t of tiers) {
        // Mã giới thiệu bị admin khoá (nghi gian lận) -> bỏ qua ĐÚNG cấp đó, các cấp khác không ảnh hưởng.
        const subDoc = await db.collection('subscriptions').doc(t.uid).get();
        if (subDoc.exists && subDoc.data().referralDisabled) continue;
        const amount = Math.round((Number(sub.amount) || 0) * t.percent / 100);
        batch.set(db.collection('commissions').doc(), {
          beneficiaryTeacherUid: t.uid, tier: t.tier,
          sourceType: sub.type === 'teacher_upgrade' ? 'teacher_referral' : 'student_referral',
          sourcePaymentId: sub.id, sourceName: sub.submitterName || '', sourceOrderCode: sub.orderCode || '',
          amount, percent: t.percent, status: 'pending_hold', holdUntil, createdAt: nowIso
        });
      }
    }

    async function approvePayment(sub) {
      const freshCfg = await getMonetizationConfig();
      const now = new Date();
      const nowIso = now.toISOString();
      const batch = db.batch();

      // sub.planId do người mua tự chọn lúc gửi yêu cầu (xem upgrade.js) — đơn cũ trước khi có lựa
      // chọn nhiều mức thì mặc định về 'month1' để vẫn duyệt được bình thường.
      const planId = (sub.planId && PLAN_TIER_ORDER.includes(sub.planId)) ? sub.planId : 'month1';

      if (sub.type === 'teacher_upgrade') {
        const periodDays = freshCfg.teacherPlans[planId].periodDays;
        const expiresAt = new Date(now.getTime() + periodDays * 86400000).toISOString();
        batch.set(db.collection('subscriptions').doc(sub.submitterUid),
          { tier: 'pro', expiresAt, updatedAt: nowIso, updatedBy: MONETIZATION_ADMIN_EMAIL }, { merge: true });
        await createReferralCommissions(sub, freshCfg, freshCfg.commission.teacherF1Percent, freshCfg.commission.teacherF2Percent, freshCfg.commission.teacherHoldDays, nowIso, batch);
      } else {
        const periodDays = freshCfg.studentPlans[planId].periodDays;
        const expiresAt = new Date(now.getTime() + periodDays * 86400000).toISOString();
        batch.set(db.collection('studentSubscriptions').doc(sub.submitterStudentUid),
          { tier: 'premium', expiresAt, updatedAt: nowIso }, { merge: true });
        await createReferralCommissions(sub, freshCfg, freshCfg.commission.studentF1Percent, freshCfg.commission.studentF2Percent, freshCfg.commission.studentHoldDays, nowIso, batch);
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
      if (!box) return;
      try {
        const snap = await db.collection('paymentSubmissions').where('status', '==', 'pending').get();
        const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        if (!list.length) { box.innerHTML = '<p class="hint">Không có yêu cầu nào đang chờ duyệt.</p>'; return; }
        box.innerHTML = list.map((sub) => `
          <div class="card" style="margin-top:10px;background:rgba(20,184,166,0.06);">
            <div style="font-weight:700;">${sub.type === 'teacher_upgrade' ? '👩‍🏫 Giáo viên nâng cấp Pro' : '🎓 Học sinh nâng cấp Premium'}</div>
            ${sub.orderCode ? `<div class="hint">Mã đơn hàng: <strong style="color:var(--brand);letter-spacing:0.05em;">${escapeHtml(sub.orderCode)}</strong> — đối chiếu với nội dung chuyển khoản</div>` : ''}
            <div class="hint">${escapeHtml(sub.submitterName || '')} · ${escapeHtml(sub.submitterContact || '')}</div>
            <div class="hint">Số tiền: <strong>${formatVnd(sub.amount)}</strong>${sub.referrerTeacherUid ? ' · Có giáo viên giới thiệu (sẽ tự sinh hoa hồng F1/F2 khi duyệt)' : ''}</div>
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

    // ---------- 💰 Hoa hồng ----------
    // 1 hub gộp cả 3 mục liên quan hoa hồng (trước đây là 3 nút riêng: "Gói & giá" phần %, "Duyệt
    // thanh toán", "Lịch sử % hoa hồng") — cùng kiểu lưới nút phụ như buildPlansSection ở trên.
    async function buildCommissionsSection(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2><span class="icon">💰</span>Hoa hồng</h2>
          <div class="action-grid">
            <button class="btn comm-sub-btn" data-sub="settings" type="button">⚙️ Cài đặt hoa hồng</button>
            <button class="btn comm-sub-btn" data-sub="history" type="button">🧾 Lịch sử chi trả hoa hồng</button>
            <button class="btn comm-sub-btn" data-sub="pending" type="button">📋 Chờ duyệt</button>
          </div>
        </div>
        <div id="commSubPanel"></div>
      `;
      let openSub = null;
      $$('.comm-sub-btn', panel).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.sub;
          const sub = $('#commSubPanel');
          if (openSub === key) {
            sub.innerHTML = '';
            btn.classList.remove('has-open');
            openSub = null;
            return;
          }
          $$('.comm-sub-btn', panel).forEach((b) => b.classList.remove('has-open'));
          btn.classList.add('has-open');
          openSub = key;
          sub.innerHTML = '<div class="card"><p class="hint">⏳ Đang tải...</p></div>';
          try {
            if (key === 'settings') {
              await renderCommissionSettings(sub);
            } else if (key === 'history') {
              sub.innerHTML = `<div class="card"><h3 style="margin:0 0 8px;">🧾 Lịch sử chi trả hoa hồng</h3><div id="commissionsBody"><p class="hint">⏳ Đang tải...</p></div></div>`;
              await renderCommissions();
            } else {
              sub.innerHTML = `<div class="card"><h3 style="margin:0 0 8px;">📋 Chờ duyệt</h3><div id="pendingPaymentsBody"><p class="hint">⏳ Đang tải...</p></div></div>`;
              await renderPendingPayments();
            }
          } catch (e) {
            sub.innerHTML = `<div class="card"><p class="hint">⚠️ ${escapeHtml(e.message)}</p></div>`;
          }
        });
      });
    }

    // ---------- ⚙️ Cài đặt hoa hồng (sub-mục trong "💰 Hoa hồng") ----------
    async function renderCommissionSettings(container) {
      container.innerHTML = `
        <div class="card">
          <h3 style="margin:0 0 8px;">⚙️ Cài đặt hoa hồng</h3>
          <p class="hint" style="font-weight:700;margin:0 0 -2px;">Khi giáo viên mua gói Pro — người nhận LUÔN LÀ giáo viên (F1: người giới thiệu trực tiếp, F2: người giới thiệu F1)</p>
          <div class="field"><label for="commissionTF1">Hoa hồng cấp 1 (F1) %</label><input type="number" id="commissionTF1" min="0" max="100" step="1" value="${cfg.commission.teacherF1Percent}" /></div>
          <div class="field"><label for="commissionTF2">Hoa hồng cấp 2 (F2) %</label><input type="number" id="commissionTF2" min="0" max="100" step="1" value="${cfg.commission.teacherF2Percent}" /></div>
          <div class="field"><label for="commissionTHold">Số ngày giữ trước khi được rút</label><input type="number" id="commissionTHold" min="0" step="1" value="${cfg.commission.teacherHoldDays}" /></div>
          <p class="hint" style="font-weight:700;margin:14px 0 -2px;">Khi học sinh mua gói Premium — học sinh KHÔNG nhận hoa hồng (chỉ là kênh chia sẻ); F1 = giáo viên chủ nhóm của học sinh đó, F2 = người giới thiệu giáo viên đó</p>
          <div class="field"><label for="commissionSF1">Hoa hồng cấp 1 (F1) %</label><input type="number" id="commissionSF1" min="0" max="100" step="1" value="${cfg.commission.studentF1Percent}" /></div>
          <div class="field"><label for="commissionSF2">Hoa hồng cấp 2 (F2) %</label><input type="number" id="commissionSF2" min="0" max="100" step="1" value="${cfg.commission.studentF2Percent}" /></div>
          <div class="field"><label for="commissionSHold">Số ngày giữ trước khi được rút</label><input type="number" id="commissionSHold" min="0" step="1" value="${cfg.commission.studentHoldDays}" /></div>
          <button class="btn primary block" id="saveCommissionBtn" style="margin-top:8px;">Lưu cài đặt hoa hồng</button>
          <div class="result-box" id="saveCommissionResult"></div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 8px;">📜 Lịch sử thay đổi</h3>
          <div id="rateHistoryBody"><p class="hint">⏳ Đang tải...</p></div>
        </div>
      `;
      $('#saveCommissionBtn').addEventListener('click', async () => {
        const box = $('#saveCommissionResult');
        showResult(box, '⏳ Đang lưu...');
        try {
          const pct = (id) => Math.min(100, Math.max(0, Number($(id).value) || 0));
          const commission = {
            teacherF1Percent: pct('#commissionTF1'),
            teacherF2Percent: pct('#commissionTF2'),
            teacherHoldDays: Math.max(0, Number($('#commissionTHold').value) || 0),
            studentF1Percent: pct('#commissionSF1'),
            studentF2Percent: pct('#commissionSF2'),
            studentHoldDays: Math.max(0, Number($('#commissionSHold').value) || 0)
          };
          await saveCommissionRate(commission, MONETIZATION_ADMIN_EMAIL);
          cfg = await getMonetizationConfig();
          showResult(box, '✅ Đã lưu.');
          await renderRateHistory();
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });
      await renderRateHistory();
    }

    async function renderRateHistory() {
      const box = $('#rateHistoryBody');
      if (!box) return;
      try {
        const snap = await db.collection('commissionRateHistory').get();
        const list = snap.docs.map((d) => d.data()).sort((a, b) => (b.changedAt || '').localeCompare(a.changedAt || ''));
        if (!list.length) { box.innerHTML = '<p class="hint">Chưa có thay đổi nào — vẫn đang dùng mức mặc định.</p>'; return; }
        box.innerHTML = list.map((r) => `
          <div class="hint" style="padding:8px 0;border-top:1px solid var(--border);">
            ${escapeHtml((r.changedAt || '').replace('T', ' ').slice(0, 16))} —
            Giáo viên: F1 ${r.teacherF1Percent}%/F2 ${r.teacherF2Percent}% (giữ ${r.teacherHoldDays} ngày) ·
            Học sinh: F1 ${r.studentF1Percent}%/F2 ${r.studentF2Percent}% (giữ ${r.studentHoldDays} ngày)
            <span style="color:var(--text-faint);">(${escapeHtml(r.changedBy || '')})</span>
          </div>
        `).join('');
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
      }
    }

    async function renderCommissions() {
      const box = $('#commissionsBody');
      if (!box) return;
      box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
      try {
        const promoted = await promoteMaturedCommissions();
        const snap = await db.collection('commissions').get();
        const list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (!list.length) { box.innerHTML = '<p class="hint">Chưa có hoa hồng nào phát sinh.</p>'; return; }

        const groups = [
          { status: 'pending_hold', label: '⏳ Chờ giữ' },
          { status: 'available', label: '✅ Sẵn sàng rút' },
          { status: 'paid', label: '💰 Đã trả' }
        ];
        const rowHtml = (c) => `
          <div class="card" style="margin-top:10px;${c.status === 'paid' ? 'opacity:0.6;' : ''}">
            <div style="font-weight:700;">${formatVnd(c.amount)} · ${c.tier || '—'} · ${c.percent}%</div>
            <div class="hint">Người hưởng (uid): ${escapeHtml(c.beneficiaryTeacherUid || '')}</div>
            <div class="hint">Nguồn: ${escapeHtml(c.sourceName || '')}${c.sourceOrderCode ? ` · Đơn ${escapeHtml(c.sourceOrderCode)}` : ''}</div>
            ${c.status === 'pending_hold' ? `<div class="hint">Được rút từ: ${escapeHtml((c.holdUntil || '').slice(0, 10))}</div>` : ''}
            ${c.status === 'available' ? `<button class="btn primary mark-paid-btn" data-id="${c.id}" type="button" style="margin-top:8px;">Đánh dấu đã trả</button>` : ''}
          </div>
        `;
        box.innerHTML = `
          ${promoted ? `<p class="hint">✓ Vừa chuyển ${promoted} khoản hoa hồng sang "Sẵn sàng rút".</p>` : ''}
          ${groups.map((g) => {
            const items = list.filter((c) => (c.status || 'pending') === g.status || (g.status === 'pending_hold' && c.status === 'pending'));
            if (!items.length) return '';
            const total = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);
            return `<div class="hint" style="font-weight:700;margin:14px 0 4px;">${g.label} — ${formatVnd(total)}</div>${items.map(rowHtml).join('')}`;
          }).join('')}
        `;
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
