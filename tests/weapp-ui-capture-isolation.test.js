const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const screenshot = require('../scripts/dev/weapp-ui-screenshot');

function runtime(initial = {}, membrane = false) {
  const storage = new Map(Object.entries(initial));
  let cloudCalls = 0;
  let reportCalls = 0;
  const app = { globalData: { openid: 'account' } };
  const page = { route: 'pages/launch/index', onShow() {} };
  const wx = {
    cloud: { callFunction: async () => { cloudCalls += 1; return { result: { ok: true } }; } },
    reportEvent() { reportCalls += 1; },
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
  };
  const wrappedWx = membrane ? new Proxy(wx, { get(target, key) {
    const value = target[key];
    if (key === 'cloud') return new Proxy(value, { get(cloud, method) {
      const fn = cloud[method];
      if (typeof fn !== 'function') return fn;
      const wrapped = (...args) => fn.apply(cloud, args);
      Object.defineProperty(wrapped, 'name', { value: fn.name });
      return wrapped;
    } });
    if (typeof value !== 'function') return value;
    const wrapped = (...args) => value.apply(target, args);
    Object.defineProperty(wrapped, 'name', { value: value.name });
    return wrapped;
  } }) : wx;
  const context = vm.createContext({ wx: wrappedWx, getApp: () => app, getCurrentPages: () => [page] });
  return {
    app, page, wx: wrappedWx, storage, cloudCalls: () => cloudCalls, reportCalls: () => reportCalls,
    miniProgram: {
      callWxMethod: async (name, ...args) => wx[name](...args),
      evaluate: async (fn, ...args) => {
        context.args = args;
        return vm.runInContext(`(${fn.toString()})(...args)`, context);
      },
    },
    rememberLedger(ledger) {
      const source = fs.readFileSync(path.join(__dirname, '../miniprogram/core/waterRecent.js'), 'utf8');
      context.module = { exports: {} };
      context.require = () => ({ get: wx.getStorageSync, set: wx.setStorageSync });
      vm.runInContext(`(function(require, module) { ${source}\n})(require, module)`, context);
      context.module.exports.rememberLedger(ledger);
    },
  };
}

test('capture restores the real recent ledger overwritten by the current water fixture path', async () => {
  const existing = { id: 'real-ledger', title: '真实账本' };
  const env = runtime({ 'water_recent_ledger:account': existing, unrelated: { retain: true } });
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  env.rememberLedger({ id: 'water_v2_demo', title: '截图账本' });
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'water_v2_demo');
  env.wx.setStorageSync('water_recent_ledger:new-account', { id: 'demo' });
  env.wx.setStorageSync('score_draft_demo_0_0', { homeScore: 9 });
  env.wx.setStorageSync('unrelated-new', 'keep');
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(env.storage.get('water_recent_ledger:account'))), existing);
  assert.equal(env.storage.has('water_recent_ledger:new-account'), false);
  assert.equal(env.storage.has('score_draft_demo_0_0'), false);
  assert.deepEqual(env.storage.get('unrelated'), { retain: true });
  assert.equal(env.storage.get('unrelated-new'), 'keep');
  assert.doesNotMatch(JSON.stringify({ state, restored }), /account|real-ledger|真实账本|homeScore/);
});

test('capture blocks unconfigured cloud actions through route and unload, and restores only after storage verification', async () => {
  const env = runtime({ score_draft_real_0_0: { homeScore: 4 } });
  const original = env.wx.cloud.callFunction;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram, {
    cloudResults: { 'waterSession:listLedgers': { result: { ok: true, data: { ledgers: [] } } } },
  });
  const configured = await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'listLedgers' } });
  assert.equal(configured.result.ok, true);
  for (const action of ['createLedger', 'recordGame', 'correctEntry', 'reverseEntry']) {
    const result = await env.wx.cloud.callFunction({ name: 'waterSession', data: { action } });
    assert.equal(result.result.ok, false);
  }
  env.wx.removeStorageSync('score_draft_real_0_0');
  env.wx.setStorageSync('score_draft_unload_0_0', { awayScore: 10 });
  env.page.onShow = () => assert.notEqual(env.wx.cloud.callFunction, original);
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, true);
  assert.equal(env.cloudCalls(), 0);
  assert.equal(env.wx.cloud.callFunction, original);
  assert.deepEqual(JSON.parse(JSON.stringify(env.storage.get('score_draft_real_0_0'))), { homeScore: 4 });
  assert.equal(env.storage.has('score_draft_unload_0_0'), false);
});

