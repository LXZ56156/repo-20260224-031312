const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const submitScoreIndexPath = require.resolve('../cloudfunctions/submitScore/index.js');
const submitScoreCommonPath = require.resolve('../cloudfunctions/submitScore/lib/common.js');
const submitScoreLogicPath = require.resolve('../cloudfunctions/submitScore/logic.js');
const submitScorePermissionPath = require.resolve('../cloudfunctions/submitScore/lib/permission.js');
const submitScorePlayerPath = require.resolve('../cloudfunctions/submitScore/lib/player.js');
const submitScoreModePath = require.resolve('../cloudfunctions/submitScore/lib/mode.js');
const submitScoreRankingCorePath = require.resolve('../cloudfunctions/submitScore/lib/rankingCore.js');
const submitScoreScorePath = require.resolve('../cloudfunctions/submitScore/lib/score.js');

function loadSubmitScoreMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_admin' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[submitScoreIndexPath];
  delete require.cache[submitScoreCommonPath];
  delete require.cache[submitScoreLogicPath];
  delete require.cache[submitScorePermissionPath];
  delete require.cache[submitScorePlayerPath];
  delete require.cache[submitScoreModePath];
  delete require.cache[submitScoreRankingCorePath];
  delete require.cache[submitScoreScorePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(submitScoreIndexPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('submitScore rejects unreasonably large scores before touching the database', async () => {
  let collectionCalls = 0;
  const { main } = loadSubmitScoreMain({
    collection() {
      collectionCalls += 1;
      throw new Error('database should not be touched');
    }
  });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 999,
    scoreB: 998
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'SCORE_OUT_OF_RANGE',
    message: '比分不能超过 60 分'
  });
  assert.equal(collectionCalls, 0);
});
