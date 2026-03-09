const test = require('node:test');
const assert = require('node:assert/strict');

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
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  ctx.setTournament = (doc) => {
    ctx.latestTournament = doc;
  };
  return ctx;
}

test('lobby onLoad tolerates malformed scene payloads', () => {
  const originalGetApp = global.getApp;
  const definition = loadLobbyPageDefinition();
  const ctx = createLobbyPageContext(definition);

  global.getApp = () => ({
    globalData: { openid: '' }
  });
  ctx.fetchTournament = () => {};
  ctx.startWatch = () => {};

  try {
    ctx.onLoad({ scene: '%E0%A4%A' });
    assert.equal(ctx.data.tournamentId, '%E0%A4%A');
  } finally {
    global.getApp = originalGetApp;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby fetchTournament surfaces guided not_found and param error states', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadLobbyPageDefinition();
    const ctx = createLobbyPageContext(definition);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'not_found',
      errorMessage: '未找到赛事',
      cachedDoc: null
    });
    await ctx.fetchTournament('t_1');
    assert.equal(ctx.data.loadErrorTitle, '比赛不存在或已关闭');
    assert.equal(ctx.data.showLoadErrorHome, true);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'param',
      errorMessage: '缺少赛事ID',
      cachedDoc: null
    });
    await ctx.fetchTournament('t_1');
    assert.equal(ctx.data.loadErrorTitle, '链接无效');
    assert.equal(ctx.data.showLoadErrorHome, true);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[lobbyPagePath];
  }
});
