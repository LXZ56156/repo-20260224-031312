const test = require('node:test');
const assert = require('node:assert/strict');

global.wx = global.wx || {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {}
};

const storage = require('../miniprogram/core/storage');
const uiPreferences = require('../miniprogram/core/uiPreferences');

test('uiPreferences normalizes invalid persisted values to safe defaults', () => {
  assert.equal(uiPreferences.normalizeMotionLevel('standard'), 'standard');
  assert.equal(uiPreferences.normalizeMotionLevel('light'), 'light');
  assert.equal(uiPreferences.normalizeMotionLevel('off'), 'off');
  assert.equal(uiPreferences.normalizeMotionLevel('wild'), 'standard');

  assert.equal(uiPreferences.normalizeListDensity('compact'), 'compact');
  assert.equal(uiPreferences.normalizeListDensity('comfortable'), 'comfortable');
  assert.equal(uiPreferences.normalizeListDensity('wide'), 'comfortable');
});

test('uiPreferences builds stable page class tokens from storage', () => {
  const originalGet = storage.get;
  storage.get = (key, fallback) => {
    if (key === uiPreferences.MOTION_LEVEL_KEY) return 'off';
    if (key === uiPreferences.LIST_DENSITY_KEY) return 'compact';
    return fallback;
  };

  try {
    assert.deepEqual(uiPreferences.readUiPreferencePatch(), {
      motionLevel: 'off',
      listDensity: 'compact',
      uiMotionClass: 'motion-off',
      uiDensityClass: 'density-compact',
      uiPreferenceClass: 'motion-off density-compact'
    });
  } finally {
    storage.get = originalGet;
  }
});

test('uiPreferences save helpers preserve existing storage keys', () => {
  const originalSet = storage.set;
  const writes = [];
  storage.set = (key, value) => {
    writes.push([key, value]);
    return true;
  };

  try {
    assert.equal(uiPreferences.saveMotionLevel('invalid'), 'standard');
    assert.equal(uiPreferences.saveListDensity('compact'), 'compact');
    assert.deepEqual(writes, [
      [uiPreferences.MOTION_LEVEL_KEY, 'standard'],
      [uiPreferences.LIST_DENSITY_KEY, 'compact']
    ]);
  } finally {
    storage.set = originalSet;
  }
});
