const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const submitScoreIndexPath = require.resolve('../cloudfunctions/submitScore/index.js');
const submitScoreCommonPath = require.resolve('../cloudfunctions/submitScore/lib/common.js');
const submitScoreLogicPath = require.resolve('../cloudfunctions/submitScore/logic.js');
const submitScorePermissionPath = require.resolve('../cloudfunctions/submitScore/lib/permission.js');
const submitScorePlayerPath = require.resolve('../cloudfunctions/submitScore/lib/player.js');
const submitScoreModePath = require.resolve('../cloudfunctions/submitScore/lib/mode.js');
const submitScoreRankingCorePath = require.resolve('../cloudfunctions/submitScore/lib/rankingCore.js');
const submitScoreScorePath = require.resolve('../cloudfunctions/submitScore/lib/score.js');
const submitScoreShareActivityPath = require.resolve('../cloudfunctions/submitScore/lib/share-activity.js');

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'running',
    version: 1,
    players: [
      { id: 'u_admin', name: '管理员' },
      { id: 'u_b', name: '球友B' },
      { id: 'u_c', name: '球友C' },
      { id: 'u_d', name: '球友D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'pending',
        teamA: ['u_admin', 'u_b'],
        teamB: ['u_c', 'u_d']
      }]
    }]
  };
}

function loadSubmitScoreMain(db, options = {}) {
  const originalLoad = Module._load;
  const openid = String(options.openid || 'u_admin');
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

  delete require.cache[submitScoreIndexPath];
  delete require.cache[submitScoreCommonPath];
  delete require.cache[submitScoreLogicPath];
  delete require.cache[submitScorePermissionPath];
  delete require.cache[submitScorePlayerPath];
  delete require.cache[submitScoreModePath];
  delete require.cache[submitScoreRankingCorePath];
  delete require.cache[submitScoreScorePath];
  delete require.cache[submitScoreShareActivityPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(submitScoreIndexPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createDbHarness(lockGetImpl, options = {}) {
  const tournamentFactory = typeof options.tournamentFactory === 'function' ? options.tournamentFactory : buildTournament;
  const calls = {
    tournamentGet: 0,
    lockGet: 0,
    update: 0,
    diagnosticUpdate: 0,
    remove: 0,
    updatePayloads: [],
    diagnosticUpdatePayloads: []
  };
  const db = {
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
      if (name === 'tournaments') {
        return {
          doc(id) {
            assert.equal(id, 't_1');
            return {
            async get() {
              calls.tournamentGet += 1;
              return { data: tournamentFactory() };
            },
            async update(payload) {
              calls.diagnosticUpdate += 1;
              calls.diagnosticUpdatePayloads.push(payload);
              return { stats: { updated: 1 } };
            }
          };
        },
          where(query) {
            const expectedVersion = Number(tournamentFactory().version) || 1;
            assert.deepEqual(query, { _id: 't_1', version: expectedVersion });
            return {
              async update(payload) {
                calls.update += 1;
                calls.updatePayloads.push(payload);
                return { stats: { updated: options.updatedCount === undefined ? 1 : options.updatedCount } };
              }
            };
          }
        };
      }
      if (name === 'score_locks') {
        return {
          doc(id) {
            assert.equal(id, 't_1_0_0');
            return {
              async get() {
                calls.lockGet += 1;
                return lockGetImpl(id);
              },
              async remove() {
                calls.remove += 1;
              }
            };
          }
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }
  };
  return { db, calls };
}

test('submitScore returns LOCK_EXPIRED when score lock document is missing', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('document.get:fail document does not exist');
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'LOCK_EXPIRED',
    message: '录分会话已过期，请重新开始录分',
    state: 'expired',
    traceId: '',
    data: {}
  });
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore rejects an expired lock without writing water or releasing the lock', async () => {
  const expireAt = Date.now() - 1;
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
    })
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 2
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'LOCK_EXPIRED',
    message: '录分会话已过期，请重新开始录分',
    state: 'expired',
    traceId: '',
    expireAt,
    data: { expireAt }
  });
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore returns VERSION_CONFLICT when optimistic update reports updated: 0', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    updatedCount: 0,
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
    })
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 2
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '写入冲突，请刷新赛事后重试',
    state: 'conflict',
    traceId: '',
    data: {}
  });
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.remove, 0);
});

