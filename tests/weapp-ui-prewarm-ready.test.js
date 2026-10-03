const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const prewarm = require('../scripts/dev/weapp-ui-prewarm');

function runtime(app) {
  return { getApp: () => app, getCurrentPages: () => [], App() {}, Page() {} };
}

test('prewarm waits on the same AppService until genuine APIs and application become available', async () => {
  let clock = 0;
  let calls = 0;
  const app = {};
  const connection = { async evaluate(probe) {
    calls += 1;
    const context = calls === 1 ? {} : (calls === 2 ? runtime(undefined) : runtime(app));
    return vm.runInNewContext(`(${probe.toString()})()`, context);
  } };
  const result = await prewarm.waitForAppServiceReady(connection, 100, {
    now: () => clock, pollMs: 10, sleep: async (ms) => { clock += ms; },
  });
  assert.equal(result.ready, true);
  assert.equal(calls, 3);
  assert.equal(result.attempts, 3);
  assert.equal(clock, 20);
  assert.deepEqual(app, {}, 'readiness must not create a marker or mutate the application');
});

test('prewarm reports a bounded not-ready timeout and last API availability without binding anything', async () => {
  let clock = 0;
  let calls = 0;
  await assert.rejects(prewarm.waitForAppServiceReady({ async evaluate(probe) {
    calls += 1;
    return vm.runInNewContext(`(${probe.toString()})()`, {});
  } }, 25, { now: () => clock, pollMs: 10, sleep: async (ms) => { clock += ms; } }), (err) => {
    assert.match(err.message, /AppService did not become ready within 25ms/);
    assert.match(err.message, /getApp.*undefined/);
    return true;
  });
  assert.equal(clock, 25);
  assert.equal(calls, 3);
});

test('evaluate rejection remains a failure and is never retried as startup unavailability', async () => {
  let calls = 0;
  await assert.rejects(prewarm.waitForAppServiceReady({ async evaluate() {
    calls += 1;
    throw new Error('transport denied');
  } }, 100, { sleep: async () => { throw new Error('must not poll an exception'); } }), /transport denied/);
  assert.equal(calls, 1);
});

test('an exception inside the genuine read-only AppService probe fails closed', async () => {
  let calls = 0;
  await assert.rejects(prewarm.waitForAppServiceReady({ async evaluate(probe) {
    calls += 1;
    return vm.runInNewContext(`(${probe.toString()})()`, {
      ...runtime({}), getApp() { throw new Error('application access failed'); },
    });
  } }, 100), /application access failed/);
  assert.equal(calls, 1);
});

test('a hung evaluate is deadline bounded and cannot be treated as ready', async () => {
  await assert.rejects(prewarm.waitForAppServiceReady({ evaluate: () => new Promise(() => {}) }, 15),
    /AppService readiness evaluate timed out/);
});

test('malformed readiness and invalid deadlines fail closed', async () => {
  for (const value of [null, {}, { ready: true }]) {
    await assert.rejects(prewarm.waitForAppServiceReady({ evaluate: async () => value }, 100), /Invalid AppService readiness probe/);
  }
  for (const value of [0, -1, NaN, Infinity]) {
    await assert.rejects(prewarm.waitForAppServiceReady({ evaluate: async () => ({}) }, value), /readiness timeout must/);
  }
});

test('readiness wait precedes nonce construction and binding without a second launch', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dev/weapp-ui-prewarm.js'), 'utf8');
  const wait = source.indexOf('await waitForAppServiceReady(launched, timeoutMs)');
  const nonce = source.indexOf('sessionId: crypto.randomBytes(32)');
  const binding = source.indexOf('await screenshotTool.bindRuntimeSession(launched, marker)');
  assert.ok(wait > 0 && wait < nonce && nonce < binding);
  assert.equal((source.match(/automator\.launch\(/g) || []).length, 1);
  assert.match(source, /AppService runtime marker binding failed/);
  assert.match(source, /checks\.sourceStableDuringPrewarm/);
});
