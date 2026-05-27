const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/manageActivityId/index.js');
const commonPath = require.resolve('../cloudfunctions/manageActivityId/lib/common.js');
const modePath = require.resolve('../cloudfunctions/manageActivityId/lib/mode.js');
const shareActivityPath = require.resolve('../cloudfunctions/manageActivityId/lib/share-activity.js');
const playerPath = require.resolve('../cloudfunctions/manageActivityId/lib/player.js');

function loadMain(db, openapi = {}, options = {}) {
  const originalLoad = Module._load;
  const openid = options.openid || 'u_share';
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: openid };
    },
    openapi: {
      updatableMessage: openapi
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];
  delete require.cache[shareActivityPath];
  delete require.cache[playerPath];

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
    playerLimit: 8,
    players: [{ id: 'u_admin', name: '管理员' }],
    ...extra
  };
}

function createDbHarness(options = {}) {
  const calls = {
    read: 0,
    txRead: 0,
    update: 0,
    updatePayload: null
  };
  const db = {
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
              calls.read += 1;
              return { data: options.initialTournament };
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
                  calls.txRead += 1;
                  return { data: options.transactionTournament || options.initialTournament };
                },
                async update(payload) {
                  calls.update += 1;
                  calls.updatePayload = payload;
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  return { db, calls };
}

test('manageActivityId returns structured failure for missing tournamentId', async () => {
  const { db } = createDbHarness({ initialTournament: buildTournament() });
  const { main } = loadMain(db);

  const result = await main({});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOURNAMENT_ID_REQUIRED');
  assert.equal(result.state, 'invalid');
});

test('manageActivityId refuses non-draft and no-limit tournaments without creating activity', async () => {
  let createCalled = 0;
  const openapi = {
    async createActivityId() {
      createCalled += 1;
      return { activityId: 'should_not_create' };
    }
  };

  {
    const { db } = createDbHarness({ initialTournament: buildTournament({ status: 'running' }) });
    const { main } = loadMain(db, openapi);
    const result = await main({ tournamentId: 't_1' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SHARE_ACTIVITY_DRAFT_ONLY');
  }

  {
    const { db } = createDbHarness({ initialTournament: buildTournament({ playerLimit: 0 }) });
    const { main } = loadMain(db, openapi);
    const result = await main({ tournamentId: 't_1' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SHARE_ACTIVITY_LIMIT_REQUIRED');
  }

  assert.equal(createCalled, 0);
});

test('manageActivityId reuses existing unexpired draft activity', async () => {
  let createCalled = false;
  const expireAtMs = Date.now() + 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament({
      shareActivityId: 'act_existing',
      shareActivityExpireAtMs: expireAtMs,
      shareActivityState: 0,
      shareActivityVersionType: 'trial'
    })
  });
  const { main } = loadMain(db, {
    async createActivityId() {
      createCalled = true;
      return { activityId: 'act_new' };
    }
  }, { openid: 'u_admin' });

  const result = await main({ tournamentId: 't_1', versionType: 'trial' });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SHARE_ACTIVITY_READY');
  assert.equal(result.activityId, 'act_existing');
  assert.equal(result.activityExpireTime, expireAtMs);
  assert.equal(createCalled, false);
  assert.equal(calls.update, 0);
});

test('manageActivityId creates and persists a new activity when existing one is expired', async () => {
  const originalNow = Date.now;
  Date.now = () => 1700000000000;
  const expireAtSeconds = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament({
      shareActivityId: 'act_expired',
      shareActivityExpireAtMs: Date.now() - 1000,
      shareActivityState: 0,
      shareActivityVersionType: 'release'
    })
  });
  const { main } = loadMain(db, {
    async createActivityId() {
      return { activityId: 'act_new', expirationTime: expireAtSeconds };
    }
  }, { openid: 'u_admin' });

  try {
    const result = await main({ tournamentId: 't_1', versionType: 'develop' });

    assert.equal(result.ok, true);
    assert.equal(result.activityId, 'act_new');
    assert.equal(result.activityExpireTime, expireAtSeconds * 1000);
    assert.equal(calls.update, 1);
    assert.equal(calls.updatePayload.data.shareActivityId, 'act_new');
    assert.equal(calls.updatePayload.data.shareActivityExpireAtMs, expireAtSeconds * 1000);
    assert.equal(calls.updatePayload.data.shareActivityState, 0);
    assert.equal(calls.updatePayload.data.shareActivityVersionType, 'develop');
    assert.equal(Object.prototype.hasOwnProperty.call(calls.updatePayload.data, 'version'), false);
  } finally {
    Date.now = originalNow;
  }
});

test('manageActivityId returns already committed activity when another share wins the race', async () => {
  let createCalled = 0;
  const expireAtMs = Date.now() + 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament(),
    transactionTournament: buildTournament({
      shareActivityId: 'act_winner',
      shareActivityExpireAtMs: expireAtMs,
      shareActivityState: 0,
      shareActivityVersionType: 'release'
    })
  });
  const { main } = loadMain(db, {
    async createActivityId() {
      createCalled += 1;
      return { activityId: 'act_orphan', expirationTime: Math.floor(expireAtMs / 1000) };
    }
  }, { openid: 'u_admin' });

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.activityId, 'act_winner');
  assert.equal(createCalled, 1);
  assert.equal(calls.update, 0);
});

