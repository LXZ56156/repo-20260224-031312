const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settingsActions = require('../miniprogram/pages/settings/settingsActions');
const settingsPagePath = require.resolve('../miniprogram/pages/settings/index.js');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function createContext(data = {}) {
  const ctx = {
    syncCalls: 0,
    data: { ...(data || {}) }
  };
  Object.keys(settingsActions).forEach((key) => {
    if (typeof settingsActions[key] === 'function') {
      ctx[key] = settingsActions[key];
    }
  });
  ctx.setData = function setData(update, callback) {
    this.data = { ...this.data, ...(update || {}) };
    if (typeof callback === 'function') callback.call(this);
  };
  ctx.syncEndConditionUi = function syncEndConditionUi() {
    this.syncCalls += 1;
  };
  return ctx;
}

function loadSettingsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[settingsPagePath];
  require(settingsPagePath);
  global.Page = originalPage;
  return definition;
}

test('settings page renders fixed pair shortcut binding', () => {
  const wxml = readPage('miniprogram/pages/settings/index.wxml');

  assert.match(wxml, /matchShortcutOptions/);
  assert.match(wxml, /bindtap="onTapMatchShortcut"/);
});

test('settings page definition exposes match shortcut tap handler', () => {
  const definition = loadSettingsPageDefinition();
  assert.equal(typeof definition.onTapMatchShortcut, 'function');
});

test('settings match shortcut syncs total matches for simple picker state', () => {
  const ctx = createContext({
    canConfigureSettings: true,
    useSimpleMPicker: true,
    editM: 3,
    mOptions: [1, 2, 3, 4, 5, 6],
    mIndex: 2,
    mDigitRange: [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    mDigitValue: [3],
    endConditionType: 'total_matches',
    endConditionTarget: 3,
    endConditionTargetIndex: 2,
    maxMatches: 6
  });

  ctx.onTapMatchShortcut({
    currentTarget: {
      dataset: {
        value: 5,
        disabled: 0
      }
    }
  });

  assert.equal(ctx.data.editM, 5);
  assert.equal(ctx.data.mIndex, 4);
  assert.deepEqual(ctx.data.mDigitValue, [5]);
  assert.equal(ctx.data.endConditionTarget, 5);
  assert.equal(ctx.data.endConditionTargetIndex, 4);
  assert.equal(ctx.syncCalls, 1);
});

test('settings match shortcut ignores disabled options', () => {
  const ctx = createContext({
    canConfigureSettings: true,
    useSimpleMPicker: true,
    editM: 3,
    mOptions: [1, 2, 3],
    mIndex: 2,
    mDigitRange: [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    mDigitValue: [3],
    endConditionType: 'total_matches',
    endConditionTarget: 3,
    endConditionTargetIndex: 2,
    maxMatches: 3
  });

  ctx.onTapMatchShortcut({
    currentTarget: {
      dataset: {
        value: 5,
        disabled: 1
      }
    }
  });

  assert.equal(ctx.data.editM, 3);
  assert.equal(ctx.syncCalls, 0);
});
