const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');

const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');
const settingsPagePath = require.resolve('../miniprogram/pages/settings/index.js');
const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

function loadPageDefinition(pagePath) {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition, overrides = {}) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return Object.assign(ctx, overrides);
}

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];

  global.setTimeout = (fn, delay = 0) => {
    const handle = { fn, delay, active: true };
    timers.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    if (handle) handle.active = false;
  };

  return {
    timers,
    runActiveTimers() {
      for (const timer of timers) {
        if (!timer.active) continue;
        timer.active = false;
        timer.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

test('profile delayed post-save navigation is cancelled when the page hides', async () => {
  const originalWx = global.wx;
  const originalSaveCloudProfile = profileCore.saveCloudProfile;
  const timerBox = installFakeTimers();
  const navCalls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    switchTab(options = {}) {
      navCalls.push({ type: 'switchTab', url: String(options.url || '') });
    },
    redirectTo(options = {}) {
      navCalls.push({ type: 'redirectTo', url: String(options.url || '') });
    },
    navigateTo(options = {}) {
      navCalls.push({ type: 'navigateTo', url: String(options.url || '') });
    },
    navigateBack(options = {}) {
      navCalls.push({ type: 'navigateBack', delta: Number(options.delta) || 0 });
    }
  };

  try {
    profileCore.saveCloudProfile = async () => ({ ok: true });
    const definition = loadPageDefinition(profilePagePath);
    const ctx = createPageContext(definition);
    ctx.setData({
      returnUrl: '/pages/mine/index',
      nickname: '球友A',
      gender: 'male',
      avatar: 'cloud://avatar/profile',
      pendingAvatarTempPath: '',
      avatarUploadFailed: false,
      saving: false
    });

    await ctx.onSave({ clientRequestId: 'req_profile_cleanup' });
    assert.equal(typeof ctx.onHide, 'function');
    ctx.onHide();
    timerBox.runActiveTimers();

    assert.deepEqual(navCalls, []);
  } finally {
    actionGuard.clear('profile:saveUserProfile');
    profileCore.saveCloudProfile = originalSaveCloudProfile;
    global.wx = originalWx;
    timerBox.restore();
    delete require.cache[profilePagePath];
  }
});

test('settings clears delayed auto-back navigation on hide', () => {
  const timerBox = installFakeTimers();

  try {
    const definition = loadPageDefinition(settingsPagePath);
    const ctx = createPageContext(definition);
    const pendingTimer = { active: true };
    ctx._autoBackTimer = pendingTimer;

    ctx.onHide();

    assert.equal(pendingTimer.active, false);
    assert.equal(ctx._autoBackTimer, null);
  } finally {
    timerBox.restore();
    delete require.cache[settingsPagePath];
  }
});

test('lobby delayed start navigation is cancelled when the page hides', () => {
  const originalWx = global.wx;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const timerBox = installFakeTimers();
  const navCalls = [];

  global.wx = {
    showToast() {}
  };

  try {
    nav.markRefreshFlag = () => {};
    nav.goSchedule = (tournamentId) => {
      navCalls.push(tournamentId);
    };
    const definition = loadPageDefinition(lobbyPagePath);
    const ctx = createPageContext(definition);
    ctx.setData({ tournamentId: 't_start_cleanup' });
    ctx.clearLastFailedAction = () => {};

    ctx.finalizeStartSuccess();
    ctx.onHide();
    timerBox.runActiveTimers();

    assert.deepEqual(navCalls, []);
  } finally {
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    global.wx = originalWx;
    timerBox.restore();
    delete require.cache[lobbyPagePath];
  }
});
