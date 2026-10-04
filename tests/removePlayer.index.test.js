const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/removePlayer/index.js');
const commonPath = require.resolve('../cloudfunctions/removePlayer/lib/common.js');
const modePath = require.resolve('../cloudfunctions/removePlayer/lib/mode.js');
const shareActivityPath = require.resolve('../cloudfunctions/removePlayer/lib/share-activity.js');

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

function loadMain(db, openidOrOptions = 'u_admin') {
  const options = openidOrOptions && typeof openidOrOptions === 'object' ? openidOrOptions : {};
  const openid = typeof openidOrOptions === 'string' ? openidOrOptions : String(options.openid || 'u_admin');
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: openid };
    },
    openapi: options.openapi ? { updatableMessage: options.openapi } : undefined,
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];
  delete require.cache[shareActivityPath];

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

test('removePlayer refreshes draft updatable share count after successful removal', async () => {
  const openapiCalls = [];
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
                      playerLimit: 8,
                      shareActivityId: 'act_remove',
                      shareActivityExpireAtMs: Date.now() + 120_000,
                      shareActivityState: 0
                    })
                  };
                }
              };
            },
            where() {
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
  };
  const { main } = loadMain(db, {
    openapi: {
      async setUpdatableMsg(payload) {
        openapiCalls.push(payload);
      }
    }
  });

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_remove'
  });

  assert.equal(result.ok, true);
  assert.equal(openapiCalls.length, 1);
  assert.deepEqual(openapiCalls[0].templateInfo.parameterList, [
    { name: 'member_count', value: '3' },
    { name: 'room_limit', value: '8' }
  ]);
});

test('removePlayer lets creator remove self without changing creatorId', async () => {
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
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return {
                    data: buildTournament({
                      refereeId: 'u_admin',
                      pairTeams: [
                        { id: 'team_drop', playerIds: ['u_admin', 'p_keep'] },
                        { id: 'team_keep', playerIds: ['p_remove', 'p_other'] }
                      ]
                    })
                  };
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
  const { main } = loadMain(db, 'u_admin');

  const result = await main({
    tournamentId: 't_1',
    playerId: 'u_admin'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'PLAYER_REMOVED');
  assert.equal(result.state, 'removed');
  assert.equal(Object.prototype.hasOwnProperty.call(writtenData, 'creatorId'), false);
  assert.deepEqual(writtenData.playerIds, ['p_remove', 'p_keep', 'p_other']);
  assert.equal(writtenData.refereeId, '');
  assert.equal(writtenData.players.some((player) => player.id === 'u_admin'), false);
  assert.deepEqual(writtenData.pairTeams, [
    { id: 'team_keep', playerIds: ['p_remove', 'p_other'] }
  ]);
});

test('removePlayer lets participant remove self and can leave roster below start minimum', async () => {
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
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return {
                    data: buildTournament({
                      players: [
                        { id: 'u_admin', name: '管理员' },
                        { id: 'u_member', name: '普通成员' },
                        { id: 'p_keep', name: '保留成员' },
                        { id: 'p_other', name: '其他成员' }
                      ],
                      pairTeams: []
                    })
                  };
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
  const { main } = loadMain(db, 'u_member');

  const result = await main({
    tournamentId: 't_1',
    playerId: 'u_member'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'PLAYER_REMOVED');
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'p_keep', 'p_other']);
  assert.equal(writtenData.players.length, 3);
});

