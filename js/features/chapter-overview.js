// Trang tổng quan "Học theo chương": chọn lớp, tiến độ toàn chương trình + danh sách chương.

(function () {
  const GRADE_KEY = 'hoahoc_selected_grade';
  let currentGrade = parseInt(localStorage.getItem(GRADE_KEY), 10) || 10;
  if (!GRADES.some((g) => g.grade === currentGrade)) currentGrade = 10;

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
    $('#freeModeSwitch').classList.toggle('on', isFreeMode());
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
    setFreeMode(!isFreeMode());
    renderAll();
  });

  renderAll();
})();
