// Trang "Câu chuyện Hoá học" — nội dung tĩnh (CHEMISTRY_STORIES/STORY_CATEGORIES, js/data/
// chemistry-stories.js), không cần Firebase/đăng nhập, giống hệt cách periodic-table.js đọc ELEMENTS.
(function () {
  const listBox = $('#storyListBox');
  const detailBox = $('#storyDetailBox');
  const chipsBox = $('#storyCategoryChips');

  function categoryLabel(catId) {
    const cat = STORY_CATEGORIES.find((c) => c.id === catId);
    return cat ? cat.label : catId;
  }

  function renderChips(activeCategory) {
    const chips = [{ id: 'all', icon: '📚', label: 'Tất cả' }].concat(STORY_CATEGORIES);
    chipsBox.innerHTML = chips.map((c) => `
      <button type="button" class="story-chip${c.id === activeCategory ? ' is-active' : ''}" data-category="${c.id}">${c.icon} ${escapeHtml(c.label)}</button>
    `).join('');
    $$('.story-chip', chipsBox).forEach((btn) => {
      btn.addEventListener('click', () => renderList(btn.dataset.category));
    });
  }

  function renderList(activeCategory) {
    detailBox.style.display = 'none';
    listBox.style.display = 'block';
    renderChips(activeCategory);
    const stories = activeCategory === 'all'
      ? CHEMISTRY_STORIES
      : CHEMISTRY_STORIES.filter((s) => s.category === activeCategory);
    listBox.innerHTML = stories.map((s) => `
      <div class="chapter-card">
        <div class="cc-icon">${s.icon}</div>
        <div class="cc-body">
          <div class="cc-order">${escapeHtml(categoryLabel(s.category))}</div>
          <div class="cc-title">${escapeHtml(s.title)}</div>
          <div class="cc-desc">${escapeHtml(s.summary)}</div>
        </div>
        <a class="cc-link" href="cau-chuyen-hoa-hoc.html?id=${encodeURIComponent(s.id)}" aria-label="${escapeHtml(s.title)}"></a>
      </div>
    `).join('');
  }

  function renderDetail(story) {
    listBox.style.display = 'none';
    chipsBox.style.display = 'none';
    detailBox.style.display = 'block';
    detailBox.innerHTML = `
      <div class="chapter-hero">
        <div class="ch-icon">${story.icon}</div>
        <div>
          <h2>${escapeHtml(story.title)}</h2>
          <p>${escapeHtml(categoryLabel(story.category))}</p>
        </div>
      </div>
      <div class="card">
        ${story.body.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        <p class="hint">🔗 <a href="${story.sourceUrl}" target="_blank" rel="noopener">Xem chi tiết</a></p>
      </div>
      <a class="btn block" href="cau-chuyen-hoa-hoc.html" style="margin-top:14px;">⬅ Quay lại danh sách</a>
    `;
  }

  function init() {
    const id = new URLSearchParams(window.location.search).get('id');
    const story = id ? CHEMISTRY_STORIES.find((s) => s.id === id) : null;
    if (story) renderDetail(story);
    else renderList('all');
  }

  init();
})();
