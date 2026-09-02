// Giao diện trang "Nhóm học sinh": tạo nhóm mới + danh sách nhóm của giáo viên đang đăng nhập.
// Các hàm đọc/ghi Firestore dùng chung nằm ở groups-data.js.
//
// Chương trình học của 1 nhóm không còn bị gò vào 1 khối lớp duy nhất — giáo viên chọn tự do
// chương từ bất kỳ khối nào để ghép chương trình riêng (VD: bồi dưỡng học sinh nâng cao bằng
// chương của khối trên, hoặc phụ đạo học sinh yếu bằng chương của khối dưới). "Lớp" hiện trong
// danh sách nhóm chỉ còn là NHÃN mô tả, tự suy ra từ các khối có chương được chọn.

(function () {
  let groupsCache = [];

  requireTeacherAuth(async () => {
    renderQuickGradeOptions();
    renderChapterChecklist();
    renderGroupList();
  });

  function renderQuickGradeOptions() {
    $('#groupQuickGrade').innerHTML = GRADES.map((g) => `<option value="${g.grade}">${g.label}</option>`).join('');
  }

  // Dùng chung cho cả form "Tạo nhóm mới" và bảng "Sửa chương trình học" của từng nhóm — checkedIds
  // để tick sẵn chương đang được giao (dùng khi sửa nhóm có sẵn).
  function chapterChecklistHtml(checkedIds) {
    const checkedSet = new Set(checkedIds || []);
    return GRADES.map((g) => {
      const chapters = getChaptersByGrade(g.grade);
      if (!chapters.length) return '';
      return `
        <div class="hint" style="font-weight:700;margin:10px 0 6px;">${escapeHtml(g.label)}</div>
        ${chapters.map((c) => `
          <label data-grade="${g.grade}" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" class="chapter-check" value="${c.id}" ${checkedSet.has(c.id) ? 'checked' : ''} style="margin-top:3px;" />
            <span>Chương ${c.order}. ${escapeHtml(c.title)}${!hasContent(c) ? ' <span class="hint">(chưa có nội dung)</span>' : ''}</span>
          </label>
        `).join('')}
      `;
    }).join('');
  }

  function renderChapterChecklist() {
    $('#groupChapters').innerHTML = chapterChecklistHtml([]);
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
      groupsCache = await listGroupsForCurrentTeacher();
      if (!groupsCache.length) { box.innerHTML = '<p class="hint">Chưa có nhóm nào.</p>'; return; }
      box.innerHTML = groupsCache.map((g) => `
        <div class="chapter-card">
          <div class="cc-icon">👥</div>
          <div class="cc-body">
            <div class="cc-order">Lớp ${escapeHtml(String(g.grade))} · Mã nhóm: <strong style="color:var(--brand);letter-spacing:0.05em;">${escapeHtml(g.groupCode)}</strong></div>
            <div class="cc-title">${escapeHtml(g.groupName)}</div>
            <div class="cc-desc">${g.studentCount} học sinh đã tham gia · ${g.chapterIds.length} chương được giao</div>
            <div class="free-mode-row" style="margin:8px 0;padding:10px 12px;">
              <div class="fm-text">
                <div class="fm-title">Học tự do cho nhóm này</div>
                <div class="fm-sub">Bật: học sinh mở được mọi chương ngay. Tắt: phải học tuần tự, xong chương trước mới mở chương sau.</div>
              </div>
              <div class="switch free-mode-toggle ${g.freeMode ? 'on' : ''}" data-group-id="${g.id}" data-group="${escapeHtml(g.groupCode)}"><div class="knob"></div></div>
            </div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn roster-toggle" data-group="${escapeHtml(g.groupCode)}">👥 Danh sách học sinh</button>
              <button class="btn results-toggle" data-group="${escapeHtml(g.groupCode)}">📊 Kết quả học tập</button>
              <button class="btn chapters-toggle" data-group="${escapeHtml(g.groupCode)}">📘 Sửa chương trình học</button>
              <a class="btn" href="tao-de-kiem-tra.html?group=${encodeURIComponent(g.groupCode)}">Tạo đề kiểm tra</a>
              <a class="btn" href="thong-ke.html?group=${encodeURIComponent(g.groupCode)}">Thống kê từng đợt</a>
            </div>
            <div class="roster-box" id="roster-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
            <div class="results-box" id="results-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
            <div class="chapters-edit-box" id="chapters-edit-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
          </div>
        </div>
      `).join('');
      wireRosterToggles();
      wireResultsToggles();
      wireChaptersEditToggles();
      wireFreeModeToggles();
    } catch (e) {
      box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
    }
  }

  function wireFreeModeToggles() {
    $$('.free-mode-toggle').forEach((el) => {
      el.addEventListener('click', async () => {
        const groupId = el.dataset.groupId;
        const groupCode = el.dataset.group;
        const group = groupsCache.find((g) => g.groupCode === groupCode);
        const next = !group.freeMode;
        el.classList.toggle('on', next); // phản hồi ngay, không chờ mạng
        try {
          await updateGroupFreeMode(groupId, next);
          group.freeMode = next;
        } catch (e) {
          el.classList.toggle('on', !next); // lỗi thì trả lại trạng thái cũ
          alert('Không lưu được: ' + e.message);
        }
      });
    });
  }

  function wireRosterToggles() {
    $$('.roster-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupCode = btn.dataset.group;
        const box = $('#roster-' + groupCode);
        const open = box.style.display !== 'none';
        if (open) { box.style.display = 'none'; btn.textContent = '👥 Danh sách học sinh'; return; }
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

  function wireResultsToggles() {
    $$('.results-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupCode = btn.dataset.group;
        const box = $('#results-' + groupCode);
        const open = box.style.display !== 'none';
        if (open) { box.style.display = 'none'; btn.textContent = '📊 Kết quả học tập'; return; }
        box.style.display = 'block';
        btn.textContent = '📊 Ẩn kết quả học tập';
        if (box.dataset.loaded) return;
        box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
        try {
          const group = groupsCache.find((g) => g.groupCode === groupCode);
          const results = await getGroupLearningResults(group);
          box.dataset.loaded = '1';
          if (!results.length) { box.innerHTML = '<p class="hint">Chưa có học sinh nào tham gia.</p>'; return; }
          box.innerHTML = `
            <div class="roster-table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Họ tên</th>
                    <th>Chương đã học</th>
                    <th>Số đợt KT đã làm</th>
                    <th>Điểm TB</th>
                    <th>Điểm cao nhất</th>
                  </tr>
                </thead>
                <tbody>
                  ${results.map((r, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${escapeHtml(r.studentName || '—')}</td>
                      <td>${r.chaptersDone}/${r.totalAssigned}</td>
                      <td>${r.examCount}</td>
                      <td>${r.avgScore10 !== null ? r.avgScore10.toFixed(1) : '—'}</td>
                      <td>${r.bestScore10 !== null ? r.bestScore10.toFixed(1) : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <p class="hint" style="margin-top:8px;">Xếp theo điểm trung bình các đợt kiểm tra, cao đến thấp. "Chương đã học" tính khi học sinh đã xem bài giảng, xem hết flashcard và đạt ≥70% trắc nghiệm của chương đó.</p>
          `;
        } catch (e) {
          box.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
        }
      });
    });
  }

  function wireChaptersEditToggles() {
    $$('.chapters-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const groupCode = btn.dataset.group;
        const box = $('#chapters-edit-' + groupCode);
        const open = box.style.display !== 'none';
        if (open) { box.style.display = 'none'; btn.textContent = '📘 Sửa chương trình học'; return; }
        box.style.display = 'block';
        btn.textContent = '📘 Đóng sửa chương trình học';
        if (box.dataset.built) return; // đã dựng sẵn, không cần dựng lại
        const group = groupsCache.find((g) => g.groupCode === groupCode);
        box.dataset.built = '1';
        box.innerHTML = `
          <div class="field" style="margin-bottom:0;">
            <div style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:9px;padding:10px;">
              ${chapterChecklistHtml(group.chapterIds)}
            </div>
            <div class="btn-row" style="margin-top:10px;">
              <button class="btn primary chapters-save-btn" style="flex:1;">Lưu thay đổi</button>
            </div>
            <div class="result-box chapters-save-result"></div>
          </div>
        `;
        $('.chapters-save-btn', box).addEventListener('click', async () => {
          const chapterIds = $$('.chapter-check', box).filter((c) => c.checked).map((c) => c.value);
          const resultBox = $('.chapters-save-result', box);
          if (!chapterIds.length) { showResult(resultBox, 'Chọn ít nhất 1 chương.', true); return; }
          showResult(resultBox, '⏳ Đang lưu...');
          try {
            const grade = computeGradeLabel(chapterIds);
            await updateGroupChapters(group.id, chapterIds, grade);
            group.chapterIds = chapterIds;
            group.grade = grade;
            showResult(resultBox, `✓ Đã lưu — nhóm giờ có ${chapterIds.length} chương.`);
            renderGroupList();
          } catch (e) {
            showResult(resultBox, `⚠️ ${escapeHtml(e.message)}`, true);
          }
        });
      });
    });
  }

  $('#groupQuickSelectBtn').addEventListener('click', () => {
    const grade = $('#groupQuickGrade').value;
    $$(`label[data-grade="${grade}"]`, $('#groupChapters')).forEach((label) => {
      const cb = $('.chapter-check', label);
      if (cb) cb.checked = true;
    });
  });

  $('#groupUnselectAllBtn').addEventListener('click', () => {
    $$('.chapter-check', $('#groupChapters')).forEach((cb) => { cb.checked = false; });
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
    const chapterIds = $$('.chapter-check', $('#groupChapters')).filter((c) => c.checked).map((c) => c.value);
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
