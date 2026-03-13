const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/setPlayerSquad/index.js');
const commonPath = require.resolve('../cloudfunctions/setPlayerSquad/lib/common.js');
const modePath = require.resolve('../cloudfunctions/setPlayerSquad/lib/mode.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'squad_doubles',
    version: 2,
    players: [
      { id: 'u_admin', name: '管理员', squad: 'A' },
      { id: 'p_1', name: '球友A', squad: 'A' }
    ]
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

test('setPlayerSquad updates one player squad with optimistic lock', async () => {
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_1',
    squad: 'B'
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(writtenData.players[1].squad, 'B');
});

test('setPlayerSquad rejects optimistic-lock conflicts', async () => {
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
    playerId: 'p_1',
    squad: 'B'
  }), /写入冲突/);
});
