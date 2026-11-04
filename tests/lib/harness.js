'use strict';
const { EXCEL_EVALUATOR } = require('./excel');

// The page pulls SheetJS from a CDN and opens a real print dialog. Stub both so
// the suite runs offline and headless, capturing the worksheet the export built.
const PAGE_STUBS = `
window.__ws = null;
window.XLSX = {
  utils: { book_new: () => ({}), book_append_sheet: (wb, ws) => { window.__ws = ws; } },
  writeFile: () => {},
};
window.print = () => {};
`;

async function openInvoice(browser, fileUrl, opts = {}) {
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1500, height: 1000 },
    deviceScaleFactor: opts.deviceScaleFactor || 1,
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(fileUrl);
  await page.waitForTimeout(opts.settle || 600);
  if (opts.stubs !== false) {
    await page.evaluate(PAGE_STUBS);
    await page.evaluate(EXCEL_EVALUATOR);
  }
  page.pageErrors = pageErrors;
  return page;
}

// Shared in-page helpers, appended to every evaluate that needs them.
const IN_PAGE = `
  const num = t => parseFloat(String(t).replace(/[^0-9.]/g, '')) || 0;
  const txt = id => document.getElementById(id).textContent;
  const money = id => num(txt(id));
  // Build the workbook and read back its evaluated totals.
  function workbook() {
    exportToExcel();
    const ws = window.__ws, ev = window.makeEval(ws);
    const out = { fees: null, extras: null, grand: null, formulaErrors: [], labels: [] };
    for (const addr of Object.keys(ws)) {
      const v = ws[addr] && ws[addr].v;
      const row = addr.replace(/^[A-Z]+/, '');
      if (typeof v === 'string') {
        out.labels.push(v);
        if (v === 'SUBTOTAL — TAXABLE') out.fees = ev.cell('M' + row);
        if (v === 'EXTRAS SUBTOTAL') out.extras = ev.cell('M' + row);
        if (v === 'GRAND TOTAL') out.grand = ev.cell('M' + row);
      }
      if (ws[addr] && ws[addr].f) {
        const q = ev.run(ws[addr].f);
        if (q && q.ERR) out.formulaErrors.push(addr + ': ' + q.ERR);
      }
    }
    return out;
  }
  // Render the PDF template without opening a print dialog, and read it back.
  function pdfDoc() {
    const st = window.setTimeout; window.setTimeout = () => 0;
    exportPDF();
    window.setTimeout = st;
    const ov = document.getElementById('pdf-overlay');
    const line = label => {
      const el = [...ov.querySelectorAll('.tr, .grand, .ext-sub')].find(e => e.textContent.includes(label));
      return el ? num(el.querySelector('span:last-child').textContent) : null;
    };
    const doc = {
      grand: line('Grand Total'),
      rowAmounts: [...ov.querySelectorAll('tbody tr:not(.jrow):not(.jsub) td.amt')].map(td => num(td.textContent)),
      jobHeadings: [...ov.querySelectorAll('tr.jrow td')].map(td => td.textContent.trim()),
      jobSubtotals: [...ov.querySelectorAll('tr.jsub')].length,
      extraJobHeadings: [...ov.querySelectorAll('.ext-job')].map(d => d.textContent.trim()),
      hasPayeLine: !!ov.querySelector('.tr.paye'),
      hasNetLine: !!ov.querySelector('.tr.net'),
      text: ov.textContent,
    };
    ov.innerHTML = '';
    return doc;
  }
`;

module.exports = { openInvoice, PAGE_STUBS, IN_PAGE };
