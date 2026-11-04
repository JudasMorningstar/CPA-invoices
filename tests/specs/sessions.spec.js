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

    // New invoice: what identifies you and who you bill survives; the job does not.
    await page.evaluate('window.confirm = () => true');
    const fresh = await page.evaluate(`(() => {
      ${IN_PAGE}
      // Fill in the things a crew member should never have to retype.
      const set = (id, v) => { document.getElementById(id).value = v; };
      set('to-name', 'Star Films'); set('to-addr', '8 Stirling Street');
      set('to-reg', '2015/086655/07'); set('to-vat', '4110269125');
      set('from-name', 'Junade'); set('from-designation', 'Prop Master');
      set('from-id', '8001015009087'); set('from-contact', '082 000 0000');
      set('from-tax', '1234567890'); set('bank-name', 'FNB');
      set('bank-branch', '250655'); set('bank-acc', '62000000000');
      set('job-name', 'Chicken Licken'); set('daily-rate', 2200);
      setPayeEnabled(false);
      rows = [{ id: 1, date: '2026-11-09', job: 'Stills', desc: 'd', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2000 }];
      extras = [{ id: 1, label: 'Laptop', job: 'Stills', days: 8, rate: 300 }];
      renderTable(); renderExtras();
      const priorNumber = document.getElementById('inv-number').value;

      newInvoice();

      const get = id => document.getElementById(id).value;
      return {
        rowCount: rows.length, extraCount: extras.length,
        firstRowBlank: rows[0] && !rows[0].date && !rows[0].desc && !rows[0].job && rows[0].rate === '',
        sections: sectionNames(),
        jobName: get('job-name'),
        invDate: get('inv-date'),
        invNumber: get('inv-number'), priorNumber,
        kept: {
          toName: get('to-name'), toAddr: get('to-addr'), toReg: get('to-reg'), toVat: get('to-vat'),
          fromName: get('from-name'), fromRole: get('from-designation'), fromId: get('from-id'),
          fromContact: get('from-contact'), fromTax: get('from-tax'),
          bankName: get('bank-name'), bankBranch: get('bank-branch'), bankAcc: get('bank-acc'),
          dailyRate: get('daily-rate'), payeOn: getPayeEnabled(),
        },
        grand: money('grand-total'),
        summaryHidden: getComputedStyle(document.getElementById('job-summary')).display === 'none',
      };
    })()`);

    checks.equal('timesheet is cleared', fresh.rowCount, 0);
    checks.equal('extras are cleared', fresh.extraCount, 0);
    checks.equal('sections are gone', fresh.sections.length, 0);
    checks.ok('the job summary hides again', fresh.summaryHidden);
    checks.equal('job name is cleared', fresh.jobName, '');
    checks.equal('invoice date is reset to today', fresh.invDate, new Date().toISOString().split('T')[0]);
    checks.ok('a fresh invoice number is generated', !!fresh.invNumber && fresh.invNumber !== fresh.priorNumber);

    const k = fresh.kept;
    checks.equal('production company kept', k.toName, 'Star Films');
    checks.equal('company address kept', k.toAddr, '8 Stirling Street');
    checks.equal('company registration kept', k.toReg, '2015/086655/07');
    checks.equal('company VAT kept', k.toVat, '4110269125');
    checks.equal('crew name kept', k.fromName, 'Junade');
    checks.equal('crew role kept', k.fromRole, 'Prop Master');
    checks.equal('crew ID kept', k.fromId, '8001015009087');
    checks.equal('crew contact kept', k.fromContact, '082 000 0000');
    checks.equal('crew tax number kept', k.fromTax, '1234567890');
    checks.equal('bank kept', k.bankName, 'FNB');
    checks.equal('branch code kept', k.bankBranch, '250655');
    checks.equal('account number kept', k.bankAcc, '62000000000');
    checks.equal('day rate kept', k.dailyRate, '2200');
    checks.equal('PAYE setting kept', k.payeOn, false);
    checks.equal('totals reset to zero', fresh.grand, 0);

    await page.close();
  },
};
