// Giao diện trang "Nhóm học sinh": tạo nhóm mới + danh sách nhóm của giáo viên đang đăng nhập.
// Các hàm đọc/ghi Firestore dùng chung nằm ở groups-data.js.
//
// Chương trình học của 1 nhóm không còn bị gò vào 1 khối lớp duy nhất — giáo viên chọn tự do
// chương từ bất kỳ khối nào để ghép chương trình riêng (VD: bồi dưỡng học sinh nâng cao bằng
// chương của khối trên, hoặc phụ đạo học sinh yếu bằng chương của khối dưới). "Lớp" hiện trong
// danh sách nhóm chỉ còn là NHÃN mô tả, tự suy ra từ các khối có chương được chọn.

(function () {
  requireTeacherAuth(async () => {
    renderQuickGradeOptions();
    renderChapterChecklist();
    renderGroupList();
  });

  function renderQuickGradeOptions() {
    $('#groupQuickGrade').innerHTML = GRADES.map((g) => `<option value="${g.grade}">${g.label}</option>`).join('');
  }

  function renderChapterChecklist() {
    $('#groupChapters').innerHTML = GRADES.map((g) => {
      const chapters = getChaptersByGrade(g.grade);
      if (!chapters.length) return '';
      return `
        <div class="hint" style="font-weight:700;margin:10px 0 6px;">${escapeHtml(g.label)}</div>
        ${chapters.map((c) => `
          <label data-grade="${g.grade}" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" class="chapter-check" value="${c.id}" style="margin-top:3px;" />
            <span>Chương ${c.order}. ${escapeHtml(c.title)}${!hasContent(c) ? ' <span class="hint">(chưa có nội dung)</span>' : ''}</span>
          </label>
        `).join('')}
      `;
    }).join('');
  }

  // Nhãn "lớp" hiển thị trong danh sách nhóm — tự suy ra từ khối của các chương đã chọn, không
  // còn là 1 lựa chọn riêng của giáo viên.
  function computeGradeLabel(chapterIds) {
    const grades = new Set();
    chapterIds.forEach((id) => {
      const found = findChapterAnywhere(id);
      if (found) grades.add(found.grade);
    });
    const sorted = Array.from(grades).sort((a, b) => a - b);
    return sorted.length ? sorted.join(', ') : '—';
  }

  async function renderGroupList() {
    const box = $('#groupList');
    box.innerHTML = '<p class="hint">⏳ Đang tải danh sách nhóm...</p>';
    try {
      const groups = await listGroupsForCurrentTeacher();
      if (!groups.length) { box.innerHTML = '<p class="hint">Chưa có nhóm nào.</p>'; return; }
      box.innerHTML = groups.map((g) => `
        <div class="chapter-card">
          <div class="cc-icon">👥</div>
          <div class="cc-body">
            <div class="cc-order">Lớp ${escapeHtml(String(g.grade))} · Mã nhóm: <strong style="color:var(--brand);letter-spacing:0.05em;">${escapeHtml(g.groupCode)}</strong></div>
            <div class="cc-title">${escapeHtml(g.groupName)}</div>
            <div class="cc-desc">${g.studentCount} học sinh đã tham gia · ${g.chapterIds.length} chương được giao</div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn roster-toggle" data-group="${escapeHtml(g.groupCode)}">👥 Xem danh sách học sinh</button>
              <a class="btn" href="tao-de-kiem-tra.html?group=${encodeURIComponent(g.groupCode)}">Tạo đề kiểm tra</a>
              <a class="btn" href="thong-ke.html?group=${encodeURIComponent(g.groupCode)}">Thống kê</a>
            </div>
            <div class="roster-box" id="roster-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
          </div>
        </div>
      `).join('');
      wireRosterToggles();
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  }

  function wireRosterToggles() {
    $$('.roster-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupCode = btn.dataset.group;
        const box = $('#roster-' + groupCode);
        const open = box.style.display !== 'none';
        if (open) { box.style.display = 'none'; btn.textContent = '👥 Xem danh sách học sinh'; return; }
        box.style.display = 'block';
        btn.textContent = '👥 Ẩn danh sách học sinh';
        if (box.dataset.loaded) return; // đã tải trước đó, không tải lại
        box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
        try {
          const students = await getStudentsForGroup(groupCode);
          box.dataset.loaded = '1';
          if (!students.length) { box.innerHTML = '<p class="hint">Chưa có học sinh nào tham gia.</p>'; return; }
          box.innerHTML = `
            <div class="roster-table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Họ tên</th>
                    <th>Địa chỉ</th>
                    <th>Trường</th>
                    <th>Lớp</th>
                    <th>SĐT</th>
                    <th>Tham gia lúc</th>
                  </tr>
                </thead>
                <tbody>
                  ${students.map((s, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${escapeHtml(s.studentName || '—')}</td>
                      <td>${escapeHtml(s.address || '—')}</td>
                      <td>${escapeHtml(s.school || '—')}</td>
                      <td>${escapeHtml(s.className || '—')}</td>
                      <td>${escapeHtml(s.phone || '—')}</td>
                      <td>${s.joinedAt ? new Date(s.joinedAt).toLocaleString('vi-VN') : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        } catch (e) {
          box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
        }
      });
    });
  }

  $('#groupQuickSelectBtn').addEventListener('click', () => {
    const grade = $('#groupQuickGrade').value;
    $$(`label[data-grade="${grade}"]`).forEach((label) => {
      const cb = $('.chapter-check', label);
      if (cb) cb.checked = true;
    });
  });

  $('#groupUnselectAllBtn').addEventListener('click', () => {
    $$('.chapter-check').forEach((cb) => { cb.checked = false; });
  });

  $('#groupCreateToggleBtn').addEventListener('click', () => {
    $('#groupCreateForm').style.display = 'block';
    $('#groupCreateToggleBtn').style.display = 'none';
    $('#groupName').focus();
  });

  $('#groupCreateCancelBtn').addEventListener('click', () => {
    $('#groupCreateForm').style.display = 'none';
    $('#groupCreateToggleBtn').style.display = 'flex';
    $('#groupName').value = '';
    hideResult($('#groupCreateResult'));
  });

  $('#groupCreateBtn').addEventListener('click', async () => {
    const groupName = $('#groupName').value.trim();
    const chapterIds = $$('.chapter-check').filter((c) => c.checked).map((c) => c.value);
    const box = $('#groupCreateResult');
    if (!groupName) { showResult(box, 'Nhập tên nhóm.', true); return; }
    if (!chapterIds.length) { showResult(box, 'Chọn ít nhất 1 chương cho nhóm.', true); return; }
    const grade = computeGradeLabel(chapterIds);
    showResult(box, '⏳ Đang tạo nhóm...');
    try {
      const group = await createGroupForCurrentTeacher(groupName, grade, chapterIds);
      showResult(box, `✓ Đã tạo nhóm "${escapeHtml(group.groupName)}" — mã nhóm: <strong style="color:var(--brand);">${escapeHtml(group.groupCode)}</strong>. Gửi mã này cho học sinh để các em tham gia.`);
      $('#groupName').value = '';
      renderGroupList();
    } catch (e) {
      showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });
})();
