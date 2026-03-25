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

test('watchTournament uses silent polling in devtools without attempting realtime watch', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalWarn = console.warn;
  const timerQueue = [];
  const activeTimers = new Set();
  const dataEvents = [];
  const warnCalls = [];
  let watchCalls = 0;

  global.setTimeout = (fn, delay = 0) => {
    const handle = { fn, delay };
    activeTimers.add(handle);
    timerQueue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    activeTimers.delete(handle);
  };
  console.warn = (...args) => {
    warnCalls.push(args);
  };
  global.wx = {
    getDeviceInfo() {
      return { platform: 'devtools' };
    },
    cloud: {
      database() {
        return {
          collection() {
            return {
              doc() {
                return {
                  async get() {
                    return { data: { _id: 't_devtools', version: 1 } };
                  },
                  watch() {
                    watchCalls += 1;
                    return {
                      close() {}
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
    't_devtools',
    (doc, meta = {}) => dataEvents.push({ version: doc.version, source: meta.source }),
    () => {}
  );

  try {
    await flushMicrotasks();
    assert.deepEqual(dataEvents, [{ version: 1, source: 'init_fetch' }]);
    assert.equal(watchCalls, 0);

    const pollTimer = timerQueue.find((handle) => handle.delay === 0);
    assert.ok(pollTimer);
    await runTimer(pollTimer, activeTimers);

    assert.deepEqual(dataEvents.slice(-1)[0], { version: 1, source: 'devtools_polling' });
    assert.equal(warnCalls.length, 0);
  } finally {
    if (watcher && typeof watcher.close === 'function') watcher.close();
    watchModule.closeWatch('t_devtools');
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    console.warn = originalWarn;
  }
});
