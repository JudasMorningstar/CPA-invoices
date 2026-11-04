'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// Money is shown in whole rands. The invariant that matters on a document a
// production's payroll will check is that every printed column adds up to its
// printed total — in the app, in the workbook's own formulas, and per job.
const ITERATIONS = parseInt(process.env.ITERATIONS || '150', 10);

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[rnd(0, a.length - 1)];
const TYPES = ['Shoot Day', 'Premium Day', 'Pre-Production', 'Post-Production', 'Travel Day'];
const JOBS = ['', 'Stills', 'TVC', 'Promo'];

function randomInvoice() {
  const useJobs = rnd(0, 1) === 1;
  return {
    dailyRate: pick([2000, 2200, 1750.5, 2333.33]),
    baseHours: pick([10, 12]),
    payeEnabled: rnd(0, 1) === 1,
    rows: Array.from({ length: rnd(1, 8) }, (_, i) => ({
      id: i + 1,
      date: `2026-03-${String(rnd(1, 26)).padStart(2, '0')}`,
      job: useJobs ? pick(JOBS) : '',
      desc: 'row ' + i,
      type: pick(TYPES),
      rate: rnd(0, 1) ? pick([2200, 1800, 2500]) : '',
      call: `0${rnd(4, 9)}:00`,
      wrap: `${rnd(12, 23)}:${pick(['00', '15', '30', '45'])}`,
      days: rnd(1, 4),
    })),
    extras: Array.from({ length: rnd(0, 4) }, (_, i) => ({
      id: i + 1, label: 'extra ' + i, job: useJobs ? pick(JOBS) : '',
      days: pick([0, 1, 2.5, 8, 19.25]), rate: pick([300, 550, 850, 1000]),
    })),
  };
}

module.exports = {
  name: `money — ${ITERATIONS} randomised invoices foot across app and workbook`,
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);
    const failures = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const spec = randomInvoice();
      const r = await page.evaluate(`(spec => {
        ${IN_PAGE}
        document.getElementById('daily-rate').value = spec.dailyRate;
        setBaseHours(spec.baseHours);
        setPayeEnabled(spec.payeEnabled);
        rows = spec.rows.map(x => ({ ...x }));
        extras = spec.extras.map(x => ({ ...x }));
        renderTable(); renderExtras();
        return {
          feeColumn: [...document.querySelectorAll('#ts-body tr:not(.job-row):not(.job-sub) .c-amt')].map(td => num(td.textContent)),
          jobFeeSubtotals: [...document.querySelectorAll('#ts-body tr.job-sub .job-sub-val')].map(td => num(td.textContent)),
          extraLines: [...document.querySelectorAll('#extras-body tr:not(.job-row):not(.job-sub) .extras-amount')].map(td => num(td.textContent)),
          jobExtraSubtotals: [...document.querySelectorAll('#extras-body [data-xsub]')].map(td => num(td.textContent)),
          jobs: jobTotals(),
          fees: money('st-taxable'), paye: money('st-paye'),
          extrasTotal: money('extras-sub'), grand: money('grand-total'),
          payeOn: getPayeEnabled(),
          xlsx: workbook(),
        };
      })(${JSON.stringify(spec)})`);

      const sum = a => a.reduce((x, y) => x + y, 0);
      const bad = [];
      if (sum(r.feeColumn) !== r.fees) bad.push(`fee column ${sum(r.feeColumn)} != subtotal ${r.fees}`);
      if (sum(r.extraLines) !== r.extrasTotal) bad.push('extras lines do not foot to the extras subtotal');
      if (r.grand !== r.fees - r.paye + r.extrasTotal) bad.push(`grand ${r.grand} != fees - paye + extras`);
      if (r.jobFeeSubtotals.length && sum(r.jobFeeSubtotals) > r.fees) bad.push('job fee subtotals exceed the total');
      if (r.jobExtraSubtotals.length && sum(r.jobExtraSubtotals) > r.extrasTotal) bad.push('job extras subtotals exceed the total');
      if (sum(r.jobs.map(j => j.total)) !== r.fees + r.extrasTotal) bad.push('job summary does not reconcile to fees + extras');
      if (r.payeOn && r.paye !== Math.round(r.fees * 0.25)) bad.push('PAYE is not 25% of the taxable total');
      if (!r.payeOn && r.paye !== 0) bad.push('PAYE charged on an untaxed job');
      if (r.xlsx.formulaErrors.length) bad.push('workbook formula errors: ' + r.xlsx.formulaErrors[0]);
      if (Math.abs(r.xlsx.fees - r.fees) > 0.01) bad.push(`workbook fees ${r.xlsx.fees} != app ${r.fees}`);
      if (Math.abs(r.xlsx.extras - r.extrasTotal) > 0.01) bad.push(`workbook extras ${r.xlsx.extras} != app ${r.extrasTotal}`);
      if (Math.abs(r.xlsx.grand - r.grand) > 0.01) bad.push(`workbook grand ${r.xlsx.grand} != app ${r.grand}`);

      if (bad.length) failures.push({ spec, problems: bad });
    }

    checks.ok(
      `${ITERATIONS - failures.length}/${ITERATIONS} randomised invoices consistent`,
      failures.length === 0,
      failures.slice(0, 2).map(f => f.problems.join('; ') + '  <- ' + JSON.stringify(f.spec).slice(0, 220)).join('\n      ')
    );
    checks.empty('no page errors', page.pageErrors);
    await page.close();
  },
};