test('submitScore returns LOCK_OCCUPIED when another scorer owns the lock', async () => {
  const expireAt = Date.now() + 60_000;
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_b',
      ownerName: '球友B',
      expireAt
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
    })
  });
  const { main } = loadSubmitScoreMain(db, { openid: 'u_admin' });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 2
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'LOCK_OCCUPIED',
    message: '当前有人正在录入比分',
    state: 'occupied',
    traceId: '',
    ownerId: 'u_b',
    ownerName: '球友B',
    remainingMs: result.remainingMs,
    expireAt,
    data: {
      ownerId: 'u_b',
      ownerName: '球友B',
      remainingMs: result.remainingMs,
      expireAt
    }
  });
  assert.equal(typeof result.remainingMs, 'number');
  assert.ok(result.remainingMs > 0);
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore treats same-score finished submit by another participant as deduped no-op', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read for same-score no-op');
  }, {
    tournamentFactory: () => {
      const t = buildTournament();
      t.rounds[0].matches[0] = {
        ...t.rounds[0].matches[0],
        status: 'finished',
        score: { teamA: 21, teamB: 19 },
        scorerId: 'u_admin',
        scorerName: '管理员'
      };
      return t;
    }
  });
  const { main } = loadSubmitScoreMain(db, { openid: 'u_b' });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    clientRequestId: 'req_same_score'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SCORE_SUBMIT_DEDUPED');
  assert.equal(result.state, 'deduped');
  assert.equal(result.clientRequestId, 'req_same_score');
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore lets participants overwrite a finished score when they hold the lock', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_b',
      ownerName: '球友B',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => {
      const t = buildTournament();
      t.rounds[0].matches[0] = {
        ...t.rounds[0].matches[0],
        status: 'finished',
        score: { teamA: 21, teamB: 19 },
        scorerId: 'u_admin',
        scorerName: '管理员'
      };
      return t;
    }
  });
  const { main } = loadSubmitScoreMain(db, { openid: 'u_b' });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 18,
    scoreB: 21
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SCORE_SUBMITTED');
  assert.equal(result.scorerName, '球友B');
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.remove, 1);
  const writtenMatch = calls.updatePayloads[0].data.rounds[0].matches[0];
  assert.deepEqual(writtenMatch.score, { teamA: 18, teamB: 21 });
  assert.equal(writtenMatch.scorerId, 'u_b');
  assert.equal(writtenMatch.scorerName, '球友B');
});

test('submitScore stores water snapshot in the same optimistic update as score', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
    })
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 2
  });

  assert.equal(result.ok, true);
  assert.equal(calls.update, 1);
  const writtenMatch = calls.updatePayloads[0].data.rounds[0].matches[0];
  assert.deepEqual(writtenMatch.score, { teamA: 21, teamB: 19 });
  assert.deepEqual(writtenMatch.water, {
    unitsPerLoser: 2
  });
  assert.ok(Array.isArray(calls.updatePayloads[0].data.rankings));
});

test('submitScore uses configured default when an enabled client omits water units', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 2 } }
    })
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.updatePayloads[0].data.rounds[0].matches[0].water, {
    unitsPerLoser: 2
  });
});

test('submitScore dedupes same score and same water without reading a lock', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read for same score and water');
  }, {
    tournamentFactory: () => {
      const tournament = buildTournament();
      tournament.mode = 'multi_rotate';
      tournament.rules = { water: { enabled: true, defaultUnitsPerLoser: 1 } };
      tournament.rounds[0].matches[0] = {
        ...tournament.rounds[0].matches[0],
        status: 'finished',
        score: { teamA: 21, teamB: 19 },
        water: { unitsPerLoser: 1 },
        scorerName: '管理员'
      };
      return tournament;
    }
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 1
  });

  assert.equal(result.code, 'SCORE_SUBMIT_DEDUPED');
  assert.equal(result.state, 'deduped');
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
});

test('submitScore updates same score when water units changed instead of deduping', async () => {
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_b',
      ownerName: '球友B',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => {
      const tournament = buildTournament();
      tournament.mode = 'multi_rotate';
      tournament.rules = { water: { enabled: true, defaultUnitsPerLoser: 1 } };
      tournament.rounds[0].matches[0] = {
        ...tournament.rounds[0].matches[0],
        status: 'finished',
        score: { teamA: 21, teamB: 19 },
        water: { unitsPerLoser: 1 },
        scorerId: 'u_admin',
        scorerName: '管理员'
      };
      return tournament;
    }
  });
  const { main } = loadSubmitScoreMain(db, { openid: 'u_b' });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 2
  });

  assert.equal(result.code, 'SCORE_SUBMITTED');
  assert.equal(calls.lockGet, 1);
  assert.equal(calls.update, 1);
  assert.deepEqual(calls.updatePayloads[0].data.rounds[0].matches[0].water, {
    unitsPerLoser: 2
  });
});

test('submitScore rejects invalid water units before reading a score lock', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read for invalid water input');
  }, {
    tournamentFactory: () => ({
      ...buildTournament(),
      mode: 'multi_rotate',
      rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
    })
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 3
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'WATER_UNITS_INVALID',
    message: '打水瓶数仅支持 0、1、2',
    state: 'invalid',
    traceId: '',
    data: {}
  });
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
});

