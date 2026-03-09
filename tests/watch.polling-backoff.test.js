const test = require('node:test');
const assert = require('node:assert/strict');

const watchModule = require('../miniprogram/sync/watch');
const { createPollingController } = watchModule;

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

test('watchTournament falls back to polling after realtime runtime error and keeps emitting data', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timerQueue = [];
  const activeTimers = new Set();
  let realtimeHandlers = null;
  let realtimeClosed = 0;
  let getCount = 0;
  const emittedVersions = [];
  const emittedErrors = [];
  const docs = [
    { _id: 't_1', version: 1 },
    { _id: 't_1', version: 2 },
    { _id: 't_1', version: 2 }
  ];

  global.setTimeout = (fn) => {
    const handle = { fn };
    activeTimers.add(handle);
    timerQueue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    activeTimers.delete(handle);
  };
  global.wx = {
    cloud: {
      database() {
        return {
          collection(name) {
            assert.equal(name, 'tournaments');
            return {
              doc(id) {
                assert.equal(id, 't_1');
                return {
                  async get() {
                    const doc = docs[Math.min(getCount, docs.length - 1)];
                    getCount += 1;
                    return { data: doc };
                  },
                  watch(handlers) {
                    realtimeHandlers = handlers;
                    return {
                      close() {
                        realtimeClosed += 1;
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    }
  };

  async function flushNextTimer() {
    const handle = timerQueue.shift();
    if (!handle || !activeTimers.has(handle)) return false;
    activeTimers.delete(handle);
    await handle.fn();
    return true;
  }

  const watcher = watchModule.watchTournament(
    't_1',
    (doc) => emittedVersions.push(doc.version),
    (err) => emittedErrors.push(String(err && err.message || err))
  );

  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(emittedVersions, [1]);
    assert.ok(realtimeHandlers && typeof realtimeHandlers.onError === 'function');

    realtimeHandlers.onError(new Error('network disconnected'));
    assert.equal(realtimeClosed, 1);
    assert.deepEqual(emittedErrors, ['network disconnected']);

    const flushed = await flushNextTimer();
    assert.equal(flushed, true);
    assert.deepEqual(emittedVersions, [1, 2]);
  } finally {
    if (watcher && typeof watcher.close === 'function') watcher.close();
    watchModule.closeWatch('t_1');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
