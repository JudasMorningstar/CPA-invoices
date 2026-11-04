'use strict';
const fs = require('fs');
const path = require('path');

// Playwright's bundled browser revision moves around, and managed environments
// install it wherever PLAYWRIGHT_BROWSERS_PATH points. Find a real binary
// rather than hardcoding a revision that will go stale.
function resolveChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const dir of entries.filter(d => d.startsWith('chromium-'))) {
      for (const sub of ['chrome-linux64', 'chrome-linux', 'chrome-mac', 'chrome-win']) {
        for (const bin of ['chrome', 'chrome.exe', 'Chromium.app/Contents/MacOS/Chromium']) {
          const p = path.join(root, dir, sub, bin);
          if (fs.existsSync(p)) {
            const rev = parseInt(dir.split('-')[1], 10) || 0;
            candidates.push({ p, rev });
          }
        }
      }
    }
  }
  if (!candidates.length) return undefined;   // let playwright try its own default
  candidates.sort((a, b) => b.rev - a.rev);
  return candidates[0].p;
}

async function launch() {
  const { chromium } = require('playwright-core');
  const executablePath = resolveChromium();
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (err) {
    throw new Error(
      'Could not launch Chromium. Set CHROMIUM_PATH, or install one with\n' +
      '  npx playwright install chromium\n' + 'Original error: ' + err.message
    );
  }
}

module.exports = { launch, resolveChromium };
