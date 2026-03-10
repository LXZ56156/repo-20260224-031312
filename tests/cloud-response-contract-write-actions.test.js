const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const joinTournamentIndexPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const joinTournamentCommonPath = require.resolve('../cloudfunctions/joinTournament/lib/common.js');
const joinTournamentModePath = require.resolve('../cloudfunctions/joinTournament/lib/mode.js');

const submitScoreIndexPath = require.resolve('../cloudfunctions/submitScore/index.js');
const submitScoreCommonPath = require.resolve('../cloudfunctions/submitScore/lib/common.js');
const submitScoreLogicPath = require.resolve('../cloudfunctions/submitScore/logic.js');
const submitScorePermissionPath = require.resolve('../cloudfunctions/submitScore/lib/permission.js');
const submitScorePlayerPath = require.resolve('../cloudfunctions/submitScore/lib/player.js');
const submitScoreModePath = require.resolve('../cloudfunctions/submitScore/lib/mode.js');
const submitScoreRankingCorePath = require.resolve('../cloudfunctions/submitScore/lib/rankingCore.js');
const submitScoreScorePath = require.resolve('../cloudfunctions/submitScore/lib/score.js');

const scoreLockIndexPath = require.resolve('../cloudfunctions/scoreLock/index.js');
const scoreLockCommonPath = require.resolve('../cloudfunctions/scoreLock/lib/common.js');
const scoreLockLogicPath = require.resolve('../cloudfunctions/scoreLock/logic.js');
const scoreLockPermissionPath = require.resolve('../cloudfunctions/scoreLock/lib/permission.js');

const startTournamentIndexPath = require.resolve('../cloudfunctions/startTournament/index.js');
const startTournamentCommonPath = require.resolve('../cloudfunctions/startTournament/lib/common.js');
const startTournamentLogicPath = require.resolve('../cloudfunctions/startTournament/logic.js');
const startTournamentModePath = require.resolve('../cloudfunctions/startTournament/lib/mode.js');

const updateSettingsIndexPath = require.resolve('../cloudfunctions/updateSettings/index.js');
const updateSettingsCommonPath = require.resolve('../cloudfunctions/updateSettings/lib/common.js');
const updateSettingsLogicPath = require.resolve('../cloudfunctions/updateSettings/logic.js');

function loadCloudMain(indexPath, cachePaths, db, openid = 'u_admin') {
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

  delete require.cache[indexPath];
  for (const cachePath of cachePaths || []) delete require.cache[cachePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(indexPath);
  } finally {
    Module._load = originalLoad;
  }
}

function buildDraftTournament(extra = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    settingsConfigured: true,
    totalMatches: 1,
    courts: 1,
    version: 1,
    mode: 'multi_rotate',
    allowOpenTeam: false,
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'total_matches', target: 1 }
    },
    players: [
      { id: 'u_admin', name: '管理员', gender: 'male' },
      { id: 'u_b', name: '球友B', gender: 'male' },
      { id: 'u_c', name: '球友C', gender: 'female' },
      { id: 'u_d', name: '球友D', gender: 'female' }
    ],
    rounds: [],
    rankings: [],
    ...extra
  };
}