test('failed cleanup restores caches but retains SDK isolation and refuses another capture', async () => {
  const env = runtime({ 'water_recent_ledger:account': { id: 'real' } });
  const original = env.wx.cloud.callFunction;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  env.rememberLedger({ id: 'demo' });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: false });
  assert.equal(restored.ok, false);
  assert.equal(restored.sdkRestored, false);
  assert.equal(restored.isolationRetained, true);
  assert.notEqual(env.wx.cloud.callFunction, original);
  env.wx.setStorageSync('water_recent_ledger:account', { id: 'late-demo' });
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'real');
  await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'createLedger' } });
  assert.equal(env.cloudCalls(), 0);
  await assert.rejects(screenshot.beginCaptureIsolation(env.miniProgram), /isolation/);
});

test('no-op cache restore fails closed and retains isolation without exposing saved values', async () => {
  const env = runtime({ score_draft_real_0_0: { sensitive: 'private-value' } });
  const originalSet = env.wx.setStorageSync;
  let ignoreWrites = false;
  env.wx.setStorageSync = (...args) => {
    if (!ignoreWrites || args[0].includes('__ui_capture_probe_')) return originalSet(...args);
  };
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  env.wx.setStorageSync('score_draft_real_0_0', { homeScore: 99 });
  ignoreWrites = true;
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, false);
  assert.equal(restored.sdkRestored, false);
  assert.equal(restored.isolationRetained, true);
  assert.doesNotMatch(JSON.stringify(restored), /private-value|sensitive|score_draft_real/);
});

test('controlled cloud response queues never fall through when exhausted', async () => {
  const env = runtime();
  const state = await screenshot.beginCaptureIsolation(env.miniProgram, {
    cloudResults: { 'waterSession:recordGame': [
      { result: { ok: false, message: '模拟失败' } },
      { result: { ok: true, data: { entry: { id: 'mock-entry' } } } },
    ] },
  });
  const request = { name: 'waterSession', data: { action: 'recordGame' } };
  assert.equal((await env.wx.cloud.callFunction(request)).result.ok, false);
  assert.equal((await env.wx.cloud.callFunction(request)).result.ok, true);
  assert.equal((await env.wx.cloud.callFunction(request)).result.code, 'UI_CAPTURE_ISOLATED');
  assert.equal(env.cloudCalls(), 0);
  assert.equal((await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true })).ok, true);
});

