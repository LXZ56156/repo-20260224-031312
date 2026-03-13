const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/managePairTeams/index.js');
const commonPath = require.resolve('../cloudfunctions/managePairTeams/lib/common.js');
const modePath = require.resolve('../cloudfunctions/managePairTeams/lib/mode.js');
const logicPath = require.resolve('../cloudfunctions/managePairTeams/logic.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'fixed_pair_rr',
    version: 4,
    players: [
      { id: 'u_1', name: 'A' },
      { id: 'u_2', name: 'B' },
      { id: 'u_3', name: 'C' },
      { id: 'u_4', name: 'D' }
    ],
    pairTeams: []
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
  delete require.cache[modePath];
  delete require.cache[logicPath];

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

test('managePairTeams creates a team and persists it with optimistic locking', async () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let writtenData = null;

  Date.now = () => 1700000000000;
  Math.random = () => 0.56789;

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
          assert.deepEqual(query, { _id: 't_1', version: 4 });
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

  try {
    const result = await main({
      tournamentId: 't_1',
      action: 'create',
      name: '晨风',
      playerIds: ['u_1', 'u_2']
    });

    assert.equal(result.ok, true);
    assert.equal(result.pairTeams.length, 1);
    assert.equal(result.pairTeams[0].name, '晨风');
    assert.equal(writtenData.pairTeams.length, 1);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('managePairTeams throws conflict error when optimistic update loses the race', async () => {
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

  await assert.rejects(() => main({
    tournamentId: 't_1',
    action: 'auto_generate'
  }), /写入冲突/);
});
