const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');

test('settings save sends enabled and disabled water objects and preserves zero default', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const payloads = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {}
  };
  cloud.call = async (name, payload) => {
    payloads.push({ name, payload });
    return { ok: true, code: 'SETTINGS_UPDATED', state: 'updated', data: {} };
  };
  nav.markRefreshFlag = () => {};
  nav.navigateBackOrRedirect = () => {};
  nav.buildTournamentUrl = (path) => path;

  const ctx = {
    data: {
      tournamentId: 't_1',
      tournament: {
        _id: 't_1',
        status: 'draft',
        mode: 'multi_rotate',
        presetKey: 'custom'
      },
      isAdmin: true,
      isDraft: true,
      canConfigureSettings: true,
      showWaterSettings: true,
      waterEnabled: true,
      waterDefaultUnitsPerLoser: 0,
      mode: 'multi_rotate',
      name: '周末比赛',
      maxMatches: 10,
      editM: 6,
      editC: 1,
      pointsPerGame: 21,
      showSquadEndCondition: false,
      endConditionType: 'total_matches',
      endConditionTarget: 6,
      endConditionTargetOptions: Array.from({ length: 20 }, (_, index) => index + 1),
      checkStartReady: false,
      settingsBusy: false
    },
    setData(patch) {
      this.data = { ...this.data, ...(patch || {}) };
    },
    async fetchTournament() {},
    clearLastFailedAction() {},
    setLastFailedAction() {},
    handleWriteError() {}
  };
  Object.assign(ctx, settingsActions);

  try {
    await ctx.saveSettings({ clientRequestId: 'req_water_settings' });

    ctx.data.waterEnabled = false;
    await ctx.saveSettings({ clientRequestId: 'req_water_settings_off' });

    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].name, 'updateSettings');
    assert.deepEqual(payloads[0].payload.water, {
      enabled: true,
      defaultUnitsPerLoser: 0
    });
    assert.equal(payloads[0].payload.clientRequestId, 'req_water_settings');
    assert.deepEqual(payloads[1].payload.water, {
      enabled: false,
      defaultUnitsPerLoser: 0
    });
    assert.equal(payloads[1].payload.clientRequestId, 'req_water_settings_off');
  } finally {
    if (ctx._autoBackTimer) clearTimeout(ctx._autoBackTimer);
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});
