// Trang "Danh pháp hữu cơ" — nội dung tĩnh (js/data/organic-nomenclature.js), không cần Firebase/
// đăng nhập, cùng khuôn mẫu chip-chuyển-mục như reference-tables.js.
(function () {
  const chipsBox = $('#nomenclatureChips');
  const box = $('#nomenclatureBox');

  function renderChips(activeId) {
    chipsBox.innerHTML = NOMENCLATURE_SECTIONS.map((s) => `
      <button type="button" class="story-chip${s.id === activeId ? ' is-active' : ''}" data-section="${s.id}">${s.icon} ${escapeHtml(s.label)}</button>
    `).join('');
    $$('.story-chip', chipsBox).forEach((btn) => {
      btn.addEventListener('click', () => renderSection(btn.dataset.section));
    });
  }

  function renderCarbonPrefix() {
    const rows = CARBON_PREFIXES.map((p) => `<tr><td>${p.count}</td><td>${escapeHtml(p.prefix)}</td></tr>`).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">Tiền tố ghép với hậu tố (-an/-en/-in/-ol...) để tạo tên đầy đủ. VD: 2 cacbon + "-an" → "Etan".</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Số nguyên tử C mạch chính</th><th>Tiền tố</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSuffix() {
    const rows = FUNCTIONAL_SUFFIXES.map((f) => `
      <tr><td>${escapeHtml(f.className)}</td><td>${escapeHtml(f.suffix)}</td><td>${escapeHtml(f.example)}</td></tr>
    `).join('');
    box.innerHTML = `
      <div class="card">
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Loại hợp chất</th><th>Hậu tố</th><th>Ví dụ</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAlkyl() {
    const rows = ALKYL_GROUPS.map((a) => `<tr><td>${escapeHtml(a.formula)}</td><td>${escapeHtml(a.name)}</td></tr>`).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">Tên gốc ankyl dùng để gọi tên các nhánh gắn vào mạch chính.</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Công thức gốc</th><th>Tên gốc</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRules() {
    const items = NAMING_STEPS.map((s) => `
      <div class="formula-card" style="margin-bottom:10px;">
        <h3 class="formula-name">Bước ${s.step}: ${escapeHtml(s.title)}</h3>
        <p class="hint" style="margin-top:0;">${escapeHtml(s.detail)}</p>
      </div>
    `).join('');
    box.innerHTML = items;
  }

  function renderExamples() {
    const rows = NOMENCLATURE_EXAMPLES.map((e) => `<tr><td>${escapeHtml(e.formula)}</td><td>${escapeHtml(e.name)}</td></tr>`).join('');
    box.innerHTML = `
      <div class="card">
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Công thức</th><th>Tên gọi</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSection(id) {
    renderChips(id);
    if (id === 'carbon-prefix') renderCarbonPrefix();
    else if (id === 'suffix') renderSuffix();
    else if (id === 'alkyl') renderAlkyl();
    else if (id === 'rules') renderRules();
    else if (id === 'examples') renderExamples();
  }

  renderSection(NOMENCLATURE_SECTIONS[0].id);
})();