test('manageActivityId checkOnly returns existing unexpired draft activity', async () => {
  const expireAtMs = Date.now() + 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament({
      shareActivityId: 'act_existing',
      shareActivityExpireAtMs: expireAtMs,
      shareActivityState: 0,
      shareActivityVersionType: 'trial'
    })
  });
  const { main } = loadMain(db, {}, { openid: 'u_admin' });
  const result = await main({ action: 'checkOnly', tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.activityId, 'act_existing');
  assert.equal(result.activityExpireTime, expireAtMs);
  assert.equal(calls.update, 0);
});

test('manageActivityId checkOnly returns not_ready when no usable activityId', async () => {
  const { db } = createDbHarness({ initialTournament: buildTournament() });
  const { main } = loadMain(db, {}, { openid: 'u_admin' });
  const result = await main({ action: 'checkOnly', tournamentId: 't_1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARE_ACTIVITY_NOT_READY');
  assert.equal(result.state, 'not_ready');
});

test('manageActivityId checkOnly refuses non-draft tournaments', async () => {
  const { db } = createDbHarness({
    initialTournament: buildTournament({ status: 'running' })
  });
  const { main } = loadMain(db);
  const result = await main({ action: 'checkOnly', tournamentId: 't_1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARE_ACTIVITY_DRAFT_ONLY');
});

test('manageActivityId store persists client-provided activityId', async () => {
  const expireAtMs = Date.now() + 24 * 60 * 60 * 1000;
  const { db, calls } = createDbHarness({ initialTournament: buildTournament() });
  const { main } = loadMain(db, {}, { openid: 'u_admin' });
  const result = await main({
    action: 'store',
    tournamentId: 't_1',
    activityId: 'act_client',
    expirationTime: expireAtMs,
    versionType: 'trial'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SHARE_ACTIVITY_STORED');
  assert.equal(result.activityId, 'act_client');
  assert.equal(calls.update, 1);
  assert.equal(calls.updatePayload.data.shareActivityId, 'act_client');
  assert.equal(calls.updatePayload.data.shareActivityState, 0);
  assert.equal(calls.updatePayload.data.shareActivityVersionType, 'trial');
});

test('manageActivityId store returns winner when concurrent store already committed', async () => {
  const winnerExpireAtMs = Date.now() + 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament(),
    transactionTournament: buildTournament({
      shareActivityId: 'act_winner',
      shareActivityExpireAtMs: winnerExpireAtMs,
      shareActivityState: 0,
      shareActivityVersionType: 'release'
    })
  });
  const { main } = loadMain(db, {}, { openid: 'u_admin' });
  const result = await main({
    action: 'store',
    tournamentId: 't_1',
    activityId: 'act_late_xyz',
    expirationTime: Date.now() + 24 * 60 * 60 * 1000,
    versionType: 'release'
  });

  assert.equal(result.ok, true);
  assert.equal(result.activityId, 'act_winner');
  assert.equal(calls.update, 0);
});

test('manageActivityId store rejects missing activityId', async () => {
  const { db } = createDbHarness({ initialTournament: buildTournament() });
  const { main } = loadMain(db);
  const result = await main({ action: 'store', tournamentId: 't_1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ACTIVITY_ID_REQUIRED');
});

test('manageActivityId store allows playerIds participant', async () => {
  const expireAtMs = Date.now() + 24 * 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament({
      players: [{ id: 'u_admin', name: '管理员' }],
      playerIds: ['u_player']
    })
  });
  const { main } = loadMain(db, {}, { openid: 'u_player' });

  const result = await main({
    action: 'store',
    tournamentId: 't_1',
    activityId: 'opaque.id:=123',
    expirationTime: expireAtMs
  });

  assert.equal(result.ok, true);
  assert.equal(result.activityId, 'opaque.id:=123');
  assert.equal(calls.update, 1);
  assert.equal(calls.updatePayload.data.shareActivityId, 'opaque.id:=123');
  assert.equal(calls.updatePayload.data.shareActivityExpireAtMs, expireAtMs);
});

test('manageActivityId store allows legacy playerId and _id participants', async () => {
  const expireAtMs = Date.now() + 24 * 60 * 60 * 1000;

  {
    const { db, calls } = createDbHarness({
      initialTournament: buildTournament({
        players: [{ playerId: 'u_legacy_player' }]
      })
    });
    const { main } = loadMain(db, {}, { openid: 'u_legacy_player' });
    const result = await main({
      action: 'store',
      tournamentId: 't_1',
      activityId: 'legacy.player:=1',
      expirationTime: expireAtMs
    });

    assert.equal(result.ok, true);
    assert.equal(calls.updatePayload.data.shareActivityId, 'legacy.player:=1');
  }

  {
    const { db, calls } = createDbHarness({
      initialTournament: buildTournament({
        players: [{ _id: 'u_legacy_id' }]
      })
    });
    const { main } = loadMain(db, {}, { openid: 'u_legacy_id' });
    const result = await main({
      action: 'store',
      tournamentId: 't_1',
      activityId: 'legacy.id:=123',
      expirationTime: expireAtMs
    });

    assert.equal(result.ok, true);
    assert.equal(calls.updatePayload.data.shareActivityId, 'legacy.id:=123');
  }
});

test('manageActivityId denies dynamic share preparation for non-participant', async () => {
  const expireAtMs = Date.now() + 24 * 60 * 60 * 1000;

  {
    const { db } = createDbHarness({ initialTournament: buildTournament() });
    const { main } = loadMain(db, {}, { openid: 'u_stranger' });
    const result = await main({ action: 'checkOnly', tournamentId: 't_1' });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'PERMISSION_DENIED');
    assert.equal(result.state, 'forbidden');
  }

  {
    const { db, calls } = createDbHarness({ initialTournament: buildTournament() });
    const { main } = loadMain(db, {}, { openid: 'u_stranger' });
    const result = await main({
      action: 'store',
      tournamentId: 't_1',
      activityId: 'opaque.id:=123',
      expirationTime: expireAtMs
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'PERMISSION_DENIED');
    assert.equal(calls.txRead, 0);
    assert.equal(calls.update, 0);
  }

  {
    let createCalled = 0;
    const { db, calls } = createDbHarness({ initialTournament: buildTournament() });
    const { main } = loadMain(db, {
      async createActivityId() {
        createCalled += 1;
        return { activityId: 'should_not_create', expirationTime: expireAtMs };
      }
    }, { openid: 'u_stranger' });
    const result = await main({ tournamentId: 't_1' });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'PERMISSION_DENIED');
    assert.equal(createCalled, 0);
    assert.equal(calls.update, 0);
  }
});

