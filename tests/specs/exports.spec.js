'use strict';
const fs = require('fs');
const path = require('path');
const { openInvoice } = require('../lib/harness');

// The PDF must print clean — no browser header, no file:// footer — and the
// print stylesheet must not escape into the app afterwards.
module.exports = {
  name: 'exports — the PDF prints clean and leaves the app alone',
  async run({ browser, fileUrl, checks, outDir }) {
    const page = await openInvoice(browser, fileUrl, { stubs: false });

    const before = await page.evaluate(`(() => {
      const cs = getComputedStyle(document.body);
      return { background: cs.backgroundColor, fontSize: cs.fontSize, maxWidth: cs.maxWidth, title: document.title };
    })()`);

    await page.evaluate(`(() => { window.print = () => {}; exportPDF(); })()`);
    await page.waitForTimeout(1800);   // past the print call and its cleanup timer

    const after = await page.evaluate(`(() => {
      const cs = getComputedStyle(document.body);
      return {
        background: cs.backgroundColor, fontSize: cs.fontSize, maxWidth: cs.maxWidth, title: document.title,
        overlayDisplay: getComputedStyle(document.getElementById('pdf-overlay')).display,
        overlayEmpty: document.getElementById('pdf-overlay').innerHTML === '',
      };
    })()`);

    checks.equal('body background restored', after.background, before.background);
    checks.equal('body font size restored', after.fontSize, before.fontSize);
    checks.equal('body max-width restored', after.maxWidth, before.maxWidth);
    checks.equal('tab title restored', after.title, before.title);
    checks.ok('overlay hidden and emptied', after.overlayDisplay === 'none' && after.overlayEmpty);

    // Geometry: zero page margin is what suppresses the browser header and
    // footer, with the real margin carried by the body padding instead.
    await page.evaluate(`(() => { const st = window.setTimeout; window.setTimeout = () => 0; exportPDF(); window.setTimeout = st; })()`);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(300);

    const geom = await page.evaluate(`(() => {
      const MM = 96 / 25.4;
      const boxes = [...document.querySelectorAll('#pdf-overlay *')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.children.length === 0; })
        .map(e => e.getBoundingClientRect());
      return {
        left: +(Math.min(...boxes.map(r => r.left)) / MM).toFixed(1),
        top: +(Math.min(...boxes.map(r => r.top)) / MM).toFixed(1),
        width: +((Math.max(...boxes.map(r => r.right)) - Math.min(...boxes.map(r => r.left))) / MM).toFixed(1),
      };
    })()`);

    checks.close('content starts 14mm from the left edge', geom.left, 14, 0.6);
    checks.close('content starts 12mm from the top edge', geom.top, 12, 0.6);
    checks.close('content is 182mm wide', geom.width, 182, 1);

    const file = path.join(outDir, 'invoice.pdf');
    await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(file));
    const { width, height } = doc.getPages()[0].getSize();
    checks.close('page is A4 wide', width / 72 * 25.4, 210, 1);
    checks.close('page is A4 tall', height / 72 * 25.4, 297, 1);

    await page.close();
  },
};
