const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/updateSettings/index.js');
const commonPath = require.resolve('../cloudfunctions/updateSettings/lib/common.js');
const logicPath = require.resolve('../cloudfunctions/updateSettings/logic.js');

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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    version: 4,
    mode: 'multi_rotate',
    allowOpenTeam: false,
    totalMatches: 4,
    courts: 1,
    players: [
      { id: 'p1', name: 'P1', gender: 'male' },
      { id: 'p2', name: 'P2', gender: 'female' },
      { id: 'p3', name: 'P3', gender: 'male' },
      { id: 'p4', name: 'P4', gender: 'female' }
    ],
    pairTeams: [],
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'total_matches', target: 4 },
      unfinishedPolicy: 'admin_decide'
    }
  };
}

test('updateSettings writes normalized settings and rules through the direct index handler', async () => {
  let updateQuery = null;
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
    async runTransaction(handler) {
      return handler({
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
              updateQuery = query;
              return {
                async update(payload) {
                  writtenData = payload.data;
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    name: '  周五夜场  ',
    totalMatches: 3,
    courts: 2,
    pointsPerGame: 15
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SETTINGS_UPDATED');
  assert.equal(result.state, 'updated');
  assert.equal(result.version, 5);
  assert.deepEqual(updateQuery, { _id: 't_1', version: 4 });
  assert.equal(writtenData.name, '周五夜场');
  assert.equal(writtenData.totalMatches, 3);
  assert.equal(writtenData.courts, 2);
  assert.equal(writtenData.settingsConfigured, true);
  assert.deepEqual(writtenData.version, { $inc: 1 });
  assert.equal(writtenData.rules.pointsPerGame, 15);
  assert.deepEqual(writtenData.rules.endCondition, {
    type: 'total_matches',
    target: 3
  });
});

test('updateSettings returns SETTINGS_INVALID when provided name is blank', async () => {
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction() {
      throw new Error('should not start transaction');
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    name: '   '
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETTINGS_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '赛事名称不能为空');
});
