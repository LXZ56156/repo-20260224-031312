const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

test('actionGuard.runWithPageBusy releases busy state after timeout', async () => {
  const timers = installFakeTimers();
  const states = [];
  const ctx = {
    setData(patch) {
      states.push(patch.busy);
    }
  };

  try {
    actionGuard.runWithPageBusy(ctx, 'busy', 'test:timeout-release', () => new Promise(() => {}), { timeoutMs: 20 });
    assert.equal(actionGuard.isBusy('test:timeout-release'), true);

    await timers.flushAll();

    assert.equal(actionGuard.isBusy('test:timeout-release'), false);
    assert.deepEqual(states, [true, false]);
  } finally {
    actionGuard.clear('test:timeout-release');
    timers.restore();
  }
});

test('actionGuard.run allows retrying the same key after timeout release', async () => {
  const timers = installFakeTimers();
  let retried = 0;

  try {
    actionGuard.run('test:timeout-retry', () => new Promise(() => {}), { timeoutMs: 20 });
    await timers.flushAll();

    const result = await actionGuard.run('test:timeout-retry', async () => {
      retried += 1;
      return 'done';
    }, { timeoutMs: 20 });

    assert.equal(result, 'done');
    assert.equal(retried, 1);
    assert.equal(actionGuard.isBusy('test:timeout-retry'), false);
  } finally {
    actionGuard.clear('test:timeout-retry');
    timers.restore();
  }
});
