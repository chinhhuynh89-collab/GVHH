// Trang tổng quan "Học theo chương": chọn chương trình (khối lớp mặc định HOẶC chương trình
// riêng do giáo viên tự tạo), tiến độ toàn chương trình + danh sách chương.
//
// Ngữ cảnh người xem (xác định 1 lần lúc tải trang, xem initContext()):
// - Giáo viên đã đăng nhập ("teacher"): thấy TẤT CẢ khối lớp 6-12 + chương trình riêng của chính
//   mình, có nút "+ Thêm chương trình" và (trong 1 chương trình riêng) "+ Thêm chương". Mỗi chương
//   đang có học sinh học hiện thêm "N nhóm đang học · M học sinh" (gộp từ tất cả nhóm của họ).
// - Học sinh đã vào 1 nhóm ("group"): CHỈ thấy đúng khối lớp/chương trình + đúng những chương đã
//   được giao cho nhóm (group.chapterIds) — không thấy toàn bộ chương trình mặc định nữa. "Học tự
//   do" do giáo viên của nhóm quyết định, không tự bật/tắt được.
// - Ngoài ra (chưa đăng nhập giáo viên, chưa vào nhóm nào): CHẶN — hiện thông báo cần vào nhóm
//   trước, không cho xem nội dung chương trình đào tạo (các công cụ khác của app không bị ảnh
//   hưởng, chỉ trang này).

