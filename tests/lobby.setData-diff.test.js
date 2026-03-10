const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

function buildTournament() {
  return {
    _id: 't_lobby_patch',
    name: '月赛大厅',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    settingsConfigured: true,
    version: 8,
    players: [
      { id: 'u_1', name: '球友1', gender: 'male' },
      { id: 'u_2', name: '球友2', gender: 'female' },
      { id: 'u_3', name: '球友3', gender: 'male' },
      { id: 'u_4', name: '球友4', gender: 'female' }
    ],
    rankings: [],
    rounds: []
  };
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

function createLobbyContext(definition, patches) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    openid: 'u_admin',
    avatarCache: {},
    _showShareHint: false,
    _pendingIntentAction: '',
    setData(update) {
      patches.push(update || {});
      this.data = { ...this.data, ...(update || {}) };
    },
    resolveDisplayPlayersAvatars() {}
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('lobby setTournament skips redundant setData when the normalized patch is unchanged', () => {
  const originalGetApp = global.getApp;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const patches = [];

  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};

  try {
    const definition = loadLobbyPageDefinition();
    const ctx = createLobbyContext(definition, patches);
    const tournament = buildTournament();

    ctx.setTournament(tournament);
    assert.ok(patches.length >= 1);

    patches.length = 0;
    ctx.setTournament(JSON.parse(JSON.stringify(tournament)));
    assert.equal(patches.length, 0);
  } finally {
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    delete require.cache[lobbyPagePath];
  }
});
