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
  requireTeacherAuth(async (user) => {
    let groups = [];
    try { groups = await listGroupsForCurrentTeacher(); } catch (e) { /* xử lý khi render */ }

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
              <label for="pendingNewGroupGrade">Khối lớp</label>
              <select id="pendingNewGroupGrade">
                ${[6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}">Lớp ${g}</option>`).join('')}
              </select>
            </div>
            <p class="hint" style="margin-top:-2px;">Nhóm mới sẽ chưa có chương trình học — vào "Nhóm học sinh" để chọn chương sau khi tạo.</p>
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
        const grade = Number($('#pendingNewGroupGrade', panel).value);
        const box = $('#pendingCreateGroupResult', panel);
        if (!name) { showResult(box, '⚠️ Nhập tên nhóm.', true); return; }
        showResult(box, '⏳ Đang tạo nhóm...');
        try {
          const group = await createGroupForCurrentTeacher(name, grade, []);
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

      const rows = students.map((s, i) => {
        // Nhóm đã bị xoá (xem deleteGroup() — xoá nhóm không còn xoá học sinh nữa) có groupName =
        // null — ghi rõ "(Nhóm đã xoá)" thay vì để trống khó hiểu, học sinh đó vẫn còn nguyên để xếp
        // vào nhóm khác.
        const groupsText = s.groups.map((g) => escapeHtml(g.groupName || '(Nhóm đã xoá)')).join(', ');
        const zaloDigits = (s.phone || '').replace(/[^0-9]/g, '');
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(codes[i] || '—')}</td>
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
              <button class="btn delete-student-btn" type="button" data-uid="${escapeHtml(s.studentUid)}" data-name="${escapeHtml(s.studentName || '')}" style="margin-top:4px;color:#dc2626;">🗑️ Xoá học sinh</button>
              <div class="result-box" id="replace-login-result-${escapeHtml(s.studentUid)}"></div>
            </td>
          </tr>
        `;
      }).join('');

      assignedBody.innerHTML = `
        <p class="hint">👉 Kéo ngang bảng để xem đủ các cột. "💬 Zalo" mở thẳng khung chat nếu số đó có dùng Zalo. "🔑 Cấp mã thay thế" chỉ dành cho học sinh dùng tài khoản do giáo viên cấp (không phải Google) — tạo 1 mã MỚI khi các em quên mật khẩu, KHÔNG khôi phục được tài khoản cũ (tiến độ/gói ở tài khoản cũ không tự chuyển sang). "🗑️ Xoá học sinh" xoá HẲN khỏi mọi nhóm — đây là nơi DUY NHẤT xoá HẲN được học sinh (xoá 1 nhóm không còn kéo theo xoá học sinh nữa). Muốn chỉ gỡ 1 học sinh khỏi 1 nhóm cụ thể (không xoá hẳn), dùng nút "🚪 Bỏ khỏi nhóm" ở trang "Nhóm học sinh".</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead>
              <tr><th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Email</th><th>Trường</th><th>Lớp</th><th>Địa chỉ</th><th>SĐT</th><th>Nhóm đang học</th><th>Vào nhóm gần nhất</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      $$('.delete-student-btn', assignedBody).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.uid;
          const name = btn.dataset.name;
          if (!confirm(`Xoá HẲN học sinh "${name}" khỏi mọi nhóm? Không thể hoàn tác — tiến độ học/gói đã mua của tài khoản này vẫn còn (không mất) nhưng sẽ không còn hiện trong bất kỳ nhóm nào của bạn nữa.`)) return;
          btn.disabled = true;
          try {
            await deleteStudentEverywhere(uid);
            await renderRosterPanel(panel);
          } catch (e) {
            alert('Không xoá được: ' + e.message);
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

    // ---------- 📋 Nạp danh sách (gọn — chỉ dựng giao diện lúc bấm mở lần đầu) ----------
    // Xem js/features/teacher-student-accounts.js cho toàn bộ logic tạo tài khoản/mã/dò trùng SĐT.
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
            <li>Bấm "Tải file mẫu" bên dưới, điền dữ liệu thật theo đúng cột (xoá 2 dòng ví dụ đi).</li>
            <li>Chọn nhóm cần nạp vào (hoặc tạo nhóm mới) — chương trình học vẫn chọn sau ở trang "Nhóm học sinh" như bình thường.</li>
            <li>Tải file đã điền lên, bấm "Nạp danh sách".</li>
            <li>Tải file mã học sinh về, gửi cho từng em (mỗi em 1 dòng: mã + mật khẩu).</li>
          </ol>
          <button class="btn block" id="downloadTemplateBtn" type="button">📥 Tải file mẫu</button>

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

      $('#downloadTemplateBtn', panel).addEventListener('click', () => downloadStudentImportTemplateCSV());
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
          const { results: imported, errors } = await bulkImportProvisionedStudents(importSelectedGroupCode, rows, (i, total, name) => {
            showResult(box, `⏳ Đang nạp ${i}/${total}: ${escapeHtml(name || '')}...`);
          });
          importLastResults = imported;
          const group = groups.find((g) => g.groupCode === importSelectedGroupCode);
          importLastGroupName = (group && group.groupName) || 'nhom';

          const newCount = imported.filter((r) => !r.reused).length;
          const reusedCount = imported.filter((r) => r.reused).length;
          showResult(box, `✓ Đã nạp xong: ${newCount} tài khoản mới, ${reusedCount} học sinh đã có sẵn (giữ nguyên mã cũ).${errors.length ? ` ⚠️ ${errors.length} dòng lỗi.` : ''}`);
          renderImportResultsTable(panel, imported, errors);
        } catch (e) {
          showResult(box, `⚠️ ${escapeHtml((e.message || '').replace(/\n/g, '<br/>'))}`, true);
        } finally {
          submitBtn.disabled = false;
        }
      });
      $('#downloadCodesBtn', panel).addEventListener('click', () => {
        if (!importLastResults) return;
        downloadStudentCodesCSV(importLastResults, importLastGroupName);
      });
    }

    function renderImportGroupPicker(panel) {
      const box = $('#groupPickerBody', panel);
      const optionsHtml = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)}</option>`).join('');
      box.innerHTML = `
        ${groups.length ? `
          <div class="field">
            <label for="importGroupSelect">Nạp vào nhóm</label>
            <select id="importGroupSelect">${optionsHtml}</select>
          </div>
        ` : '<p class="hint">Bạn chưa có nhóm nào — tạo nhóm mới bên dưới trước.</p>'}
        <button class="btn block" id="importNewGroupToggleBtn" type="button" style="margin-top:8px;">➕ Tạo nhóm mới</button>
        <div id="importNewGroupForm" style="display:none;margin-top:10px;">
          <div class="field">
            <label for="importNewGroupName">Tên nhóm</label>
            <input type="text" id="importNewGroupName" placeholder="VD: 6A1 - Trường THCS ABC" />
          </div>
          <div class="field">
            <label for="importNewGroupGrade">Khối lớp</label>
            <select id="importNewGroupGrade">
              ${[6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}">Lớp ${g}</option>`).join('')}
            </select>
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
        const grade = $('#importNewGroupGrade', panel).value;
        const box2 = $('#importNewGroupResult', panel);
        if (!name) { showResult(box2, 'Nhập tên nhóm.', true); return; }
        showResult(box2, '⏳ Đang tạo...');
        try {
          const group = await createGroupForCurrentTeacher(name, grade, [], '');
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
