# Invoice regression tests

The invoice is a single HTML file, but the money maths exists twice: once as
JavaScript for the app and the PDF, and again as live Excel formulas in the
XLSX export, so the spreadsheet stays editable. That duplication is where the
bugs have been — overtime buckets that disagreed between the app and the
workbook, rounding that made a printed column not add up to its own subtotal,
`#VALUE!` in exported Premium Day rows.

These tests exist to catch that class of defect. The workbook test does not
check the numbers the exporter happened to write — it **evaluates the formulas
the workbook actually ships** and compares them against what the app displays.

## Running

```sh
cd tests
npm install
npm test
```

Run one spec by substring:

```sh
npm test -- money
```

Options:

- `ITERATIONS=400 npm test` — how many randomised invoices the money spec tries
  (default 150).
- `CHROMIUM_PATH=/path/to/chrome npm test` — if the browser is not found
  automatically. Otherwise `npx playwright install chromium` provides one.

Output lands in `tests/out/` and is ignored by git.

## What each spec covers

| Spec | Covers |
| --- | --- |
| `reconciliation` | The Chicken Licken invoice — two jobs at two day rates, three hire lines, invoiced gross — must reach R29 275 in the app, the PDF and the workbook's evaluated formulas, with the per-job split intact. |
| `money` | Randomised invoices: every printed column foots to its printed total, per-job subtotals never exceed the whole, PAYE is 25% or nothing, and the workbook agrees with the app. |
| `tax` | The PAYE switch reaches all four surfaces. With it off the PAYE lines are *hidden*, not zeroed, so the invoice never implies a deduction that was not made. |
| `sections` | Sections are a shared job label, not a second structure: adding, renaming, re-rating and removing one must keep its rows and extras together and move the totals with them. |
| `sessions` | `.cpa` files saved before extras became a list still load; jobs and per-row rates survive save and restore; autosave restores on reload. |
| `exports` | The PDF prints with no browser header or `file://` footer, lands on A4 at 14mm/12mm margins, and its stylesheet does not leak into the app afterwards. |
| `layout` | No horizontal overflow and no sticky-bar overlap from 320px to 1920px. |
| `defaults` | Whatever example ships in the file loads without errors and its own totals agree. Deliberately asserts no fixed figures, so editing the example does not break it. |

## Notes

The page loads SheetJS from a CDN and opens a real print dialog. The harness
stubs both, so the suite runs offline and headless. `tests/lib/excel.js` holds
the formula evaluator; it supports exactly what the export emits — arithmetic,
cell references, `SUM` over a range, `MIN`, `MAX` and `ROUND`.