test('write actions expose structured contract on representative success and failure paths', async () => {
  const joinMain = loadCloudMain(joinTournamentIndexPath, [
    joinTournamentCommonPath,
    joinTournamentModePath
  ], {
    databaseShouldNotBeCalled() {
      throw new Error('joinTournament should not touch db for missing id');
    }
  }, 'u_viewer').main;

  const joinResult = await joinMain({ __traceId: 'trace_join' }, {});
  assert.deepEqual(joinResult, {
    ok: false,
    code: 'TOURNAMENT_ID_REQUIRED',
    message: '缺少赛事ID',
    state: 'invalid',
    traceId: 'trace_join'
  });

  const submitMain = loadCloudMain(submitScoreIndexPath, [
    submitScoreCommonPath,
    submitScoreLogicPath,
    submitScorePermissionPath,
    submitScorePlayerPath,
    submitScoreModePath,
    submitScoreRankingCorePath,
    submitScoreScorePath
  ], {
    collection() {
      throw new Error('submitScore should not touch db for score bounds failure');
    }
  }).main;

  const submitResult = await submitMain({
    __traceId: 'trace_submit',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 999,
    scoreB: 998
  });
  assert.deepEqual(submitResult, {
    ok: false,
    code: 'SCORE_OUT_OF_RANGE',
    message: '比分不能超过 60 分',
    state: 'invalid',
    traceId: 'trace_submit'
  });

  const scoreLockMain = loadCloudMain(scoreLockIndexPath, [
    scoreLockCommonPath,
    scoreLockLogicPath,
    scoreLockPermissionPath
  ], {
    createCollection: async () => {},
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      return handler({
        collection(name) {
          if (name === 'tournaments') {
            return {
              doc() {
                return {
                  async get() {
                    return {
                      data: {
                        _id: 't_1',
                        creatorId: 'u_admin',
                        status: 'running',
                        players: [{ id: 'u_admin', name: '管理员' }],
                        rounds: [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'pending' }] }]
                      }
                    };
                  }
                };
              }
            };
          }
          if (name === 'score_locks') {
            return {
              doc() {
                return {
                  async get() {
                    throw new Error('document.get:fail document does not exist');
                  }
                };
              }
            };
          }
          throw new Error(`unexpected collection ${name}`);
        }
      });
    }
  }).main;

  const lockResult = await scoreLockMain({
    __traceId: 'trace_lock',
    action: 'status',
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0
  });
  assert.deepEqual(lockResult, {
    ok: true,
    code: 'LOCK_IDLE',
    message: '当前可开始录分',
    state: 'idle',
    traceId: 'trace_lock',
    ownerId: '',
    ownerName: '',
    expireAt: 0,
    remainingMs: 0
  });

  const startMain = loadCloudMain(startTournamentIndexPath, [
    startTournamentCommonPath,
    startTournamentLogicPath,
    startTournamentModePath
  ], {
    command: {
      inc(value) {
        return { $inc: value };
      },
      remove() {
        return { $remove: true };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name !== 'tournaments') throw new Error(`unexpected collection ${name}`);
      return {
        doc(id) {
          assert.equal(id, 't_1');
          return {
            async get() {
              return { data: buildDraftTournament() };
            }
          };
        },
        where(query) {
          assert.deepEqual(query, { _id: 't_1', version: 1 });
          return {
            async update() {
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  }).main;

  const startResult = await startMain({
    __traceId: 'trace_start',
    tournamentId: 't_1'
  });
  assert.equal(startResult.ok, true);
  assert.equal(startResult.code, 'TOURNAMENT_STARTED');
  assert.equal(startResult.message, '已开赛');
  assert.equal(startResult.state, 'started');
  assert.equal(startResult.traceId, 'trace_start');

  const updateMain = loadCloudMain(updateSettingsIndexPath, [
    updateSettingsCommonPath,
    updateSettingsLogicPath
  ], {
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
          if (name !== 'tournaments') throw new Error(`unexpected collection ${name}`);
          return {
            doc(id) {
              assert.equal(id, 't_1');
              return {
                async get() {
                  return { data: buildDraftTournament() };
                }
              };
            },
            where(query) {
              assert.deepEqual(query, { _id: 't_1', version: 1 });
              return {
                async update() {
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  }).main;

  const updateResult = await updateMain({
    __traceId: 'trace_settings',
    tournamentId: 't_1',
    totalMatches: 1,
    courts: 1
  });
  assert.deepEqual(updateResult, {
    ok: true,
    code: 'SETTINGS_UPDATED',
    message: '已保存比赛参数',
    state: 'updated',
    traceId: 'trace_settings',
    version: 2
  });
});
