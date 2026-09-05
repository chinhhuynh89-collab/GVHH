// Trang "Quản lý học sinh" — bố cục dạng lưới nút gọn (giống trang Quản trị): bấm nút nào chỉ mở
// đúng khung nội dung của mục đó, nút khác tự đóng lại. 3 mục:
// 1) "📋 Nạp danh sách" — nạp cả lớp từ file Excel/CSV, tự cấp tài khoản mã học sinh + mật khẩu
//    hàng loạt (xem js/features/teacher-student-accounts.js).
// 2) "🆕 Chờ duyệt" — gồm 2 loại: (a) xin vào 1 nhóm CỤ THỂ bằng mã nhóm (có groupCode sẵn) — chỉ
//    cần Duyệt/Từ chối; (b) đăng ký bằng MÃ GIÁO VIÊN, chưa rõ nhóm nào — chọn 1 nhóm có sẵn để xếp
//    vào, hoặc xoá nếu đăng ký nhầm/spam. Hiện sẵn số lượng ở huy hiệu trên nút dù chưa mở, để biết
//    ngay có việc cần xử lý.
// 3) "🧑‍🎓 Danh sách" — gộp TẤT CẢ học sinh đã ở trong nhóm nào đó thành 1 danh sách (1 học sinh có
//    thể xuất hiện với nhiều nhóm nếu học cùng lúc nhiều nhóm).

