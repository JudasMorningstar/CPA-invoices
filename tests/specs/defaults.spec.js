'use strict';
const fs = require('fs');
const path = require('path');
const { openInvoice, IN_PAGE } = require('../lib/harness');

// This file is hosted for other crew to use, so it must ship blank. Anything
// pre-filled would be one person's details sitting on everyone else's invoice.
// The checks look for the shape — a non-empty value on an identity field —
// rather than naming anyone, so the guard holds without the test repeating
// what it is guarding against.
const IDENTITY_FIELDS = [
  'to-name', 'to-addr', 'to-reg', 'to-vat', 'job-name',
  'from-name', 'from-designation', 'from-addr', 'from-id', 'from-contact', 'from-tax',
  'bank-name', 'bank-branch', 'bank-acc',
];

module.exports = {
  name: 'defaults — the template ships blank and self-reconciles',
  async run({ browser, fileUrl, checks }) {
    // Read the source directly: a prefill could be in markup or in the init.
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'PropLens_Invoice_2.html'), 'utf8');
    const prefilled = IDENTITY_FIELDS.filter(id => {
      const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(src);
      if (!tag) return false;
      const value = /\svalue="([^"]*)"/.exec(tag[0]);
      return !!(value && value[1].trim());
    });
    checks.empty('no identity field ships with a value', prefilled);

    const page = await openInvoice(browser, fileUrl);
    const r = await page.evaluate(`(() => {
      ${IN_PAGE}
      const filled = ${JSON.stringify(IDENTITY_FIELDS)}
        .filter(id => (document.getElementById(id).value || '').trim());
      return {
        filled,
        rowCount: rows.length,
        extraCount: extras.length,
        sections: sectionNames(),
        tbodyRows: document.querySelectorAll('#ts-body tr').length,
        extrasRows: document.querySelectorAll('#extras-body tr').length,
        canAddDay: !!document.querySelector('.add-row-group .add-row-btn'),
        canAddSection: !!document.querySelector('.add-section-btn'),
        canAddExtra: !!document.querySelector('[onclick="addExtra()"]'),
        invoiceDateSet: !!document.getElementById('inv-date').value,
        payeOn: getPayeEnabled(),
        fees: money('st-taxable'), extras_: money('extras-sub'),
        paye: money('st-paye'), grand: money('grand-total'), barGrand: money('bar-grand'),
        summaryHidden: getComputedStyle(document.getElementById('job-summary')).display === 'none',
        xlsx: workbook(),
        pdf: pdfDoc(),
      };
    })()`);

    checks.empty('nothing is filled in on load', r.filled);
    checks.equal('timesheet starts empty', r.rowCount, 0);
    checks.equal('extras start empty', r.extraCount, 0);
    checks.equal('no sections are pre-made', r.sections.length, 0);
    checks.equal('no stray timesheet rows rendered', r.tbodyRows, 0);
    checks.equal('no stray extras rows rendered', r.extrasRows, 0);
    checks.ok('a day can be added', r.canAddDay);
    checks.ok('a section can be added', r.canAddSection);
    checks.ok('an extras line can be added', r.canAddExtra);
    checks.ok('invoice date defaults to today', r.invoiceDateSet);
    checks.ok('PAYE defaults to on, per CPA', r.payeOn);
    checks.ok('job summary stays hidden', r.summaryHidden);

    // An empty invoice must read as zero everywhere, not as a stray day rate.
    checks.equal('fees are zero', r.fees, 0);
    checks.equal('extras are zero', r.extras_, 0);
    checks.equal('grand total is zero', r.grand, 0);
    checks.equal('sticky bar agrees', r.barGrand, r.grand);
    checks.close('workbook agrees', r.xlsx.grand, r.grand);
    checks.equal('PDF agrees', r.pdf.grand, r.grand);
    checks.empty('workbook formulas still evaluate when empty', r.xlsx.formulaErrors);
    checks.empty('no page errors on load', page.pageErrors);

    await page.close();
  },
};
