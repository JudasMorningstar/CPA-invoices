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

    // The shipped example: the Section 2 rate is the main one, and the odd
    // section out carries the override.
    const shipped = await page.evaluate(`(() => {
      ${IN_PAGE}
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

    checks.equal('Section 2 shows the main rate', shipped.globalRate, '2200');
    checks.equal('Stills section is overridden', shipped.stillsRate, '2000');
    checks.equal('TVC section inherits (blank)', shipped.tvcRate, '');
    checks.equal('TVC rows bill at the inherited rate', shipped.tvcRowRate, 2200);
    checks.equal('Stills rows bill at the override', shipped.stillsRowRate, 2000);
    checks.equal('totals unchanged by the flip', shipped.grand, 29275);

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
