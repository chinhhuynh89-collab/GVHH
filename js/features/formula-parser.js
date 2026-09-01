// Phân tích công thức hoá học (VD: Al2(SO4)3, CuSO4.5H2O) thành số nguyên tử mỗi nguyên tố.
// Dùng chung cho Công cụ tính toán (tính M) và Cân bằng phương trình.

function parseSimpleFormula(str) {
  let i = 0;
  function parseExpr() {
    const counts = {};
    while (i < str.length && str[i] !== ')') {
      if (str[i] === '(') {
        i++;
        const inner = parseExpr();
        i++; // bỏ qua ')'
        let numStr = '';
        while (i < str.length && /\d/.test(str[i])) { numStr += str[i]; i++; }
        const mult = numStr ? parseInt(numStr, 10) : 1;
        for (const el in inner) counts[el] = (counts[el] || 0) + inner[el] * mult;
      } else if (/[A-Z]/.test(str[i])) {
        let sym = str[i]; i++;
        while (i < str.length && /[a-z]/.test(str[i])) { sym += str[i]; i++; }
        let numStr = '';
        while (i < str.length && /\d/.test(str[i])) { numStr += str[i]; i++; }
        const mult = numStr ? parseInt(numStr, 10) : 1;
        counts[sym] = (counts[sym] || 0) + mult;
      } else {
        throw new Error(`Ký tự không hợp lệ trong công thức: "${str[i]}"`);
      }
    }
    return counts;
  }
  const result = parseExpr();
  if (i < str.length) throw new Error(`Công thức không hợp lệ gần vị trí "${str.slice(i)}"`);
  return result;
}

function parseFormula(rawFormula) {
  const str = rawFormula.replace(/\s+/g, '');
  if (!str) throw new Error('Công thức trống');
  if (str.includes('.')) {
    const parts = str.split('.');
    const total = {};
    parts.forEach((part) => {
      const m = part.match(/^(\d+)(.*)$/);
      let mult = 1, formula = part;
      if (m) { mult = parseInt(m[1], 10); formula = m[2]; }
      const sub = parseSimpleFormula(formula);
      for (const el in sub) total[el] = (total[el] || 0) + sub[el] * mult;
    });
    return total;
  }
  return parseSimpleFormula(str);
}

let _massBySymbol = null;
function molarMassOf(formula) {
  if (!_massBySymbol) {
    _massBySymbol = {};
    ELEMENTS.forEach((e) => { _massBySymbol[e.sym] = e.mass; });
  }
  const counts = parseFormula(formula);
  let mass = 0;
  for (const sym in counts) {
    if (!(sym in _massBySymbol)) throw new Error(`Không nhận diện được nguyên tố "${sym}"`);
    mass += _massBySymbol[sym] * counts[sym];
  }
  return mass;
}
