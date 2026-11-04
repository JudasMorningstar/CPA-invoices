'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// Some jobs are invoiced without production deducting PAYE. With the switch
// off, nothing may imply a deduction that was never made.
const SETUP = `
  document.getElementById('daily-rate').value = 2300;
  setBaseHours(10);
  rows = [
    { id: 1, date: '2026-03-02', job: '', desc: 'Shoot', type: 'Shoot Day', call: '06:00', wrap: '19:00', days: 1, rate: '' },
    { id: 2, date: '2026-03-04', job: '', desc: 'Prep', type: 'Pre-Production', call: '', wrap: '', days: 3, rate: '' },
  ];
  extras = [{ id: 1, label: 'Laptop', job: '', days: 8, rate: 300 }];
  renderTable(); renderExtras();
`;

const SNAPSHOT = `
  const visible = id => { const el = document.getElementById(id); return el ? getComputedStyle(el).display !== 'none' : null; };
  const pdf = pdfDoc();
  const xlsx = workbook();
  return {
    fees: money('st-taxable'), paye: money('st-paye'),
    extras: money('extras-sub'), grand: money('grand-total'),
    note: txt('grand-note'),
    payeRowsVisible: [visible('st-paye-row'), visible('gt-paye-row'), visible('bar-paye-item')],
    pdfHasPaye: pdf.hasPayeLine, pdfHasNet: pdf.hasNetLine, pdfGrand: pdf.grand,
    xlsxHasPaye: xlsx.labels.includes('Less: PAYE 25%'),
    xlsxHasNet: xlsx.labels.includes('Net Taxable (after PAYE)'),
    xlsxGrand: xlsx.grand,
  };
`;

module.exports = {
  name: 'tax — the PAYE switch reaches every surface',
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);
    await page.evaluate(SETUP);

    const on = await page.evaluate(`(() => { setPayeEnabled(true); ${IN_PAGE} ${SNAPSHOT} })()`);
    const off = await page.evaluate(`(() => { setPayeEnabled(false); ${IN_PAGE} ${SNAPSHOT} })()`);

    checks.equal('taxed: PAYE is 25% of fees', on.paye, Math.round(on.fees * 0.25));
    checks.equal('taxed: grand = fees - PAYE + extras', on.grand, on.fees - on.paye + on.extras);
    checks.ok('taxed: PAYE rows shown', on.payeRowsVisible.every(Boolean));
    checks.ok('taxed: PDF shows the PAYE and net lines', on.pdfHasPaye && on.pdfHasNet);
    checks.ok('taxed: workbook has the PAYE and net rows', on.xlsxHasPaye && on.xlsxHasNet);

    checks.equal('untaxed: no PAYE charged', off.paye, 0);
    checks.equal('untaxed: grand = fees + extras', off.grand, off.fees + off.extras);
    checks.ok('untaxed: PAYE rows hidden, not zeroed', off.payeRowsVisible.every(v => v === false));
    checks.equal('untaxed: grand total relabelled', off.note.trim(), '(NO PAYE DEDUCTED)');
    checks.ok('untaxed: PDF omits the PAYE and net lines', !off.pdfHasPaye && !off.pdfHasNet);
    checks.ok('untaxed: workbook omits the PAYE and net rows', !off.xlsxHasPaye && !off.xlsxHasNet);
    checks.close('untaxed: workbook grand matches the app', off.xlsxGrand, off.grand);
    checks.equal('untaxed: PDF grand matches the app', off.pdfGrand, off.grand);
    checks.empty('no page errors', page.pageErrors);

    await page.close();
  },
};
