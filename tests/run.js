#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, resolveChromium } = require('./lib/browser');
const { createChecks } = require('./lib/assert');

const INVOICE = path.resolve(__dirname, '..', 'index.html');
const OUT_DIR = path.join(__dirname, 'out');
const SPEC_DIR = path.join(__dirname, 'specs');

async function main() {
  if (!fs.existsSync(INVOICE)) {
    console.error('Cannot find ' + INVOICE);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const only = process.argv[2];
  const specs = fs.readdirSync(SPEC_DIR)
    .filter(f => f.endsWith('.spec.js'))
    .filter(f => !only || f.includes(only))
    .sort()
    .map(f => require(path.join(SPEC_DIR, f)));

  if (!specs.length) {
    console.error(only ? `No spec matches "${only}"` : 'No specs found');
    process.exit(2);
  }

  const chromium = resolveChromium();
  console.log(`\ninvoice : ${INVOICE}`);
  console.log(`chromium: ${chromium || '(playwright default)'}\n`);

  const browser = await launch();
  const fileUrl = pathToFileURL(INVOICE).href;
  let passed = 0, failed = 0;
  const started = Date.now();

  for (const spec of specs) {
    const checks = createChecks();
    const t0 = Date.now();
    try {
      await spec.run({ browser, fileUrl, checks, outDir: OUT_DIR });
    } catch (err) {
      checks.ok('spec threw', false, err.stack || err.message);
    }
    const bad = checks.results.filter(r => !r.passed);
    const mark = bad.length ? '✗' : '✓';
    console.log(`${mark} ${spec.name}  (${checks.results.length} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const r of bad) {
      console.log(`    ✗ ${r.label}`);
      if (r.detail) console.log(`      ${r.detail}`);
    }
    passed += checks.results.length - bad.length;
    failed += bad.length;
  }

  await browser.close();
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${passed} passed, ${failed} failed  (${secs}s)\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
