const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/startTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/startTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/startTournament/lib/mode.js');

function loadMain(db, overrides = {}) {
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
  const mockRotation = overrides.rotation || {
    generateSchedule() {
      return {
        seed: 123,
        fairnessScore: 0.88,
        fairness: { imbalance: 0 },
        playerStats: { p1: { played: 1 } },
        schedulerMeta: { source: 'stub' },
        rounds: [{
          roundIndex: 0,
          matches: [{
            matchIndex: 0,
            matchType: 'doubles',
            logicalRound: 0,
            unitAId: 'pair_a',
            unitBId: 'pair_b',
            unitAName: 'A 组',
            unitBName: 'B 组',
            teamA: ['p1', 'p2'],
            teamB: ['p3', 'p4']
          }],
          restPlayers: []
        }]
      };
    },
    selectSchedulerPolicy() {
      return {
        selectedEpsilon: 1.2,
        selectedSearchSeeds: 4
      };
    }
  };
  const mockLogic = overrides.logic || {
    validateBeforeGenerate(tournament) {
      return {
        players: tournament.players,
        totalMatches: tournament.totalMatches,
        courts: tournament.courts,
        mode: tournament.mode,
        allowOpenTeam: false,
        rules: {
          endCondition: { type: 'total_matches', target: tournament.totalMatches }
        },
        pairTeams: []
      };
    }
  };
  const mockScheduleModes = overrides.scheduleModes || {
    buildSquadSchedule() {
      throw new Error('should not use squad schedule');
    },
    buildFixedPairSchedule() {
      throw new Error('should not use fixed pair schedule');
    }
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    if (parent && parent.filename === mainPath && request === './rotation') return mockRotation;
    if (parent && parent.filename === mainPath && request === './logic') return mockLogic;
    if (parent && parent.filename === mainPath && request === './scheduleModes') return mockScheduleModes;
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
    settingsConfigured: true,
    version: 2,
    totalMatches: 1,
    courts: 1,
    mode: 'multi_rotate',
    allowOpenTeam: false,
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'total_matches', target: 1 }
    },
    players: [
      { id: 'p1', name: 'A1', gender: 'male' },
      { id: 'p2', name: 'A2', gender: 'female' },
      { id: 'p3', name: 'B1', gender: 'male' },
      { id: 'p4', name: 'B2', gender: 'female' }
    ],
    pairTeams: []
  };
}

test('startTournament writes generated rounds and running state through the direct index handler', async () => {
  let updateQuery = null;
  let writtenData = null;
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
      assert.equal(name, 'tournaments');
      return {
        async get() {
          throw new Error('unexpected direct get');
        },
        doc(id) {
          assert.equal(id, 't_1');
          return {
            async get() {
              return { data: buildTournament() };
            }
          };
        },
        where(query) {
          updateQuery = query;
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    schedulerProfile: 'balanced'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'TOURNAMENT_STARTED');
  assert.equal(result.state, 'started');
  assert.equal(result.version, 3);
  assert.deepEqual(updateQuery, { _id: 't_1', version: 2 });
  assert.equal(writtenData.status, 'running');
  assert.equal(Array.isArray(writtenData.rounds), true);
  assert.equal(writtenData.rounds.length, 1);
  assert.equal(writtenData.rounds[0].matches[0].status, 'pending');
  assert.equal(Array.isArray(writtenData.rankings), true);
  assert.equal(writtenData.scheduleSeed, 123);
  assert.equal(writtenData.mode, 'multi_rotate');
  assert.equal(writtenData.fairnessScore, 0.88);
  assert.deepEqual(writtenData.version, { $inc: 1 });
});

test('startTournament returns TOURNAMENT_ID_REQUIRED before reading the database', async () => {
  let readCalled = false;
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
    collection() {
      readCalled = true;
      throw new Error('should not read');
    }
  };
  const { main } = loadMain(db);

  const result = await main({});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOURNAMENT_ID_REQUIRED');
  assert.equal(result.state, 'invalid');
  assert.equal(readCalled, false);
});
