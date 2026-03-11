const test = require('node:test');
const assert = require('node:assert/strict');

const watchModule = require('../miniprogram/sync/watch');

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function runTimer(handle, activeTimers) {
  if (!handle || !activeTimers.has(handle)) return Promise.resolve(false);
  activeTimers.delete(handle);
  return Promise.resolve(handle.fn()).then(() => true);
}

test('watchTournament retries realtime after polling fallback and emits recovered realtime source', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timerQueue = [];
  const activeTimers = new Set();
  const realtimeHandlers = [];
  const dataEvents = [];
  const errorEvents = [];
  let realtimeClosed = 0;
  let getCount = 0;
  const docs = [
    { _id: 't_recover', version: 1 },
    { _id: 't_recover', version: 2 },
    { _id: 't_recover', version: 3 }
  ];

  global.setTimeout = (fn, delay = 0) => {
    const handle = { fn, delay };
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
                assert.equal(id, 't_recover');
                return {
                  async get() {
                    const doc = docs[Math.min(getCount, docs.length - 1)];
                    getCount += 1;
                    return { data: doc };
                  },
                  watch(handlers) {
                    realtimeHandlers.push(handlers);
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

  const watcher = watchModule.watchTournament(
    't_recover',
    (doc, meta = {}) => dataEvents.push({ version: doc.version, source: meta.source }),
    (err) => errorEvents.push(String(err && err.__watchType || ''))
  );

  try {
    await flushMicrotasks();
    assert.deepEqual(dataEvents, [{ version: 1, source: 'init_fetch' }]);
    assert.equal(realtimeHandlers.length, 1);

    realtimeHandlers[0].onError(new Error('network disconnected'));
    assert.equal(realtimeClosed, 1);
    assert.deepEqual(errorEvents, ['network']);

    const pollTimer = timerQueue.find((handle) => handle.delay === 0);
    const recoverTimer = timerQueue.find((handle) => handle.delay === 5000);
    assert.ok(pollTimer);
    assert.ok(recoverTimer);

    await runTimer(pollTimer, activeTimers);
    assert.deepEqual(dataEvents.slice(-1)[0], { version: 2, source: 'polling' });

    await runTimer(recoverTimer, activeTimers);
    await flushMicrotasks();
    assert.equal(realtimeHandlers.length, 2);

    realtimeHandlers[1].onChange({
      docs: [{ _id: 't_recover', version: 4 }]
    });
    assert.deepEqual(dataEvents.slice(-1)[0], { version: 4, source: 'realtime_recovered' });
  } finally {
    if (watcher && typeof watcher.close === 'function') watcher.close();
    watchModule.closeWatch('t_recover');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('watchTournament clears pending recovery timer when the last listener closes', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timerQueue = [];
  const activeTimers = new Set();
  const realtimeHandlers = [];
  let realtimeClosed = 0;

  global.setTimeout = (fn, delay = 0) => {
    const handle = { fn, delay };
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
          collection() {
            return {
              doc() {
                return {
                  async get() {
                    return { data: { _id: 't_close', version: 1 } };
                  },
                  watch(handlers) {
                    realtimeHandlers.push(handlers);
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

  const watcher = watchModule.watchTournament('t_close', () => {}, () => {});

  try {
    await flushMicrotasks();
    assert.equal(realtimeHandlers.length, 1);
    realtimeHandlers[0].onError(new Error('network disconnected'));
    const recoverTimer = timerQueue.find((handle) => handle.delay === 5000);
    assert.ok(recoverTimer);
    assert.equal(activeTimers.has(recoverTimer), true);

    watcher.close();
    assert.equal(realtimeClosed, 1);
    assert.equal(activeTimers.has(recoverTimer), false);
  } finally {
    watchModule.closeWatch('t_close');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
