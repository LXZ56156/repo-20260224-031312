const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/addPlayers/index.js');
const commonPath = require.resolve('../cloudfunctions/addPlayers/lib/common.js');
const modePath = require.resolve('../cloudfunctions/addPlayers/lib/mode.js');
const shareActivityPath = require.resolve('../cloudfunctions/addPlayers/lib/share-activity.js');

function loadMain(db, stubs = {}) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_admin' };
    },
    openapi: stubs.openapi ? { updatableMessage: stubs.openapi } : undefined,
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];
  delete require.cache[shareActivityPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    if (request === 'crypto' && stubs.crypto) return stubs.crypto;
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
  let writtenData = null;

  Date.now = () => 1700000000000;

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
  const { main } = loadMain(db, {
    crypto: {
      randomBytes() {
        return Buffer.from('1234567890abcdef', 'hex');
      }
    }
  });

  try {
    const result = await main({
      tournamentId: 't_1',
      players: [
        { name: '球友A', gender: 'male' },
        { name: '球友A', gender: 'female' },
        { name: '球友B', gender: 'female' },
        { name: '', gender: 'male' }
      ],
      clientRequestId: 'req_add_1',
      __traceId: 'trace-add-1'
    });

    assert.deepEqual(result, {
      traceId: 'trace-add-1',
      state: 'updated',
      clientRequestId: 'req_add_1',
      added: 2,
      addedCount: 2,
      maleCount: 1,
      femaleCount: 1,
      unknownCount: 0,
      duplicateCount: 1,
      invalidCount: 1,
      duplicateNames: ['球友A'],
      invalidNames: [''],
      ok: true,
      code: 'PLAYERS_ADDED',
      message: '名单导入已处理',
      data: {
        clientRequestId: 'req_add_1',
        added: 2,
        addedCount: 2,
        maleCount: 1,
        femaleCount: 1,
        unknownCount: 0,
        duplicateCount: 1,
        invalidCount: 1,
        duplicateNames: ['球友A'],
        invalidNames: ['']
      }
    });
    assert.equal(writtenData.players.length, 3);
    assert.deepEqual(writtenData.playerIds, [
      'u_admin',
      'guest_1700000000000_0_1234567890abcdef',
      'guest_1700000000000_1_1234567890abcdef'
    ]);
    assert.equal(writtenData.lastClientRequestId, 'req_add_1');
    assert.deepEqual(writtenData.lastAddPlayersCounts, {
      added: 2,
      addedCount: 2,
      maleCount: 1,
      femaleCount: 1,
      unknownCount: 0,
      duplicateCount: 1,
      invalidCount: 1
    });
  } finally {
    Date.now = originalNow;
  }
});

test('addPlayers refreshes draft updatable share count after successful import', async () => {
  const originalNow = Date.now;
  const openapiCalls = [];
  Date.now = () => 1700000000000;
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
                    data: {
                      ...buildTournament(),
                      playerLimit: 8,
                      shareActivityId: 'act_add',
                      shareActivityExpireAtMs: Date.now() + 120_000,
                      shareActivityState: 0
                    }
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
    crypto: {
      randomBytes() {
        return Buffer.from('1234567890abcdef', 'hex');
      }
    },
    openapi: {
      async setUpdatableMsg(payload) {
        openapiCalls.push(payload);
      }
    }
  });

  try {
    const result = await main({
      tournamentId: 't_1',
      players: [{ name: '球友A', gender: 'male' }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.addedCount, 1);
    assert.equal(openapiCalls.length, 1);
    assert.deepEqual(openapiCalls[0].templateInfo.parameterList, [
      { name: 'member_count', value: '2' },
      { name: 'room_limit', value: '8' }
    ]);
  } finally {
    Date.now = originalNow;
  }
});

test('addPlayers respects fixed rotation quota after ignoring existing and batch duplicates', async () => {
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
                    data: {
                      ...buildTournament(),
                      presetKey: 'rotation_6',
                      playerLimit: 6,
                      players: [
                        { id: 'u_admin', name: '管理员', gender: 'male' },
                        { id: 'u_1', name: '已在名单', gender: 'female' },
                        { id: 'u_2', name: '球友2', gender: 'male' },
                        { id: 'u_3', name: '球友3', gender: 'female' }
                      ]
                    }
                  };
                }
              };
            },
            where() {
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
  const { main } = loadMain(db, {
    crypto: {
      randomBytes() {
        return Buffer.from('1234567890abcdef', 'hex');
      }
    }
  });

  const result = await main({
    tournamentId: 't_1',
    players: [
      { name: '已在名单', gender: 'male' },
      { name: '新球友A', gender: 'male' },
      { name: '新球友A', gender: 'female' },
      { name: '新球友B', gender: 'female' }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.addedCount, 2);
  assert.equal(result.duplicateCount, 2);
  assert.equal(writtenData.players.length, 6);
  assert.equal(Object.hasOwn(writtenData, 'lastClientRequestId'), false);
  assert.equal(Object.hasOwn(writtenData, 'lastAddPlayersCounts'), false);
});

test('addPlayers rejects the whole import when fixed rotation quota would be exceeded', async () => {
  let updateCalled = false;
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
                    data: {
                      ...buildTournament(),
                      presetKey: 'rotation_6',
                      playerLimit: 6,
                      players: [
                        { id: 'u_admin', name: '管理员', gender: 'male' },
                        { id: 'u_1', name: '球友1', gender: 'female' },
                        { id: 'u_2', name: '球友2', gender: 'male' },
                        { id: 'u_3', name: '球友3', gender: 'female' },
                        { id: 'u_4', name: '球友4', gender: 'male' }
                      ]
                    }
                  };
                }
              };
            },
            where() {
              updateCalled = true;
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    players: [
      { name: '新球友A', gender: 'male' },
      { name: '新球友B', gender: 'female' }
    ],
    __traceId: 'trace-add-limit'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PLAYER_LIMIT_EXCEEDED');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '该赛制剩余名额 1 人，本次导入 2 人，未导入');
  assert.equal(updateCalled, false);
});

