const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/joinTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/joinTournament/lib/mode.js');

function loadMain(db, openid = 'u_join') {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: openid };
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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'squad_doubles',
    version: 3,
    players: [
      { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male', squad: 'A' }
    ],
    playerIds: ['u_admin']
  };
}

test('joinTournament adds player with normalized profile fallback and squad choice', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where(query) {
          assert.deepEqual(query, { openid: 'u_join' });
          return {
            limit(value) {
              assert.equal(value, 1);
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
            }
          };
        }
      };
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
                },
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
    squadChoice: 'b'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(result.state, 'joined');
  assert.equal(result.version, 4);
  assert.deepEqual(result.player, {
    id: 'u_join',
    name: '球友A',
    avatar: 'cloud://avatar/a.png',
    gender: 'female',
    squad: 'B'
  });
  assert.equal(writtenData.version, 4);
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'u_join']);
  assert.equal(writtenData.players.length, 2);
  assert.deepEqual(writtenData.players[1], result.player);
});

test('joinTournament returns PROFILE_MINIMUM_REQUIRED when neither payload nor profile is complete', async () => {
  let writeCalled = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      return handler({
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return { data: buildTournament() };
                },
                async update() {
                  writeCalled = true;
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
    nickname: '',
    avatar: '',
    gender: ''
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_MINIMUM_REQUIRED');
  assert.equal(result.state, 'invalid');
  assert.match(String(result.message || ''), /请先完善/);
  assert.equal(writeCalled, false);
});
