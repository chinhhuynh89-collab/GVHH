// Cân bằng phương trình hoá học bằng đại số tuyến tính (giải hệ phương trình thuần nhất
// bằng khử Gauss trên phân số chính xác, sau đó quy đồng về số nguyên nhỏ nhất).

function gcdInt(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

class Fraction {
  constructor(n, d = 1) {
    if (d === 0) throw new Error('Chia cho 0');
    if (d < 0) { n = -n; d = -d; }
    const g = gcdInt(n, d);
    this.n = g ? n / g : 0;
    this.d = g ? d / g : 1;
  }
  add(o) { return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Fraction(this.n * o.n, this.d * o.d); }
  div(o) { return new Fraction(this.n * o.d, this.d * o.n); }
  isZero() { return this.n === 0; }
  neg() { return new Fraction(-this.n, this.d); }
  static from(x) { return x instanceof Fraction ? x : new Fraction(x, 1); }
}

function splitEquationSides(equationStr) {
  const parts = equationStr.split(/->|=>|=|→/);
  if (parts.length !== 2) throw new Error('Phương trình cần đúng 1 dấu "->" hoặc "=" ngăn cách 2 vế');
  return [parts[0], parts[1]];
}

function splitSpecies(sideStr) {
  return sideStr.split('+').map((s) => s.trim()).filter(Boolean);
}

function balanceEquation(equationStr) {
  const [leftStr, rightStr] = splitEquationSides(equationStr);
  const reactants = splitSpecies(leftStr);
  const products = splitSpecies(rightStr);
  if (reactants.length === 0 || products.length === 0) {
    throw new Error('Cần có ít nhất 1 chất ở mỗi vế');
  }

  const species = [...reactants, ...products];
  const parsedCounts = species.map((f) => {
    try {
      return parseFormula(f);
    } catch (e) {
      throw new Error(`Công thức "${f}" không hợp lệ: ${e.message}`);
    }
  });

  const elementSet = new Set();
  parsedCounts.forEach((counts) => Object.keys(counts).forEach((el) => elementSet.add(el)));
  const elements = Array.from(elementSet);

  // Kiểm tra nguyên tố chỉ xuất hiện 1 vế -> không thể cân bằng
  const leftElements = new Set();
  const rightElements = new Set();
  parsedCounts.slice(0, reactants.length).forEach((c) => Object.keys(c).forEach((el) => leftElements.add(el)));
  parsedCounts.slice(reactants.length).forEach((c) => Object.keys(c).forEach((el) => rightElements.add(el)));
  for (const el of elementSet) {
    if (!leftElements.has(el) || !rightElements.has(el)) {
      throw new Error(`Nguyên tố ${el} chỉ xuất hiện ở một vế — phương trình không cân bằng được`);
    }
  }

  const numCols = species.length;
  const matrix = elements.map((el) =>
    parsedCounts.map((counts, j) => {
      const sign = j < reactants.length ? 1 : -1;
      return new Fraction((counts[el] || 0) * sign, 1);
    })
  );

  // Khử Gauss -> dạng bậc thang rút gọn (RREF)
  let pivotRow = 0;
  const pivotCols = [];
  for (let col = 0; col < numCols && pivotRow < matrix.length; col++) {
    let sel = -1;
    for (let r = pivotRow; r < matrix.length; r++) {
      if (!matrix[r][col].isZero()) { sel = r; break; }
    }
    if (sel === -1) continue;
    [matrix[pivotRow], matrix[sel]] = [matrix[sel], matrix[pivotRow]];

    const pivotVal = matrix[pivotRow][col];
    matrix[pivotRow] = matrix[pivotRow].map((v) => v.div(pivotVal));

    for (let r = 0; r < matrix.length; r++) {
      if (r === pivotRow) continue;
      const factor = matrix[r][col];
      if (factor.isZero()) continue;
      matrix[r] = matrix[r].map((v, c) => v.sub(matrix[pivotRow][c].mul(factor)));
    }
    pivotCols.push(col);
    pivotRow++;
  }

  const freeCols = [];
  for (let c = 0; c < numCols; c++) if (!pivotCols.includes(c)) freeCols.push(c);

  if (freeCols.length === 0) {
    throw new Error('Không tìm được nghiệm cân bằng (phương trình có thể sai hoặc đã tối giản)');
  }

  // Chọn 1 biến tự do = 1, các biến tự do khác = 0 (đủ cho hầu hết phương trình hoá học phổ thông)
  const freeCol = freeCols[0];
  const values = new Array(numCols).fill(null);
  freeCols.forEach((c) => { values[c] = new Fraction(c === freeCol ? 1 : 0, 1); });

  pivotCols.forEach((col, idx) => {
    let sum = new Fraction(0, 1);
    freeCols.forEach((fc) => { sum = sum.add(matrix[idx][fc].mul(values[fc])); });
    values[col] = sum.neg();
  });

  // Quy đồng mẫu số chung rồi rút gọn về số nguyên nhỏ nhất
  let lcm = 1;
  values.forEach((v) => { lcm = (lcm * v.d) / gcdInt(lcm, v.d); });
  let intCoefs = values.map((v) => Math.round((v.n * lcm) / v.d));

  if (intCoefs.some((c) => c <= 0)) {
    const flipped = intCoefs.map((c) => -c);
    if (flipped.every((c) => c > 0)) intCoefs = flipped;
    else throw new Error('Không tìm được nghiệm cân bằng hợp lệ (hệ số âm hoặc bằng 0)');
  }

  let g = intCoefs[0];
  intCoefs.forEach((c) => { g = gcdInt(g, c); });
  intCoefs = intCoefs.map((c) => c / g);

  return {
    reactants: reactants.map((f, i) => ({ formula: f, coef: intCoefs[i] })),
    products: products.map((f, i) => ({ formula: f, coef: intCoefs[reactants.length + i] }))
  };
}

// ---------- Giao diện trang cân bằng phương trình ----------
(function () {
  const input = $('#eqInput');
  const btn = $('#eqBalanceBtn');
  const resultBox = $('#eqResult');
  const chips = $$('.example-chips button');
  if (!input || !btn) return;

  function formatFormulaHTML(formula) {
    return formula.replace(/(\d+)/g, '<sub>$1</sub>');
  }

  function renderBalanced(result) {
    const side = (list) => list
      .map(({ formula, coef }) => `${coef > 1 ? `<span class="coef">${coef}</span>` : ''}${formatFormulaHTML(formula)}`)
      .join(' + ');
    return `<div class="balanced-eq">${side(result.reactants)} → ${side(result.products)}</div>`;
  }

  function run() {
    const eq = input.value.trim();
    if (!eq) {
      showResult(resultBox, 'Nhập phương trình cần cân bằng.', true);
      return;
    }
    try {
      const result = balanceEquation(eq);
      showResult(resultBox, renderBalanced(result));
    } catch (e) {
      showResult(resultBox, `⚠️ ${e.message}`, true);
    }
  }

  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.eq;
      run();
    });
  });
})();
