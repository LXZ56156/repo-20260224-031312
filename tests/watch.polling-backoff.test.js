const test = require('node:test');
const assert = require('node:assert/strict');

const { createPollingController } = require('../miniprogram/sync/watch');

test('createPollingController increases backoff on failure and resets after success', async () => {
  const waits = [];
  let fetchCount = 0;

  const controller = createPollingController({
    autoStart: false,
    baseMs: 100,
    maxMs: 800,
    jitterFn: (ms) => ms,
    setTimeoutFn: (_fn, wait) => {
      waits.push(wait);
      return wait;
    },
    clearTimeoutFn() {},
    fetchDoc: async () => {
      fetchCount += 1;
      if (fetchCount === 1) throw new Error('network');
      return { version: fetchCount };
    }
  });

  await controller.runOnce();
  assert.equal(controller.getDelayMs(), 180);
  assert.equal(waits[0], 180);

  await controller.runOnce();
  assert.equal(controller.getDelayMs(), 100);
  assert.equal(waits[1], 100);
});

test('createPollingController avoids concurrent polling reentry', async () => {
  let fetchCount = 0;
  let releaseFetch;

  const controller = createPollingController({
    autoStart: false,
    jitterFn: (ms) => ms,
    setTimeoutFn: () => 0,
    clearTimeoutFn() {},
    fetchDoc: async () => {
      fetchCount += 1;
      await new Promise((resolve) => {
        releaseFetch = resolve;
      });
      return { version: 1 };
    }
  });

  const first = controller.runOnce();
  const second = controller.runOnce();
  assert.equal(controller.isInflight(), true);
  assert.equal(fetchCount, 1);

  releaseFetch();
  await Promise.all([first, second]);
  assert.equal(fetchCount, 1);
  assert.equal(controller.isInflight(), false);
});
