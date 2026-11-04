'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// A crew member's saved .cpa files outlive any one version of the template.
module.exports = {
  name: 'sessions — legacy files load, current format round-trips',
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);

    const legacy = await page.evaluate(`(() => {
      ${IN_PAGE}
      // Saved when extras were five fixed items and rows had no job or rate.
      applyState({
        header: {}, dailyRate: '2000', baseHours: 10, payeEnabled: true,
        rows: [{ id: 1, date: '2026-02-02', desc: 'Old shoot', type: 'Shoot Day', call: '06:00', wrap: '18:00', days: 1 }],
        extras: { toolboxDays: '2', toolboxRate: '250', vehicleDays: '7', vehicleRate: '550',
                  vanDays: '16', vanRate: '1000', cellDays: '0', cellRate: '80', mealsDays: '0', mealsRate: '100' },
      });
      return {
        labels: extras.map(e => e.label),
        extrasTotal: money('extras-sub'),
        inheritedRate: getRowRate(rows[0]),
        summaryHidden: getComputedStyle(document.getElementById('job-summary')).display === 'none',
      };
    })()`);

    checks.equal('legacy extras expand to five named lines', legacy.labels.length, 5);
    checks.equal('legacy extras total', legacy.extrasTotal, 2 * 250 + 7 * 550 + 16 * 1000);
    checks.equal('legacy rows inherit the global day rate', legacy.inheritedRate, 2000);
    checks.ok('job summary stays hidden when nothing is grouped', legacy.summaryHidden);

    const trip = await page.evaluate(`(() => {
      ${IN_PAGE}
      rows = [{ id: 1, date: '2026-05-01', job: 'TVC', desc: 'd', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2200 }];
      extras = [{ id: 1, label: 'Laptop', job: 'TVC', days: 8, rate: 300 }];
      renderTable(); renderExtras();
      const before = money('grand-total');
      const saved = JSON.parse(JSON.stringify(gatherState()));
      rows = []; extras = []; renderTable(); renderExtras();
      const cleared = money('grand-total');
      applyState(saved);
      return {
        before, cleared, after: money('grand-total'),
        savedExtrasIsArray: Array.isArray(saved.extras),
        job: rows[0].job, rate: String(rows[0].rate), extraJob: extras[0].job,
      };
    })()`);

    checks.equal('clearing really empties the invoice', trip.cleared, 0);
    checks.equal('total survives save and restore', trip.after, trip.before);
    checks.ok('extras are saved as a list', trip.savedExtrasIsArray);
    checks.equal('row job survives', trip.job, 'TVC');
    checks.equal('row rate survives', trip.rate, '2200');
    checks.equal('extras job survives', trip.extraJob, 'TVC');

    // Autosave restore on reload — this was dead for a while, so it is pinned.
    await page.evaluate(`(() => {
      document.getElementById('to-name').value = 'Autosave probe';
      rows = [{ id: 1, date: '2026-06-01', job: 'Probe', desc: 'd', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 1234 }];
      renderTable(); triggerAutosave();
    })()`);
    await page.waitForTimeout(2500);
    await page.reload();
    await page.waitForTimeout(800);
    const restored = await page.evaluate(`({
      company: document.getElementById('to-name').value,
      job: rows[0] && rows[0].job,
      rate: rows[0] && String(rows[0].rate),
    })`);
    checks.equal('autosave restores the company', restored.company, 'Autosave probe');
    checks.equal('autosave restores the job label', restored.job, 'Probe');
    checks.equal('autosave restores the per-row rate', restored.rate, '1234');

    await page.close();
  },
};