(function () {
  let ownPrograms = []; // chương trình riêng do giáo viên tự tạo — dùng ở 2 form tạo nhóm nhanh bên dưới

  // Bỏ dấu tiếng Việt + thường hoá để tìm kiếm không phân biệt dấu/hoa-thường (gõ "an" vẫn ra "Ẩn", "Ân"...).
  function normalizeSearchText(str) {
    return (str || '').toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');
  }

  // Tạo lựa chọn "khối lớp mặc định" HOẶC "chương trình riêng" trong 1 <select> duy nhất — dùng cho
  // 2 form tạo nhóm nhanh bên dưới (chờ duyệt / nạp danh sách). value dạng "g:<số khối>" (khối mặc
  // định) hoặc "p:<id chương trình>" (chương trình riêng do giáo viên tự tạo, xem programs-data.js) —
  // trước đây 2 form này CHỈ cho chọn khối 6-12, không có cách nào chọn chương trình riêng.
  function gradeOrProgramOptionsHtml() {
    const gradesHtml = [6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="g:${g}">Lớp ${g}</option>`).join('');
    const programsHtml = ownPrograms.map((p) => `<option value="p:${p.id}">${escapeHtml(p.icon || '🎓')} ${escapeHtml(p.name)}</option>`).join('');
    return `
      <optgroup label="Khối lớp mặc định">${gradesHtml}</optgroup>
      ${ownPrograms.length ? `<optgroup label="Chương trình riêng của tôi">${programsHtml}</optgroup>` : ''}
    `;
  }

  // Từ giá trị select ở trên -> { grade, chapterIds } để truyền thẳng vào createGroupForCurrentTeacher.
  // Chọn chương trình riêng -> gán LUÔN toàn bộ chương của chương trình đó cho nhóm mới, khỏi phải
  // vào lại "Nhóm học sinh" chọn tay lần nữa. Chọn khối mặc định -> giữ hành vi cũ (chưa gán chương
  // nào, chọn sau).
  async function resolveGradeOrProgramValue(rawValue) {
    if (rawValue.startsWith('p:')) {
      const programId = rawValue.slice(2);
      const program = ownPrograms.find((p) => p.id === programId);
      const chapters = await getProgramChapters(programId);
      return { grade: program ? program.name : 'Chương trình riêng', chapterIds: chapters.map((c) => c.id) };
    }
    return { grade: Number(rawValue.slice(2)), chapterIds: [] };
  }

  requireTeacherAuth(async (user) => {
    let groups = [];
    try { groups = await listGroupsForCurrentTeacher(); } catch (e) { /* xử lý khi render */ }
    try { ownPrograms = await listProgramsForCurrentTeacher(); } catch (e) { /* xử lý khi render */ }

    // Đếm nhanh số học sinh chờ duyệt ngay lúc tải trang để hiện huy hiệu trên nút — không cần bấm
    // mở mới biết có việc cần xử lý.
    try {
      const pending = await getPendingRegistrationsForCurrentTeacher();
      if (pending.length) {
        const badge = $('#pendingCountBadge');
        badge.textContent = pending.length > 99 ? '99+' : String(pending.length);
        badge.style.display = 'flex';
      }
    } catch (e) { /* ignore */ }

    // ---------- Điều hướng: 1 khung nội dung duy nhất, đổi theo nút vừa bấm ----------
    let openSub = null;
    $$('.manage-sub-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.sub;
        const panel = $('#manageSubPanel');
        if (openSub === key) {
          panel.innerHTML = '';
          btn.classList.remove('has-open');
          openSub = null;
          return;
        }
        $$('.manage-sub-btn').forEach((b) => b.classList.remove('has-open'));
        btn.classList.add('has-open');
        openSub = key;
        panel.innerHTML = '<div class="card"><p class="hint">⏳ Đang tải...</p></div>';
        try {
          if (key === 'import') await renderImportPanel(panel);
          else if (key === 'pending') await renderPendingPanel(panel);
          else await renderRosterPanel(panel);
        } catch (e) {
          panel.innerHTML = `<div class="card"><p class="hint">⚠️ ${escapeHtml(e.message)}</p></div>`;
        }
      });
    });

    // ---------- 🆕 Chờ duyệt ----------
    async function renderPendingPanel(panel) {
      let pending = [];
      try {
        pending = await getPendingRegistrationsForCurrentTeacher();
      } catch (e) {
        panel.innerHTML = `<div class="card"><p class="hint">⚠️ ${escapeHtml(e.message)}</p></div>`;
        return;
      }

      const badge = $('#pendingCountBadge');
      if (pending.length) { badge.textContent = pending.length > 99 ? '99+' : String(pending.length); badge.style.display = 'flex'; }
      else badge.style.display = 'none';

      if (!pending.length) {
        panel.innerHTML = '<div class="card"><p class="hint">Không có học sinh nào đang chờ duyệt.</p></div>';
        return;
      }

      const groupOptions = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)} (${escapeHtml(g.groupCode)})</option>`).join('');

      panel.innerHTML = `
        <div class="card">
          <h2 style="margin-top:0;"><span class="icon">🆕</span>Học sinh chờ duyệt</h2>
          <p class="hint" style="margin-top:-4px;">Học sinh xin vào 1 nhóm cụ thể (bằng mã nhóm) chỉ cần bạn duyệt/từ chối; học sinh đăng ký bằng mã giáo viên (chưa rõ nhóm) thì bạn chọn 1 nhóm để xếp vào.</p>
          <div id="pendingRegistrationsBody">
            ${pending.map((r) => `
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
            `).join('')}
          </div>

          <button class="btn block" id="pendingCreateGroupToggleBtn" type="button" style="margin-top:12px;">➕ Chưa có nhóm phù hợp? Tạo nhóm mới</button>
          <div id="pendingCreateGroupForm" style="display:none;margin-top:10px;">
            <div class="field">
              <label for="pendingNewGroupName">Tên nhóm</label>
              <input type="text" id="pendingNewGroupName" placeholder="VD: 6A1 - Trường THCS ABC" />
            </div>
            <div class="field">
              <label for="pendingNewGroupGrade">Khối lớp / chương trình</label>
              <select id="pendingNewGroupGrade">${gradeOrProgramOptionsHtml()}</select>
            </div>
            <p class="hint" style="margin-top:-2px;">Chọn khối mặc định: nhóm mới chưa có chương trình học, vào "Nhóm học sinh" để chọn chương sau. Chọn 1 chương trình riêng: tự gán luôn toàn bộ chương của chương trình đó cho nhóm.</p>
            <button class="btn primary block" id="pendingCreateGroupBtn" type="button">Tạo nhóm</button>
            <div class="result-box" id="pendingCreateGroupResult"></div>
          </div>
        </div>
      `;

      $$('.assign-btn', panel).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          const reg = pending.find((r) => r.id === regId);
          const select = panel.querySelector(`.assign-group-select[data-reg="${regId}"]`);
          const box = panel.querySelector(`#reg-result-${regId}`);
          showResult(box, '⏳ Đang xếp vào nhóm...');
          try {
            await assignRegistrationToGroup(reg, select.value);
            showResult(box, '✓ Đã xếp vào nhóm!');
            await renderPendingPanel(panel);
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
      $$('.approve-btn', panel).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          const reg = pending.find((r) => r.id === regId);
          const box = panel.querySelector(`#reg-result-${regId}`);
          showResult(box, '⏳ Đang duyệt...');
          try {
            await assignRegistrationToGroup(reg, reg.groupCode);
            showResult(box, '✓ Đã duyệt vào nhóm!');
            await renderPendingPanel(panel);
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
      $$('.reject-btn', panel).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const regId = btn.dataset.reg;
          if (!confirm('Từ chối/xoá yêu cầu này? Học sinh sẽ không được vào nhóm.')) return;
          const box = panel.querySelector(`#reg-result-${regId}`);
          showResult(box, '⏳ Đang xử lý...');
          try {
            await rejectRegistration(regId);
            await renderPendingPanel(panel);
          } catch (e) {
            showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });

      $('#pendingCreateGroupToggleBtn', panel).addEventListener('click', () => {
        const form = $('#pendingCreateGroupForm', panel);
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
      $('#pendingCreateGroupBtn', panel).addEventListener('click', async () => {
        const name = $('#pendingNewGroupName', panel).value.trim();
        const box = $('#pendingCreateGroupResult', panel);
        if (!name) { showResult(box, '⚠️ Nhập tên nhóm.', true); return; }
        showResult(box, '⏳ Đang tạo nhóm...');
        try {
          const { grade, chapterIds } = await resolveGradeOrProgramValue($('#pendingNewGroupGrade', panel).value);
          const group = await createGroupForCurrentTeacher(name, grade, chapterIds);
          groups.push(group);
          showResult(box, `✓ Đã tạo nhóm "${escapeHtml(name)}" — mã ${escapeHtml(group.groupCode)}. Đã có thể xếp học sinh vào nhóm này.`);
          setTimeout(() => renderPendingPanel(panel), 1400);
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });
    }

    // ---------- 🧑‍🎓 Danh sách học sinh đã có trong nhóm ----------
    async function renderRosterPanel(panel) {
      panel.innerHTML = `<div class="card"><h2 style="margin-top:0;"><span class="icon">🧑‍🎓</span>Học sinh đã có trong nhóm</h2><p class="hint" style="margin-top:-4px;">Gộp tất cả học sinh ở mọi nhóm của bạn thành 1 danh sách — 1 học sinh có thể xuất hiện kèm nhiều nhóm nếu học cùng lúc nhiều nhóm.</p><div id="manageStudentsBody"><p class="hint">⏳ Đang tải danh sách học sinh...</p></div></div>`;
      const assignedBody = $('#manageStudentsBody', panel);

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

      const codes = await Promise.all(students.map((s) => getAccountCode(s.studentUid)));
      // Học sinh dùng tài khoản do giáo viên cấp đã có sẵn "loginCode" (VD ABC123.07) làm mã định
      // danh riêng, dễ nhận ra hơn hẳn mã "HS..." chung chung — ưu tiên hiện mã đó ở cột "Mã HS" thay
      // vì mã chung (chỉ học sinh tự đăng ký bằng Google mới cần dùng đến mã chung, xem auth.js).
      const displayCodes = students.map((s, i) => s.loginCode || codes[i]);

      const groupOptionsHtml = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)}</option>`).join('');

      let sortMode = 'recent'; // 'recent' (mới vào nhóm gần đây nhất trước) | 'name' (tên A-Z)

      function sortedIndexes() {
        const idx = students.map((_, i) => i);
        if (sortMode === 'name') {
          idx.sort((a, b) => (students[a].studentName || '').localeCompare(students[b].studentName || '', 'vi'));
        } else {
          idx.sort((a, b) => (students[b].latestJoinedAt || '').localeCompare(students[a].latestJoinedAt || ''));
        }
        return idx;
      }

      function buildRowHtml(s, code, sttPlaceholder) {
        // Nhóm đã bị xoá (xem deleteGroup() — xoá nhóm không còn xoá học sinh nữa) có groupName =
        // null — ghi rõ "(Nhóm đã xoá)" thay vì để trống khó hiểu, học sinh đó vẫn còn nguyên để xếp
        // vào nhóm khác. Học sinh nạp lên chưa xếp nhóm (unassigned) ghi rõ "Chưa xếp nhóm".
        const groupsText = s.groups.map((g) => escapeHtml(g.unassigned ? 'Chưa xếp nhóm' : (g.groupName || '(Nhóm đã xoá)'))).join(', ');
        const zaloDigits = (s.phone || '').replace(/[^0-9]/g, '');
        // Chuỗi tìm kiếm gộp sẵn (tên, mã HS, mã đăng nhập, SĐT) — bỏ dấu + thường hoá 1 lần lúc render
        // thay vì tính lại mỗi lần gõ phím, lọc theo dataset ngay trên DOM cho mượt (giống Excel).
        const searchText = normalizeSearchText([s.studentName, code, s.loginCode, s.phone].filter(Boolean).join(' '));
        // Học sinh "Chưa xếp nhóm" (nạp lên chọn "Chưa xếp nhóm" lúc đó) cần 1 cách xếp vào nhóm SAU —
        // trước đây chỉ xếp được lúc TẠO nhóm mới (chọn học sinh có sẵn), không có cách nào xếp vào 1
        // nhóm ĐÃ CÓ SẴN, khiến các học sinh này "mắc kẹt" không hiện trong bất kỳ nhóm nào.
        const unassignedGroup = s.groups.find((g) => g.unassigned);
        return `
          <tr data-search="${escapeHtml(searchText)}" data-uid="${escapeHtml(s.studentUid)}">
            <td class="stt-cell">${sttPlaceholder}</td>
            <td>${escapeHtml(code || '—')}</td>
            <td>${escapeHtml(s.studentName || '')}</td>
            <td>${escapeHtml(s.email || '')}</td>
            <td>${escapeHtml(s.school || '')}</td>
            <td>${escapeHtml(s.className || '')}</td>
            <td>${escapeHtml(s.address || '')}</td>
            <td>${escapeHtml(s.phone || '')}</td>
            <td>${groupsText}</td>
            <td>${escapeHtml((s.latestJoinedAt || '').slice(0, 10))}</td>
            <td>
              ${zaloDigits ? `<a class="btn" href="https://zalo.me/${escapeHtml(zaloDigits)}" target="_blank" rel="noopener">💬 Zalo</a>` : ''}
              ${s.loginCode ? `<button class="btn replace-login-btn" type="button" data-uid="${escapeHtml(s.studentUid)}" style="margin-top:4px;">🔑 Cấp mã thay thế</button>` : ''}
              ${unassignedGroup && groups.length ? `
                <button class="btn assign-group-toggle-btn" type="button" data-doc-id="${escapeHtml(unassignedGroup.docId)}" data-uid="${escapeHtml(s.studentUid)}" style="margin-top:4px;">📥 Xếp vào nhóm</button>
                <div class="assign-group-form" style="display:none;">
                  <select class="assign-group-select-inline">${groupOptionsHtml}</select>
                  <button class="btn primary assign-group-confirm-btn" type="button">Xếp vào nhóm này</button>
                </div>
              ` : ''}
              <button class="btn delete-student-btn" type="button" data-doc-ids="${escapeHtml(s.docIds.join(','))}" data-name="${escapeHtml(s.studentName || '')}" style="margin-top:4px;color:#dc2626;">🗑️ Xoá học sinh</button>
              <div class="result-box" id="replace-login-result-${escapeHtml(s.studentUid)}"></div>
            </td>
          </tr>
        `;
      }

      // Đánh lại số thứ tự (cột STT) đúng theo vị trí HIỆN CÓ trong bảng — gọi lại ngay sau khi xoá
      // 1 dòng để không còn để trống số cũ (VD xoá dòng 3 thì dòng 4 trở đi phải lùi lên thành 3, 4...
      // chứ không nhảy cóc 1,2,4,5).
      function renumberRows() {
        $$('#studentRosterBody tr', assignedBody).forEach((tr, idx) => {
          const cell = tr.querySelector('.stt-cell');
          if (cell) cell.textContent = idx + 1;
        });
      }

      function wireRowButtons() {
        $$('.assign-group-toggle-btn', assignedBody).forEach((btn) => {
          btn.addEventListener('click', () => {
            const form = btn.nextElementSibling;
            if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
          });
        });
        $$('.assign-group-confirm-btn', assignedBody).forEach((confirmBtn) => {
          confirmBtn.addEventListener('click', async () => {
            const form = confirmBtn.closest('.assign-group-form');
            const toggleBtn = form.previousElementSibling;
            const docId = toggleBtn.dataset.docId;
            const uid = toggleBtn.dataset.uid;
            const groupCode = form.querySelector('.assign-group-select-inline').value;
            const s = students.find((x) => x.studentUid === uid);
            confirmBtn.disabled = true;
            try {
              await assignUnassignedStudentToGroup(docId, groupCode, s);
              showToast(`Đã xếp "${s.studentName}" vào nhóm.`, false);
              await renderRosterPanel(panel);
            } catch (e) {
              showToast('Không xếp được: ' + e.message);
              confirmBtn.disabled = false;
            }
          });
        });

        $$('.delete-student-btn', assignedBody).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const docIds = btn.dataset.docIds ? btn.dataset.docIds.split(',') : [];
            const name = btn.dataset.name;
            if (!confirm(`Xoá HẲN học sinh "${name}" khỏi mọi nhóm? Không thể hoàn tác — tiến độ học/gói đã mua của tài khoản này vẫn còn (không mất) nhưng sẽ không còn hiện trong bất kỳ nhóm nào của bạn nữa.`)) return;
            btn.disabled = true;
            try {
              await deleteStudentEverywhere(docIds);
              // Chỉ xoá ĐÚNG dòng vừa bấm khỏi bảng — trước đây vẽ lại TOÀN BỘ danh sách
              // (renderRosterPanel(panel)) sau mỗi lần xoá, làm mất vị trí đang cuộn tới (nhảy về đầu
              // trang) và không có xác nhận rõ ràng đã xoá xong, khiến giáo viên tưởng bấm không có
              // tác dụng khi đang xoá nhiều học sinh liên tiếp trong danh sách dài.
              const row = btn.closest('tr');
              if (row) row.remove();
              renumberRows();
              showToast(`Đã xoá "${name}".`, false);
            } catch (e) {
              showToast('Không xoá được: ' + e.message);
              btn.disabled = false;
            }
          });
        });

        $$('.replace-login-btn', assignedBody).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const uid = btn.dataset.uid;
            const s = students.find((x) => x.studentUid === uid);
            const box = document.getElementById(`replace-login-result-${uid}`);
            if (!confirm(`Cấp mã học sinh MỚI cho "${s.studentName}"? Mã/mật khẩu CŨ sẽ ngừng hoạt động, tiến độ học và gói đã mua ở tài khoản cũ KHÔNG tự chuyển sang tài khoản mới. Chỉ dùng khi học sinh quên mật khẩu và không còn cách nào khác.`)) return;
            btn.disabled = true;
            showResult(box, '⏳ Đang tạo mã mới...');
            try {
              // Ưu tiên 1 nhóm CÒN TỒN TẠI (groupName khác null) — không lấy nhầm nhóm đã bị xoá làm
              // nơi xếp tài khoản mới vào, sẽ tạo ra 1 bản ghi "mồ côi" khác ngay khi vừa cấp xong.
              const stillExisting = s.groups.find((g) => g.groupName !== null);
              const groupCode = stillExisting ? stillExisting.groupCode : (s.groups[0] && s.groups[0].groupCode);
              const { loginCode, password } = await issueReplacementLoginForStudent({
                studentName: s.studentName, school: s.school, className: s.className,
                address: s.address, phone: s.phone, groupCode
              });
              showResult(box, `✓ Mã mới: <strong>${escapeHtml(loginCode)}</strong> — mật khẩu: <strong style="color:var(--brand);">${escapeHtml(password)}</strong>. Gửi ngay cho học sinh, mã này chỉ hiện được 1 lần.`);
            } catch (e) {
              btn.disabled = false;
              showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
            }
          });
        });
      }

      function renderTableBody() {
        const rowsHtml = sortedIndexes().map((i, order) => buildRowHtml(students[i], displayCodes[i], order + 1)).join('');
        $('#studentRosterBody', assignedBody).innerHTML = rowsHtml;
        wireRowButtons();
      }

      assignedBody.innerHTML = `
        <div class="roster-toolbar-sticky">
          <div class="field" style="margin-bottom:6px;">
            <label for="studentSearchInput">🔍 Tìm học sinh (tên, mã, SĐT)</label>
            <input type="text" id="studentSearchInput" placeholder="Gõ để lọc nhanh — VD: tên, mã học sinh, số điện thoại..." autocomplete="off" />
          </div>
          <div class="field" style="margin-bottom:0;">
            <label for="studentSortSelect">Sắp xếp</label>
            <select id="studentSortSelect">
              <option value="recent">Vào nhóm gần đây nhất trước</option>
              <option value="name">Tên A-Z</option>
            </select>
          </div>
          <p class="hint" id="studentSearchCount" style="margin-bottom:0;"></p>
        </div>
        <div class="btn-row" style="margin-bottom:8px;">
          <button class="btn" id="rosterHelpToggleBtn" type="button">❓ Hướng dẫn dùng bảng</button>
          <button class="btn" id="cleanupDuplicatesBtn" type="button">🧹 Dọn bản ghi trùng do lỗi cũ (1 lần)</button>
        </div>
        <p class="hint" id="rosterHelpText" style="display:none;">👉 Kéo ngang bảng để xem đủ các cột. "💬 Zalo" mở thẳng khung chat nếu số đó có dùng Zalo. "🔑 Cấp mã thay thế" chỉ dành cho học sinh dùng tài khoản do giáo viên cấp (không phải Google) — tạo 1 mã MỚI khi các em quên mật khẩu, KHÔNG khôi phục được tài khoản cũ (tiến độ/gói ở tài khoản cũ không tự chuyển sang). "🗑️ Xoá học sinh" xoá HẲN khỏi mọi nhóm — đây là nơi DUY NHẤT xoá HẲN được học sinh (xoá 1 nhóm không còn kéo theo xoá học sinh nữa). Muốn chỉ gỡ 1 học sinh khỏi 1 nhóm cụ thể (không xoá hẳn), dùng nút "🚪 Bỏ khỏi nhóm" ở trang "Nhóm học sinh".</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead>
              <tr><th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Email</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Nhóm đang học</th><th>Vào nhóm gần nhất</th><th></th></tr>
            </thead>
            <tbody id="studentRosterBody"></tbody>
          </table>
        </div>
      `;

      renderTableBody();

      // Dọn 1 lần — xem cleanupOrphanedUnassignedDuplicates() (groups-data.js) để hiểu chính xác lỗi
      // cũ nó sửa (tính năng "chọn học sinh có sẵn" lúc tạo nhóm mới từng để sót bản ghi "Chưa xếp
      // nhóm" cũ sau khi thêm vào nhóm mới). Bấm lại nhiều lần vẫn an toàn — không còn gì để dọn thì
      // chỉ báo "Không có gì để dọn", không xoá nhầm gì thêm.
      $('#rosterHelpToggleBtn', assignedBody).addEventListener('click', (e) => {
        const helpText = $('#rosterHelpText', assignedBody);
        const show = helpText.style.display === 'none';
        helpText.style.display = show ? '' : 'none';
        e.currentTarget.textContent = show ? '❌ Đóng hướng dẫn' : '❓ Hướng dẫn dùng bảng';
      });

      $('#cleanupDuplicatesBtn', assignedBody).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!confirm('Rà và xoá các bản ghi "Chưa xếp nhóm" THỪA của học sinh đã có nhóm thật (do lỗi cũ để sót lại)? Chỉ xoá đúng bản ghi thừa, không đụng tới nhóm thật đang dùng. Không thể hoàn tác.')) return;
        btn.disabled = true;
        btn.textContent = '⏳ Đang rà soát...';
        try {
          const removed = await cleanupOrphanedUnassignedDuplicates();
          showToast(removed ? `Đã dọn ${removed} bản ghi thừa.` : 'Không có gì để dọn.', false);
          if (removed) await renderRosterPanel(panel);
        } catch (e2) {
          showToast('Không dọn được: ' + e2.message);
        } finally {
          btn.disabled = false;
          btn.textContent = '🧹 Dọn bản ghi trùng do lỗi cũ (1 lần)';
        }
      });

      const searchInput = $('#studentSearchInput', assignedBody);
      const searchCount = $('#studentSearchCount', assignedBody);
      searchInput.addEventListener('input', () => {
        const q = normalizeSearchText(searchInput.value.trim());
        const rosterTrs = $$('#studentRosterBody tr', assignedBody);
        let shown = 0;
        rosterTrs.forEach((tr) => {
          const match = !q || (tr.dataset.search || '').includes(q);
          tr.style.display = match ? '' : 'none';
          if (match) shown++;
        });
        searchCount.textContent = q ? `Tìm thấy ${shown}/${rosterTrs.length} học sinh.` : '';
      });

      // Đổi cách sắp xếp -> vẽ lại bảng theo thứ tự mới, bỏ luôn bộ lọc tìm kiếm đang gõ dở (đơn giản
      // hơn là vừa giữ bộ lọc vừa đổi thứ tự — giáo viên gõ lại tìm rất nhanh nếu cần).
      $('#studentSortSelect', assignedBody).addEventListener('change', (e) => {
        sortMode = e.target.value;
        searchInput.value = '';
        searchCount.textContent = '';
        renderTableBody();
      });
    }

    // ---------- 📋 Nạp danh sách (gọn — chỉ dựng giao diện lúc bấm mở lần đầu) ----------
    // Xem js/features/teacher-student-accounts.js cho toàn bộ logic tạo tài khoản/mã/dò trùng SĐT.
    const IMPORT_UNASSIGNED_VALUE = '__UNASSIGNED__';
    let importSelectedGroupCode = null;
    let importSelectedFile = null;
    let importLastResults = null;
    let importLastGroupName = '';

    async function renderImportPanel(panel) {
      panel.innerHTML = `
        <div class="card">
          <h2 style="margin-top:0;"><span class="icon">📋</span>Nạp danh sách học sinh</h2>
          <p class="hint" style="margin-top:-4px;">Dùng khi bạn đã có sẵn danh sách lớp (Excel/CSV) và muốn tạo tài khoản cho cả lớp cùng lúc — mỗi học sinh có 1 <strong>mã học sinh + mật khẩu</strong> riêng để đăng nhập, không cần tự đăng ký bằng Google.</p>
          <ol class="hint" style="padding-left:18px;line-height:1.8;margin:0 0 10px;">
            <li>Bấm "Tải file mẫu (.xlsx)" bên dưới, điền dữ liệu thật theo đúng cột (xoá 2 dòng ví dụ đi) rồi lưu lại — file .xlsx không bao giờ bị lỗi mất dấu tiếng Việt như .csv nên cứ yên tâm lưu bình thường.</li>
            <li>Chọn nhóm cần nạp vào (hoặc tạo nhóm mới) — chương trình học vẫn chọn sau ở trang "Nhóm học sinh" như bình thường.</li>
            <li>Tải file đã điền lên, bấm "Nạp danh sách" — xong sẽ TỰ ĐỘNG tải về máy 1 file mã học sinh (mỗi em 1 dòng: mã + mật khẩu), gửi file đó cho từng em. Lưu file này cẩn thận — mật khẩu chỉ hiện được đúng lúc này, không xem lại được sau đó (kể cả chính app), quên lưu chỉ còn cách cấp mã thay thế.</li>
          </ol>
          <div class="btn-row">
            <button class="btn block" id="downloadTemplateBtn" type="button">📥 Tải file mẫu (.xlsx)</button>
            <button class="btn block" id="downloadTemplateCsvBtn" type="button">Tải file mẫu (.csv)</button>
          </div>

          <div class="section-label">Nhóm cần nạp vào</div>
          <div id="groupPickerBody"><p class="hint">⏳ Đang tải danh sách nhóm...</p></div>

          <div class="section-label">Tải file danh sách lên</div>
          <p class="hint" style="margin-top:-4px;">Chấp nhận file .xlsx hoặc .csv theo đúng mẫu ở trên.</p>
          <input type="file" id="importFileInput" accept=".xlsx,.csv" />
          <button class="btn primary block" id="importSubmitBtn" type="button" style="margin-top:10px;" disabled>Nạp danh sách</button>
          <div class="result-box" id="importResult"></div>

          <div id="importResultsCard" style="display:none;margin-top:14px;">
            <div class="section-label">Kết quả</div>
            <div id="importResultsBody"></div>
            <button class="btn primary block" id="downloadCodesBtn" type="button" style="margin-top:10px;">📥 Tải file mã học sinh</button>
          </div>
        </div>
      `;

      renderImportGroupPicker(panel);

      $('#downloadTemplateBtn', panel).addEventListener('click', () => downloadStudentImportTemplateXLSX());
      $('#downloadTemplateCsvBtn', panel).addEventListener('click', () => downloadStudentImportTemplateCSV());
      $('#importFileInput', panel).addEventListener('change', (e) => {
        importSelectedFile = e.target.files[0] || null;
        updateImportSubmitState(panel);
      });
      $('#importSubmitBtn', panel).addEventListener('click', async () => {
        const box = $('#importResult', panel);
        if (!importSelectedGroupCode || !importSelectedFile) return;
        const submitBtn = $('#importSubmitBtn', panel);
        submitBtn.disabled = true;
        showResult(box, '⏳ Đang đọc file...');
        try {
          const rows = await parseStudentImportFile(importSelectedFile);
          const groupCodeToUse = importSelectedGroupCode === IMPORT_UNASSIGNED_VALUE ? '' : importSelectedGroupCode;
          const { results: imported, errors } = await bulkImportProvisionedStudents(groupCodeToUse, rows, (i, total, name) => {
            showResult(box, `⏳ Đang nạp ${i}/${total}: ${escapeHtml(name || '')}...`);
          });
          importLastResults = imported;
          const group = groups.find((g) => g.groupCode === importSelectedGroupCode);
          importLastGroupName = group ? group.groupName : 'chua-xep-nhom';

          const newCount = imported.filter((r) => !r.reused).length;
          const reusedCount = imported.filter((r) => r.reused).length;
          showResult(box, `✓ Đã nạp xong: ${newCount} tài khoản mới, ${reusedCount} học sinh đã có sẵn (giữ nguyên mã cũ).${errors.length ? ` ⚠️ ${errors.length} dòng lỗi.` : ''}`);
          renderImportResultsTable(panel, imported, errors);
          // Tự động tải ngay khi vừa nạp xong (có tài khoản MỚI) — mật khẩu chỉ hiện được ĐÚNG 1 LẦN
          // DUY NHẤT lúc này (Firebase Auth không cho xem lại mật khẩu cũ sau đó, kể cả chính app này
          // cũng không lưu lại), nên không thể chỉ trông chờ giáo viên tự nhớ bấm nút tải — quên bấm
          // (VD lỡ chuyển sang mục khác, tải lại trang) coi như mất hẳn, chỉ còn cách "Cấp mã thay thế"
          // ở mục Danh sách (tạo mã MỚI, không lấy lại được mã cũ). Báo rõ TÊN FILE vừa tải qua toast —
          // trang web không có cách nào tự mở thư mục Tải xuống hay mở thẳng file cho giáo viên (trình
          // duyệt chặn hẳn, không có API nào cho phép), nên chỉ báo tên file để tự tìm trong thư mục
          // Tải xuống/Downloads của máy rồi gửi cho học sinh.
          if (newCount > 0) {
            const filename = downloadStudentCodesCSV(imported, importLastGroupName);
            showToast(`Đã tải file "${filename}" xuống thư mục Tải xuống (Downloads) của máy — mở thư mục đó để lấy file gửi cho học sinh. Lưu file cẩn thận, mật khẩu không xem lại được sau khi rời trang này.`, false);
          }
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml((e.message || '').replace(/\n/g, '<br/>'))}`, true);
        } finally {
          submitBtn.disabled = false;
        }
      });
      $('#downloadCodesBtn', panel).addEventListener('click', () => {
        if (!importLastResults) return;
        const filename = downloadStudentCodesCSV(importLastResults, importLastGroupName);
        showToast(`Đã tải file "${filename}" xuống thư mục Tải xuống (Downloads) của máy.`, false);
      });
    }

    function renderImportGroupPicker(panel) {
      const box = $('#groupPickerBody', panel);
      const optionsHtml = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)}</option>`).join('');
      box.innerHTML = `
        <div class="field">
          <label for="importGroupSelect">Nạp vào nhóm</label>
          <select id="importGroupSelect">
            <option value="${IMPORT_UNASSIGNED_VALUE}">— Chưa xếp nhóm (xếp sau) —</option>
            ${optionsHtml}
          </select>
        </div>
        <p class="hint" style="margin-top:-4px;">Không nhất thiết phải chọn nhóm ngay — chọn "Chưa xếp nhóm" thì vẫn tạo tài khoản bình thường, sau đó vào "Nhóm học sinh" chọn học sinh có sẵn để xếp vào nhóm khi nào bạn muốn.</p>
        <button class="btn block" id="importNewGroupToggleBtn" type="button" style="margin-top:8px;">➕ Tạo nhóm mới</button>
        <div id="importNewGroupForm" style="display:none;margin-top:10px;">
          <div class="field">
            <label for="importNewGroupName">Tên nhóm</label>
            <input type="text" id="importNewGroupName" placeholder="VD: 6A1 - Trường THCS ABC" />
          </div>
          <div class="field">
            <label for="importNewGroupGrade">Khối lớp / chương trình</label>
            <select id="importNewGroupGrade">${gradeOrProgramOptionsHtml()}</select>
          </div>
          <button class="btn primary block" id="importNewGroupCreateBtn" type="button">Tạo nhóm</button>
          <div class="result-box" id="importNewGroupResult"></div>
        </div>
      `;

      const select = $('#importGroupSelect', panel);
      importSelectedGroupCode = select ? select.value : null;
      if (select) select.addEventListener('change', () => { importSelectedGroupCode = select.value; updateImportSubmitState(panel); });

      $('#importNewGroupToggleBtn', panel).addEventListener('click', () => {
        const form = $('#importNewGroupForm', panel);
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
      $('#importNewGroupCreateBtn', panel).addEventListener('click', async () => {
        const name = $('#importNewGroupName', panel).value.trim();
        const box2 = $('#importNewGroupResult', panel);
        if (!name) { showResult(box2, 'Nhập tên nhóm.', true); return; }
        showResult(box2, '⏳ Đang tạo...');
        try {
          const { grade, chapterIds } = await resolveGradeOrProgramValue($('#importNewGroupGrade', panel).value);
          const group = await createGroupForCurrentTeacher(name, grade, chapterIds, '');
          groups.push(group);
          showResult(box2, `✓ Đã tạo nhóm "${escapeHtml(group.groupName)}".`);
          $('#importNewGroupName', panel).value = '';
          $('#importNewGroupForm', panel).style.display = 'none';
          renderImportGroupPicker(panel);
          importSelectedGroupCode = group.groupCode;
          const sel = $('#importGroupSelect', panel);
          if (sel) sel.value = group.groupCode;
          updateImportSubmitState(panel);
        } catch (e) {
          showResult(box2, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });

      updateImportSubmitState(panel);
    }

    function updateImportSubmitState(panel) {
      $('#importSubmitBtn', panel).disabled = !importSelectedGroupCode || !importSelectedFile;
    }

    function renderImportResultsTable(panel, results, errors) {
      const card = $('#importResultsCard', panel);
      const body = $('#importResultsBody', panel);
      card.style.display = 'block';
      body.innerHTML = `
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Họ và tên</th><th>Mã học sinh</th><th>Mật khẩu</th></tr></thead>
            <tbody>
              ${results.map((r) => `
                <tr>
                  <td>${escapeHtml(r.studentName)}</td>
                  <td>${escapeHtml(r.loginCode)}</td>
                  <td>${r.reused ? '<span class="hint">Đã cấp trước đó</span>' : `<strong style="color:var(--brand);">${escapeHtml(r.password)}</strong>`}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${errors.length ? `<div class="result-box show error" style="margin-top:10px;">${errors.map((e) => escapeHtml(e.message)).join('<br/>')}</div>` : ''}
      `;
    }
  });
})();
