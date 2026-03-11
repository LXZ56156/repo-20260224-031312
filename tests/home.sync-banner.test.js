const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const adGuard = require('../miniprogram/core/adGuard');

const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

function loadHomePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[homePagePath];
  require(homePagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('home page reuses unified sync banner for offline state changes', () => {
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const originalIsOnboardingDone = storage.isOnboardingDone;
  const originalIsProfileNudgeDismissed = storage.isProfileNudgeDismissed;
  const originalGetUserProfile = storage.getUserProfile;
  const originalGetHomeSortMode = storage.getHomeSortMode;
  const originalGetHomeFilterStatus = storage.getHomeFilterStatus;
  const originalGetEntryPruneVersion = storage.getEntryPruneVersion;
  const originalSetEntryPruneVersion = storage.setEntryPruneVersion;
  const originalShouldShowDailySplash = adGuard.shouldShowDailySplash;
  const originalMarkSplashShown = adGuard.markSplashShown;
  let onNetworkChange = null;

  storage.isOnboardingDone = () => true;
  storage.isProfileNudgeDismissed = () => true;
  storage.getUserProfile = () => ({});
  storage.getHomeSortMode = () => 'updated';
  storage.getHomeFilterStatus = () => 'all';
  storage.getEntryPruneVersion = () => 1;
  storage.setEntryPruneVersion = () => {};
  adGuard.shouldShowDailySplash = () => false;
  adGuard.markSplashShown = () => {};

  global.wx = {
    getSystemInfoSync() {
      return { windowWidth: 375 };
    },
    getStorageSync() {
      return undefined;
    },
    setStorageSync() {},
    removeStorageSync() {}
  };
  global.getApp = () => ({
    globalData: {
      networkOffline: true,
      runtimeEnv: { showBadge: false, shortLabel: '' }
    },
    subscribeNetworkChange(handler) {
      onNetworkChange = handler;
      return () => {
        onNetworkChange = null;
      };
    }
  });

  try {
    const definition = loadHomePageDefinition();
    const ctx = createPageContext(definition);

    ctx.onLoad();

    assert.equal(ctx.data.syncStatusVisible, true);
    assert.match(ctx.data.syncStatusText, /离线/);
    assert.equal(ctx.data.syncStatusTone, 'warning');

    onNetworkChange(false);
    assert.equal(ctx.data.networkOffline, false);
    assert.equal(ctx.data.syncStatusVisible, false);
  } finally {
    global.getApp = originalGetApp;
    global.wx = originalWx;
    storage.isOnboardingDone = originalIsOnboardingDone;
    storage.isProfileNudgeDismissed = originalIsProfileNudgeDismissed;
    storage.getUserProfile = originalGetUserProfile;
    storage.getHomeSortMode = originalGetHomeSortMode;
    storage.getHomeFilterStatus = originalGetHomeFilterStatus;
    storage.getEntryPruneVersion = originalGetEntryPruneVersion;
    storage.setEntryPruneVersion = originalSetEntryPruneVersion;
    adGuard.shouldShowDailySplash = originalShouldShowDailySplash;
    adGuard.markSplashShown = originalMarkSplashShown;
    delete require.cache[homePagePath];
  }
});