for (const cleanupFails of [false, true]) {
  test(`partial route failure ${cleanupFails ? 'retains isolation when unload cleanup fails' : 'cleans up before restoring the SDK'}`, async (t) => {
    const env = runtime({ score_draft_real_0_0: { homeScore: 4 } });
    const originalCloud = env.wx.cloud.callFunction;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-isolation-route-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    let routes = 0;
    env.miniProgram.reLaunch = async () => {
      routes += 1;
      assert.notEqual(env.wx.cloud.callFunction, originalCloud);
      await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: routes === 1 ? 'createLedger' : 'recordGame' } });
      env.wx.setStorageSync('score_draft_fixture_0_0', { homeScore: routes });
      if (routes === 1) throw new Error('injected partial route failure');
      if (cleanupFails) throw new Error('injected unload cleanup failure');
      return { path: 'pages/launch/index' };
    };
    env.miniProgram.send = async () => ({ path: 'pages/launch/index' });
    const connection = { runtimeEvents: { exceptions: [], console: [] } };
    const result = await screenshot.runCase('waterV2Member24', env.miniProgram, connection, {
      config: { expectedWindowWidth: 430, runRoot: root, outDir: root, routeTimeoutMs: 50 }, runId: 'partial',
    });
    assert.equal(routes, 2);
    assert.equal(result.ok, false);
    assert.equal(result.promotion.eligible, false);
    assert.equal(env.cloudCalls(), 0);
    assert.equal(env.storage.has('score_draft_fixture_0_0'), false);
    assert.equal(result.sdkIsolationCleanup.sdkRestored, !cleanupFails);
    assert.equal(env.wx.cloud.callFunction === originalCloud, !cleanupFails);
    assert.equal(result.sdkIsolationCleanup.isolationRetained, cleanupFails);
  });
}

test('verified recovery can restore a retained isolation without losing the original snapshot', async () => {
  const env = runtime({ 'water_recent_ledger:account': { id: 'original' } });
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  env.rememberLedger({ id: 'demo' });
  assert.equal((await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: false })).ok, false);
  assert.equal((await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true })).ok, true);
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'original');
});

test('fixture injection failure still isolates onHide and onUnload before restoring caches', async (t) => {
  const env = runtime({ 'water_recent_ledger:account': { id: 'original' }, score_draft_real_0_0: { homeScore: 2 } });
  const originalCloud = env.wx.cloud.callFunction;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-isolation-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let routes = 0;
  const page = {
    path: 'pages/water/index',
    async callMethod(name) {
      assert.equal(name, 'applyRoomData');
      env.rememberLedger({ id: 'water_v2_demo' });
      throw new Error('injected projection failure');
    },
  };
  env.miniProgram.reLaunch = async () => {
    routes += 1;
    if (routes === 1) {
      env.page.route = 'pages/water/index';
      return page;
    }
    assert.notEqual(env.wx.cloud.callFunction, originalCloud);
    await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordDirect' } });
    env.wx.removeStorageSync('score_draft_real_0_0');
    env.wx.setStorageSync('score_draft_unload_0_0', { homeScore: 22 });
    env.page.route = 'pages/launch/index';
    return { path: 'pages/launch/index' };
  };
  env.miniProgram.send = async () => ({ path: 'pages/launch/index' });
  const result = await screenshot.runCase('waterV2Member24', env.miniProgram, {
    runtimeEvents: { exceptions: [], console: [] },
  }, { config: { expectedWindowWidth: 430, runRoot: root, outDir: root, routeTimeoutMs: 50 }, runId: 'injection' });
  assert.equal(result.ok, false);
  assert.equal(result.sdkIsolationCleanup.ok, true);
  assert.equal(env.cloudCalls(), 0);
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'original');
  assert.equal(env.storage.get('score_draft_real_0_0').homeScore, 2);
  assert.equal(env.storage.has('score_draft_unload_0_0'), false);
  assert.equal(env.wx.cloud.callFunction, originalCloud);
});

test('a failed SDK restoration reinstalls blocking guards and closes the cleanup gate', async () => {
  const env = runtime();
  const originalCloud = env.wx.cloud.callFunction;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  let activeCloud = env.wx.cloud.callFunction;
  Object.defineProperty(env.wx.cloud, 'callFunction', {
    get: () => activeCloud,
    set: (value) => { if (value !== originalCloud) activeCloud = value; },
  });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, false);
  assert.equal(restored.sdkRestored, false);
  assert.equal(restored.isolationRetained, true);
  assert.notEqual(env.wx.cloud.callFunction, originalCloud);
  await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
  assert.equal(env.cloudCalls(), 0);
});

