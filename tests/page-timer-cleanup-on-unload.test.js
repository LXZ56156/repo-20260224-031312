const test = require('node:test');
const assert = require('node:assert/strict');

const pageTimers = require('../miniprogram/core/pageTimers');

test('pageTimers handles synchronous setTimeout implementations without stale handles', () => {
  const ctx = {};
  let calls = 0;

  const handle = pageTimers.setNamedTimer(ctx, 'instant', () => {
    calls += 1;
  }, 10, {
    setTimeoutFn(fn) {
      fn();
      return 1;
    },
    clearTimeoutFn() {}
  });

  assert.equal(handle, 1);
  assert.equal(calls, 1);
  assert.deepEqual(ctx.__pageTimers, {});
});
