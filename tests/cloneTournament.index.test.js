const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/cloneTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/cloneTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/cloneTournament/lib/mode.js');
const logicPath = require.resolve('../cloudfunctions/cloneTournament/logic.js');

function buildSourceTournament() {
  return {
    _id: 't_source',
    creatorId: 'u_creator',
    name: '周三双打',
    status: 'running',
    mode: 'fixed_pair_rr',
    allowOpenTeam: false,
    settingsConfigured: true,
    totalMatches: 10,
    courts: 2,
    rules: {
      gamesPerMatch: 1,
      pointsPerGame: 21,
      endCondition: { type: 'total_matches', target: 10 }
    },
    players: [
      { id: 'u_creator', name: '管理员', type: 'user', gender: 'male' },
      { id: 'p_2', name: '球友B', type: 'guest', gender: 'female' }
    ],
    pairTeams: [
      { id: 'team_1', name: '一队', playerIds: ['u_creator', 'p_2'], locked: true }
    ]
  };
}

function loadMain(db, stubs = {}) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: stubs.openid || 'u_creator' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];
  delete require.cache[logicPath];

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

async function cloneAndCapture(sourceOverrides = {}) {
  let addedData = null;
  const source = {
    ...buildSourceTournament(),
    players: [
      { id: 'u_creator', name: '管理员', type: 'user', gender: 'male' }
    ],
    pairTeams: [],
    ...sourceOverrides
  };
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_source');
          return {
            async get() {
              return { data: source };
            }
          };
        },
        async add(payload) {
          addedData = payload.data;
          return { _id: 't_copy' };
        }
      };
    }
  };
  const { main } = loadMain(db);
  const result = await main({ sourceTournamentId: 't_source' });
  return { result, addedData };
}

test('cloneTournament index creates a new draft copy with remapped pair teams', async () => {
  const originalNow = Date.now;
  let addedData = null;

  Date.now = () => 1700000000000;

  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_source');
          return {
            async get() {
              return { data: buildSourceTournament() };
            }
          };
        },
        async add(payload) {
          addedData = payload.data;
          return { _id: 't_copy' };
        }
      };
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
    const result = await main({ sourceTournamentId: 't_source' });

    assert.deepEqual(result, {
      ok: true,
      code: 'TOURNAMENT_CLONED',
      message: '已复制赛事',
      state: 'created',
      traceId: '',
      tournamentId: 't_copy',
      data: { tournamentId: 't_copy' }
    });
    assert.equal(addedData.status, 'draft');
    assert.equal(addedData.name, '周三双打（副本）');
    assert.equal(addedData.settingsConfigured, true);
    assert.equal(addedData.totalMatches, 10);
    assert.equal(addedData.courts, 2);
    assert.deepEqual(addedData.rules, buildSourceTournament().rules);
    assert.equal(addedData.players[0].id, 'u_creator');
    assert.equal(addedData.players[1].id, 'guest_1700000000000_1_1234567890abcdef');
    assert.deepEqual(addedData.pairTeams, [{
      id: 'team_1',
      name: '一队',
      playerIds: ['u_creator', 'guest_1700000000000_1_1234567890abcdef'],
      locked: true
    }]);
    assert.deepEqual(addedData.rounds, []);
  } finally {
    Date.now = originalNow;
  }
});

test('cloneTournament preserves canonical rotation presets and derives player limits', async (t) => {
  const cases = [
    [' ROTATION_6 ', 'rotation_6', 6],
    ['rotation_7', 'rotation_7', 7],
    ['rotation_8', 'rotation_8', 8]
  ];

  for (const [sourcePresetKey, canonicalPresetKey, playerLimit] of cases) {
    await t.test(canonicalPresetKey, async () => {
      const { result, addedData } = await cloneAndCapture({
        mode: 'multi_rotate',
        presetKey: sourcePresetKey,
        playerLimit: 999
      });

      assert.equal(result.code, 'TOURNAMENT_CLONED');
      assert.equal(addedData.presetKey, canonicalPresetKey);
      assert.equal(addedData.playerLimit, playerLimit);
    });
  }
});

test('cloneTournament normalizes custom, missing, and unknown rotation presets', async (t) => {
  const cases = [
    ['custom', 'custom'],
    ['missing', undefined],
    ['unknown', 'rotation_99']
  ];

  for (const [label, presetKey] of cases) {
    await t.test(label, async () => {
      const { addedData } = await cloneAndCapture({
        mode: 'multi_rotate',
        presetKey,
        playerLimit: 999
      });

      assert.equal(addedData.presetKey, 'custom');
      assert.equal(Object.prototype.hasOwnProperty.call(addedData, 'playerLimit'), false);
    });
  }
});

