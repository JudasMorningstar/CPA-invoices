'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// Whatever example data ships in the file, the page must load cleanly and its
// own totals must agree with each other. No hardcoded figures here, so editing
// the shipped example never breaks this spec.
module.exports = {
  name: 'defaults — the shipped file loads clean and self-reconciles',
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);
    const r = await page.evaluate(`(() => {
      ${IN_PAGE}
      return {
        rowCount: rows.length,
        startsRendered: document.querySelectorAll('#ts-body tr').length > 0,
        invoiceDateSet: !!document.getElementById('inv-date').value,
        fees: money('st-taxable'), paye: money('st-paye'),
        extras: money('extras-sub'), grand: money('grand-total'),
        barGrand: money('bar-grand'),
        feeColumn: [...document.querySelectorAll('#ts-body tr:not(.job-row):not(.job-sub) .c-amt')].map(td => num(td.textContent)),
        jobs: jobTotals(),
        xlsx: workbook(),
        pdf: pdfDoc(),
      };
    })()`);

    const sum = a => a.reduce((x, y) => x + y, 0);
    checks.ok('rows render on load', r.startsRendered);
    checks.ok('invoice date is filled in', r.invoiceDateSet);
    checks.equal('fee column foots to the subtotal', sum(r.feeColumn), r.fees);
    checks.equal('grand = fees - PAYE + extras', r.grand, r.fees - r.paye + r.extras);
    checks.equal('sticky bar agrees with the grand total', r.barGrand, r.grand);
    checks.equal('job summary reconciles', sum(r.jobs.map(j => j.total)), r.fees + r.extras);
    checks.close('workbook agrees with the app', r.xlsx.grand, r.grand);
    checks.equal('PDF agrees with the app', r.pdf.grand, r.grand);
    checks.empty('workbook formulas all evaluate', r.xlsx.formulaErrors);
    checks.empty('no page errors on load', page.pageErrors);

    await page.close();
  },
};
