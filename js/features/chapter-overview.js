// Trang tổng quan "Học theo chương": chọn lớp, tiến độ toàn chương trình + danh sách chương.
//
// Ngữ cảnh người xem (xác định 1 lần lúc tải trang, xem initContext()):
// - Giáo viên đã đăng nhập: hiện thêm "N nhóm đang học · M học sinh" trên mỗi chương có học sinh
//   động tới, gộp từ tất cả nhóm của giáo viên đó — để dễ quan sát mà không cần vào từng nhóm.
// - Học sinh đã vào 1 nhóm: "Học tự do" do giáo viên của nhóm quyết định (xem groups-data.js:
//   updateGroupFreeMode), không tự bật/tắt được nữa — nút chuyển thành hiển thị trạng thái, không
//   bấm được.
// - Ngoài ra (duyệt tự do, chưa đăng nhập/chưa vào nhóm): giữ nguyên hành vi cũ, tự bật/tắt được.

(function () {
  const GRADE_KEY = 'hoahoc_selected_grade';
  let currentGrade = parseInt(localStorage.getItem(GRADE_KEY), 10) || 10;
  if (!GRADES.some((g) => g.grade === currentGrade)) currentGrade = 10;

  let freeModeLockedByGroup = false; // true nếu học sinh đang ở trong 1 nhóm (không tự bật/tắt được)
  let isTeacherViewer = false;
  let chapterActivity = {}; // chỉ có dữ liệu nếu isTeacherViewer

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

  function renderGradeTabs() {
    $('#gradeTabs').innerHTML = GRADES.map((g) => `
      <button class="tab-btn ${g.grade === currentGrade ? 'active' : ''}" data-grade="${g.grade}">${g.label}</button>
    `).join('');
    $$('.tab-btn', $('#gradeTabs')).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentGrade = parseInt(btn.dataset.grade, 10);
        localStorage.setItem(GRADE_KEY, currentGrade);
        renderAll();
      });
    });
  }

  function renderOverview(chapters) {
    const withContent = chapters.filter(hasContent);
    const percent = overallPercent(chapters);
    const doneCount = chapters.filter((c) => isChapterComplete(c.id)).length;
    const sub = withContent.length
      ? `Đã hoàn thành ${doneCount}/${withContent.length} chương có nội dung`
      : 'Nội dung chi tiết đang được biên soạn';
    $('#progressOverview').innerHTML = `
      ${ringSVG(percent)}
      <div class="po-text">
        <div class="po-title">Tiến độ Hoá học lớp ${currentGrade}</div>
        <div class="po-sub">${sub}</div>
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

  function renderChapterList(chapters) {
    if (!chapters.length) {
      $('#chapterList').innerHTML = `<div class="card"><p class="hint">Chưa có dữ liệu chương trình cho khối lớp này.</p></div>`;
      return;
    }
    $('#chapterList').innerHTML = chapters.map((c) => {
      const withContent = hasContent(c);
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
          ${unlocked ? `<a class="cc-link" href="chuong.html?id=${c.id}" aria-label="${c.title}"></a>` : ''}
          <div class="cc-icon">${c.icon}</div>
          <div class="cc-body">
            <div class="cc-order">Chương ${c.order}</div>
            <div class="cc-title">${c.title}</div>
            <div class="cc-desc">${c.description}</div>
            ${withContent ? `
              <div class="cc-progress-bar"><div class="cc-progress-fill" style="width:${percent}%;"></div></div>
              <div class="cc-progress-label">${percent}% hoàn thành</div>
            ` : `<div class="cc-progress-label">Nội dung chi tiết đang được biên soạn</div>`}
            ${isTeacherViewer && activity ? `
              <div class="cc-activity">🧑‍🤝‍🧑 ${activity.groupCount} nhóm đang học · ${activity.studentCount} học sinh</div>
            ` : ''}
          </div>
          ${badge}
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    const chapters = getChaptersByGrade(currentGrade);
    renderGradeTabs();
    renderOverview(chapters);
    renderFreeModeToggle();
    renderChapterList(chapters);
  }

  $('#freeModeSwitch').addEventListener('click', () => {
    if (freeModeLockedByGroup) return; // giáo viên nhóm quyết định, học sinh không tự đổi được
    setFreeMode(!isFreeMode());
    renderAll();
  });

  async function initContext() {
    if (typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured()) return;
    try {
      const teacher = await waitForAuthReady();
      if (teacher) {
        isTeacherViewer = true;
        try { chapterActivity = await getTeacherChapterActivity(); } catch (e) { chapterActivity = {}; }
        return;
      }
    } catch (e) { /* ignore */ }

    const membership = typeof getMembership === 'function' ? getMembership() : null;
    if (membership && membership.groupCode) {
      try {
        const { db } = ensureFirebase();
        const snap = await db.collection('groups').where('groupCode', '==', membership.groupCode).limit(1).get();
        if (!snap.empty) {
          setGroupFreeModeOverride(!!snap.docs[0].data().freeMode);
          freeModeLockedByGroup = true;
        }
      } catch (e) { /* ignore, dùng lựa chọn cá nhân như bình thường */ }
    }
  }

  (async function init() {
    await initContext();
    renderAll();
  })();
})();
