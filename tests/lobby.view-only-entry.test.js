const test = require('node:test');
const assert = require('node:assert/strict');

const viewModel = require('../miniprogram/pages/lobby/lobbyViewModel');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

function buildTournament() {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players: [
      { id: 'u_admin', name: '组织者' },
      { id: 'u_other', name: '球友A' }
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
  return ctx;
}

test('lobby view model keeps draft share visitors in read-only mode until they opt in', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_viewer',
    data: {
      entryMode: 'view_only',
      viewOnlyJoinExpanded: false
    }
  });

  assert.equal(result.patch.showViewOnlyJoinPrompt, true);
  assert.equal(result.patch.showJoin, false);
  assert.equal(result.patch.nextActionText, '');
});

test('lobby view-only prompt can expand into the normal join form', () => {
  const definition = loadLobbyPageDefinition();
  const ctx = createLobbyPageContext(definition);

  try {
    ctx.setData({
      entryMode: 'view_only',
      viewOnlyJoinExpanded: false,
      profileNicknameFocus: false
    });
    ctx.enterJoinFromViewOnly();

    assert.equal(ctx.data.viewOnlyJoinExpanded, true);
    assert.equal(ctx.data.profileNicknameFocus, true);
  } finally {
    delete require.cache[lobbyPagePath];
  }
});
