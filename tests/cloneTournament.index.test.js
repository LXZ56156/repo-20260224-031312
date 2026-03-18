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
    rules: { gamesPerMatch: 1, pointsPerGame: 21, endCondition: { type: 'total_matches', target: 10 } },
    players: [
      { id: 'u_creator', name: '管理员', type: 'user', gender: 'male' },
      { id: 'p_2', name: '球友B', type: 'guest', gender: 'female' }
    ],
    pairTeams: [
      { id: 'team_1', name: '一队', playerIds: ['u_creator', 'p_2'], locked: true }
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
      return { OPENID: 'u_creator' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];
  delete require.cache[logicPath];

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

test('cloneTournament index creates a new draft copy with remapped pair teams', async () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  let addedData = null;

  Date.now = () => 1700000000000;
  Math.random = () => 0.123456;

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
  const { main } = loadMain(db);

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
    assert.equal(addedData.players[0].id, 'u_creator');
    assert.equal(addedData.players[1].id, 'guest_1700000000000_1_123456');
    assert.deepEqual(addedData.pairTeams, [{
      id: 'team_1',
      name: '一队',
      playerIds: ['u_creator', 'guest_1700000000000_1_123456'],
      locked: true
    }]);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('cloneTournament treats repeated clientRequestId as deduped success', async () => {
  let sourceRead = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          assert.deepEqual(query, {
            creatorId: 'u_creator',
            cloneSourceTournamentId: 't_source',
            clientRequestId: 'req_clone_1'
          });
          return {
            limit(value) {
              assert.equal(value, 1);
              return {
                async get() {
                  return { data: [{ _id: 't_copy_existing' }] };
                }
              };
            }
          };
        },
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
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_clone_1');
  assert.equal(result.tournamentId, 't_copy_existing');
  assert.equal(sourceRead, false);
});
