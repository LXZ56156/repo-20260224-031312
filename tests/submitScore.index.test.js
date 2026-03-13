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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'running',
    version: 1,
    players: [
      { id: 'u_admin', name: '管理员' },
      { id: 'u_b', name: '球友B' },
      { id: 'u_c', name: '球友C' },
      { id: 'u_d', name: '球友D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'pending',
        teamA: ['u_admin', 'u_b'],
        teamB: ['u_c', 'u_d']
      }]
    }]
  };
}

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

function createDbHarness(lockGetImpl, options = {}) {
  const calls = {
    tournamentGet: 0,
    lockGet: 0,
    update: 0,
    remove: 0
  };
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'tournaments') {
        return {
          doc(id) {
            assert.equal(id, 't_1');
            return {
              async get() {
                calls.tournamentGet += 1;
                return { data: buildTournament() };
              }
            };
          },
          where(query) {
            assert.deepEqual(query, { _id: 't_1', version: 1 });
            return {
              async update() {
                calls.update += 1;
                return { stats: { updated: options.updatedCount === undefined ? 1 : options.updatedCount } };
              }
            };
          }
        };
      }
      if (name === 'score_locks') {
        return {
          doc(id) {
            assert.equal(id, 't_1_0_0');
            return {
              async get() {
                calls.lockGet += 1;
                return lockGetImpl(id);
              },
              async remove() {
                calls.remove += 1;
              }
            };
          }
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }
  };
  return { db, calls };
}

test('submitScore returns LOCK_EXPIRED when score lock document is missing', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('document.get:fail document does not exist');
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'LOCK_EXPIRED',
    message: '录分会话已过期，请重新开始录分',
    state: 'expired',
    traceId: ''
  });
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore returns VERSION_CONFLICT when optimistic update reports updated: 0', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    updatedCount: 0
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '写入冲突，请刷新赛事后重试',
    state: 'conflict',
    traceId: ''
  });
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.remove, 0);
});
