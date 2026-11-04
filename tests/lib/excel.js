'use strict';

// Injected into the page. The XLSX export ships live Excel formulas, so the
// only honest way to test the workbook is to evaluate those formulas and
// compare them against what the app shows. Supports exactly what the export
// emits: + - * /, parentheses, cell refs, SUM(range), MIN, MAX, ROUND.
const EXCEL_EVALUATOR = `
window.makeEval = function (ws) {
  const memo = new Map();
  const ROUND = (x, d) => { const m = Math.pow(10, d); return Math.round(x * m) / m; };

  function cell(addr) {
    if (memo.has(addr)) return memo.get(addr);
    memo.set(addr, 0);                       // guard against reference cycles
    const c = ws[addr];
    let out = 0;
    if (c) {
      if (c.f !== undefined) out = run(c.f);
      else if (typeof c.v === 'number') out = c.v;
    }
    memo.set(addr, out);
    return out;
  }

  function range(a, b) {
    const m1 = /^([A-Z]+)(\\d+)$/.exec(a), m2 = /^([A-Z]+)(\\d+)$/.exec(b);
    let t = 0;
    for (let r = +m1[2]; r <= +m2[2]; r++) t += cell(m1[1] + r);
    return t;
  }

  function run(f) {
    let src = f.replace(/SUM\\(([A-Z]+\\d+):([A-Z]+\\d+)\\)/g, (_, a, b) => String(range(a, b)));
    src = src.replace(/(?<![A-Z0-9_])([A-Z]{1,2})(\\d+)(?![0-9(])/g, (m, col, row) => String(cell(col + row)));
    src = src.replace(/\\bMIN\\(/g, 'Math.min(').replace(/\\bMAX\\(/g, 'Math.max(');
    try { return Function('ROUND', '"use strict";return (' + src + ')')(ROUND); }
    catch (e) { return { ERR: f, msg: e.message }; }
  }

  return { cell, run };
};
`;

module.exports = { EXCEL_EVALUATOR };
