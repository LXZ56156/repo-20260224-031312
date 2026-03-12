const test = require('node:test');
const assert = require('node:assert/strict');

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

function createLobbyPageContext(definition, tournament) {
  const ctx = {
    data: {
      ...JSON.parse(JSON.stringify(definition.data)),
      tournamentId: 't_1',
      tournament
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('lobby page uses a unified transfer contract across lifecycle states', () => {
  const definition = loadLobbyPageDefinition();
  try {
    const draftCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'draft' });
    const runningCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'running' });
    const finishedCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'finished' });

    const draftShare = draftCtx.onShareAppMessage();
    const runningShare = runningCtx.onShareAppMessage();
    const finishedShare = finishedCtx.onShareAppMessage();

    assert.equal(draftShare.title, '周末比赛 · 查看比赛');
    assert.equal(draftShare.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(runningShare.title, '周末比赛 · 查看比赛');
    assert.equal(runningShare.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(finishedShare.title, '周末比赛 · 查看比赛');
    assert.equal(finishedShare.path, '/pages/share-entry/index?tournamentId=t_1');
  } finally {
    delete require.cache[lobbyPagePath];
  }
});
