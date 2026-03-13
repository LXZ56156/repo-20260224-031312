const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const adGuard = require('../miniprogram/core/adGuard');

test('adGuard blocks page exposure during cooldown or after session limit', () => {
  const originalGetApp = global.getApp;
  const originalNow = Date.now;
  const originalGetLastExposure = storage.getAdLastExposure;

  Date.now = () => Date.parse('2026-03-13T10:00:00.000Z');
  storage.getAdLastExposure = (page) => (page === 'home' ? Date.parse('2026-03-13T09:50:00.000Z') : 0);
  global.getApp = () => ({
    globalData: {
      adSessionExposureCount: 2
    }
  });

  try {
    assert.equal(adGuard.shouldExposePageSlot('home'), false);
    assert.equal(adGuard.shouldExposePageSlot('analytics', { sessionLimit: 2 }), false);
    assert.equal(adGuard.shouldExposePageSlot('analytics', { sessionLimit: 3 }), true);
  } finally {
    global.getApp = originalGetApp;
    Date.now = originalNow;
    storage.getAdLastExposure = originalGetLastExposure;
  }
});

test('adGuard markPageExposed writes exposure timestamp and increments session count', () => {
  const originalGetApp = global.getApp;
  const originalNow = Date.now;
  const originalSetLastExposure = storage.setAdLastExposure;
  const calls = [];
  const app = { globalData: { adSessionExposureCount: 0 } };

  Date.now = () => 1700000000000;
  storage.setAdLastExposure = (page, timestamp) => {
    calls.push({ page, timestamp });
  };
  global.getApp = () => app;

  try {
    adGuard.markPageExposed('home');
    assert.deepEqual(calls, [{ page: 'home', timestamp: 1700000000000 }]);
    assert.equal(app.globalData.adSessionExposureCount, 1);
  } finally {
    global.getApp = originalGetApp;
    Date.now = originalNow;
    storage.setAdLastExposure = originalSetLastExposure;
  }
});

test('adGuard daily splash only shows once per calendar day', () => {
  const originalNow = Date.now;
  const originalGetLastSplashAt = storage.getAdLastSplashAt;
  const originalSetLastSplashAt = storage.setAdLastSplashAt;
  let lastSplashAt = 0;

  Date.now = () => Date.parse('2026-03-13T20:00:00.000Z');
  storage.getAdLastSplashAt = () => lastSplashAt;
  storage.setAdLastSplashAt = (value) => {
    lastSplashAt = value;
  };

  try {
    assert.equal(adGuard.shouldShowDailySplash(), true);
    adGuard.markSplashShown();
    assert.equal(adGuard.shouldShowDailySplash(), false);
    lastSplashAt = Date.parse('2026-03-12T23:59:59.000Z');
    assert.equal(adGuard.shouldShowDailySplash(), true);
  } finally {
    Date.now = originalNow;
    storage.getAdLastSplashAt = originalGetLastSplashAt;
    storage.setAdLastSplashAt = originalSetLastSplashAt;
  }
});
