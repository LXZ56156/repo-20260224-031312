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


async function withWatch(run, first = 'success') {
  const old = {wx: global.wx, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, warn: console.warn};
  const timers = new Set();
  const events = [];
  const errors = [];
  let reads = 0;
  let resolveFirst;
  let rejectFirst;
  const pending = new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
  // Avoid an unhandled rejection if a test assertion fails before the pending read is awaited.
  pending.catch(() => {});
  const tid = 'initial_' + first;
  global.setTimeout = (fn, delay) => { const timer = {fn, delay}; timers.add(timer); return timer; };
  global.clearTimeout = (timer) => timers.delete(timer);
  console.warn = () => {};
  global.wx = {getDeviceInfo: () => ({platform: 'devtools'}), cloud: {database: () => ({collection: () => ({doc: () => ({get: async () => {
    reads += 1;
    if (reads === 1 && first !== 'success') return pending;
    return {data: {_id: tid, version: reads}};
  }, watch: () => { throw new Error('devtools must not attach realtime'); }})})})}};
  const watcher = watchModule.watchTournament(tid, (doc, meta) => events.push([doc.version, meta.source]), (err) => errors.push(err), {initialDoc: {_id: tid, version: 0}});
  const tick = (delay) => runTimer([...timers].find((timer) => delay === 0 ? timer.delay === 0 : timer.delay > 0), timers);
  try {
    await run({reads: () => reads, resolveFirst, rejectFirst, tid, tick, events, errors, timers, close: () => watchModule.closeWatch(tid)});
  } finally {
    resolveFirst({data: {_id: tid, version: 1}});
    watcher.close();
    watchModule.closeWatch(tid);
    global.wx = old.wx;
    global.setTimeout = old.setTimeout;
    global.clearTimeout = old.clearTimeout;
    console.warn = old.warn;
  }
}

test('devtools first poll reuses resolved initial remote result, next interval still reads', async () => {
  await withWatch(async ({tick, events, reads}) => {
    await flushMicrotasks();
    await tick(0);
    assert.equal(reads(), 1);
    assert.deepEqual(events.slice(-2), [[1, 'init_fetch'], [1, 'devtools_polling']]);
    await tick(1);
    assert.equal(reads(), 2);
    assert.deepEqual(events.at(-1), [2, 'devtools_polling']);
  });
});

test('devtools first poll joins pending remote read rather than using cached initialDoc', async () => {
  await withWatch(async ({tick, events, reads, resolveFirst, tid}) => {
    const poll = tick(0);
    assert.equal(reads(), 1);
    resolveFirst({data: {_id: tid, version: 1}});
    await poll;
    assert.deepEqual(events.slice(-2), [[1, 'init_fetch'], [1, 'devtools_polling']]);
  }, 'pending');
});

test('devtools failed initial read still permits an immediate fresh poll retry', async () => {
  await withWatch(async ({tick, reads, rejectFirst, events, errors}) => {
    rejectFirst(new Error('network unavailable'));
    await flushMicrotasks();
    await tick(0);
    assert.equal(reads(), 2);
    assert.equal(errors.length, 1);
    assert.deepEqual(events.at(-1), [2, 'devtools_polling']);
  }, 'failure');
});

test('closing while first read is pending suppresses events and leaves no polling timers', async () => {
  await withWatch(async ({tick, reads, resolveFirst, tid, events, timers, close}) => {
    const before = events.length;
    const poll = tick(0);
    assert.equal(reads(), 1);
    close();
    resolveFirst({data: {_id: tid, version: 1}});
    await poll;
    assert.equal(events.length, before);
    assert.equal(timers.size, 0);
  }, 'closing');
});

test('missing initial document terminates polling without another read', async () => {
  await withWatch(async ({resolveFirst, tick, reads, errors, timers}) => {
    resolveFirst({data: null});
    await flushMicrotasks();
    await tick(0);
    assert.equal(reads(), 1);
    assert.equal(errors.length, 1);
    assert.equal(timers.size, 0);
  }, 'missing');
});

test('missing initial document during first poll wait terminates without retrying a disposed source', async () => {
  await withWatch(async ({resolveFirst, tick, reads, errors, timers}) => {
    const poll = tick(0);
    resolveFirst({data: null});
    await poll;
    assert.equal(reads(), 1);
    assert.equal(errors.length, 1);
    assert.equal(timers.size, 0);
  }, 'missing_pending');
});

test('closing during failed first read prevents a retry after disposal', async () => {
  await withWatch(async ({rejectFirst, tick, reads, errors, timers, close}) => {
    const poll = tick(0);
    close();
    rejectFirst(new Error('late network failure'));
    await poll;
    assert.equal(reads(), 1);
    assert.equal(errors.length, 0);
    assert.equal(timers.size, 0);
  }, 'closed_failure');
});
