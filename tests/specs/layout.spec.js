'use strict';
const { openInvoice } = require('../lib/harness');

// Crew fill these in on a phone on set. Nothing may overflow sideways, and the
// sticky bar must never cover the form.
const VIEWPORTS = [
  ['iphone-se', 375, 667], ['iphone-14', 390, 844], ['pixel', 360, 780],
  ['small-android', 320, 700], ['ipad-portrait', 768, 1024], ['ipad-landscape', 1024, 768],
  ['laptop', 1280, 800], ['desktop', 1440, 900], ['wide', 1920, 1080],
  // Either side of each totals-bar tier, where a control would clip first.
  ['tier-mobile-edge', 861, 900], ['tier-totals-lo', 1000, 900], ['tier-totals-hi', 1001, 900],
  ['tier-labels-lo', 1420, 900], ['tier-labels-hi', 1421, 900],
  ['tier-rules-lo', 1560, 900], ['tier-rules-hi', 1561, 900],
];

module.exports = {
  name: 'layout — no sideways overflow from 320px to 1920px',
  async run({ browser, fileUrl, checks }) {
    for (const [name, width, height] of VIEWPORTS) {
      const page = await openInvoice(browser, fileUrl, { viewport: { width, height }, stubs: false, settle: 600 });
      const m = await page.evaluate(`(() => {
        const bar = document.getElementById('totals-bar').getBoundingClientRect();
        const firstSection = document.querySelector('.section-head').getBoundingClientRect();
        const barKids = [...document.getElementById('totals-bar').children]
          .filter(e => getComputedStyle(e).display !== 'none');
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          overlapsContent: firstSection.top < bar.bottom - 1,
          barSpill: Math.max(...barKids.map(e => e.getBoundingClientRect().bottom)) > bar.bottom + 0.5,
          // A button whose label is drawn with ::after cannot shrink, so a bar
          // that no longer fits clips its last control rather than compressing.
          clippedControls: barKids
            .filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5)
            .map(e => e.id || e.className || e.tagName),
        };
      })()`);
      checks.ok(`${name} (${width}px): no horizontal overflow`, m.overflow <= 0, `scrollWidth exceeds viewport by ${m.overflow}px`);
      checks.ok(`${name} (${width}px): bar clears the content`, !m.overlapsContent);
      checks.ok(`${name} (${width}px): bar contents stay inside it`, !m.barSpill);
      checks.empty(`${name} (${width}px): no bar control clipped`, m.clippedControls);
      checks.empty(`${name} (${width}px): no page errors`, page.pageErrors);
      await page.close();
    }
  },
};
