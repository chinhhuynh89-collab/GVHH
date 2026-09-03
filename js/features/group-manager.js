// Giao diện trang "Nhóm học sinh": tạo nhóm mới + danh sách nhóm của giáo viên đang đăng nhập.
// Các hàm đọc/ghi Firestore dùng chung nằm ở groups-data.js.
//
// Chương trình học của 1 nhóm không còn bị gò vào 1 khối lớp duy nhất — giáo viên chọn tự do
// chương từ bất kỳ khối nào để ghép chương trình riêng (VD: bồi dưỡng học sinh nâng cao bằng
// chương của khối trên, hoặc phụ đạo học sinh yếu bằng chương của khối dưới). "Lớp" hiện trong
// danh sách nhóm chỉ còn là NHÃN mô tả, tự suy ra từ các khối có chương được chọn.

(function () {
  let groupsCache = [];
  let ownProgramsWithChapters = []; // [{ program, chapters }] — chương trình riêng của giáo viên, để chọn giao cho nhóm
  let knownStudents = []; // học sinh đã có sẵn trong danh sách (mọi nhóm) — để chọn thêm thẳng vào nhóm mới
  let openGroupId = null; // nhóm đang mở khung chi tiết (kiểu lưới nút + 1 khung nội dung, giống trang Quản trị)

  requireTeacherAuth(async () => {
    renderQuickGradeOptions();
    await loadOwnProgramsWithChapters();
    renderChapterChecklist();
    await loadKnownStudents();
    renderStudentsChecklist();
    renderGroupList();
  });

  async function loadOwnProgramsWithChapters() {
    try {
      const programs = await listProgramsForCurrentTeacher();
      const chaptersPerProgram = await Promise.all(programs.map((p) => getProgramChapters(p.id)));
      ownProgramsWithChapters = programs.map((p, i) => ({ program: p, chapters: chaptersPerProgram[i] }));
    } catch (e) { ownProgramsWithChapters = []; }
  }

  async function loadKnownStudents() {
    try {
      knownStudents = await getAllStudentsForCurrentTeacher();
    } catch (e) { knownStudents = []; }
  }

  // Danh sách tick chọn học sinh đã có sẵn (từ nhóm khác) để thêm thẳng vào nhóm MỚI đang tạo —
  // dùng studentUid làm khoá (khớp cách gộp học sinh ở groups-data.js).
  function renderStudentsChecklist() {
    const box = $('#groupStudentsChecklist');
    if (!knownStudents.length) {
      box.innerHTML = '<p class="hint">Chưa có học sinh nào trong danh sách của bạn.</p>';
      return;
    }
    box.innerHTML = knownStudents.map((s) => `
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
        <input type="checkbox" class="group-student-check" value="${escapeHtml(s.studentUid || s.id)}" style="margin-top:3px;" />
        <span>${escapeHtml(s.studentName || '')} <span class="hint">— ${escapeHtml(s.school || '')} · ${escapeHtml(s.phone || '')}</span></span>
      </label>
    `).join('');
  }

  function renderQuickGradeOptions() {
    $('#groupQuickGrade').innerHTML = GRADES.map((g) => `<option value="${g.grade}">${g.label}</option>`).join('');
  }

  // Dùng chung cho cả form "Tạo nhóm mới" và bảng "Sửa chương trình học" của từng nhóm — checkedIds
  // để tick sẵn chương đang được giao (dùng khi sửa nhóm có sẵn). Gồm cả chương khối 6-12 mặc định
  // VÀ chương thuộc chương trình riêng do giáo viên tự tạo (xem programs-data.js).
  function chapterChecklistHtml(checkedIds) {
    const checkedSet = new Set(checkedIds || []);
    const gradesHtml = GRADES.map((g) => {
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
    const programsHtml = ownProgramsWithChapters.map(({ program, chapters }) => {
      if (!chapters.length) return '';
      return `
        <div class="hint" style="font-weight:700;margin:10px 0 6px;">${program.icon || '🎓'} ${escapeHtml(program.name)}</div>
        ${chapters.map((c) => `
          <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" class="chapter-check" value="${c.id}" ${checkedSet.has(c.id) ? 'checked' : ''} style="margin-top:3px;" />
            <span>${escapeHtml(c.title)}</span>
          </label>
        `).join('')}
      `;
    }).join('');
    return gradesHtml + programsHtml;
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

  // Bố cục kiểu lưới nút (giống trang Quản trị): mỗi nhóm là 1 nút trong "#groupMenuGrid", bấm vào
  // mới mở đầy đủ thông tin + hành động (danh sách học sinh, kết quả, sửa chương trình, xoá...) của
  // ĐÚNG nhóm đó vào "#groupSectionPanel" — nhóm khác tự đóng lại, tránh cảnh tất cả các nhóm hiện
  // tràn cùng lúc khi giáo viên có nhiều nhóm.
  async function renderGroupList() {
    const menu = $('#groupMenuGrid');
    menu.innerHTML = '<p class="hint">⏳ Đang tải danh sách nhóm...</p>';
    try {
      groupsCache = await listGroupsForCurrentTeacher();
    } catch (e) {
      menu.innerHTML = `<div class="result-box show error">⚠️ ${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!groupsCache.length) {
      menu.innerHTML = '<p class="hint">Chưa có nhóm nào.</p>';
      closeGroupPanel();
      return;
    }
    menu.innerHTML = groupsCache.map((g) => `
      <button class="btn group-menu-btn ${g.id === openGroupId ? 'has-open' : ''}" type="button" data-group-id="${g.id}">
        <span style="display:block;font-weight:700;">${escapeHtml(g.groupName)}</span>
        <span class="hint" style="display:block;">Mã ${escapeHtml(g.groupCode)} · ${g.studentCount} HS</span>
      </button>
    `).join('');
    $$('.group-menu-btn', menu).forEach((btn) => {
      btn.addEventListener('click', () => {
        const groupId = btn.dataset.groupId;
        if (openGroupId === groupId) { closeGroupPanel(); return; }
        openGroupPanel(groupId);
      });
    });
    // Nhóm đang mở lúc trước vẫn còn -> vẽ lại khung chi tiết với dữ liệu mới nhất (VD sau khi tạo
    // nhóm mới, số liệu nhóm khác có thể đổi); nhóm đó đã bị xoá -> tự đóng khung.
    if (openGroupId) {
      if (groupsCache.some((g) => g.id === openGroupId)) renderGroupPanel(openGroupId);
      else closeGroupPanel();
    }
  }

  function closeGroupPanel() {
    openGroupId = null;
    const panel = $('#groupSectionPanel');
    panel.style.display = 'none';
    panel.innerHTML = '';
    $$('.group-menu-btn').forEach((b) => b.classList.remove('has-open'));
  }

  function openGroupPanel(groupId) {
    openGroupId = groupId;
    $$('.group-menu-btn').forEach((b) => b.classList.toggle('has-open', b.dataset.groupId === groupId));
    $('#groupSectionPanel').style.display = 'block';
    renderGroupPanel(groupId);
  }

  function groupCardHtml(g) {
    return `
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
          <div class="action-grid" style="margin-top:8px;">
            <button class="btn roster-toggle" data-group="${escapeHtml(g.groupCode)}">👥 Danh sách học sinh</button>
            <button class="btn results-toggle" data-group="${escapeHtml(g.groupCode)}">📊 Kết quả học tập</button>
            <button class="btn chapters-toggle" data-group="${escapeHtml(g.groupCode)}">📘 Sửa chương trình học</button>
            <a class="btn" href="tao-de-kiem-tra.html?group=${encodeURIComponent(g.groupCode)}">📝 Tạo đề kiểm tra</a>
            <a class="btn" href="thong-ke.html?group=${encodeURIComponent(g.groupCode)}">📈 Thống kê từng đợt</a>
            ${g.zaloGroupLink
              ? `<a class="btn" href="${escapeHtml(g.zaloGroupLink)}" target="_blank" rel="noopener">💬 Nhắn Zalo nhóm</a>
                 <button class="btn zalo-edit-btn" type="button" data-group-id="${g.id}" data-current="${escapeHtml(g.zaloGroupLink)}">✏️ Sửa link Zalo</button>`
              : `<button class="btn zalo-edit-btn" type="button" data-group-id="${g.id}" data-current="">💬 + Thêm link Zalo nhóm</button>`}
            <button class="btn delete-group-btn" type="button" data-group-id="${g.id}" data-group="${escapeHtml(g.groupCode)}" data-name="${escapeHtml(g.groupName)}" style="color:#dc2626;">🗑️ Xoá nhóm</button>
          </div>
          <div class="roster-box" id="roster-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
          <div class="results-box" id="results-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
          <div class="chapters-edit-box" id="chapters-edit-${escapeHtml(g.groupCode)}" style="display:none;margin-top:10px;"></div>
        </div>
      </div>
    `;
  }

  function renderGroupPanel(groupId) {
    const g = groupsCache.find((gr) => gr.id === groupId);
    if (!g) { closeGroupPanel(); return; }
    $('#groupSectionPanel').innerHTML = groupCardHtml(g);
    wireRosterToggles();
    wireResultsToggles();
    wireChaptersEditToggles();
    wireFreeModeToggles();
    wireZaloEditButtons();
    wireDeleteGroupButtons();
  }

  // Kiểu accordion: mỗi nhóm chỉ mở 1 trong 3 mục (danh sách học sinh / kết quả học tập / sửa
  // chương trình học) cùng lúc — bấm mở mục nào thì mục đang mở của nhóm đó tự đóng lại, đỡ rối
  // mắt trên màn hình nhỏ.
  function closeOtherPanels(groupCode, exceptBoxId) {
    [
      { boxId: 'roster-' + groupCode, selector: `.roster-toggle[data-group="${groupCode}"]`, label: '👥 Danh sách học sinh' },
      { boxId: 'results-' + groupCode, selector: `.results-toggle[data-group="${groupCode}"]`, label: '📊 Kết quả học tập' },
      { boxId: 'chapters-edit-' + groupCode, selector: `.chapters-toggle[data-group="${groupCode}"]`, label: '📘 Sửa chương trình học' }
    ].forEach(({ boxId, selector, label }) => {
      if (boxId === exceptBoxId) return;
      const otherBox = document.getElementById(boxId);
      const otherBtn = document.querySelector(selector);
      if (otherBox) otherBox.style.display = 'none';
      if (otherBtn) otherBtn.textContent = label;
    });
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

  // Thêm/sửa link nhóm Zalo cho 1 nhóm đã tồn tại — dùng khi tạo nhóm chưa nhập, hoặc muốn đổi link
  // (VD nhóm Zalo cũ giải tán, tạo nhóm mới). Chỉ giáo viên thấy nút này.
  function wireZaloEditButtons() {
    $$('.zalo-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const current = btn.dataset.current || '';
        const input = prompt('Link nhóm Zalo (dán link từ Zalo, để trống để xoá):', current);
        if (input === null) return; // bấm Huỷ
        const zaloGroupLink = normalizeGroupZaloUrl(input.trim());
        try {
          await updateGroupZaloLink(groupId, zaloGroupLink);
          const group = groupsCache.find((g) => g.id === groupId);
          if (group) group.zaloGroupLink = zaloGroupLink;
          renderGroupPanel(groupId); // chỉ vẽ lại khung của đúng nhóm này, không đóng khung đang mở
        } catch (e) {
          alert('Không lưu được: ' + e.message);
        }
      });
    });
  }

  // Tự thêm https:// nếu giáo viên dán thiếu — Zalo thường cho sẵn link đầy đủ nhưng phòng khi gõ tay.
  function normalizeGroupZaloUrl(v) {
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  // Xoá hẳn 1 nhóm — không thể hoàn tác nên bắt xác nhận rõ, kèm luôn cảnh báo số học sinh sẽ mất
  // khỏi nhóm (bản thân học sinh vẫn còn nếu đang học nhóm khác).
  function wireDeleteGroupButtons() {
    $$('.delete-group-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const groupCode = btn.dataset.group;
        const groupName = btn.dataset.name;
        const group = groupsCache.find((g) => g.id === groupId);
        const studentCount = group ? group.studentCount : 0;
        if (!confirm(`Xoá hẳn nhóm "${groupName}"? ${studentCount ? `${studentCount} học sinh sẽ mất khỏi nhóm này. ` : ''}Không thể hoàn tác.`)) return;
        btn.disabled = true;
        btn.textContent = '⏳ Đang xoá...';
        try {
          await deleteGroup(groupId, groupCode);
          closeGroupPanel();
          await renderGroupList();
        } catch (e) {
          alert('Không xoá được: ' + e.message);
          btn.disabled = false;
          btn.textContent = '🗑️ Xoá nhóm';
        }
      });
    });
  }

  async function loadAndRenderRoster(box, groupCode) {
    box.innerHTML = '<p class="hint">⏳ Đang tải...</p>';
    try {
      const students = await getStudentsForGroup(groupCode);
      box.dataset.loaded = '1';
      if (!students.length) { box.innerHTML = '<p class="hint">Chưa có học sinh nào tham gia.</p>'; return; }
      box.innerHTML = `
        <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
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
                <th>Xoá</th>
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
                  <td><button class="btn delete-student-btn" type="button" data-student-id="${s.id}" data-name="${escapeHtml(s.studentName || '')}" style="color:#dc2626;">🗑️</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      $$('.delete-student-btn', box).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const studentId = btn.dataset.studentId;
          const name = btn.dataset.name;
          if (!confirm(`Xoá "${name}" khỏi nhóm này? Không thể hoàn tác.`)) return;
          btn.disabled = true;
          try {
            await deleteStudent(studentId);
            await loadAndRenderRoster(box, groupCode);
            const g = groupsCache.find((gr) => gr.groupCode === groupCode);
            if (g) g.studentCount = Math.max(0, (g.studentCount || 1) - 1);
          } catch (e) {
            alert('Không xoá được: ' + e.message);
            btn.disabled = false;
          }
        });
      });
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
        if (open) { box.style.display = 'none'; btn.textContent = '👥 Danh sách học sinh'; return; }
        closeOtherPanels(groupCode, box.id);
        box.style.display = 'block';
        btn.textContent = '👥 Ẩn danh sách học sinh';
        if (box.dataset.loaded) return; // đã tải trước đó, không tải lại
        await loadAndRenderRoster(box, groupCode);
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
        closeOtherPanels(groupCode, box.id);
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
            <p class="hint">👉 Kéo ngang bảng để xem đủ các cột</p>
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
        closeOtherPanels(groupCode, box.id);
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
            // Đợi 1 chút cho giáo viên kịp thấy thông báo trước khi vẽ lại khung nhóm (renderGroupPanel
            // dựng lại từ đầu nên khung "Sửa chương trình học" sẽ tự đóng lại) — khung nhóm vẫn mở.
            setTimeout(() => renderGroupPanel(group.id), 1200);
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
    $('#groupZaloLink').value = '';
    $$('.group-student-check', $('#groupStudentsChecklist')).forEach((c) => { c.checked = false; });
    hideResult($('#groupCreateResult'));
  });

  $('#groupCreateBtn').addEventListener('click', async () => {
    const groupName = $('#groupName').value.trim();
    const zaloGroupLink = normalizeGroupZaloUrl($('#groupZaloLink').value.trim());
    const chapterIds = $$('.chapter-check', $('#groupChapters')).filter((c) => c.checked).map((c) => c.value);
    const selectedStudentUids = $$('.group-student-check', $('#groupStudentsChecklist')).filter((c) => c.checked).map((c) => c.value);
    const box = $('#groupCreateResult');
    if (!groupName) { showResult(box, 'Nhập tên nhóm.', true); return; }
    if (!chapterIds.length) { showResult(box, 'Chọn ít nhất 1 chương cho nhóm.', true); return; }
    const grade = computeGradeLabel(chapterIds);
    showResult(box, '⏳ Đang tạo nhóm...');
    try {
      const group = await createGroupForCurrentTeacher(groupName, grade, chapterIds, zaloGroupLink);
      let addedCount = 0;
      if (selectedStudentUids.length) {
        const selectedStudents = knownStudents.filter((s) => selectedStudentUids.includes(s.studentUid || s.id));
        const results = await Promise.allSettled(selectedStudents.map((s) => addStudentToGroup(group.groupCode, s)));
        addedCount = results.filter((r) => r.status === 'fulfilled').length;
      }
      showResult(box, `✓ Đã tạo nhóm "${escapeHtml(group.groupName)}" — mã nhóm: <strong style="color:var(--brand);">${escapeHtml(group.groupCode)}</strong>.${addedCount ? ` Đã thêm ${addedCount} học sinh có sẵn vào nhóm.` : ''} Gửi mã này cho học sinh khác để các em xin vào nhóm.`);
      $('#groupName').value = '';
      $('#groupZaloLink').value = '';
      $$('.group-student-check', $('#groupStudentsChecklist')).forEach((c) => { c.checked = false; });
      renderGroupList();
      setTimeout(() => {
        $('#groupCreateForm').style.display = 'none';
        $('#groupCreateToggleBtn').style.display = 'flex';
        hideResult(box);
      }, 2600);
    } catch (e) {
      showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });
})();
