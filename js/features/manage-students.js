// Trang "Quản lý học sinh":
// 1) "Học sinh chờ duyệt" — gồm 2 loại: (a) xin vào 1 nhóm CỤ THỂ bằng mã nhóm (có groupCode sẵn) —
//    giáo viên chỉ cần Duyệt/Từ chối; (b) đăng ký bằng MÃ GIÁO VIÊN, chưa rõ nhóm nào — giáo viên
//    chọn 1 nhóm có sẵn để xếp vào, hoặc xoá nếu đăng ký nhầm/spam.
// 2) "Học sinh đã có trong nhóm" — gộp TẤT CẢ học sinh đã ở trong nhóm nào đó thành 1 danh sách
//    (1 học sinh có thể xuất hiện với nhiều nhóm nếu học cùng lúc nhiều nhóm).

(function () {
  requireTeacherAuth(async (user) => {
    const pendingCard = $('#pendingRegistrationsCard');
    const pendingBody = $('#pendingRegistrationsBody');
    const assignedBody = $('#manageStudentsBody');

    let groups = [];
    try { groups = await listGroupsForCurrentTeacher(); } catch (e) { /* xử lý khi render */ }

    async function renderPending() {
      let pending = [];
      try {
        pending = await getPendingRegistrationsForCurrentTeacher();
      } catch (e) {
        pendingCard.style.display = 'block';
        pendingBody.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
        return;
      }

      if (!pending.length) { pendingCard.style.display = 'none'; return; }
      pendingCard.style.display = 'block';

      const groupOptions = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)} (${escapeHtml(g.groupCode)})</option>`).join('');

      // Có groupCode sẵn = học sinh xin vào 1 nhóm CỤ THỂ bằng mã nhóm (chỉ cần duyệt/từ chối).
      // Không có groupCode = đăng ký bằng mã giáo viên, chưa rõ nhóm nào (cần chọn nhóm để xếp vào).
      pendingBody.innerHTML = pending.map((r) => `
        <div class="card" style="margin-top:10px;background:rgba(220,38,38,0.06);">
          <div style="font-weight:700;">${escapeHtml(r.studentName || '')}</div>
          <div class="hint">${escapeHtml(r.school || '')} · Lớp ${escapeHtml(r.className || '')} · ${escapeHtml(r.phone || '')}</div>
          <div class="hint">${escapeHtml(r.address || '')}</div>
          ${r.groupCode ? `
            <div class="hint" style="margin-top:6px;">Xin vào nhóm: <strong>${escapeHtml(r.groupName || r.groupCode)}</strong> (mã ${escapeHtml(r.groupCode)})</div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn primary approve-btn" data-reg="${r.id}" type="button" style="flex:1;">✅ Duyệt vào nhóm</button>
              <button class="btn reject-btn" data-reg="${r.id}" type="button">❌ Từ chối</button>
            </div>
          ` : groups.length ? `
            <div class="btn-row" style="margin-top:8px;">
              <select class="assign-group-select" data-reg="${r.id}" style="flex:1;">${groupOptions}</select>
              <button class="btn primary assign-btn" data-reg="${r.id}" type="button">Xếp vào nhóm</button>
            </div>
            <button class="btn reject-btn" data-reg="${r.id}" type="button" style="margin-top:8px;">Xoá đăng ký này</button>
          ` : `
            <p class="hint" style="margin-top:8px;">⚠️ Bạn chưa có nhóm nào — vào "Nhóm học sinh" tạo nhóm trước.</p>
            <button class="btn reject-btn" data-reg="${r.id}" type="button" style="margin-top:8px;">Xoá đăng ký này</button>
          `}
          <div class="result-box" id="reg-result-${r.id}"></div>
        </div>
      `).join('');

      $$('.assign-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          const reg = pending.find((r) => r.id === regId);
          const select = document.querySelector(`.assign-group-select[data-reg="${regId}"]`);
          const box = document.getElementById(`reg-result-${regId}`);
          showResult(box, '⏳ Đang xếp vào nhóm...');
          try {
            await assignRegistrationToGroup(reg, select.value);
            showResult(box, '✓ Đã xếp vào nhóm!');
            await renderPending();
            await renderAssigned();
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
      $$('.approve-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          const reg = pending.find((r) => r.id === regId);
          const box = document.getElementById(`reg-result-${regId}`);
          showResult(box, '⏳ Đang duyệt...');
          try {
            await assignRegistrationToGroup(reg, reg.groupCode);
            showResult(box, '✓ Đã duyệt vào nhóm!');
            await renderPending();
            await renderAssigned();
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
      $$('.reject-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          if (!confirm('Từ chối/xoá yêu cầu này? Học sinh sẽ không được vào nhóm.')) return;
          const box = document.getElementById(`reg-result-${regId}`);
          showResult(box, '⏳ Đang xử lý...');
          try {
            await rejectRegistration(regId);
            await renderPending();
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
    }

    async function renderAssigned() {
      assignedBody.innerHTML = '<p class="hint">⏳ Đang tải danh sách học sinh...</p>';
      let students = [];
      try {
        students = await getAllStudentsForCurrentTeacher();
      } catch (e) {
        assignedBody.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
        return;
      }

      if (!students.length) {
        assignedBody.innerHTML = '<p class="hint">Chưa có học sinh nào trong nhóm.</p>';
        return;
      }

      const rows = students.map((s, i) => {
        const groupsText = s.groups.map((g) => escapeHtml(g.groupName)).join(', ');
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(s.studentName || '')}</td>
            <td>${escapeHtml(s.school || '')}</td>
            <td>${escapeHtml(s.className || '')}</td>
            <td>${escapeHtml(s.address || '')}</td>
            <td>${escapeHtml(s.phone || '')}</td>
            <td>${groupsText}</td>
            <td>${escapeHtml((s.latestJoinedAt || '').slice(0, 10))}</td>
          </tr>
        `;
      }).join('');

      assignedBody.innerHTML = `
        <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead>
              <tr><th>STT</th><th>Họ tên</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Nhóm đang học</th><th>Vào nhóm gần nhất</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    $('#pendingCreateGroupToggleBtn').addEventListener('click', () => {
      const form = $('#pendingCreateGroupForm');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    $('#pendingCreateGroupBtn').addEventListener('click', async () => {
      const name = $('#pendingNewGroupName').value.trim();
      const grade = Number($('#pendingNewGroupGrade').value);
      const box = $('#pendingCreateGroupResult');
      if (!name) { showResult(box, '⚠️ Nhập tên nhóm.', true); return; }
      showResult(box, '⏳ Đang tạo nhóm...');
      try {
        const group = await createGroupForCurrentTeacher(name, grade, []);
        groups.push(group);
        showResult(box, `✓ Đã tạo nhóm "${escapeHtml(name)}" — mã ${escapeHtml(group.groupCode)}. Đã có thể xếp học sinh vào nhóm này.`);
        $('#pendingNewGroupName').value = '';
        await renderPending();
        setTimeout(() => {
          $('#pendingCreateGroupForm').style.display = 'none';
          hideResult(box);
        }, 2200);
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
      }
    });

    await renderPending();
    await renderAssigned();
  });
})();
