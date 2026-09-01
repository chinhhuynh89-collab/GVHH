// Bảng tuần hoàn tương tác: dựng lưới 18 cột, tìm kiếm, modal chi tiết nguyên tố.

(function () {
  const grid = $('#ptGrid');
  const legend = $('#ptLegend');
  const search = $('#ptSearch');
  const backdrop = $('#elModal');
  const modalBody = $('#elModalBody');

  const PLACEHOLDERS = [
    { row: 6, col: 3, label: '57–71', target: 9 },
    { row: 7, col: 3, label: '89–103', target: 10 }
  ];

  function buildLegend() {
    legend.innerHTML = Object.keys(CATEGORY_LABELS).map((key) => `
      <div class="legend-item">
        <span class="swatch" style="background:${CATEGORY_COLORS[key]}"></span>
        ${CATEGORY_LABELS[key]}
      </div>
    `).join('');
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function buildGrid() {
    const frag = document.createDocumentFragment();

    ELEMENTS.forEach((el) => {
      const pos = gridPositionForZ(el.z);
      const cell = document.createElement('div');
      cell.className = 'pt-cell';
      cell.style.gridRow = pos.row;
      cell.style.gridColumn = pos.col;
      const color = CATEGORY_COLORS[el.cat] || '#64748b';
      cell.style.background = hexToRgba(color, 0.18);
      cell.style.color = color;
      cell.dataset.z = el.z;
      cell.dataset.search = `${el.sym} ${el.vi} ${el.en} ${el.z}`.toLowerCase();
      cell.innerHTML = `<span class="z">${el.z}</span><span class="sym">${el.sym}</span>`;
      cell.addEventListener('click', () => openElement(el.z));
      frag.appendChild(cell);
    });

    PLACEHOLDERS.forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'pt-cell placeholder';
      cell.style.visibility = 'visible';
      cell.style.pointerEvents = 'none';
      cell.style.background = 'transparent';
      cell.style.border = 'none';
      cell.style.color = 'var(--text-faint)';
      cell.style.fontSize = '10px';
      cell.style.gridRow = p.row;
      cell.style.gridColumn = p.col;
      cell.innerHTML = `<span style="font-weight:700;">${p.label}</span>`;
      grid.appendChild(cell);
    });

    grid.appendChild(frag);
  }

  function openElement(z) {
    const el = getElementByZ(z);
    if (!el) return;
    const color = CATEGORY_COLORS[el.cat] || '#64748b';
    modalBody.innerHTML = `
      <button class="close-btn" id="elModalClose">✕</button>
      <div class="el-head">
        <div class="el-sym-big" style="background:${hexToRgba(color, 0.2)};color:${color};">${el.sym}</div>
        <div>
          <div class="el-name">${el.vi}</div>
          <div class="el-name-en">${el.en} · Z = ${el.z}</div>
          <span class="el-cat-badge" style="background:${hexToRgba(color, 0.2)};color:${color};">${CATEGORY_LABELS[el.cat] || 'Khác'}</span>
        </div>
      </div>
      <div class="el-info-grid">
        <div class="info-item"><div class="k">Khối lượng nguyên tử</div><div class="v">${el.mass} u</div></div>
        <div class="info-item"><div class="k">Chu kỳ / Nhóm</div><div class="v">${el.period} / ${el.group || '—'}</div></div>
        <div class="info-item" style="grid-column: 1 / -1;"><div class="k">Cấu hình electron</div><div class="v">${el.config}</div></div>
        <div class="info-item"><div class="k">Khối lượng riêng</div><div class="v">${el.density != null ? el.density + ' ' + (el.densityUnit || 'g/cm³') : 'Chưa xác định'}</div></div>
        <div class="info-item"><div class="k">Nóng chảy / Sôi</div><div class="v">${el.melt != null ? el.melt + '°C' : '—'} / ${el.boil != null ? el.boil + '°C' : '—'}</div></div>
      </div>
      <div class="el-summary">${el.summary}</div>
    `;
    backdrop.classList.add('show');
    $('#elModalClose').addEventListener('click', closeModal);
  }

  function closeModal() {
    backdrop.classList.remove('show');
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    $$('.pt-cell', grid).forEach((cell) => {
      if (!cell.dataset.search) return;
      const match = q === '' || cell.dataset.search.includes(q);
      cell.style.opacity = match ? '1' : '0.18';
    });
  });

  buildLegend();
  buildGrid();
})();
