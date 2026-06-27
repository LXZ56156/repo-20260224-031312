const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadPageDefinition, createPageContext } = require('./timeout-reentry.helpers');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');

const createPagePath = require.resolve('../miniprogram/pages/create/index.js');
const launchPagePath = require.resolve('../miniprogram/pages/launch/index.js');

test('legacy create page is a minimal compatibility route without the old form', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/create/index.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/create/index.js'), 'utf8');
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'miniprogram/app.json'), 'utf8'));

  assert.ok(appConfig.pages.includes('pages/create/index'));
  assert.match(wxml, /正在前往发起页/);
  assert.match(wxml, /bindtap="goLaunch"[^>]*>返回发起<\/button>/);
  assert.doesNotMatch(wxml, /创建后流程|一步创建|先创建草稿|创建并进入|赛事名称/);
  assert.doesNotMatch(js, /createTournament|ensureProfileForAction|clientRequestId|handleCreate/);
});

test('legacy create route stores a normalized launch intent and never creates automatically', async () => {
  const originalWx = global.wx;
  const originalSetLaunchIntent = nav.setLaunchIntent;
  const originalCloudCall = cloud.call;
  const switchCalls = [];
  const intents = [];
  let cloudCalls = 0;

  global.wx = {
    switchTab(options = {}) {
      switchCalls.push(options);
      if (typeof options.success === 'function') options.success();
    }
  };
  nav.setLaunchIntent = (intent) => intents.push(intent);
  cloud.call = async () => {
    cloudCalls += 1;
    return { ok: true };
  };

  try {
    const definition = loadPageDefinition(createPagePath);
    const ctx = createPageContext(definition);
    await ctx.onLoad({ mode: 'multi_rotate', presetKey: 'rotation_8' });

    assert.deepEqual(intents, [{ mode: 'multi_rotate', presetKey: 'rotation_8' }]);
    assert.equal(switchCalls.length, 1);
    assert.equal(switchCalls[0].url, '/pages/launch/index');
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    nav.setLaunchIntent = originalSetLaunchIntent;
    cloud.call = originalCloudCall;
    delete require.cache[createPagePath];
  }
});

test('legacy create route without params keeps a visible fallback when switchTab fails', async () => {
  const originalWx = global.wx;
  const originalSetLaunchIntent = nav.setLaunchIntent;
  let intentCalls = 0;
  let switchCalls = 0;

  global.wx = {
    switchTab(options = {}) {
      switchCalls += 1;
      if (typeof options.fail === 'function') options.fail(new Error('switch failed'));
    }
  };
  nav.setLaunchIntent = () => {
    intentCalls += 1;
  };

  try {
    const definition = loadPageDefinition(createPagePath);
    const ctx = createPageContext(definition);
    await ctx.onLoad({});

    assert.equal(intentCalls, 0);
    assert.equal(switchCalls, 1);
    assert.equal(ctx.data.redirecting, false);
  } finally {
    global.wx = originalWx;
    nav.setLaunchIntent = originalSetLaunchIntent;
    delete require.cache[createPagePath];
  }
});

test('launch consumes the legacy intent to highlight one mode without creating it', () => {
  const originalWx = global.wx;
  const originalConsumeLaunchIntent = nav.consumeLaunchIntent;
  const originalCloudCall = cloud.call;
  const scrollCalls = [];
  let cloudCalls = 0;

  global.wx = {
    pageScrollTo(options = {}) {
      scrollCalls.push(options);
    }
  };
  nav.consumeLaunchIntent = () => ({ mode: 'multi_rotate', presetKey: 'rotation_7' });
  cloud.call = async () => {
    cloudCalls += 1;
    return { ok: true };
  };

  try {
    const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/launch/index.wxml'), 'utf8');
    assert.match(wxml, /id="launch-mode-\{\{item.key\}\}"/);
    assert.match(wxml, /legacySelectionKey === item.key \? 'is-legacy-selected'/);
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);
    ctx.onShow();

    assert.equal(ctx.data.legacySelectionKey, 'rotation_7');
    assert.deepEqual(scrollCalls, [{ selector: '#launch-mode-rotation_7', duration: 0 }]);
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    nav.consumeLaunchIntent = originalConsumeLaunchIntent;
    cloud.call = originalCloudCall;
    delete require.cache[launchPagePath];
  }
});

test('launch intent is one-shot app state', () => {
  const originalGetApp = global.getApp;
  const app = { globalData: {} };
  global.getApp = () => app;

  try {
    nav.setLaunchIntent({ mode: 'fixed_pair_rr', presetKey: 'custom' });
    assert.deepEqual(nav.consumeLaunchIntent(), { mode: 'fixed_pair_rr', presetKey: 'custom' });
    assert.equal(nav.consumeLaunchIntent(), null);
  } finally {
    global.getApp = originalGetApp;
  }
});
