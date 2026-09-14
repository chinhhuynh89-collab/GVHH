// Trang "Từ điển Hoá học Việt-Anh" — nội dung tĩnh (CHEMISTRY_DICTIONARY/DICTIONARY_CATEGORIES,
// js/data/chemistry-dictionary.js), không cần Firebase/đăng nhập, cùng khuôn với chemistry-formulas.js
// (chip lọc theo nhóm + thanh tìm kiếm). Khác biệt: thêm bỏ dấu tiếng Việt khi so khớp tìm kiếm — vì
// đây là công cụ tra từ, gõ nhanh không dấu trên điện thoại cần vẫn tìm được ("nguyen tu" -> "Nguyên tử").
(function () {
  const listBox = $('#dictListBox');
  const chipsBox = $('#dictCategoryChips');
  const searchInput = $('#dictSearch');

  function stripDiacritics(str) {
    return str
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  function categoryInfo(catId) {
    return DICTIONARY_CATEGORIES.find((c) => c.id === catId);
  }

  function renderChips(activeCategory) {
    const chips = [{ id: 'all', icon: '📚', label: 'Tất cả' }].concat(DICTIONARY_CATEGORIES);
    chipsBox.innerHTML = chips.map((c) => `
      <button type="button" class="story-chip${c.id === activeCategory ? ' is-active' : ''}" data-category="${c.id}">${c.icon} ${escapeHtml(c.label)}</button>
    `).join('');
    $$('.story-chip', chipsBox).forEach((btn) => {
      btn.addEventListener('click', () => { state.category = btn.dataset.category; renderList(); });
    });
  }

  const state = { category: 'all', keyword: '' };

  function matchesKeyword(item, keyword) {
    if (!keyword) return true;
    const haystack = stripDiacritics((item.vi + ' ' + item.en).toLowerCase());
    return haystack.includes(keyword);
  }

  function renderList() {
    renderChips(state.category);
    const keyword = stripDiacritics(state.keyword.trim().toLowerCase());
    const items = CHEMISTRY_DICTIONARY.filter((d) =>
      (state.category === 'all' || d.category === state.category) && matchesKeyword(d, keyword)
    );
    if (!items.length) {
      listBox.innerHTML = '<div class="card"><p class="hint">Không tìm thấy từ/thuật ngữ phù hợp.</p></div>';
      return;
    }
    listBox.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        ${items.map((d) => {
          const cat = categoryInfo(d.category);
          return `
            <div class="dict-row">
              <div class="dict-row-vi">${escapeHtml(d.vi)}</div>
              <div class="dict-row-en">${escapeHtml(d.en)}</div>
              ${cat ? `<div class="dict-row-cat">${cat.icon} ${escapeHtml(cat.label)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  searchInput.addEventListener('input', () => {
    state.keyword = searchInput.value;
    renderList();
  });

  renderList();
})();