test('addPlayers returns structured invalid result for missing tournamentId', async () => {
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
    players: [{ name: '球友A', gender: 'male' }],
    __traceId: 'trace-add-missing-id'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'TOURNAMENT_ID_REQUIRED',
    message: '缺少 tournamentId',
    state: 'invalid',
    traceId: 'trace-add-missing-id',
    data: {}
  });
});

test('addPlayers returns structured invalid result for missing names payload', async () => {
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
    names: '   ',
    __traceId: 'trace-add-missing-names'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'NAMES_REQUIRED',
    message: '缺少 names',
    state: 'invalid',
    traceId: 'trace-add-missing-names',
    data: {}
  });
});

test('addPlayers returns structured conflict result when optimistic update loses the race', async () => {
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
    players: [{ name: '球友A', gender: 'male' }],
    __traceId: 'trace-add-conflict'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '写入冲突，请重试',
    state: 'conflict',
    traceId: 'trace-add-conflict',
    data: {}
  });
});

test('addPlayers replays the first import result for a repeated clientRequestId', async () => {
  let updateCalled = false;
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
                    data: {
                      ...buildTournament(),
                      lastClientRequestId: 'req_add_1',
                      lastAddPlayersCounts: {
                        added: 2,
                        addedCount: 2,
                        maleCount: 1,
                        femaleCount: 1,
                        unknownCount: 0,
                        duplicateCount: 1,
                        invalidCount: 1
                      }
                    }
                  };
                }
              };
            },
            where() {
              updateCalled = true;
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    players: [{ name: '球友A', gender: 'male' }],
    clientRequestId: 'req_add_1',
    __traceId: 'trace-add-retry'
  });

  assert.deepEqual(result, {
    traceId: 'trace-add-retry',
    state: 'deduped',
    deduped: true,
    clientRequestId: 'req_add_1',
    added: 2,
    addedCount: 2,
    maleCount: 1,
    femaleCount: 1,
    unknownCount: 0,
    duplicateCount: 1,
    invalidCount: 1,
    duplicateNames: [],
    invalidNames: [],
    ok: true,
    code: 'PLAYERS_ADDED_DEDUPED',
    message: '名单导入已处理',
    data: {
      deduped: true,
      clientRequestId: 'req_add_1',
      added: 2,
      addedCount: 2,
      maleCount: 1,
      femaleCount: 1,
      unknownCount: 0,
      duplicateCount: 1,
      invalidCount: 1,
      duplicateNames: [],
      invalidNames: []
    }
  });
  assert.equal(updateCalled, false);
});

for (const apiOutcome of ['success', 'failure']) {
  test('addPlayers returns the committed result when ' + apiOutcome + ' share diagnostics never settle', async () => {
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
              assert.deepEqual(query, { _id: 't_1', version: 2 });
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
    const pending = main({ tournamentId: 't_1', names: '新队员' });
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
      assert.equal(result.code, 'PLAYERS_ADDED');
      assert.equal(result.state, 'updated');
      assert.equal(writtenData.players.length, 2);
      assert.equal(writtenData.players[1].name, '新队员');
    } finally {
      clearTimeout(guard);
      releaseDiagnostic();
      await pending;
    }
  });
}

for (const gate of ['budget is exhausted', 'replayed request', 'draft-only refusal']) {
  test('addPlayers skips optional share when ' + gate, async () => {
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
      tournament.lastClientRequestId = 'req_replay';
      tournament.lastAddPlayersCounts = { added: 1 };
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
              assert.deepEqual(query, { _id: 't_1', version: 2 });
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
      const result = await main({ tournamentId: 't_1', names: '新队员', ...(gate === 'replayed request' ? { clientRequestId: 'req_replay' } : {}) });
      assert.equal(transactionCommitted, true);
      assert.equal(apiCalls, 0);
      assert.equal(diagnosticCalls, 0);
      if (gate === 'budget is exhausted') {
        assert.equal(updateCount, 1);
        assert.equal(result.ok, true);
        assert.equal(result.code, 'PLAYERS_ADDED');
        assert.equal(result.state, 'updated');
      } else {
        assert.equal(updateCount, 0);
        assert.equal(result.ok, gate === 'replayed request');
        assert.equal(result.state, gate === 'replayed request' ? 'deduped' : 'forbidden');
      }
    } finally { Date.now = originalNow; }
  });
}
