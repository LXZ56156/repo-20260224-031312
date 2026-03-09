const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const tournamentSync = require('../miniprogram/core/tournamentSync');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

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

function createLobbyPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    fetchTournament() {},
    startWatch() {},
    setJoinAvatarDisplay() {},
    setMyAvatarDisplay() {}
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('lobby no longer auto-runs join intent from share url params', () => {
  const originalGetApp = global.getApp;
  const originalGetSessionMinutesPref = storage.getSessionMinutesPref;
  const originalGetSlotMinutesPref = storage.getSlotMinutesPref;
  const originalGetUserProfile = storage.getUserProfile;
  const originalGet = storage.get;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;

  global.getApp = () => ({
    globalData: { openid: 'u_viewer', networkOffline: false },
    subscribeNetworkChange() {
      return () => {};
    }
  });
  storage.getSessionMinutesPref = () => 120;
  storage.getSlotMinutesPref = () => 15;
  storage.getUserProfile = () => null;
  storage.get = (key, fallback) => fallback;
  tournamentSync.fetchTournament = async () => null;
  tournamentSync.startWatch = () => {};

  try {
    const definition = loadLobbyPageDefinition();
    const ctx = createLobbyPageContext(definition);

    ctx.onLoad({ tournamentId: 't_1', intent: 'join' });

    assert.equal(ctx.data.tournamentId, 't_1');
    assert.equal(ctx._pendingIntentAction, '');
  } finally {
    global.getApp = originalGetApp;
    storage.getSessionMinutesPref = originalGetSessionMinutesPref;
    storage.getSlotMinutesPref = originalGetSlotMinutesPref;
    storage.getUserProfile = originalGetUserProfile;
    storage.get = originalGet;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[lobbyPagePath];
  }
});
