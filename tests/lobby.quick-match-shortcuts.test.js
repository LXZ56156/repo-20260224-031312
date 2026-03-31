const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function createContext(data = {}) {
  const ctx = {
    syncCalls: 0,
    data: { ...(data || {}) }
  };
  Object.keys(lobbyDraftActions).forEach((key) => {
    if (typeof lobbyDraftActions[key] === 'function') {
      ctx[key] = lobbyDraftActions[key];
    }
  });
  ctx.setData = function setData(update, callback) {
    this.data = { ...this.data, ...(update || {}) };
    if (typeof callback === 'function') callback.call(this);
  };
  ctx.syncQuickEndConditionUi = function syncQuickEndConditionUi() {
    this.syncCalls += 1;
  };
  return ctx;
}

function loadLobbyPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[lobbyPagePath];
  require(lobbyPagePath);
  global.Page = originalPage;
  return definition;
}

test('lobby quick settings replace recommendation hints with match shortcut taps', () => {
  const wxml = readPage('miniprogram/pages/lobby/lobby-admin-panel.wxml');

  assert.match(wxml, /quickMatchShortcutOptions/);
  assert.match(wxml, /bindtap="onTapQuickMatchShortcut"/);
  assert.doesNotMatch(wxml, /建议总场次/);
  assert.doesNotMatch(wxml, /建议先配置/);
  assert.doesNotMatch(wxml, /满 ?4 ?人后会自动重算/);
});

test('lobby page definition exposes quick match shortcut tap handler', () => {
  const definition = loadLobbyPageDefinition();
  assert.equal(typeof definition.onTapQuickMatchShortcut, 'function');
});

test('lobby quick match shortcut syncs total matches for simple picker state', () => {
  const ctx = createContext({
    canConfigureSettings: true,
    quickConfigM: 4,
    quickConfigMIndex: 3,
    quickConfigMOptions: [1, 2, 3, 4, 5, 6, 7, 8],
    quickConfigMDigitRange: [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    quickConfigMDigitValue: [0, 4],
    quickEndConditionType: 'total_matches',
    quickEndConditionTarget: 4,
    quickEndConditionTargetIndex: 3,
    maxMatches: 8
  });

  ctx.onTapQuickMatchShortcut({
    currentTarget: {
      dataset: {
        value: 6,
        disabled: 0
      }
    }
  });

  assert.equal(ctx.data.quickConfigM, 6);
  assert.equal(ctx.data.quickConfigMIndex, 5);
  assert.deepEqual(ctx.data.quickConfigMDigitValue, [0, 6]);
  assert.equal(ctx.data.quickEndConditionTarget, 6);
  assert.equal(ctx.data.quickEndConditionTargetIndex, 5);
  assert.equal(ctx.syncCalls, 1);
});

test('lobby quick match shortcut syncs total matches for digit picker state', () => {
  const ctx = createContext({
    canConfigureSettings: true,
    quickConfigM: 8,
    quickConfigMIndex: 7,
    quickConfigMOptions: [],
    quickConfigMDigitRange: [
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    ],
    quickConfigMDigitValue: [0, 0, 8],
    quickEndConditionType: 'total_matches',
    quickEndConditionTarget: 8,
    quickEndConditionTargetIndex: 7,
    maxMatches: 40
  });

  ctx.onTapQuickMatchShortcut({
    currentTarget: {
      dataset: {
        value: 12,
        disabled: 0
      }
    }
  });

  assert.equal(ctx.data.quickConfigM, 12);
  assert.equal(ctx.data.quickConfigMIndex, 7);
  assert.deepEqual(ctx.data.quickConfigMDigitValue, [0, 1, 2]);
  assert.equal(ctx.data.quickEndConditionTarget, 12);
  assert.equal(ctx.data.quickEndConditionTargetIndex, 11);
  assert.equal(ctx.syncCalls, 1);
});

test('lobby quick match shortcut ignores disabled options', () => {
  const ctx = createContext({
    canConfigureSettings: true,
    quickConfigM: 3,
    quickConfigMIndex: 2,
    quickConfigMOptions: [1, 2, 3, 4],
    quickConfigMDigitRange: [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    quickConfigMDigitValue: [3],
    quickEndConditionType: 'total_matches',
    quickEndConditionTarget: 3,
    quickEndConditionTargetIndex: 2,
    maxMatches: 3
  });

  ctx.onTapQuickMatchShortcut({
    currentTarget: {
      dataset: {
        value: 6,
        disabled: 1
      }
    }
  });

  assert.equal(ctx.data.quickConfigM, 3);
  assert.equal(ctx.data.quickConfigMIndex, 2);
  assert.deepEqual(ctx.data.quickConfigMDigitValue, [3]);
  assert.equal(ctx.data.quickEndConditionTarget, 3);
  assert.equal(ctx.data.quickEndConditionTargetIndex, 2);
  assert.equal(ctx.syncCalls, 0);
});