test('cloneTournament does not add rotation preset fields to non rotation modes', async (t) => {
  for (const mode of ['squad_doubles', 'fixed_pair_rr']) {
    await t.test(mode, async () => {
      const { addedData } = await cloneAndCapture({
        mode,
        presetKey: 'rotation_6',
        playerLimit: 999
      });

      assert.equal(Object.prototype.hasOwnProperty.call(addedData, 'presetKey'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(addedData, 'playerLimit'), false);
    });
  }
});

test('cloneTournament preserves valid multi_rotate water rules while clearing rounds', async () => {
  let addedData = null;
  const source = {
    ...buildSourceTournament(),
    name: '周末多人转',
    mode: 'multi_rotate',
    pairTeams: [],
    rules: {
      ...buildSourceTournament().rules,
      water: { enabled: true, defaultUnitsPerLoser: 2 }
    },
    rounds: [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'finished' }] }]
  };
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_source');
          return {
            async get() {
              return { data: source };
            }
          };
        },
        async add(payload) {
          addedData = payload.data;
          return { _id: 't_water_copy' };
        }
      };
    }
  };
  const { main } = loadMain(db, {
    crypto: {
      randomBytes() {
        return Buffer.from('1234567890abcdef', 'hex');
      }
    }
  });

  const result = await main({ sourceTournamentId: 't_source' });

  assert.equal(result.ok, true);
  assert.deepEqual(addedData.rules.water, {
    enabled: true,
    defaultUnitsPerLoser: 2
  });
  assert.deepEqual(addedData.rounds, []);
});

test('cloneTournament preserves rotation preset and water rules together while clearing rounds', async () => {
  const { result, addedData } = await cloneAndCapture({
    mode: 'multi_rotate',
    presetKey: 'rotation_6',
    playerLimit: 999,
    rules: {
      ...buildSourceTournament().rules,
      water: { enabled: true, defaultUnitsPerLoser: 2 }
    },
    rounds: [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'finished' }] }]
  });

  assert.equal(result.ok, true);
  assert.equal(addedData.presetKey, 'rotation_6');
  assert.equal(addedData.playerLimit, 6);
  assert.deepEqual(addedData.rules.water, {
    enabled: true,
    defaultUnitsPerLoser: 2
  });
  assert.deepEqual(addedData.rounds, []);
});

test('cloneTournament index returns structured invalid result for missing sourceTournamentId', async () => {
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      throw new Error('should not access db');
    }
  };
  const { main } = loadMain(db);

  const result = await main({ __traceId: 'trace-clone-missing-id' });
  assert.deepEqual(result, {
    ok: false,
    code: 'SOURCE_TOURNAMENT_ID_REQUIRED',
    message: '缺少 sourceTournamentId',
    state: 'invalid',
    traceId: 'trace-clone-missing-id',
    data: {}
  });
});

test('cloneTournament index returns structured not_found result when source tournament is missing', async () => {
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        doc(id) {
          assert.equal(id, 't_missing');
          return {
            async get() {
              throw new Error('document.get:fail document does not exist');
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    sourceTournamentId: 't_missing',
    __traceId: 'trace-clone-missing-source'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'TOURNAMENT_NOT_FOUND',
    message: '赛事不存在',
    state: 'not_found',
    traceId: 'trace-clone-missing-source',
    data: {}
  });
});

test('cloneTournament index returns structured forbidden result for non creator', async () => {
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        doc() {
          return {
            async get() {
              return { data: buildSourceTournament() };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db, { openid: 'u_other' });

  const result = await main({
    sourceTournamentId: 't_source',
    __traceId: 'trace-clone-forbidden'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'PERMISSION_DENIED',
    message: '仅创建者可复制自己的赛事',
    state: 'forbidden',
    traceId: 'trace-clone-forbidden',
    data: {}
  });
});

test('cloneTournament treats repeated clientRequestId as deduped success', async () => {
  let sourceRead = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                return {
                  data: {
                    status: 'succeeded',
                    resourceId: 't_copy_existing'
                  }
                };
              }
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        doc() {
          sourceRead = true;
          return {
            async get() {
              return { data: buildSourceTournament() };
            }
          };
        },
        async add() {
          throw new Error('should not create clone on deduped retry');
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    sourceTournamentId: 't_source',
    clientRequestId: 'req_clone_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'TOURNAMENT_CLONED');
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_clone_1');
  assert.equal(result.tournamentId, 't_copy_existing');
  assert.equal(sourceRead, false);
});