test('removePlayer rejects participant removing another player', async () => {
  let writeCalled = false;
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
                      players: [
                        { id: 'u_admin', name: '管理员' },
                        { id: 'u_member', name: '普通成员' },
                        { id: 'p_target', name: '目标成员' },
                        { id: 'p_other', name: '其他成员' }
                      ]
                    })
                  };
                }
              };
            },
            where() {
              writeCalled = true;
              throw new Error('should not write when permission denied');
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db, 'u_member');

  const result = await main({
    tournamentId: 't_1',
    playerId: 'p_target'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
  assert.equal(result.state, 'forbidden');
  assert.equal(writeCalled, false);
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

test('removePlayer keeps rejoined players when a completed clientRequestId is replayed', async () => {
  let tournament = buildTournament({
    players: [
      { id: 'u_admin', name: '管理员' },
      { playerId: 'p_remove', name: '待移除' },
      { _id: 'p_keep', name: '保留成员' },
      { id: 'p_other', name: '其他成员' }
    ]
  });
  const requestLogs = new Map();
  let updateCount = 0;

  function collection(name) {
    if (name === 'client_request_logs') {
      return {
        doc(id) {
          return {
            async get() {
              if (!requestLogs.has(id)) throw new Error('document.get:fail document does not exist');
              return { data: requestLogs.get(id) };
            },
            async set({ data }) {
              requestLogs.set(id, data);
            }
          };
        }
      };
    }
    assert.equal(name, 'tournaments');
    return {
      doc() {
        return {
          async get() {
            return { data: tournament };
          }
        };
      },
      where() {
        return {
          async update({ data }) {
            updateCount += 1;
            tournament = {
              ...tournament,
              ...data,
              version: Number(tournament.version) + 1
            };
            return { stats: { updated: 1 } };
          }
        };
      }
    };
  }

  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async createCollection() {},
    async runTransaction(handler) {
      return handler({ collection });
    }
  };
  const { main } = loadMain(db);

  const first = await main({
    tournamentId: 't_1',
    playerId: 'p_remove',
    clientRequestId: 'req_remove_1'
  });
  tournament = {
    ...tournament,
    players: tournament.players.concat({ _id: 'p_remove', name: '重新加入' }),
    playerIds: tournament.playerIds.concat('p_remove'),
    version: Number(tournament.version) + 1
  };
  const replay = await main({
    tournamentId: 't_1',
    playerId: 'p_remove',
    clientRequestId: 'req_remove_1'
  });

  assert.equal(first.code, 'PLAYER_REMOVED');
  assert.equal(requestLogs.size, 1);
  assert.equal(replay.ok, true);
  assert.equal(replay.code, 'PLAYER_REMOVED_DEDUPED');
  assert.equal(replay.state, 'deduped');
  assert.equal(replay.deduped, true);
  assert.equal(updateCount, 1);
  assert.equal(tournament.players.some((player) => player._id === 'p_remove'), true);
  assert.deepEqual(replay.data, {
    clientRequestId: 'req_remove_1',
    deduped: true,
    playerId: 'p_remove'
  });

  const absentFirst = await main({
    tournamentId: 't_1',
    playerId: 'p_late',
    clientRequestId: 'req_remove_absent'
  });
  tournament = {
    ...tournament,
    players: tournament.players.concat({ playerId: 'p_late', name: '稍后加入' }),
    playerIds: tournament.playerIds.concat('p_late'),
    version: Number(tournament.version) + 1
  };
  const absentReplay = await main({
    tournamentId: 't_1',
    playerId: 'p_late',
    clientRequestId: 'req_remove_absent'
  });

  assert.equal(absentFirst.code, 'PLAYER_REMOVED_DEDUPED');
  assert.equal(requestLogs.size, 2);
  assert.equal(absentReplay.code, 'PLAYER_REMOVED_DEDUPED');
  assert.equal(updateCount, 1);
  assert.equal(tournament.players.some((player) => player.playerId === 'p_late'), true);
});

for (const apiOutcome of ['success', 'failure']) {
  test('removePlayer returns the committed result when ' + apiOutcome + ' share diagnostics never settle', async () => {
    const tournament = {
      ...buildTournament(),
      playerLimit: 8,
      shareActivityId: 'act_optional',
      shareActivityExpireAtMs: Date.now() + 120_000,
      shareActivityState: 0
    };
    let writtenData = null;
    let transactionCommitted = false;
    let apiCalls = 0;
    let diagnosticCalls = 0;
    let releaseDiagnostic;
    const diagnosticPending = new Promise((resolve) => { releaseDiagnostic = resolve; });
    const db = {
      command: { inc: (value) => ({ $inc: value }), remove: () => ({ $remove: true }) },
      serverDate: () => ({ $serverDate: true }),
      collection(collectionName) {
        assert.equal(collectionName, 'tournaments');
        return { doc(id) {
          assert.equal(id, 't_1');
          return { update({ data }) {
            assert.equal(transactionCommitted, true);
            assert.ok(writtenData);
            if (apiOutcome === 'success') assert.deepEqual(data.shareActivityLastError, { $remove: true });
            else assert.equal(data.shareActivityLastError, 'optional API failed');
            diagnosticCalls += 1;
            return diagnosticPending;
          } };
        } };
      },
      async runTransaction(handler) {
        const result = await handler({ collection(collectionName) {
          assert.equal(collectionName, 'tournaments');
          return {
            doc: () => ({ get: async () => ({ data: tournament }) }),
            where(query) {
              assert.deepEqual(query, { _id: 't_1', version: 3 });
              return { update: async ({ data }) => {
                writtenData = data;
                return { stats: { updated: 1 } };
              } };
            }
          };
        } });
        transactionCommitted = true;
        return result;
      }
    };
    const { main } = loadMain(db, { openapi: { async setUpdatableMsg() {
      assert.equal(transactionCommitted, true);
      apiCalls += 1;
      if (apiOutcome === 'failure') throw new Error('optional API failed');
    } } });
    const pending = main({ tournamentId: 't_1', playerId: 'p_remove' });
    let guard;
    try {
      const result = await Promise.race([pending, new Promise((resolve) => {
        guard = setTimeout(() => resolve('handler still pending after committed write'), 1400);
      })]);
      assert.equal(transactionCommitted, true);
      assert.ok(writtenData);
      assert.deepEqual(writtenData.version, { $inc: 1 });
      assert.equal(apiCalls, 1);
      assert.equal(diagnosticCalls, 1);
      assert.notEqual(result, 'handler still pending after committed write');
      assert.equal(result.ok, true);
      assert.equal(result.code, 'PLAYER_REMOVED');
      assert.equal(result.state, 'removed');
      assert.equal(writtenData.players.length, 3);
      assert.equal(writtenData.players.some((player) => player.id === 'p_remove'), false);
      assert.equal(writtenData.refereeId, '');
    } finally {
      clearTimeout(guard);
      releaseDiagnostic();
      await pending;
    }
  });
}

for (const gate of ['budget is exhausted', 'replayed request', 'draft-only refusal']) {
  test('removePlayer skips optional share when ' + gate, async () => {
    const originalNow = Date.now;
    let now = 1_800_000_000_000;
    Date.now = () => now;
    let updateCount = 0;
    let apiCalls = 0;
    let diagnosticCalls = 0;
    let transactionCommitted = false;
    const tournament = {
      ...buildTournament(),
      playerLimit: 8,
      shareActivityId: 'act_gate',
      shareActivityExpireAtMs: now + 120_000,
      shareActivityState: 0
    };
    if (gate === 'replayed request') {
      tournament.players = tournament.players.filter((player) => player.id !== 'p_remove');
    }
    if (gate === 'draft-only refusal') tournament.status = 'finished';
    const db = {
      command: { inc: (value) => ({ $inc: value }), remove: () => ({ $remove: true }) },
      serverDate: () => ({ $serverDate: true }),
      collection() { return { doc: () => ({ update: async () => { diagnosticCalls += 1; } }) }; },
      async runTransaction(handler) {
        const result = await handler({ collection(collectionName) {
          assert.equal(collectionName, 'tournaments');
          return {
            doc: () => ({ get: async () => ({ data: tournament }) }),
            where(query) {
              assert.equal(gate, 'budget is exhausted');
              assert.deepEqual(query, { _id: 't_1', version: 3 });
              return { update: async ({ data }) => {
                assert.deepEqual(data.version, { $inc: 1 });
                updateCount += 1;
                return { stats: { updated: 1 } };
              } };
            }
          };
        } });
        if (gate === 'budget is exhausted') now += 2600;
        transactionCommitted = true;
        return result;
      }
    };
    try {
      const { main } = loadMain(db, { openapi: { async setUpdatableMsg() { apiCalls += 1; } } });
      const result = await main({ tournamentId: 't_1', playerId: 'p_remove' });
      assert.equal(transactionCommitted, gate !== 'draft-only refusal');
      assert.equal(apiCalls, 0);
      assert.equal(diagnosticCalls, 0);
      if (gate === 'budget is exhausted') {
        assert.equal(updateCount, 1);
        assert.equal(result.ok, true);
        assert.equal(result.code, 'PLAYER_REMOVED');
        assert.equal(result.state, 'removed');
      } else {
        assert.equal(updateCount, 0);
        assert.equal(result.ok, gate === 'replayed request');
        assert.equal(result.state, gate === 'replayed request' ? 'deduped' : 'forbidden');
      }
    } finally { Date.now = originalNow; }
  });
}