test('profile identity is restored after page teardown, while cloud isolation remains installed', async (t) => {
  const env = runtime({ openid: 'cached-account', unrelated: 7 });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-isolation-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let routes = 0;
  env.miniProgram.reLaunch = async () => {
    routes += 1;
    assert.equal(env.app.globalData.openid, 'ui-screenshot-user');
    assert.equal(env.storage.get('openid'), 'ui-screenshot-user');
    await env.wx.cloud.callFunction({ name: 'upsertProfile', data: {} });
    if (routes === 1) throw new Error('injected profile route failure');
    return { path: 'pages/launch/index' };
  };
  env.miniProgram.send = async () => ({ path: 'pages/launch/index' });
  const result = await screenshot.runCase('feedback', env.miniProgram, {
    runtimeEvents: { exceptions: [], console: [] },
  }, { config: { expectedWindowWidth: 430, runRoot: root, outDir: root, routeTimeoutMs: 50 }, runId: 'profile' });
  assert.equal(routes, 2);
  assert.equal(env.cloudCalls(), 0);
  assert.equal(result.ok, false);
  assert.equal(result.storageFixtureCleanup.ok, true);
  assert.equal(result.sdkIsolationCleanup.ok, true);
  assert.equal(env.app.globalData.openid, 'account');
  assert.equal(env.storage.get('openid'), 'cached-account');
  assert.equal(env.storage.has('userProfile'), false);
  assert.equal(env.storage.get('unrelated'), 7);
});

test('a cloud restore setter that throws after changing the method is returned to the blocking guard', async () => {
  const env = runtime();
  const originalCloud = env.wx.cloud.callFunction;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  let activeCloud = env.wx.cloud.callFunction;
  Object.defineProperty(env.wx.cloud, 'callFunction', {
    get: () => activeCloud,
    set: (value) => {
      activeCloud = value;
      if (value === originalCloud) throw new Error('injected late setter failure');
    },
  });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, false);
  assert.equal(restored.isolationRetained, true);
  assert.notEqual(env.wx.cloud.callFunction, originalCloud);
  await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
  assert.equal(env.cloudCalls(), 0);
});

test('DevTools membrane function wrappers verify real guarded behavior without identity equality or real cloud calls', async () => {
  const env = runtime({ 'water_recent_ledger:account': { id: 'original' } }, true);
  assert.notEqual(env.wx.cloud.callFunction, env.wx.cloud.callFunction);
  assert.notEqual(env.wx.setStorageSync, env.wx.setStorageSync);
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  assert.equal(state.applied, true);
  env.wx.setStorageSync('water_recent_ledger:account', { id: 'demo' });
  const blocked = await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
  assert.equal(blocked.result.code, 'UI_CAPTURE_ISOLATED');
  env.wx.reportEvent('activity_view', { privateValue: 'must-not-be-saved' });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.sdkRestored, true);
  assert.equal(restored.sdkRestoreVerification.cloudCallPerformed, false);
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'original');
  assert.equal(env.cloudCalls(), 0);
  assert.equal(env.reportCalls(), 0);
  assert.equal(restored.suppressedEventsCount, 1);
  assert.equal(restored.sdkRestoreVerification.eventReportPerformed, false);
  assert.doesNotMatch(JSON.stringify(restored), /privateValue|must-not-be-saved|activity_view/);
  assert.equal([...env.storage.keys()].some(key => key.includes('__ui_capture_probe_')), false);
});

test('capture suppresses view/attempt/result telemetry through failed cleanup without retaining event payloads', async () => {
  const env = runtime();
  const originalReport = env.wx.reportEvent;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  for (const name of ['activity_view', 'activity_attempt', 'activity_result']) {
    env.wx.reportEvent(name, { privateValue: 'private-analytics-value' });
  }
  const retained = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: false });
  assert.equal(retained.ok, false);
  assert.equal(retained.isolationRetained, true);
  env.wx.reportEvent('activity_result', { privateValue: 'late-private-value' });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.suppressedEventsCount, 4);
  assert.equal(env.reportCalls(), 0);
  assert.equal(env.wx.reportEvent, originalReport);
  assert.doesNotMatch(JSON.stringify({ retained, restored }), /privateValue|private-analytics-value|late-private-value|activity_result/);
});

