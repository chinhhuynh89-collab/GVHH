// Trang "Công thức, Định luật" — nội dung tĩnh (CHEMISTRY_FORMULAS/FORMULA_CATEGORIES, js/data/
// chemistry-formulas.js), không cần Firebase/đăng nhập, giống hệt cách periodic-table.js đọc ELEMENTS.
// Không có trang chi tiết riêng — mỗi thẻ đã hiện đủ công thức + chú thích biến số + ghi chú ngay tại
// danh sách, vì đây là tài liệu tra cứu nhanh, không phải bài đọc dài như "Câu chuyện Hoá học".
(function () {
  const listBox = $('#formulaListBox');
  const chipsBox = $('#formulaCategoryChips');
  const searchInput = $('#formulaSearch');

  function categoryInfo(catId) {
    return FORMULA_CATEGORIES.find((c) => c.id === catId);
  }

  function renderChips(activeCategory) {
    const chips = [{ id: 'all', icon: '📚', label: 'Tất cả' }].concat(FORMULA_CATEGORIES);
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
    const haystack = (item.name + ' ' + item.formula).toLowerCase();
    return haystack.includes(keyword);
  }

  function renderList() {
    renderChips(state.category);
    const keyword = state.keyword.trim().toLowerCase();
    const items = CHEMISTRY_FORMULAS.filter((f) =>
      (state.category === 'all' || f.category === state.category) && matchesKeyword(f, keyword)
    );
    if (!items.length) {
      listBox.innerHTML = '<div class="card"><p class="hint">Không tìm thấy công thức/định luật phù hợp.</p></div>';
      return;
    }
    listBox.innerHTML = items.map((f) => {
      const cat = categoryInfo(f.category);
      return `
        <div class="card formula-card">
          <div class="cc-order">${cat ? cat.icon + ' ' + escapeHtml(cat.label) : ''}</div>
          <h3 class="formula-name">${escapeHtml(f.name)}</h3>
          <div class="formula-expr">${escapeHtml(f.formula)}</div>
          <ul class="formula-vars">
            ${f.variables.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
          </ul>
          ${f.note ? `<p class="hint formula-note">💡 ${escapeHtml(f.note)}</p>` : ''}
        </div>
      `;
    }).join('');
  }

  searchInput.addEventListener('input', () => {
    state.keyword = searchInput.value;
    renderList();
  });

  renderList();
})();
