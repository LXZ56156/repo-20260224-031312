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

function buildTournament(extra = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'fixed_pair_rr',
    version: 3,
    players: [
      { id: 'u_admin', type: 'user', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male' },
      { id: 'guest_1', type: 'guest', name: '球友A', avatar: '', gender: 'female' },
      { id: 'u_other', type: 'user', name: '球友B', avatar: 'cloud://avatar/b', gender: 'male' }
    ],
    playerIds: ['u_admin', 'guest_1', 'u_other'],
    pairTeams: [
      { id: 'pair_1', playerIds: ['guest_1', 'u_other'], name: '球友A / 球友B' }
    ],
    rankings: [
      { entityType: 'player', entityId: 'guest_1', playerId: 'guest_1', name: '球友A' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            teamA: [{ id: 'guest_1', name: '球友A', avatar: '' }, { id: 'u_other', name: '球友B', avatar: 'cloud://avatar/b' }],
            teamB: [{ id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin' }, { id: 'u_other_2', name: '球友C', avatar: '' }]
          }
        ],
        restPlayers: [{ id: 'guest_1', name: '球友A', avatar: '' }]
      }
    ],
    ...extra
  };
}

test('joinTournament auto-claims a uniquely matched guest and rewrites tournament references', async () => {
  let writtenData = null;
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

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(result.claimed, true);
  assert.equal(result.claimedGuestId, 'guest_1');
  assert.equal(result.player.id, 'u_join');
  assert.equal(writtenData.players.some((item) => item.id === 'guest_1'), false);
  assert.equal(writtenData.players.some((item) => item.id === 'u_join' && item.avatar === 'cloud://avatar/a.png'), true);
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'u_join', 'u_other']);
  assert.deepEqual(writtenData.pairTeams[0].playerIds, ['u_join', 'u_other']);
  assert.equal(writtenData.rounds[0].matches[0].teamA[0].id, 'u_join');
  assert.equal(writtenData.rounds[0].restPlayers[0].id, 'u_join');
  assert.equal(writtenData.rankings[0].playerId, 'pair_1');
  assert.equal(writtenData.rankings[0].entityId, 'pair_1');
  assert.equal(writtenData.rankings[0].entityType, 'team');
});

test('joinTournament does not auto-claim when multiple guests share the same normalized name', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      return {
        where() {
          return {
            limit() {
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
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return {
                    data: buildTournament({
                      players: [
                        { id: 'guest_1', type: 'guest', name: '球友A', avatar: '', gender: 'female' },
                        { id: 'guest_2', type: 'guest', name: '球友A', avatar: '', gender: 'female' }
                      ],
                      playerIds: ['guest_1', 'guest_2'],
                      pairTeams: []
                    })
                  };
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

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.claimed, undefined);
  assert.equal(writtenData.players.filter((item) => item.id.startsWith('guest_')).length, 2);
  assert.equal(writtenData.players.some((item) => item.id === 'u_join'), true);
});
