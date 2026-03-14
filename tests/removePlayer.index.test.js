const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/removePlayer/index.js');
const commonPath = require.resolve('../cloudfunctions/removePlayer/lib/common.js');

function buildTournament(extra = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    refereeId: 'p_remove',
    version: 3,
    players: [
      { id: 'u_admin', name: '管理员' },
      { id: 'p_remove', name: '待移除' },
      { id: 'p_keep', name: '保留成员' },
      { id: 'p_other', name: '其他成员' }
    ],
    pairTeams: [
      { id: 'team_drop', playerIds: ['p_remove', 'p_keep'] },
      { id: 'team_keep', playerIds: ['p_keep', 'p_other'] }
    ],
    ...extra
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

test('removePlayer updates player roster, referee and pair teams in one transaction', async () => {
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
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_remove'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'PLAYER_REMOVED');
  assert.equal(result.message, '已移除参赛成员');
  assert.equal(result.state, 'removed');
  assert.equal(result.playerId, 'p_remove');
  assert.deepEqual(result.data, {
    clientRequestId: '',
    playerId: 'p_remove'
  });
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'p_keep', 'p_other']);
  assert.equal(writtenData.refereeId, '');
  assert.equal(writtenData.players.length, 3);
  assert.deepEqual(writtenData.pairTeams, [
    { id: 'team_keep', playerIds: ['p_keep', 'p_other'] }
  ]);
});

test('removePlayer surfaces optimistic-lock conflicts as structured retryable result', async () => {
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

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_remove'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'VERSION_CONFLICT');
  assert.equal(result.message, '写入冲突，请刷新赛事后重试');
  assert.equal(result.state, 'conflict');
});

test('removePlayer treats retry after server-side success as deduped success', async () => {
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
                  return {
                    data: buildTournament({
                      refereeId: '',
                      players: [
                        { id: 'u_admin', name: '管理员' },
                        { id: 'p_keep', name: '保留成员' },
                        { id: 'p_other', name: '其他成员' }
                      ],
                      pairTeams: [{ id: 'team_keep', playerIds: ['p_keep', 'p_other'] }]
                    })
                  };
                }
              };
            },
            where() {
              throw new Error('should not write when retry is deduped');
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_remove',
    clientRequestId: 'req_remove_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'PLAYER_REMOVED_DEDUPED');
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.playerId, 'p_remove');
  assert.deepEqual(result.data, {
    clientRequestId: 'req_remove_1',
    deduped: true,
    playerId: 'p_remove'
  });
});
