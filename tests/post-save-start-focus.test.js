const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');
const settingsActions = require('../miniprogram/pages/settings/settingsActions');

function createWxStub() {
  const toastCalls = [];
  return {
    toastCalls,
    api: {
      showLoading() {},
      hideLoading() {},
      showToast(options = {}) {
        toastCalls.push(options);
      },
      pageScrollTo() {}
    }
  };
}

function createContext(methods, data = {}) {
  const ctx = {
    data: { ...(data || {}) },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(methods || {}).forEach((key) => {
    if (typeof methods[key] === 'function') ctx[key] = methods[key];
  });
  return ctx;
}

test('lobby saveQuickSettings focuses start action after save when refreshed state is ready', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const wxBox = createWxStub();
  let focusCalls = 0;

  global.wx = wxBox.api;

  try {
    cloud.call = async () => ({ ok: true, version: 2 });
    nav.markRefreshFlag = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_lobby_ready',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      quickConfigName: '大厅比赛',
      quickConfigM: 6,
      quickConfigC: 2,
      quickPointsPerGame: 21,
      quickShowSquadEndCondition: false,
      quickEndConditionType: 'total_matches',
      quickEndConditionTarget: 6,
      quickEndConditionTargetOptions: [1, 2, 3, 4, 5, 6],
      maxMatches: 0,
      allowOpenTeam: false,
      canConfigureSettings: true,
      checkStartReady: false
    });
    ctx.fetchTournament = async () => {
      ctx.setData({ checkStartReady: true });
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.focusStartAction = () => {
      focusCalls += 1;
    };

    await ctx.saveQuickSettings();

    assert.equal(focusCalls, 1);
    assert.equal(wxBox.toastCalls.at(-1).title, '已保存，可开赛');
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby saveQuickSettings stays in place after save when refreshed state is not ready', async () => {
  const originalWx = global.wx;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;

  const wxBox = createWxStub();
  let focusCalls = 0;

  global.wx = wxBox.api;

  try {
    cloud.call = async () => ({ ok: true, version: 2 });
    nav.markRefreshFlag = () => {};

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_lobby_not_ready',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      quickConfigName: '大厅比赛',
      quickConfigM: 6,
      quickConfigC: 2,
      quickPointsPerGame: 21,
      quickShowSquadEndCondition: false,
      quickEndConditionType: 'total_matches',
      quickEndConditionTarget: 6,
      quickEndConditionTargetOptions: [1, 2, 3, 4, 5, 6],
      maxMatches: 0,
      allowOpenTeam: false,
      canConfigureSettings: true,
      checkStartReady: false
    });
    ctx.fetchTournament = async () => {
      ctx.setData({ checkStartReady: false });
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};
    ctx.focusStartAction = () => {
      focusCalls += 1;
    };

    await ctx.saveQuickSettings();

    assert.equal(focusCalls, 0);
    assert.equal(wxBox.toastCalls.at(-1).title, '参数已保存');
  } finally {
    global.wx = originalWx;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('settings saveSettings stores focus_start intent when refreshed state is ready', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalSetLobbyIntent = nav.setLobbyIntent;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const wxBox = createWxStub();
  const intentCalls = [];
  const navCalls = [];

  global.wx = wxBox.api;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    cloud.call = async () => ({ ok: true, version: 2 });
    nav.markRefreshFlag = () => {};
    nav.setLobbyIntent = (...args) => {
      intentCalls.push(args);
    };
    nav.navigateBackOrRedirect = (url) => {
      navCalls.push(url);
    };
    nav.buildTournamentUrl = (pagePath, tournamentId) => `${pagePath}?tournamentId=${tournamentId}`;

    const ctx = createContext(settingsActions, {
      tournamentId: 't_settings_ready',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      name: '周二场',
      maxMatches: 0,
      editM: 6,
      editC: 2,
      pointsPerGame: 21,
      endConditionType: 'total_matches',
      endConditionTarget: 6,
      endConditionTargetOptions: [1, 2, 3, 4, 5, 6],
      showSquadEndCondition: false,
      mode: 'multi_rotate',
      allowOpenTeam: false,
      canConfigureSettings: true,
      checkStartReady: false
    });
    ctx.fetchTournament = async () => {
      ctx.setData({ checkStartReady: true });
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    await ctx.saveSettings();

    assert.deepEqual(intentCalls, [['t_settings_ready', 'focus_start']]);
    assert.equal(wxBox.toastCalls.at(-1).title, '已保存，可开赛');
    assert.deepEqual(navCalls, ['/pages/lobby/index?tournamentId=t_settings_ready']);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.setLobbyIntent = originalSetLobbyIntent;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});

test('settings saveSettings does not store focus_start intent when refreshed state is not ready', async () => {
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalCloudCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalSetLobbyIntent = nav.setLobbyIntent;
  const originalNavigateBackOrRedirect = nav.navigateBackOrRedirect;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;

  const wxBox = createWxStub();
  const intentCalls = [];
  const navCalls = [];

  global.wx = wxBox.api;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    cloud.call = async () => ({ ok: true, version: 2 });
    nav.markRefreshFlag = () => {};
    nav.setLobbyIntent = (...args) => {
      intentCalls.push(args);
    };
    nav.navigateBackOrRedirect = (url) => {
      navCalls.push(url);
    };
    nav.buildTournamentUrl = (pagePath, tournamentId) => `${pagePath}?tournamentId=${tournamentId}`;

    const ctx = createContext(settingsActions, {
      tournamentId: 't_settings_wait',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u1', name: 'A' },
          { id: 'u2', name: 'B' },
          { id: 'u3', name: 'C' },
          { id: 'u4', name: 'D' }
        ]
      },
      name: '周二场',
      maxMatches: 0,
      editM: 6,
      editC: 2,
      pointsPerGame: 21,
      endConditionType: 'total_matches',
      endConditionTarget: 6,
      endConditionTargetOptions: [1, 2, 3, 4, 5, 6],
      showSquadEndCondition: false,
      mode: 'multi_rotate',
      allowOpenTeam: false,
      canConfigureSettings: true,
      checkStartReady: false
    });
    ctx.fetchTournament = async () => {
      ctx.setData({ checkStartReady: false });
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = () => {};

    await ctx.saveSettings();

    assert.deepEqual(intentCalls, []);
    assert.equal(wxBox.toastCalls.at(-1).title, '已保存');
    assert.deepEqual(navCalls, ['/pages/lobby/index?tournamentId=t_settings_wait']);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    cloud.call = originalCloudCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.setLobbyIntent = originalSetLobbyIntent;
    nav.navigateBackOrRedirect = originalNavigateBackOrRedirect;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
  }
});
