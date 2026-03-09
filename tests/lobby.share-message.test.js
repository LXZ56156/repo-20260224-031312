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

test('lobby share title follows tournament lifecycle state', () => {
  const definition = loadLobbyPageDefinition();
  try {
    const draftCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'draft' });
    const runningCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'running' });
    const finishedCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'finished' });

    const draftShare = draftCtx.onShareAppMessage();
    const runningShare = runningCtx.onShareAppMessage();
    const finishedShare = finishedCtx.onShareAppMessage();

    assert.match(draftShare.title, /查看比赛信息/);
    assert.doesNotMatch(draftShare.title, /邀请你参赛/);
    assert.match(draftShare.path, /intent=join/);
    assert.match(runningShare.title, /查看赛况与排名/);
    assert.doesNotMatch(runningShare.title, /邀请你参赛/);
    assert.match(runningShare.path, /intent=watch/);
    assert.match(finishedShare.title, /查看结果与排名/);
    assert.doesNotMatch(finishedShare.title, /邀请你参赛/);
    assert.match(finishedShare.path, /intent=result/);
  } finally {
    delete require.cache[lobbyPagePath];
  }
});
