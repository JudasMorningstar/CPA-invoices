'use strict';

// Minimal collector: a spec records checks, the runner prints and tallies them.
function createChecks() {
  const results = [];
  const api = {
    ok(label, condition, detail) {
      results.push({ label, passed: !!condition, detail: condition ? '' : (detail || '') });
      return !!condition;
    },
    equal(label, actual, expected) {
      const passed = actual === expected;
      return api.ok(label, passed, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    close(label, actual, expected, tolerance = 0.01) {
      const passed = Math.abs(actual - expected) <= tolerance;
      return api.ok(label, passed, `expected ~${expected}, got ${actual}`);
    },
    empty(label, list) {
      return api.ok(label, list.length === 0, list.slice(0, 3).join(' | '));
    },
    results,
  };
  return api;
}

module.exports = { createChecks };
