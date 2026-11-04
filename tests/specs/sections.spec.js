'use strict';
const { openInvoice, IN_PAGE } = require('../lib/harness');

// A section is just a job label shared by rows and extras — there is no second
// structure to keep in step. These checks pin that the section controls keep
// rows and extras together, and that totals follow.
module.exports = {
  name: 'sections — add, rename, re-rate and remove',
  async run({ browser, fileUrl, checks }) {
    const page = await openInvoice(browser, fileUrl);
    await page.evaluate('window.confirm = () => true');

    // The template ships blank, so the spec builds its own two sections: one
    // running at the Section 2 rate, one overriding it.
    const shipped = await page.evaluate(`(() => {
      ${IN_PAGE}
      document.getElementById('daily-rate').value = 2200;
      setPayeEnabled(false);
      rows = [
        { id: 1, date: '2026-11-09', job: 'Stills', desc: 'd1', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2000 },
        { id: 2, date: '2026-11-10', job: 'Stills', desc: 'd2', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: 2000 },
        { id: 3, date: '2026-11-16', job: 'TVC', desc: 'prep', type: 'Pre-Production', call: '', wrap: '', days: 4, rate: '' },
        { id: 4, date: '2026-11-23', job: 'TVC', desc: 's1', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
        { id: 5, date: '2026-11-24', job: 'TVC', desc: 's2', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
        { id: 6, date: '2026-11-25', job: 'TVC', desc: 's3', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
        { id: 7, date: '2026-11-26', job: 'TVC', desc: 's4', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
        { id: 8, date: '2026-11-27', job: 'TVC', desc: 's5', type: 'Shoot Day', call: '08:00', wrap: '18:00', days: 1, rate: '' },
      ];
      nextId = 9;
      extras = [
        { id: 1, label: 'Vehicle — loaded', job: 'TVC', days: 2, rate: 850 },
        { id: 2, label: 'Vehicle — no loading', job: 'TVC', days: 2.5, rate: 550 },
        { id: 3, label: 'Laptop hire', job: 'TVC', days: 8, rate: 300 },
      ];
      nextExtraId = 4;
      renderTable(); renderExtras();
      return {
        globalRate: document.getElementById('daily-rate').value,
        sections: sectionNames(),
        stillsRate: sectionRate('Stills'),
        tvcRate: sectionRate('TVC'),
        tvcRowRate: getRowRate(rows.find(r => r.job === 'TVC')),
        stillsRowRate: getRowRate(rows.find(r => r.job === 'Stills')),
        grand: money('grand-total'),
      };
    })()`);

    checks.equal('Section 2 holds the main rate', shipped.globalRate, '2200');
    checks.equal('the overriding section reports its own rate', shipped.stillsRate, '2000');
    checks.equal('the inheriting section reports blank', shipped.tvcRate, '');
    checks.equal('inheriting rows bill at the Section 2 rate', shipped.tvcRowRate, 2200);
    checks.equal('overriding rows bill at their own rate', shipped.stillsRowRate, 2000);
    checks.equal('two sections reconcile to one total', shipped.grand, 29275);

    // Adding a section
    const added = await page.evaluate(`(() => {
      ${IN_PAGE}
      const before = sectionNames().length;
      addSection();
      const name = sectionNames().find(n => !['Stills', 'TVC'].includes(n));
      return { before, after: sectionNames().length, name,
               rowsInNew: rows.filter(r => r.job === name).length,
               headings: [...document.querySelectorAll('#ts-body tr.job-row')].map(tr => tr.dataset.job) };
    })()`);
    checks.equal('a section is added', added.after, added.before + 1);
    checks.equal('the new section starts with one day', added.rowsInNew, 1);
    checks.ok('the new section gets a heading', added.headings.includes(added.name));

    // Renaming carries extras with it
    const renamed = await page.evaluate(`(() => {
      ${IN_PAGE}
      addExtraToSection('TVC');
      const extrasBefore = extras.filter(e => e.job === 'TVC').length;
      renameSection('TVC', 'Commercial');
      return {
        extrasBefore,
        rowsRenamed: rows.filter(r => r.job === 'Commercial').length,
        extrasRenamed: extras.filter(e => e.job === 'Commercial').length,
        tvcLeftBehind: [...rows, ...extras].filter(x => (x.job || '') === 'TVC').length,
      };
    })()`);
    checks.equal('rows follow the rename', renamed.rowsRenamed, 6);
    checks.equal('extras follow the rename', renamed.extrasRenamed, renamed.extrasBefore);
    checks.equal('nothing is left on the old name', renamed.tvcLeftBehind, 0);

    // Re-rating a section moves its money
    const rerated = await page.evaluate(`(() => {
      ${IN_PAGE}
      const before = jobTotals().find(j => j.name === 'Stills').fees;
      setSectionRate('Stills', 3000);
      const after = jobTotals().find(j => j.name === 'Stills').fees;
      return { before, after, rowRates: rows.filter(r => r.job === 'Stills').map(r => String(r.rate)),
               sectionRate: sectionRate('Stills') };
    })()`);
    checks.equal('section fees before re-rating', rerated.before, 4000);
    checks.equal('section fees after re-rating', rerated.after, 6000);
    checks.ok('every row in the section took the rate', rerated.rowRates.every(r => r === '3000'));
    checks.equal('the section reports one rate', rerated.sectionRate, '3000');

    // Adding a day into a section inherits that section's rate
    const addedDay = await page.evaluate(`(() => {
      ${IN_PAGE}
      addRowToSection('Stills');
      const last = rows[rows.length - 1];
      return { job: last.job, rate: String(last.rate), count: rows.filter(r => r.job === 'Stills').length };
    })()`);
    checks.equal('the new day joins the section', addedDay.job, 'Stills');
    checks.equal('the new day takes the section rate', addedDay.rate, '3000');
    checks.equal('the section now has three days', addedDay.count, 3);

    // Removing a section takes its rows and extras with it
    const removed = await page.evaluate(`(() => {
      ${IN_PAGE}
      addExtraToSection('Stills');
      const had = { rows: rows.filter(r => r.job === 'Stills').length,
                    extras: extras.filter(e => e.job === 'Stills').length };
      deleteSection('Stills');
      return { had,
               rowsLeft: rows.filter(r => r.job === 'Stills').length,
               extrasLeft: extras.filter(e => e.job === 'Stills').length,
               inSummary: jobTotals().some(j => j.name === 'Stills'),
               headings: [...document.querySelectorAll('#ts-body tr.job-row')].map(tr => tr.dataset.job) };
    })()`);
    checks.ok('the section had rows and extras to remove', removed.had.rows > 0 && removed.had.extras > 0);
    checks.equal('its rows are gone', removed.rowsLeft, 0);
    checks.equal('its extras are gone', removed.extrasLeft, 0);
    checks.ok('it leaves the job summary', !removed.inSummary);
    checks.ok('its heading is gone', !removed.headings.includes('Stills'));

    checks.empty('no page errors', page.pageErrors);
    await page.close();
  },
};
