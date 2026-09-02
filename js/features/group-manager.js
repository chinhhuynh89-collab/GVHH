// Giao diện trang "Nhóm học sinh": tạo nhóm mới + danh sách nhóm của giáo viên đang đăng nhập.
// Các hàm đọc/ghi Firestore dùng chung nằm ở groups-data.js.

(function () {
  requireTeacherAuth(async () => {
    renderGradeOptions();
    renderChapterChecklist();
    renderGroupList();
  });

  function renderGradeOptions() {
    $('#groupGrade').innerHTML = GRADES.map((g) => `<option value="${g.grade}">${g.label}</option>`).join('');
  }

  function renderChapterChecklist() {
    const grade = parseInt($('#groupGrade').value, 10);
    const chapters = getChaptersByGrade(grade);
    $('#groupChapters').innerHTML = chapters.map((c) => `
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
        <input type="checkbox" class="chapter-check" value="${c.id}" checked style="margin-top:3px;" />
        <span>Chương ${c.order}. ${escapeHtml(c.title)}${!hasContent(c) ? ' <span class="hint">(chưa có nội dung)</span>' : ''}</span>
      </label>
    `).join('');
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
            <div class="cc-order">Lớp ${g.grade} · Mã nhóm: <strong style="color:var(--brand);letter-spacing:0.05em;">${escapeHtml(g.groupCode)}</strong></div>
            <div class="cc-title">${escapeHtml(g.groupName)}</div>
            <div class="cc-desc">${g.studentCount} học sinh đã tham gia · ${g.chapterIds.length} chương được giao</div>
            <div class="btn-row" style="margin-top:8px;">
              <a class="btn" href="tao-de-kiem-tra.html?group=${encodeURIComponent(g.groupCode)}">Tạo đề kiểm tra</a>
              <a class="btn" href="thong-ke.html?group=${encodeURIComponent(g.groupCode)}">Thống kê</a>
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  }

  $('#groupGrade').addEventListener('change', renderChapterChecklist);

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
    const grade = parseInt($('#groupGrade').value, 10);
    const chapterIds = $$('.chapter-check').filter((c) => c.checked).map((c) => c.value);
    const box = $('#groupCreateResult');
    if (!groupName) { showResult(box, 'Nhập tên nhóm.', true); return; }
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