test('manageActivityId store rechecks participant permission inside transaction', async () => {
  const expireAtMs = Date.now() + 24 * 60 * 60 * 1000;
  const { db, calls } = createDbHarness({
    initialTournament: buildTournament({
      playerIds: ['u_player']
    }),
    transactionTournament: buildTournament({
      playerIds: [],
      players: [{ id: 'u_admin', name: '管理员' }]
    })
  });
  const { main } = loadMain(db, {}, { openid: 'u_player' });

  const result = await main({
    action: 'store',
    tournamentId: 't_1',
    activityId: 'opaque.id:=123',
    expirationTime: expireAtMs
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
  assert.equal(calls.txRead, 1);
  assert.equal(calls.update, 0);
});

test('manageActivityId store validates opaque activityId and expiration bounds', async () => {
  const validExpireAtMs = Date.now() + 24 * 60 * 60 * 1000;
  const cases = [
    {
      payload: { activityId: 'too_short', expirationTime: validExpireAtMs },
      code: 'ACTIVITY_ID_INVALID'
    },
    {
      payload: { activityId: 'a'.repeat(513), expirationTime: validExpireAtMs },
      code: 'ACTIVITY_ID_INVALID'
    },
    {
      payload: { activityId: 'opaque id 123', expirationTime: validExpireAtMs },
      code: 'ACTIVITY_ID_INVALID'
    },
    {
      payload: { activityId: 'opaque\nid123', expirationTime: validExpireAtMs },
      code: 'ACTIVITY_ID_INVALID'
    },
    {
      payload: { activityId: 'opaque.id:=123', expirationTime: Date.now() + 30 * 1000 },
      code: 'EXPIRATION_INVALID'
    },
    {
      payload: { activityId: 'opaque.id:=123', expirationTime: Date.now() + 49 * 60 * 60 * 1000 },
      code: 'EXPIRATION_INVALID'
    },
    {
      payload: { activityId: 'opaque.id:=123', expirationTime: 0 },
      code: 'EXPIRATION_INVALID'
    }
  ];

  for (const item of cases) {
    const { db, calls } = createDbHarness({ initialTournament: buildTournament() });
    const { main } = loadMain(db, {}, { openid: 'u_admin' });
    const result = await main({
      action: 'store',
      tournamentId: 't_1',
      ...item.payload
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, item.code);
    assert.equal(result.state, 'invalid');
    assert.equal(calls.update, 0);
  }
});