(function () {
  let viewerMode = 'guest'; // 'teacher' | 'group' | 'guest' | 'no-firebase'
  let freeModeLockedByGroup = false;
  let chapterActivity = {};
  let ownPrograms = [];
  let groupChapterIdSet = null;
  let groupProgramChapterIds = {}; // programId -> [chapterId,...] được giao cho nhóm
  let groupPrograms = [];
  let groupGrades = [];

  let tabs = [];
  let currentTabKey = null;
  let currentTabData = null; // { type, grade, program, chapters } — kết quả getChaptersForCurrentTab() gần nhất

  function tabKey(t) { return t.type + ':' + t.value; }

  function ringSVG(percent, size = 66, stroke = 6) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (percent / 100) * c;
    return `
      <div class="progress-ring" style="width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}">
          <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
          <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="ring-label">${percent}%</div>
      </div>
    `;
  }

  // ---------- Ngữ cảnh người xem ----------
  async function initContext() {
    if (typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) { viewerMode = 'no-firebase'; return; }
    try {
      const teacher = await waitForAuthReady();
      if (teacher) {
        viewerMode = 'teacher';
        try { ownPrograms = await listProgramsForCurrentTeacher(); } catch (e) { ownPrograms = []; }
        try { chapterActivity = await getTeacherChapterActivity(); } catch (e) { chapterActivity = {}; }
        return;
      }
    } catch (e) { /* ignore */ }

    const membership = typeof getMembership === 'function' ? getMembership() : null;
    if (!membership || !membership.groupCode) { viewerMode = 'guest'; return; }

    try {
      const { db } = ensureFirebase();
      const snap = await db.collection('groups').where('groupCode', '==', membership.groupCode).limit(1).get();
      if (snap.empty) { viewerMode = 'guest'; return; }
      const group = snap.docs[0].data();
      setGroupFreeModeOverride(!!group.freeMode);
      freeModeLockedByGroup = true;
      const chapterIds = group.chapterIds || [];
      groupChapterIdSet = new Set(chapterIds);

      const gradesSet = new Set();
      const nonGradeIds = [];
      chapterIds.forEach((id) => {
        const found = findChapterAnywhere(id);
        if (found) gradesSet.add(found.grade); else nonGradeIds.push(id);
      });
      groupGrades = Array.from(gradesSet).sort((a, b) => a - b);

      if (nonGradeIds.length) {
        const docs = await Promise.all(nonGradeIds.map((id) => db.collection('programChapters').doc(id).get()));
        const programIdsSet = new Set();
        docs.forEach((doc, i) => {
          if (!doc.exists) return;
          const pid = doc.data().programId;
          programIdsSet.add(pid);
          (groupProgramChapterIds[pid] = groupProgramChapterIds[pid] || []).push(nonGradeIds[i]);
        });
        groupPrograms = await getProgramsByIds(Array.from(programIdsSet));
      }

      viewerMode = (groupGrades.length || groupPrograms.length) ? 'group' : 'guest';
    } catch (e) {
      viewerMode = 'guest';
    }
  }

  function renderGate() {
    $('#overviewWrap').style.display = 'none';
    const gate = $('#gateCard');
    gate.style.display = 'block';
    if (viewerMode === 'no-firebase') {
      gate.innerHTML = `<p class="hint">⚠️ Tính năng này chưa được giáo viên bật (chưa kết nối Firebase).</p>`;
      return;
    }
    gate.innerHTML = `
      <h2><span class="icon">🎓</span>Chương trình đào tạo</h2>
      <p class="hint">Nội dung học theo chương chỉ hiện cho học sinh đã vào 1 nhóm học tập (do giáo viên giao chương trình), hoặc giáo viên đã đăng nhập.</p>
      <a class="btn primary block" href="vao-nhom.html">Vào nhóm học tập</a>
    `;
  }

  // ---------- Tab (khối lớp mặc định + chương trình riêng) ----------
  function buildTabs() {
    if (viewerMode === 'teacher') {
      tabs = GRADES.map((g) => ({ type: 'grade', value: g.grade, label: g.label }))
        .concat(ownPrograms.map((p) => ({ type: 'program', value: p.id, label: p.name, icon: p.icon || '🎓' })));
    } else {
      tabs = groupGrades.map((g) => ({ type: 'grade', value: g, label: 'Lớp ' + g }))
        .concat(groupPrograms.map((p) => ({ type: 'program', value: p.id, label: p.name, icon: p.icon || '🎓' })));
    }
    if (!tabs.length) return;
    if (!currentTabKey || !tabs.some((t) => tabKey(t) === currentTabKey)) currentTabKey = tabKey(tabs[0]);
  }

  function renderTabBar() {
    const tabsHtml = tabs.map((t) => `
      <button class="tab-btn ${tabKey(t) === currentTabKey ? 'active' : ''}" data-key="${tabKey(t)}">${t.icon ? t.icon + ' ' : ''}${escapeHtml(t.label)}</button>
    `).join('');
    const addBtn = viewerMode === 'teacher' ? `<button class="tab-btn" id="addProgramTabBtn" style="border:1px dashed var(--border);">+ Thêm chương trình</button>` : '';
    $('#gradeTabs').innerHTML = tabsHtml + addBtn;
    $$('.tab-btn[data-key]', $('#gradeTabs')).forEach((btn) => {
      btn.addEventListener('click', () => { currentTabKey = btn.dataset.key; renderCurrentTab(); });
    });
    if (viewerMode === 'teacher') {
      $('#addProgramTabBtn').addEventListener('click', () => {
        $('#programAddForm').style.display = $('#programAddForm').style.display === 'none' ? 'block' : 'none';
      });
    }
  }

  async function getChaptersForCurrentTab() {
    const sepIdx = currentTabKey.indexOf(':');
    const type = currentTabKey.slice(0, sepIdx);
    const rawValue = currentTabKey.slice(sepIdx + 1);
    if (type === 'grade') {
      const grade = parseInt(rawValue, 10);
      let chapters = getChaptersByGrade(grade);
      if (viewerMode === 'group') chapters = chapters.filter((c) => groupChapterIdSet.has(c.id));
      return { type: 'grade', grade, program: null, chapters };
    }
    const programId = rawValue;
    let chapters = [];
    try { chapters = await getProgramChapters(programId); } catch (e) { chapters = []; }
    if (viewerMode === 'group') {
      const allowed = new Set(groupProgramChapterIds[programId] || []);
      chapters = chapters.filter((c) => allowed.has(c.id));
    }
    const program = (viewerMode === 'teacher' ? ownPrograms : groupPrograms).find((p) => p.id === programId);
    return { type: 'program', grade: null, program, chapters };
  }

  function renderOverview(data) {
    const chapters = data.chapters;
    const withContent = chapters.filter((c) => data.type === 'program' || hasContent(c));
    const percent = overallPercent(chapters);
    const doneCount = chapters.filter((c) => isChapterComplete(c.id)).length;
    const title = data.type === 'grade' ? `Tiến độ Hoá học lớp ${data.grade}` : `Tiến độ ${data.program ? data.program.name : ''}`;
    const sub = withContent.length
      ? `Đã hoàn thành ${doneCount}/${withContent.length} chương có nội dung`
      : (data.type === 'program' ? 'Chương trình này chưa có chương nào' : 'Nội dung chi tiết đang được biên soạn');
    $('#progressOverview').innerHTML = `
      ${ringSVG(percent)}
      <div class="po-text">
        <div class="po-title">${escapeHtml(title)}</div>
        <div class="po-sub">${escapeHtml(sub)}</div>
      </div>
    `;
  }

  function renderFreeModeToggle() {
    const el = $('#freeModeSwitch');
    el.classList.toggle('on', isFreeMode());
    el.classList.toggle('locked', freeModeLockedByGroup);
    $('#freeModeSub').textContent = freeModeLockedByGroup
      ? 'Do giáo viên của nhóm bạn thiết lập — không tự bật/tắt được.'
      : 'Cho phép mở tất cả chương, không cần học tuần tự';
  }

  function renderChapterList(data) {
    const chapters = data.chapters;
    $('#chapterListLabel').textContent = data.type === 'grade' ? 'Danh sách chương' : `Danh sách chương — ${data.program ? data.program.name : ''}`;
    $('#addProgramChapterBtn').style.display = (viewerMode === 'teacher' && data.type === 'program') ? 'block' : 'none';

    if (!chapters.length) {
      $('#chapterList').innerHTML = `<div class="card"><p class="hint">${data.type === 'program' ? 'Chương trình này chưa có chương nào. Bấm "+ Thêm chương mới" ở trên để bắt đầu.' : 'Chưa có dữ liệu chương trình cho khối lớp này.'}</p></div>`;
      return;
    }
    $('#chapterList').innerHTML = chapters.map((c) => {
      const withContent = data.type === 'program' ? true : hasContent(c);
      const unlocked = isChapterUnlocked(chapters, c.id);
      const percent = withContent ? chapterPercent(c.id) : 0;
      const complete = withContent && isChapterComplete(c.id);
      let badge = '';
      if (!withContent) badge = '<div class="cc-lock" title="Đang biên soạn">📝</div>';
      else if (!unlocked) badge = '<div class="cc-lock">🔒</div>';
      else if (complete) badge = '<div class="cc-check">✓ Xong</div>';
      const activity = chapterActivity[c.id];
      return `
        <div class="chapter-card ${unlocked ? '' : 'locked'}">
          ${unlocked ? `<a class="cc-link" href="chuong.html?id=${c.id}" aria-label="${escapeHtml(c.title)}"></a>` : ''}
          <div class="cc-icon">${c.icon}</div>
          <div class="cc-body">
            <div class="cc-order">Chương ${c.order}</div>
            <div class="cc-title">${escapeHtml(c.title)}</div>
            <div class="cc-desc">${escapeHtml(c.description)}</div>
            ${withContent ? `
              <div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${percent}%;"></div></div>
              <div class="cc-progress-label">${percent}% hoàn thành</div>
            ` : `<div class="cc-progress-label">Nội dung chi tiết đang được biên soạn</div>`}
            ${viewerMode === 'teacher' && activity ? `
              <div class="cc-activity">🧑‍🤝‍🧑 ${activity.groupCount} nhóm đang học · ${activity.studentCount} học sinh</div>
            ` : ''}
            ${viewerMode === 'teacher' && data.type === 'program' ? `
              <a href="#" class="program-chapter-delete" data-id="${c.id}" style="font-size:11px;color:var(--danger);display:inline-block;margin-top:6px;">Xoá chương này</a>
            ` : ''}
          </div>
          ${badge}
        </div>
      `;
    }).join('');

    if (viewerMode === 'teacher' && data.type === 'program') {
      $$('.program-chapter-delete', $('#chapterList')).forEach((a) => {
        a.addEventListener('click', async (e) => {
          e.preventDefault();
          if (!confirm('Xoá chương này khỏi chương trình? Bài giảng/câu hỏi/flashcard đã soạn trong chương cũng sẽ không còn truy cập được nữa.')) return;
          try {
            await deleteProgramChapter(a.dataset.id);
            renderCurrentTab();
          } catch (err) {
            alert('Không xoá được: ' + err.message);
          }
        });
      });
    }
  }

  async function renderCurrentTab() {
    renderTabBar();
    if (!currentTabKey) {
      $('#progressOverview').innerHTML = '';
      $('#chapterList').innerHTML = '<div class="card"><p class="hint">Chưa có chương trình nào.</p></div>';
      $('#addProgramChapterBtn').style.display = 'none';
      return;
    }
    currentTabData = await getChaptersForCurrentTab();
    renderOverview(currentTabData);
    renderFreeModeToggle();
    renderChapterList(currentTabData);
  }

  $('#freeModeSwitch').addEventListener('click', () => {
    if (freeModeLockedByGroup) return;
    setFreeMode(!isFreeMode());
    renderFreeModeToggle();
    if (currentTabData) renderChapterList(currentTabData);
  });

  $('#programCreateCancelBtn').addEventListener('click', () => {
    $('#programAddForm').style.display = 'none';
  });

  $('#programCreateBtn').addEventListener('click', async () => {
    const name = $('#programName').value.trim();
    const icon = $('#programIcon').value.trim();
    const description = $('#programDesc').value.trim();
    const box = $('#programCreateResult');
    if (!name) { showResult(box, 'Nhập tên chương trình.', true); return; }
    showResult(box, '⏳ Đang tạo...');
    try {
      const programId = await createProgram(name, icon, description);
      ownPrograms.push({ id: programId, name, icon: icon || '🎓', description });
      $('#programName').value = ''; $('#programIcon').value = ''; $('#programDesc').value = '';
      $('#programAddForm').style.display = 'none';
      hideResult(box);
      currentTabKey = tabKey({ type: 'program', value: programId });
      buildTabs();
      await renderCurrentTab();
    } catch (e) {
      showResult(box, `⚠️ ${escapeHtml(e.message)}`, true);
    }
  });

  $('#addProgramChapterBtn').addEventListener('click', async () => {
    if (!currentTabData || currentTabData.type !== 'program') return;
    const title = prompt('Tên chương mới:');
    if (!title || !title.trim()) return;
    const description = prompt('Mô tả ngắn (có thể bỏ trống):') || '';
    try {
      await addProgramChapter(currentTabData.program.id, { title: title.trim(), description: description.trim() });
      await renderCurrentTab();
    } catch (e) {
      alert('Không thêm được: ' + e.message);
    }
  });

  function applyHeaderTitle() {
    const title = viewerMode === 'teacher' ? 'Tạo chương trình giảng dạy' : 'Chương trình học tập';
    $('#pageHeaderTitle').textContent = title;
    document.title = title + ' — Trợ Lý Giáo Viên Hoá Học';
  }

  (async function init() {
    await initContext();
    if (viewerMode === 'guest' || viewerMode === 'no-firebase') { renderGate(); return; }
    applyHeaderTitle();
    $('#overviewWrap').style.display = 'block';
    buildTabs();
    await renderCurrentTab();
  })();
})();
