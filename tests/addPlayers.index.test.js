const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/addPlayers/index.js');
const commonPath = require.resolve('../cloudfunctions/addPlayers/lib/common.js');

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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    version: 2,
    players: [
      { id: 'u_admin', name: '管理员', gender: 'male' }
    ]
  };
}

test('addPlayers imports unique valid players and returns detailed counts', async () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let writtenData = null;

  Date.now = () => 1700000000000;
  Math.random = () => 0.123456;

  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      const transaction = {
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
              assert.deepEqual(query, { _id: 't_1', version: 2 });
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
      return handler(transaction);
    }
  };
  const { main } = loadMain(db);

  try {
    const result = await main({
      tournamentId: 't_1',
      players: [
        { name: '球友A', gender: 'male' },
        { name: '球友A', gender: 'female' },
        { name: '球友B', gender: 'female' },
        { name: '', gender: 'male' }
      ]
    });

    assert.deepEqual(result, {
      ok: true,
      added: 2,
      addedCount: 2,
      maleCount: 1,
      femaleCount: 1,
      unknownCount: 0,
      duplicateCount: 1,
      invalidCount: 1,
      duplicateNames: ['球友A'],
      invalidNames: ['']
    });
    assert.equal(writtenData.players.length, 3);
    assert.deepEqual(writtenData.playerIds, ['u_admin', 'guest_1700000000000_0_123456', 'guest_1700000000000_1_123456']);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('addPlayers throws conflict error when optimistic update loses the race', async () => {
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      return handler({
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
      });
    }
  };
  const { main } = loadMain(db);

  await assert.rejects(() => main({
    tournamentId: 't_1',
    players: [{ name: '球友A', gender: 'male' }]
  }), /写入冲突/);
});
