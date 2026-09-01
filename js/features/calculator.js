// Công cụ tính toán nhanh: mol/khối lượng/thể tích khí, nồng độ dung dịch, độ tan, pH, hiệu suất phản ứng.

(function () {
  initTabs(document);

  function num(id) {
    const el = $('#' + id);
    if (!el || el.value.trim() === '') return null;
    const v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  }

  // ---------- Tính M từ công thức ----------
  $('#molFormulaBtn').addEventListener('click', () => {
    const box = $('#molFormulaResult');
    const formula = $('#molFormula').value.trim();
    if (!formula) { showResult(box, 'Nhập công thức hoá học.', true); return; }
    try {
      const M = molarMassOf(formula);
      showResult(box, `Khối lượng mol M = <span class="result-value">${formatNumber(M, 4)}</span> g/mol`);
      $('#molM').value = formatNumber(M, 4);
    } catch (e) {
      showResult(box, `⚠️ ${e.message}`, true);
    }
  });

  // ---------- Mol ⇄ khối lượng ⇄ thể tích khí ----------
  $('#molCalcBtn').addEventListener('click', () => {
    const box = $('#molResult');
    const M = num('molM');
    let n = num('molN');
    let m = num('molMass');
    let V = num('molVolume');
    const Vm = parseFloat($('#molCondition').value);

    if (n === null && m === null && V === null) {
      showResult(box, 'Nhập ít nhất một trong ba giá trị: n, m hoặc V.', true);
      return;
    }

    if (n === null) {
      if (m !== null && M) n = m / M;
      else if (V !== null) n = V / Vm;
    }
    if (n === null) {
      showResult(box, 'Cần khối lượng mol M để tính n từ m. Hãy nhập M hoặc dùng thể tích khí V.', true);
      return;
    }
    if (m === null && M) m = n * M;
    if (V === null) V = n * Vm;

    const lines = [`Số mol n = <span class="result-value">${formatNumber(n)}</span> mol`];
    lines.push(m !== null ? `Khối lượng m = <span class="result-value">${formatNumber(m)}</span> gam` : 'Khối lượng m: cần nhập M để tính');
    lines.push(`Thể tích khí V = <span class="result-value">${formatNumber(V)}</span> lít`);
    showResult(box, lines.join('<br>'));
  });

  // ---------- Nồng độ mol ----------
  $('#cmBtn').addEventListener('click', () => {
    const box = $('#cmResult');
    const n = num('cmN'), V = num('cmV');
    if (n === null || V === null) { showResult(box, 'Nhập đủ số mol n và thể tích V.', true); return; }
    if (V <= 0) { showResult(box, 'Thể tích V phải lớn hơn 0.', true); return; }
    const cm = n / V;
    showResult(box, `C<sub>M</sub> = <span class="result-value">${formatNumber(cm)}</span> mol/l`);
  });

  // ---------- Nồng độ phần trăm ----------
  $('#cpBtn').addEventListener('click', () => {
    const box = $('#cpResult');
    const ct = num('cpCt'), dd = num('cpDd');
    if (ct === null || dd === null) { showResult(box, 'Nhập đủ khối lượng chất tan và khối lượng dung dịch.', true); return; }
    if (dd <= 0) { showResult(box, 'Khối lượng dung dịch phải lớn hơn 0.', true); return; }
    const cp = (ct / dd) * 100;
    showResult(box, `C% = <span class="result-value">${formatNumber(cp)}</span> %`);
  });

  // ---------- Độ tan ----------
  $('#sBtn').addEventListener('click', () => {
    const box = $('#sResult');
    let S = num('sS'), ct = num('sCt'), h2o = num('sH2O');
    const provided = [S, ct, h2o].filter((v) => v !== null).length;
    if (provided < 2) { showResult(box, 'Nhập đúng 2 trong 3 giá trị.', true); return; }

    if (S === null) {
      if (h2o <= 0) { showResult(box, 'Khối lượng nước phải lớn hơn 0.', true); return; }
      S = (ct / h2o) * 100;
    } else if (ct === null) {
      ct = (S * h2o) / 100;
    } else if (h2o === null) {
      if (S <= 0) { showResult(box, 'Độ tan S phải lớn hơn 0.', true); return; }
      h2o = (ct * 100) / S;
    }
    showResult(box,
      `S = <span class="result-value">${formatNumber(S)}</span> g/100g nước<br>` +
      `m<sub>ct</sub> = <span class="result-value">${formatNumber(ct)}</span> gam<br>` +
      `m<sub>H₂O</sub> = <span class="result-value">${formatNumber(h2o)}</span> gam`
    );
  });

  // ---------- pH từ nồng độ ion ----------
  $('#phIonBtn').addEventListener('click', () => {
    const box = $('#phIonResult');
    const type = $('#phIonType').value;
    const c = num('phIonConc');
    if (c === null || c <= 0) { showResult(box, 'Nhập nồng độ ion lớn hơn 0.', true); return; }
    const hConc = type === 'H' ? c : 1e-14 / c;
    const ohConc = type === 'OH' ? c : 1e-14 / c;
    const pH = -Math.log10(hConc);
    const pOH = 14 - pH;
    showResult(box,
      `pH = <span class="result-value">${formatNumber(pH, 3)}</span> &nbsp; (pOH = ${formatNumber(pOH, 3)})<br>` +
      `[H⁺] = ${formatNumber(hConc)} mol/l &nbsp; [OH⁻] = ${formatNumber(ohConc)} mol/l<br>` +
      `Dung dịch có tính ${pH < 7 ? 'axit' : pH > 7 ? 'bazơ (kiềm)' : 'trung tính'}`
    );
  });

  // ---------- pH axit/bazơ mạnh ----------
  $('#phStrongBtn').addEventListener('click', () => {
    const box = $('#phStrongResult');
    const type = $('#phType').value;
    const c = num('phConc');
    const n = num('phN') || 1;
    if (c === null || c <= 0) { showResult(box, 'Nhập nồng độ dung dịch lớn hơn 0.', true); return; }
    if (n <= 0) { showResult(box, 'Số ion H⁺/OH⁻ mỗi phân tử phải ≥ 1.', true); return; }

    let pH;
    if (type === 'acid') {
      const hConc = c * n;
      pH = -Math.log10(hConc);
    } else {
      const ohConc = c * n;
      const pOH = -Math.log10(ohConc);
      pH = 14 - pOH;
    }
    showResult(box, `pH = <span class="result-value">${formatNumber(pH, 3)}</span> &nbsp; (pOH = ${formatNumber(14 - pH, 3)})`);
  });

  // ---------- Hiệu suất phản ứng ----------
  $('#yBtn').addEventListener('click', () => {
    const box = $('#yResult');
    const theory = num('yTheory'), actual = num('yActual');
    if (theory === null || actual === null) { showResult(box, 'Nhập đủ lượng lý thuyết và lượng thực tế.', true); return; }
    if (theory <= 0) { showResult(box, 'Lượng lý thuyết phải lớn hơn 0.', true); return; }
    const h = (actual / theory) * 100;
    let note = '';
    if (h > 100) note = '<br><span style="color:var(--accent);">⚠️ Hiệu suất &gt; 100% — kiểm tra lại số liệu.</span>';
    showResult(box, `H% = <span class="result-value">${formatNumber(h, 2)}</span> %${note}`);
  });
})();
