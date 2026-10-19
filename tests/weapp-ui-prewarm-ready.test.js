const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const prewarm = require('../scripts/dev/weapp-ui-prewarm');

test('bounded cold-start budget preserves a meaningful AppService window after a 37-second native container', async () => {
  let clock = 0, calls = 0;
  const budget = prewarm.createStartupBudget(120000, { now: () => clock });
  budget.remaining('ide-service', 1000, 60000); clock += 7000;
  budget.remaining('automation-launch', 1000, 60000); clock += 25000;
  assert.equal(budget.remaining('native-container', 1000, 60000, 15000), 60000); clock += 37213;
  const allowance = budget.remaining('app-service', 5000, 60000);
  assert.equal(allowance, 50787);
  const result = await prewarm.waitForAppServiceReady({ async evaluate(probe) {
    calls++; clock += 500; return vm.runInNewContext(`(${probe.toString()})()`, runtime({}, [{ route: 'pages/launch/index' }]));
  } }, allowance, { now: () => clock, minimumReadBudgetMs: 5000, absoluteDeadline: budget.deadline });
  assert.equal(result.ready, true); assert.equal(calls, 1);
  assert.ok(clock < 120000); assert.equal(budget.snapshot().stages.at(-1).grantedMs, allowance);
});

test('exhausted startup and subminimum AppService budgets fail explicitly before any RPC', async () => {
  let clock = 0, calls = 0;
  const budget = prewarm.createStartupBudget(60000, { now: () => clock });
  clock = 59999;
  assert.throws(() => budget.remaining('app-service', 5000), /Startup budget insufficient.*app-service.*remaining.*1/);
  await assert.rejects(prewarm.waitForAppServiceReady({ async evaluate() { calls++; } }, 1,
    { minimumReadBudgetMs: 5000 }), /AppService readiness budget insufficient.*no RPC/);
  assert.equal(calls, 0);
  for (const value of [0, 4999, 180001, Infinity, NaN]) assert.throws(() => prewarm.createStartupBudget(value), /5000.*180000/);
});

test('prewarm waits for actual target geometry twice on the original SDK connection without changing the App marker', async () => {
  let clock = 0, calls = 0;
  const marker = { challengeId: 'preserved-hot-compile-marker' };
  const samples = [390, 430, 390, 430, 430];
  const result = await prewarm.waitForViewportReady({ async systemInfo() {
    return { windowWidth: samples[calls++], windowHeight: 752, screenWidth: 430, screenHeight: 932, pixelRatio: 3 };
  } }, 430, 100, { height: 752, now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; } });
  assert.equal(result.ready, true); assert.equal(result.attempts, 5); assert.equal(result.systemInfo.windowWidth, 430);
  assert.deepEqual(marker, { challengeId: 'preserved-hot-compile-marker' });
});

test('viewport wait refuses wrong height, unstable geometry, expired targets and failed reads', async () => {
  for (const scenario of ['height', 'unstable']) {
    let clock = 0, calls = 0;
    await assert.rejects(prewarm.waitForViewportReady({ async systemInfo() {
      return { windowWidth: 430, windowHeight: scenario === 'height' ? 671 : 752, pixelRatio: scenario === 'unstable' ? ++calls : 3 };
    } }, 430, 30, { height: 752, now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; } }), /did not settle/);
  }
  await assert.rejects(prewarm.waitForViewportReady({ systemInfo() { throw Error('SDK read failed'); } }, 430, 30), /SDK read failed/);
  await assert.rejects(prewarm.waitForViewportReady({}, 0, 30), /positive target/);
  let clock = 0;
  await assert.rejects(prewarm.waitForViewportReady({ async systemInfo() {
    clock += 20; return { windowWidth: 430, windowHeight: 752 };
  } }, 430, 30, { now: () => clock, pollMs: 1, sleep: async ms => { clock += ms; } }), /did not settle/);
});

test('one recognized viewport read timeout resets geometry samples and stays inside the original deadline', async () => {
  let clock = 0, calls = 0;
  const recovered = [];
  const result = await prewarm.waitForViewportReady({ async systemInfo() {
    calls++;
    if (calls === 2) { clock += 5000; throw Error('prewarm:real-viewport timed out after 5000ms'); }
    return { windowWidth: 430, windowHeight: 752, pixelRatio: 3 };
  } }, 430, 10000, { height: 752, now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; }, onReadTimeout: event => recovered.push(event) });
  assert.equal(result.ready, true); assert.equal(calls, 4, 'a sample before the timeout cannot count toward stability');
  assert.equal(result.transientReadTimeouts, 1); assert.equal(recovered.length, 1);
  assert.ok(result.elapsedMs >= 5000 && result.elapsedMs < 10000);
});

test('second viewport timeout, permanent SDK errors, disconnect and exhausted deadline are never retried indefinitely', async () => {
  for (const kind of ['second', 'disconnect', 'permanent', 'expired']) {
    let clock = 0, calls = 0;
    await assert.rejects(prewarm.waitForViewportReady({ async systemInfo() {
      calls++;
      if (kind === 'disconnect') throw Error('Connection closed');
      if (kind === 'permanent') throw Error('SDK evaluation failed');
      clock += 5000; throw Error('prewarm:real-viewport timed out after 5000ms');
    } }, 430, kind === 'expired' ? 4000 : 20000, { now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; } }), /timed out|Connection closed|SDK evaluation/);
    assert.equal(calls, kind === 'second' ? 2 : 1, kind);
  }
});