test('capture leaves a missing reportEvent SDK absent and emits no event probes', async () => {
  const env = runtime();
  delete env.wx.reportEvent;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  assert.equal(typeof env.wx.reportEvent, 'undefined');
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, true);
  assert.equal(restored.suppressedEventsCount, 0);
  assert.equal(typeof env.wx.reportEvent, 'undefined');
  assert.equal(env.reportCalls(), 0);
});

test('a no-op telemetry SDK restore retains every guard without invoking the original reportEvent', async () => {
  const env = runtime();
  const originalReport = env.wx.reportEvent;
  const state = await screenshot.beginCaptureIsolation(env.miniProgram);
  let activeReport = env.wx.reportEvent;
  Object.defineProperty(env.wx, 'reportEvent', {
    get: () => activeReport,
    set: (value) => { if (value !== originalReport) activeReport = value; },
  });
  const restored = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
  assert.equal(restored.ok, false);
  assert.equal(restored.sdkRestored, false);
  assert.equal(restored.isolationRetained, true);
  env.wx.reportEvent('activity_result', { privateValue: 'never-forward' });
  await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
  assert.equal(env.reportCalls(), 0);
  assert.equal(env.cloudCalls(), 0);
});

test('failed installation retains its recoverable owner token without routing or probing the original cloud SDK', async (t) => {
  const env = runtime({ 'water_recent_ledger:account': { id: 'original' } });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-isolation-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const originalCloud = env.wx.cloud.callFunction;
  Object.defineProperty(env.wx.cloud, 'callFunction', { get: () => originalCloud, set() {} });
  let captured;
  await assert.rejects(screenshot.beginCaptureIsolation(env.miniProgram), (error) => {
    captured = error.captureIsolation;
    assert.equal(captured.verified, false);
    assert.equal(captured.token, env.app.__uiCaptureIsolation.token);
    assert.doesNotMatch(JSON.stringify(captured), /account|original/);
    return true;
  });
  let routes = 0;
  env.miniProgram.reLaunch = async () => { routes += 1; throw new Error('routing must not run'); };
  const result = await screenshot.runCase('waterV2Member24', env.miniProgram, {
    runtimeEvents: { exceptions: [], console: [] },
  }, { config: { expectedWindowWidth: 430, runRoot: root, outDir: root }, runId: 'install' });
  assert.equal(routes, 0);
  assert.equal(env.cloudCalls(), 0);
  assert.equal(result.ok, false);
  assert.equal(result.sdkIsolationCleanup.ok, false);
  assert.equal(env.storage.get('water_recent_ledger:account').id, 'original');
  assert.equal([...env.storage.keys()].some(key => key.includes('__ui_capture_probe_')), false);
});

for (const failure of ['neutral stack', 'guard probe']) {
  test(`capture cleanup blocks late protected writes after ${failure} throws`, async () => {
    const env = runtime({ score_draft_real_0_0: { homeScore: 4 } });
    const state = await screenshot.beginCaptureIsolation(env.miniProgram);
    env.wx.setStorageSync('score_draft_real_0_0', { homeScore: 99 });
    await env.miniProgram.evaluate(function injectCleanupFailure(kind) {
      if (kind === 'neutral stack') globalThis.getCurrentPages = () => { throw new Error('injected stack failure'); };
      else getApp().__uiCaptureIsolation.probeGuards = async () => { throw new Error('injected probe rejection'); };
    }, failure);
    const result = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
    assert.equal(result.ok, false);
    assert.equal(result.snapshotRetained, true);
    assert.equal(result.guardVerified, failure === 'neutral stack');
    assert.equal(result.isolationRetained, result.guardVerified);
    assert.equal(env.app.__uiCaptureIsolation.token, state.token);
    assert.equal(env.app.__uiCaptureIsolation.retained, true);
    env.wx.setStorageSync('score_draft_real_0_0', { homeScore: 22 });
    env.wx.removeStorageSync('score_draft_real_0_0');
    assert.equal(env.storage.get('score_draft_real_0_0').homeScore, 4);
    await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
    env.wx.reportEvent('activity_result', { privateValue: 'never-forward' });
    assert.equal(env.cloudCalls(), 0);
    assert.equal(env.reportCalls(), 0);
    assert.doesNotMatch(JSON.stringify(result), /homeScore|score_draft_real|never-forward/);
  });
}

