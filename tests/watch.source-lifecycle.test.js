const test = require('node:test');
const assert = require('node:assert/strict');
const watchModule = require('../miniprogram/sync/watch');

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t, options = {}) {
  const id = t.name;
  const timers = new Set();
  const sources = [];
  const data = [];
  const errors = [];
  let gets = 0;
  t.mock.method(global, 'setTimeout', (fn, delay) => {
    const timer = { fn, delay };
    timers.add(timer);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', (timer) => { timers.delete(timer); });
  const previousWx = global.wx;
  global.wx = {
    getDeviceInfo: () => ({ platform: 'ios' }),
    cloud: { database: () => ({ collection: () => ({ doc: () => ({
      get() {
        gets += 1;
        return options.get ? options.get(gets) : Promise.resolve({ data: { _id: id, version: gets } });
      },
      watch(handlers) {
        const source = { handlers, closed: 0, close() { this.closed += 1; } };
        sources.push(source);
        if (options.register) options.register(handlers, sources.length);
        return source;
      }
    }) }) }) }
  };
  const watcher = watchModule.watchTournament(id,
    (doc, meta) => { data.push({ version: doc.version, source: meta.source }); },
    (error) => { errors.push(error.__watchType); });
  t.after(() => { watchModule.closeWatch(id); global.wx = previousWx; });
  return { id, timers, sources, data, errors, watcher,
    async run(delay) {
      const timer = [...timers].find((entry) => entry.delay === delay);
      assert.ok(timer, `active ${delay}ms timer`);
      timers.delete(timer);
      await timer.fn();
      await flush();
    }
  };
}

test('watch classification requires explicit unsupported semantics instead of realtime API names', () => {
  for (const [message, expected] of [
    ['realtime network disconnected', 'network'],
    ['reportRealtimeAction:fail network timeout', 'network'],
    ['reportRealtimeAction:fail unexpected result', 'unknown'],
    ['realtime watch not supported', 'realtime_not_supported'],
    ['reportRealtimeAction:fail unsupported', 'realtime_not_supported'],
    ['document.get:fail requested document does not exist; realtime not supported', 'not_found']
  ]) {
    assert.equal(watchModule.classifyWatchError(new Error(message)), expected, message);
  }
});

for (const message of ['realtime network disconnected', 'reportRealtimeAction:fail network timeout']) {
  test(`watch recovers after ${message}`, async (t) => {
    const ctx = fixture(t);
    await flush();
    ctx.sources[0].handlers.onError(new Error(message));
    assert.deepEqual(ctx.errors, ['network']);
    await ctx.run(5000);
    assert.equal(ctx.sources.length, 2);
    ctx.sources[1].handlers.onChange({ docs: [{ _id: ctx.id, version: 3 }] });
    assert.deepEqual(ctx.data.at(-1), { version: 3, source: 'realtime_recovered' });
  });
}

test('closed realtime callbacks cannot emit data, errors or cancel polling recovery', async (t) => {
  const ctx = fixture(t);
  await flush();
  ctx.sources[0].handlers.onError(new Error('network disconnected'));
  const dataBefore = [...ctx.data];
  const errorsBefore = [...ctx.errors];
  ctx.sources[0].handlers.onChange({ docs: [{ _id: ctx.id, version: 99 }] });
  ctx.sources[0].handlers.onError(new Error('document.get:fail requested document does not exist'));
  assert.deepEqual(ctx.data, dataBefore);
  assert.deepEqual(ctx.errors, errorsBefore);
  assert.equal(ctx.watcher.isActive(), true);
  await ctx.run(5000);
  assert.equal(ctx.sources.length, 2);
  ctx.sources[1].handlers.onChange({ docs: [{ _id: ctx.id, version: 4 }] });
  assert.deepEqual(ctx.data.at(-1), { version: 4, source: 'realtime_recovered' });
});

for (const outcome of ['data', 'not_found']) {
  test(`replaced source ignores its late init fetch ${outcome}`, async (t) => {
    const pending = deferred();
    const ctx = fixture(t, { get: (count) => count === 1 ? pending.promise
      : Promise.resolve({ data: { _id: t.name, version: count } }) });
    ctx.sources[0].handlers.onError(new Error('network disconnected'));
    await ctx.run(5000);
    const dataBefore = [...ctx.data];
    const errorsBefore = [...ctx.errors];
    if (outcome === 'data') pending.resolve({ data: { _id: ctx.id, version: 99 } });
    else pending.reject(new Error('document.get:fail requested document does not exist'));
    await flush();
    assert.deepEqual(ctx.data, dataBefore);
    assert.deepEqual(ctx.errors, errorsBefore);
    assert.equal(ctx.watcher.isActive(), true);
    ctx.sources[1].handlers.onChange({ docs: [{ _id: ctx.id, version: 4 }] });
    assert.deepEqual(ctx.data.at(-1), { version: 4, source: 'realtime_recovered' });
  });
}

for (const outcome of ['data', 'not_found']) {
  test(`recovered realtime ignores the closed poller's in-flight ${outcome}`, async (t) => {
    const pending = deferred();
    const ctx = fixture(t, { get: (count) => count === 2 ? pending.promise
      : Promise.resolve({ data: { _id: t.name, version: count } }) });
    await flush();
    ctx.sources[0].handlers.onError(new Error('network disconnected'));
    const pollTimer = [...ctx.timers].find((entry) => entry.delay === 0);
    ctx.timers.delete(pollTimer);
    const polling = pollTimer.fn();
    await ctx.run(5000);
    ctx.sources[1].handlers.onChange({ docs: [{ _id: ctx.id, version: 4 }] });
    const dataBefore = [...ctx.data];
    const errorsBefore = [...ctx.errors];
    if (outcome === 'data') pending.resolve({ data: { _id: ctx.id, version: 99 } });
    else pending.reject(new Error('document.get:fail requested document does not exist'));
    await polling;
    assert.deepEqual(ctx.data, dataBefore);
    assert.deepEqual(ctx.errors, errorsBefore);
    assert.equal(ctx.watcher.isActive(), true);
  });
}

test('synchronous watch registration error retains polling and the existing recovery delays', async (t) => {
  const ctx = fixture(t, { register: (handlers, count) => {
    if (count < 5) handlers.onError(new Error('network disconnected'));
  } });
  await flush();
  assert.equal(ctx.sources[0].closed, 1, 'returned failed registration is closed without overwriting polling');
  await ctx.run(0);
  assert.equal(ctx.data.at(-1).source, 'polling');
  for (const delay of [5000, 15000, 30000, 60000]) await ctx.run(delay);
  assert.equal(ctx.sources.length, 5);
  assert.deepEqual(ctx.sources.slice(0, 4).map((source) => source.closed), [1, 1, 1, 1]);
  ctx.sources[4].handlers.onChange({ docs: [{ _id: ctx.id, version: 10 }] });
  assert.deepEqual(ctx.data.at(-1), { version: 10, source: 'realtime_recovered' });
});