test('native watcher excludes generated directory events without hiding project sources', () => {
  const minimatch = require('minimatch');
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../project.config.json'), 'utf8'));
  const ignored = value => config.watchOptions.ignore.some(pattern => minimatch(value, pattern, { dot: true }));
  for (const value of ['.git', '.git/index', '.git/objects/aa/object', 'tmp', 'tmp/session.json', 'tmp/ui-runs/example.png']) {
    assert.equal(ignored(value), true, value);
  }
  for (const value of ['miniprogram/app.js', 'miniprogram/pages/settings/index.wxml', 'miniprogram/tmp/code.js',
    'cloudfunctions/updateSettings/index.js', 'scripts/dev/weapp-ui-screenshot.js', 'docs/tasks/current.md', 'project.config.json']) {
    assert.equal(ignored(value), false, value);
  }
});

function runtime(app, pages = [{ route: 'pages/home/index' }]) {
  return { getApp: () => app, getCurrentPages: () => pages, App() {}, Page() {} };
}

test('prewarm does not bind a startup application while its page stack is empty or lacks a route', async () => {
  let clock = 0;
  let calls = 0;
  const app = {};
  const snapshots = [[], [{}], [{ route: 'pages/home/index' }]];
  const result = await prewarm.waitForAppServiceReady({ async evaluate(probe) {
    return vm.runInNewContext(`(${probe.toString()})()`, runtime(app, snapshots[calls++]));
  } }, 100, { now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; } });
  assert.equal(calls, 3);
  assert.equal(result.lastProbe.pageReady, true);
  assert.equal(result.lastProbe.pageCount, 1);
  assert.equal(clock, 20);
  assert.deepEqual(app, {}, 'readiness must never bind or repair a marker');
});

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

test('a verified native startup permits one bridge timeout observation, then requires genuine runtime readiness', async () => {
  let clock = 0;
  let calls = 0;
  const events = [];
  const app = {};
  const result = await prewarm.waitForAppServiceReady({ async evaluate(probe) {
    calls += 1;
    if (calls === 1) { clock += 10; throw new Error('timeout waiting for automator response'); }
    return vm.runInNewContext(`(${probe.toString()})()`, runtime(app, calls === 2 ? [] : [{ route: 'pages/home/index' }]));
  } }, 100, { now: () => clock, pollMs: 10, sleep: async ms => { clock += ms; },
    nativeStartupVerified: true, onStartupBridgeTimeout: value => events.push(value) });
  assert.equal(calls, 3);
  assert.equal(result.ready, true);
  assert.equal(result.startupBridgeTimeouts, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].rpc, 'App.callFunction(inspectAppServiceReady)');
  assert.deepEqual(app, {}, 'a bridge timeout cannot authorize a marker or change application data');
});

test('startup bridge timeout recovery is single-use, deadline bound, and excludes other failures', async () => {
  let calls = 0;
  const failing = { evaluate: async () => { calls += 1; throw new Error('timeout waiting for automator response'); } };
  await assert.rejects(prewarm.waitForAppServiceReady(failing, 100, { nativeStartupVerified: true }), /timeout waiting/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(prewarm.waitForAppServiceReady(failing, 100), /timeout waiting/);
  assert.equal(calls, 1, 'without the native startup proof an exception remains fatal');
  let clock = 0;
  calls = 0;
  await assert.rejects(prewarm.waitForAppServiceReady({ evaluate: async () => {
    calls += 1; clock = 100; throw new Error('timeout waiting for automator response');
  } }, 100, { now: () => clock, nativeStartupVerified: true }), /timeout waiting/);
  assert.equal(calls, 1, 'the existing startup deadline must not be extended');
  for (const message of ['Connection closed', 'application access failed', 'AppService readiness evaluate timed out after 100ms']) {
    calls = 0;
    await assert.rejects(prewarm.waitForAppServiceReady({ evaluate: async () => {
      calls += 1; throw new Error(message);
    } }, 100, { nativeStartupVerified: true }), e => e.message === message);
    assert.equal(calls, 1, message);
  }
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
  const wait = source.indexOf('await waitForAppServiceReady(launched, appServiceAllowance,');
  const nonce = source.indexOf('sessionId: crypto.randomBytes(32)');
  const binding = source.indexOf('await screenshotTool.bindRuntimeSession(launched, marker)');
  assert.ok(wait > 0 && wait < nonce && nonce < binding);
  assert.equal((source.match(/automator\.launch\(/g) || []).length, 1);
  assert.match(source, /AppService runtime marker binding failed/);
  assert.match(source, /checks\.sourceStableDuringPrewarm/);
});

test('Windows native container completion precedes application readiness and the unique marker', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dev/weapp-ui-prewarm.js'), 'utf8');
  const native = source.indexOf('await waitForNativeStartup(');
  const runtime = source.indexOf('await waitForAppServiceReady(launched,');
  const marker = source.indexOf('sessionId: crypto.randomBytes(32)');
  assert.ok(native > 0 && native < runtime && runtime < marker);
  assert.equal((source.match(/automator\.launch\(/g) || []).length, 1);
});
