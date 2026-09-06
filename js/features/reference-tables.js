// Trang "Bảng tra cứu" — nội dung tĩnh (js/data/reference-tables.js), không cần Firebase/đăng nhập.
// 5 bảng khác cấu trúc nhau (hoá trị, lưới tính tan, danh sách dãy hoạt động, bảng thế điện cực, bảng
// nhận biết ion) nên mỗi bảng có hàm vẽ riêng, không dùng chung 1 khuôn thẻ như chemistry-formulas.js.
(function () {
  const chipsBox = $('#refTableChips');
  const box = $('#refTableBox');

  function renderChips(activeId) {
    chipsBox.innerHTML = REF_TABLE_SECTIONS.map((s) => `
      <button type="button" class="story-chip${s.id === activeId ? ' is-active' : ''}" data-section="${s.id}">${s.icon} ${escapeHtml(s.label)}</button>
    `).join('');
    $$('.story-chip', chipsBox).forEach((btn) => {
      btn.addEventListener('click', () => renderSection(btn.dataset.section));
    });
  }

  function solubChipHtml(code) {
    if (code === 't') return '<span class="solub-chip tan">T</span>';
    if (code === 'k') return '<span class="solub-chip khong-tan">K</span>';
    if (code === 'i') return '<span class="solub-chip it-tan">I</span>';
    return '<span class="solub-chip none">–</span>';
  }

  function renderValenceTable() {
    const elementRows = ELEMENT_VALENCES.map((e) => `
      <tr><td>${escapeHtml(e.symbol)}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.valence)}</td></tr>
    `).join('');
    const groupRows = POLYATOMIC_VALENCES.map((g) => `
      <tr><td>${escapeHtml(g.formula)}</td><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.valence)}</td></tr>
    `).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">💡 Quy tắc hoá trị: trong hợp chất AₓBᵧ, x×(hoá trị A) = y×(hoá trị B) — dùng để lập nhanh công thức hoá học.</p>
        <h3 class="formula-name">Nguyên tố</h3>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Kí hiệu</th><th>Tên nguyên tố</th><th>Hoá trị</th></tr></thead>
            <tbody>${elementRows}</tbody>
          </table>
        </div>
        <h3 class="formula-name" style="margin-top:16px;">Nhóm nguyên tử thường gặp</h3>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Công thức</th><th>Tên nhóm</th><th>Hoá trị</th></tr></thead>
            <tbody>${groupRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSolubilityTable() {
    const header = `<th>Cation \\ Gốc axit</th>` + SOLUBILITY_ANIONS.map((a) => `<th>${escapeHtml(a.label)}</th>`).join('');
    const rows = SOLUBILITY_CATIONS.map((c) => {
      const cells = SOLUBILITY_ANIONS.map((a) => {
        const code = SOLUBILITY_DATA[c.id + '-' + a.id];
        return `<td>${solubChipHtml(code)}</td>`;
      }).join('');
      return `<tr><td>${escapeHtml(c.label)}</td>${cells}</tr>`;
    }).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">
          <span class="solub-chip tan">T</span> tan &nbsp;
          <span class="solub-chip khong-tan">K</span> không tan &nbsp;
          <span class="solub-chip it-tan">I</span> ít tan &nbsp;
          <span class="solub-chip none">–</span> không tồn tại/không bền — vuốt ngang để xem hết bảng.
        </p>
        <div class="roster-table-wrap">
          <table class="roster-table solub-table">
            <thead><tr>${header}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderActivitySeries() {
    const chips = METAL_ACTIVITY_SERIES.map((m, i) => `
      <div class="as-chip">
        <span class="as-rank">${i + 1}</span>
        <span>${escapeHtml(m.symbol)}</span>
      </div>
    `).join('<div class="as-arrow">→</div>');
    const notes = METAL_ACTIVITY_SERIES.map((m) => `<li><strong>${escapeHtml(m.symbol)}</strong> (${escapeHtml(m.name)}): ${escapeHtml(m.note)}</li>`).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">Xếp theo chiều giảm dần độ hoạt động hoá học (trái mạnh hơn phải):</p>
        <div class="activity-series-row">${chips}</div>
        <ul class="formula-vars" style="margin-top:12px;">${notes}</ul>
      </div>
    `;
  }

  function renderElectrodeSeries() {
    const rows = ELECTRODE_POTENTIALS.map((e) => `
      <tr><td>${escapeHtml(e.halfReaction)}</td><td>${e.e0.toFixed(2)} V</td></tr>
    `).join('');
    box.innerHTML = `
      <div class="card">
        <p class="hint" style="margin-top:0;">Sắp xếp từ thế điện cực chuẩn âm nhất (kim loại dễ bị oxi hoá nhất) đến dương nhất (dễ bị khử nhất), ở 25°C, so với điện cực hiđro chuẩn.</p>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Bán phản ứng khử</th><th>E° (V)</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderIonTable() {
    const rows = ION_IDENTIFICATION.map((i) => `
      <tr><td>${escapeHtml(i.ion)}</td><td>${escapeHtml(i.reagent)}</td><td>${escapeHtml(i.phenomenon)}</td></tr>
    `).join('');
    box.innerHTML = `
      <div class="card">
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Ion cần nhận biết</th><th>Thuốc thử</th><th>Hiện tượng</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSection(id) {
    renderChips(id);
    if (id === 'valence') renderValenceTable();
    else if (id === 'solubility') renderSolubilityTable();
    else if (id === 'activity') renderActivitySeries();
    else if (id === 'electrode') renderElectrodeSeries();
    else if (id === 'ionid') renderIonTable();
  }

  renderSection(REF_TABLE_SECTIONS[0].id);
})();
