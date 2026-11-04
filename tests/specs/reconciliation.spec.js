'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// A real two-section invoice: two jobs at two day rates, three hire lines,
// invoiced gross. Every surface must land on the same R29 275.
const INVOICE = {
  dailyRate: 2000,
  payeEnabled: false,
  rows: [
    { id: 1, date: '2026-11-09', job: 'Stills', desc: 'Stills day 1', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
    { id: 2, date: '2026-11-10', job: 'Stills', desc: 'Stills day 2', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
    { id: 3, date: '2026-11-16', job: 'TVC', desc: 'Office / prep', type: 'Pre-Production', call: '', wrap: '', days: 4, rate: 2200 },
    { id: 4, date: '2026-11-23', job: 'TVC', desc: 'Shoot day 1', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 },
    { id: 5, date: '2026-11-24', job: 'TVC', desc: 'Shoot day 2', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 },
    { id: 6, date: '2026-11-25', job: 'TVC', desc: 'Shoot day 3', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 },
    { id: 7, date: '2026-11-26', job: 'TVC', desc: 'Shoot day 4', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 },
    { id: 8, date: '2026-11-27', job: 'TVC', desc: 'Shoot day 5', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 },
  ],
  extras: [
    { id: 1, label: 'Vehicle — loaded (bakkie)', job: 'TVC', days: 2, rate: 850 },
    { id: 2, label: 'Vehicle — no loading', job: 'TVC', days: 2.5, rate: 550 },
    { id: 3, label: 'Laptop / Computer Hire', job: 'TVC', days: 8, rate: 300 },
  ],
};

const FEES = 23800, EXTRAS = 5475, GRAND = 29275;

module.exports = {
  name: 'reconciliation — two sections at two day rates',
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);
    const r = await page.evaluate(`(spec => {
      ${IN_PAGE}
      document.getElementById('daily-rate').value = spec.dailyRate;
      setPayeEnabled(spec.payeEnabled);
      rows = spec.rows.map(x => ({ ...x }));
      extras = spec.extras.map(x => ({ ...x }));
      renderTable(); renderExtras();
      return {
        app: { fees: money('st-taxable'), extras: money('extras-sub'), grand: money('grand-total') },
        jobs: jobTotals(),
        feeColumn: [...document.querySelectorAll('#ts-body tr:not(.job-row):not(.job-sub) .c-amt')].map(td => num(td.textContent)),
        jobHeadings: [...document.querySelectorAll('#ts-body tr.job-row td')].map(td => td.textContent.trim()),
        pdf: pdfDoc(),
        xlsx: workbook(),
      };
    })(${JSON.stringify(INVOICE)})`);

    const sum = a => a.reduce((x, y) => x + y, 0);

    checks.equal('app fees', r.app.fees, FEES);
    checks.equal('app extras', r.app.extras, EXTRAS);
    checks.equal('app grand total', r.app.grand, GRAND);
    checks.equal('fee column foots to the subtotal', sum(r.feeColumn), FEES);

    const stills = r.jobs.find(j => j.name === 'Stills');
    const tvc = r.jobs.find(j => j.name === 'TVC');
    checks.equal('Stills total', stills && stills.total, 4000);
    checks.equal('TVC fees', tvc && tvc.fees, 19800);
    checks.equal('TVC extras', tvc && tvc.extras, 5475);
    checks.equal('TVC total', tvc && tvc.total, 25275);
    checks.equal('two job headings in the timesheet', r.jobHeadings.length, 2);

    checks.equal('PDF grand total', r.pdf.grand, GRAND);
    checks.equal('PDF fee rows foot to the subtotal', sum(r.pdf.rowAmounts), FEES);
    checks.equal('PDF shows both job headings', r.pdf.jobHeadings.length, 2);
    checks.ok('PDF carries the job summary', r.pdf.text.includes('Summary by Job'));

    checks.close('XLSX fees match the app', r.xlsx.fees, FEES);
    checks.close('XLSX extras match the app', r.xlsx.extras, EXTRAS);
    checks.close('XLSX grand total matches the app', r.xlsx.grand, GRAND);
    checks.empty('XLSX formulas all evaluate', r.xlsx.formulaErrors);
    checks.empty('no page errors', page.pageErrors);

    await page.close();
  },
};