for (const reinstallFails of [false, true]) {
  test(`capture cleanup handles restored SDK name getters and ${reinstallFails ? 'reports an unverified cloud guard' : 'reinstalls every guard'}`, async () => {
    const env = runtime({ score_draft_real_0_0: { homeScore: 4 } });
    const originalCloud = env.wx.cloud.callFunction;
    const state = await screenshot.beginCaptureIsolation(env.miniProgram);
    env.wx.setStorageSync('score_draft_real_0_0', { homeScore: 99 });
    let activeCloud = env.wx.cloud.callFunction;
    let restored = false;
    Object.defineProperty(env.wx.cloud, 'callFunction', {
      get: () => activeCloud === originalCloud ? new Proxy(activeCloud, {
        get(target, key) {
          if (key === 'name') throw new Error('injected restored SDK name getter failure');
          return Reflect.get(target, key);
        },
      }) : activeCloud,
      set: (value) => {
        if (value === originalCloud) restored = true;
        if (!(reinstallFails && restored && value !== originalCloud)) activeCloud = value;
      },
    });
    const result = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
    assert.equal(result.ok, false);
    assert.equal(result.sdkRestored, false);
    assert.equal(result.snapshotRetained, true);
    assert.equal(result.guardVerified, !reinstallFails);
    assert.equal(result.isolationRetained, !reinstallFails);
    assert.equal(env.app.__uiCaptureIsolation.retained, true);
    env.wx.setStorageSync('score_draft_real_0_0', { homeScore: 22 });
    env.wx.removeStorageSync('score_draft_real_0_0');
    assert.equal(env.storage.get('score_draft_real_0_0').homeScore, 4);
    env.wx.reportEvent('activity_result', { privateValue: 'never-forward' });
    if (!reinstallFails) await env.wx.cloud.callFunction({ name: 'waterSession', data: { action: 'recordGame' } });
    assert.equal(env.cloudCalls(), 0);
    assert.equal(env.reportCalls(), 0);
  });
}

for (const replyLostAfterCleanup of [false, true]) {
  test(`capture cleanup transport rejection is unknown ${replyLostAfterCleanup ? 'after cleanup executed' : 'before execution'}`, async () => {
    const env = runtime({ score_draft_real_0_0: { homeScore: 4 } });
    const state = await screenshot.beginCaptureIsolation(env.miniProgram);
    const evaluate = env.miniProgram.evaluate;
    env.miniProgram.evaluate = async (fn, ...args) => {
      if (fn.name !== 'finishScreenshotSdkIsolation') return evaluate(fn, ...args);
      if (replyLostAfterCleanup) await evaluate(fn, ...args);
      throw new Error('injected lost transport response');
    };
    const result = await screenshot.finishCaptureIsolation(env.miniProgram, state, { cleanupOk: true });
    assert.equal(result.ok, false);
    assert.equal(result.sdkRestored, false);
    assert.equal(result.snapshotRetained, null);
    assert.equal(result.guardVerified, null);
    assert.equal(result.isolationRetained, null);
    assert.match(result.error, /transport outcome is unknown/);
    assert.equal(env.cloudCalls(), 0);
    assert.equal(env.reportCalls(), 0);
  });
}
