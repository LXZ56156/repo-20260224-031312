const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/rebuildRankings/index.js');
const commonPath = require.resolve('../cloudfunctions/rebuildRankings/lib/common.js');
const rankingCorePath = require.resolve('../cloudfunctions/rebuildRankings/lib/rankingCore.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    version: 3,
    players: [
      { id: 'u_admin', name: '管理员' },
      { id: 'u_2', name: '球友B' },
      { id: 'u_3', name: '球友C' },
      { id: 'u_4', name: '球友D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: [{ id: 'u_admin' }, { id: 'u_2' }],
        teamB: [{ id: 'u_3' }, { id: 'u_4' }],
        score: { teamA: 21, teamB: 18 }
      }]
    }]
  };
}

function loadMain(db) {
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

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[rankingCorePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('rebuildRankings recomputes rankings and writes with optimistic locking', async () => {
  let writtenData = null;
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
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_1');
          return {
            async get() {
              return { data: buildTournament() };
            }
          };
        },
        where(query) {
          assert.deepEqual(query, { _id: 't_1', version: 3 });
          return {
            async update(payload) {
              writtenData = payload.data;
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({ tournamentId: 't_1' });
  assert.equal(result.ok, true);
  assert.equal(result.rankingsCount, 4);
  assert.ok(Array.isArray(writtenData.rankings));
  assert.deepEqual(writtenData.version, { $inc: 1 });
});

test('rebuildRankings surfaces optimistic conflicts as retryable errors', async () => {
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { data: buildTournament() };
            }
          };
        },
        where() {
          return {
            async update() {
              return { stats: { updated: 0 } };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  await assert.rejects(() => main({ tournamentId: 't_1' }), /写入冲突/);
});