test('submitScore rejects explicit water input when the feature is disabled', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read when water is disabled');
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19,
    waterUnitsPerLoser: 1
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'WATER_NOT_ENABLED',
    message: '当前赛事未开启打水记账',
    state: 'invalid',
    traceId: '',
    data: {}
  });
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
});

test('submitScore marks and updates active share activity when tournament finishes', async () => {
  const openapiCalls = [];
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      shareActivityId: 'act_finish',
      shareActivityExpireAtMs: Date.now() + 120_000,
      shareActivityState: 1,
      shareActivityVersionType: 'release'
    })
  });
  const { main } = loadSubmitScoreMain(db, {
    openapi: {
      async setUpdatableMsg(payload) {
        openapiCalls.push(payload);
      }
    }
  });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.equal(result.ok, true);
  assert.equal(result.finished, true);
  assert.equal(calls.updatePayloads[0].data.shareActivityState, 2);
  assert.deepEqual(calls.updatePayloads[0].data.shareActivityUpdatedAt, { $serverDate: true });
  assert.deepEqual(openapiCalls, [{
    activityId: 'act_finish',
    targetState: 2
  }]);
  assert.equal(calls.diagnosticUpdate, 1);
  assert.deepEqual(calls.diagnosticUpdatePayloads[0].data, {
    shareActivityLastError: { $remove: true },
    shareActivityLastErrorCode: { $remove: true },
    shareActivityLastErrorMsg: { $remove: true },
    shareActivityLastErrorAt: { $remove: true }
  });
});

test('submitScore records share activity diagnostics when finished update is rejected by openapi', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const { db, calls } = createDbHarness(async () => ({
    data: {
      ownerId: 'u_admin',
      ownerName: '管理员',
      expireAt: Date.now() + 60_000
    }
  }), {
    tournamentFactory: () => ({
      ...buildTournament(),
      shareActivityId: 'act_finish',
      shareActivityExpireAtMs: Date.now() + 120_000,
      shareActivityState: 1,
      shareActivityVersionType: 'release'
    })
  });
  const { main } = loadSubmitScoreMain(db, {
    openapi: {
      async setUpdatableMsg() {
        const err = new Error('updatableMessage.setUpdatableMsg:fail 47502 invalid target_state');
        err.errCode = 47502;
        throw err;
      }
    }
  });

  try {
    const result = await main({
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      scoreA: 21,
      scoreB: 19
    });

    assert.equal(result.ok, true);
    assert.equal(result.finished, true);
    assert.equal(calls.updatePayloads[0].data.shareActivityState, 2);
    assert.equal(calls.diagnosticUpdate, 1);
    assert.deepEqual(calls.diagnosticUpdatePayloads[0].data, {
      shareActivityLastError: 'updatableMessage.setUpdatableMsg:fail 47502 invalid target_state',
      shareActivityLastErrorCode: '47502',
      shareActivityLastErrorMsg: 'updatableMessage.setUpdatableMsg:fail 47502 invalid target_state',
      shareActivityLastErrorAt: { $serverDate: true }
    });
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /setUpdatableMsg failed/);
  } finally {
    console.warn = originalWarn;
  }
});

test('submitScore keeps canceled matches non-editable', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read for canceled match');
  }, {
    tournamentFactory: () => {
      const t = buildTournament();
      t.rounds[0].matches[0] = {
        ...t.rounds[0].matches[0],
        status: 'canceled'
      };
      return t;
    }
  });
  const { main } = loadSubmitScoreMain(db, { openid: 'u_b' });

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 18,
    scoreB: 21
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MATCH_CANCELED');
  assert.equal(result.state, 'canceled');
  assert.equal(result.message, '该场已结束');
  assert.equal(calls.tournamentGet, 1);
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
  assert.equal(calls.remove, 0);
});

test('submitScore preserves finished water snapshot when an older client omits water units', async () => {
  const { db, calls } = createDbHarness(async () => {
    throw new Error('lock should not be read for a legacy idempotent retry');
  }, {
    tournamentFactory: () => {
      const tournament = buildTournament();
      tournament.mode = 'multi_rotate';
      tournament.rules = { water: { enabled: true, defaultUnitsPerLoser: 2 } };
      tournament.rounds[0].matches[0] = {
        ...tournament.rounds[0].matches[0],
        status: 'finished',
        score: { teamA: 21, teamB: 19 },
        water: { unitsPerLoser: 1 },
        scorerId: 'u_admin',
        scorerName: '管理员'
      };
      return tournament;
    }
  });
  const { main } = loadSubmitScoreMain(db);

  const result = await main({
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 21,
    scoreB: 19
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SCORE_SUBMIT_DEDUPED');
  assert.equal(calls.lockGet, 0);
  assert.equal(calls.update, 0);
});
