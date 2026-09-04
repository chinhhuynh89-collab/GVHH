// Trang "Nạp danh sách học sinh" — nạp cả lớp (Excel/CSV có sẵn) 1 lần, tự tạo tài khoản Email/
// Password nội bộ (mã học sinh + mật khẩu) cho từng em và xếp thẳng vào 1 nhóm đã chọn. Xem
// js/features/teacher-student-accounts.js cho toàn bộ logic tạo tài khoản/mã/dò trùng.

(function () {
  requireTeacherAuth(async (user) => {
    let groups = [];
    let selectedGroupCode = null;
    let selectedFile = null;
    let lastResults = null;
    let lastGroupName = '';

    async function loadGroups() {
      const box = $('#groupPickerBody');
      try {
        groups = await listGroupsForCurrentTeacher();
      } catch (e) {
        box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`;
        return;
      }
      renderGroupPicker();
    }

    function renderGroupPicker() {
      const box = $('#groupPickerBody');
      const optionsHtml = groups.map((g) => `<option value="${escapeHtml(g.groupCode)}">${escapeHtml(g.groupName)} (${g.studentCount} học sinh)</option>`).join('');
      box.innerHTML = `
        ${groups.length ? `
          <div class="field">
            <label for="groupPickerSelect">Nạp vào nhóm</label>
            <select id="groupPickerSelect">${optionsHtml}</select>
          </div>
        ` : '<p class="hint">Bạn chưa có nhóm nào — tạo nhóm mới bên dưới trước.</p>'}
        <button class="btn block" id="newGroupToggleBtn" type="button" style="margin-top:8px;">➕ Tạo nhóm mới</button>
        <div id="newGroupForm" style="display:none;margin-top:10px;">
          <div class="field">
            <label for="newGroupName">Tên nhóm</label>
            <input type="text" id="newGroupName" placeholder="VD: 6A1 - Trường THCS ABC" />
          </div>
          <div class="field">
            <label for="newGroupGrade">Khối lớp</label>
            <select id="newGroupGrade">
              ${[6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}">Lớp ${g}</option>`).join('')}
            </select>
          </div>
          <p class="hint" style="margin-top:-2px;">Nhóm mới sẽ chưa có chương trình học — vào "Nhóm học sinh" để chọn chương sau khi tạo.</p>
          <button class="btn primary block" id="newGroupCreateBtn" type="button">Tạo nhóm</button>
          <div class="result-box" id="newGroupResult"></div>
        </div>
      `;

      const select = $('#groupPickerSelect');
      if (select) {
        selectedGroupCode = select.value;
        select.addEventListener('change', () => { selectedGroupCode = select.value; updateSubmitState(); });
      } else {
        selectedGroupCode = null;
      }

      $('#newGroupToggleBtn').addEventListener('click', () => {
        const form = $('#newGroupForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
      $('#newGroupCreateBtn').addEventListener('click', async () => {
        const groupName = $('#newGroupName').value.trim();
        const grade = $('#newGroupGrade').value;
        const box2 = $('#newGroupResult');
        if (!groupName) { showResult(box2, 'Nhập tên nhóm.', true); return; }
        showResult(box2, '⏳ Đang tạo...');
        try {
          const group = await createGroupForCurrentTeacher(groupName, grade, [], '');
          showResult(box2, `✓ Đã tạo nhóm "${escapeHtml(group.groupName)}".`);
          $('#newGroupName').value = '';
          $('#newGroupForm').style.display = 'none';
          await loadGroups();
          selectedGroupCode = group.groupCode;
          const sel = $('#groupPickerSelect');
          if (sel) sel.value = group.groupCode;
          updateSubmitState();
        } catch (e) {
          showResult(box2, `⚠️ ${escapeHtml(e.message)}`, true);
        }
      });

      updateSubmitState();
    }

    function updateSubmitState() {
      $('#importSubmitBtn').disabled = !selectedGroupCode || !selectedFile;
    }

    $('#downloadTemplateBtn').addEventListener('click', () => downloadStudentImportTemplateCSV());

    $('#importFileInput').addEventListener('change', (e) => {
      selectedFile = e.target.files[0] || null;
      updateSubmitState();
    });

    $('#importSubmitBtn').addEventListener('click', async () => {
      const box = $('#importResult');
      if (!selectedGroupCode || !selectedFile) return;
      const submitBtn = $('#importSubmitBtn');
      submitBtn.disabled = true;
      showResult(box, '⏳ Đang đọc file...');
      try {
        const rows = await parseStudentImportFile(selectedFile);
        const { results: imported, errors } = await bulkImportProvisionedStudents(selectedGroupCode, rows, (i, total, name) => {
          showResult(box, `⏳ Đang nạp ${i}/${total}: ${escapeHtml(name || '')}...`);
        });
        lastResults = imported;
        const group = groups.find((g) => g.groupCode === selectedGroupCode);
        lastGroupName = (group && group.groupName) || $('#newGroupName').value || 'nhom';

        const newCount = imported.filter((r) => !r.reused).length;
        const reusedCount = imported.filter((r) => r.reused).length;
        showResult(box, `✓ Đã nạp xong: ${newCount} tài khoản mới, ${reusedCount} học sinh đã có sẵn (giữ nguyên mã cũ).${errors.length ? ` ⚠️ ${errors.length} dòng lỗi.` : ''}`);

        renderResultsTable(imported, errors);
        await loadGroups(); // cập nhật lại số học sinh trong dropdown
        const sel = $('#groupPickerSelect');
        if (sel) { sel.value = selectedGroupCode; }
      } catch (e) {
        showResult(box, `⚠️ ${escapeHtml((e.message || '').replace(/\n/g, '<br/>'))}`, true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    function renderResultsTable(results, errors) {
      const card = $('#importResultsCard');
      const body = $('#importResultsBody');
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
        ${errors.length ? `
          <div class="result-box show error" style="margin-top:10px;">
            ${errors.map((e) => escapeHtml(e.message)).join('<br/>')}
          </div>
        ` : ''}
      `;
    }

    $('#downloadCodesBtn').addEventListener('click', () => {
      if (!lastResults) return;
      downloadStudentCodesCSV(lastResults, lastGroupName);
    });

    await loadGroups();
  });
})();
