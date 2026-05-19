const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/startTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/startTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/startTournament/lib/mode.js');
const shareActivityPath = require.resolve('../cloudfunctions/startTournament/lib/share-activity.js');

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
    openapi: overrides.openapi ? { updatableMessage: overrides.openapi } : undefined,
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
    },
    computeEffectiveCourts(playersCount, courts) {
      const players = Math.max(0, Number(playersCount) || 0);
      const requested = Math.max(1, Number(courts) || 1);
      return Math.max(1, Math.min(requested, Math.floor(players / 4) || 1));
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
  delete require.cache[shareActivityPath];

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

function buildPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
    gender: index % 2 === 0 ? 'male' : 'female'
  }));
}

function buildStartedTournament() {
  return {
    ...buildTournament(),
    status: 'running',
    version: 3,
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        teamA: [{ id: 'p1', name: 'A1' }, { id: 'p2', name: 'A2' }],
        teamB: [{ id: 'p3', name: 'B1' }, { id: 'p4', name: 'B2' }]
      }],
      restPlayers: []
    }]
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
  assert.equal(writtenData.scheduledMatches, 1);
  assert.equal(writtenData.rounds[0].matches[0].status, 'pending');
  assert.equal(Array.isArray(writtenData.rankings), true);
  assert.equal(writtenData.scheduleSeed, 123);
  assert.equal(writtenData.mode, 'multi_rotate');
  assert.equal(writtenData.fairnessScore, 0.88);
  assert.deepEqual(writtenData.version, { $inc: 1 });
});

test('startTournament marks and updates active share activity as started', async () => {
  const openapiCalls = [];
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
    collection() {
      return {
        doc() {
          return {
            async get() {
              return {
                data: {
                  ...buildTournament(),
                  shareActivityId: 'act_start',
                  shareActivityExpireAtMs: Date.now() + 120_000,
                  shareActivityState: 0,
                  shareActivityVersionType: 'trial'
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
  };
  const { main } = loadMain(db, {
    openapi: {
      async setUpdatableMsg(payload) {
        openapiCalls.push(payload);
      }
    }
  });

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(writtenData.shareActivityState, 1);
  assert.deepEqual(writtenData.shareActivityUpdatedAt, { $serverDate: true });
  assert.equal(openapiCalls.length, 1);
  assert.deepEqual(openapiCalls[0], {
    activityId: 'act_start',
    targetState: 1,
    templateInfo: {
      parameterList: [
        { name: 'path', value: 'pages/schedule/index?tournamentId=t_1' },
        { name: 'version_type', value: 'trial' }
      ]
    }
  });
});

test('startTournament rejects generated schedules with duplicate players in one match', async () => {
  let updateCalled = false;
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
              updateCalled = true;
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db, {
    rotation: {
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
              teamB: ['p1', 'p4']
            }],
            restPlayers: []
          }]
        };
      },
      selectSchedulerPolicy() {
        return { selectedEpsilon: 1.2, selectedSearchSeeds: 4 };
      },
      computeEffectiveCourts(playersCount, courts) {
        return Math.max(1, Math.min(Number(courts) || 1, Math.floor((Number(playersCount) || 0) / 4) || 1));
      }
    }
  });

  const result = await main({
    tournamentId: 't_1',
    schedulerProfile: 'balanced'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'START_VALIDATION_FAILED');
  assert.equal(result.state, 'invalid');
  assert.match(result.message, /重复成员/);
  assert.equal(updateCalled, false);
});

test('startTournament maps fixed rotation underfilled roster to structured validation failure', async () => {
  let updateCalled = false;
  const realLogic = require('../cloudfunctions/startTournament/logic');
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
        doc() {
          return {
            async get() {
              return {
                data: {
                  ...buildTournament(),
                  presetKey: 'rotation_6',
                  playerLimit: 6,
                  totalMatches: 9,
                  courts: 1,
                  players: buildPlayers(5)
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
  };
  const { main } = loadMain(db, { logic: realLogic });

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'START_VALIDATION_FAILED');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '6人转需要正好 6 人参赛，当前 5 人');
  assert.equal(updateCalled, false);
});

test('startTournament uses multi_rotate scheduling for 8-player fixed rotation with two courts', async () => {
  let scheduledCourts = 0;
  let writtenData = null;
  const realLogic = require('../cloudfunctions/startTournament/logic');
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
        doc() {
          return {
            async get() {
              return {
                data: {
                  ...buildTournament(),
                  presetKey: 'rotation_8',
                  playerLimit: 8,
                  totalMatches: 14,
                  courts: 2,
                  players: buildPlayers(8)
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
  };
  const { main } = loadMain(db, {
    logic: realLogic,
    rotation: {
      generateSchedule(_players, _matches, courts) {
        scheduledCourts = courts;
        return {
          seed: 456,
          fairnessScore: 0.9,
          fairness: {},
          playerStats: {},
          schedulerMeta: { source: 'fixed-rotation-test' },
          rounds: [{
            roundIndex: 0,
            matches: [{
              matchIndex: 0,
              matchType: 'doubles',
              logicalRound: 0,
              teamA: ['p1', 'p2'],
              teamB: ['p3', 'p4']
            }, {
              matchIndex: 1,
              matchType: 'doubles',
              logicalRound: 0,
              teamA: ['p5', 'p6'],
              teamB: ['p7', 'p8']
            }],
            restPlayers: []
          }]
        };
      },
      selectSchedulerPolicy() {
        return { selectedEpsilon: 1.2, selectedSearchSeeds: 4 };
      },
      computeEffectiveCourts() {
        return 2;
      }
    }
  });

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(scheduledCourts, 2);
  assert.equal(writtenData.mode, 'multi_rotate');
  assert.equal(writtenData.scheduledMatches, 2);
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

test('startTournament treats repeated clientRequestId as deduped success', async () => {
  let updateCalled = false;
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
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                return {
                  data: {
                    status: 'succeeded',
                    resourceId: 't_1'
                  }
                };
              }
            };
          }
        };
      }
      return {
        doc() {
          return {
            async get() {
              return { data: buildStartedTournament() };
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
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    clientRequestId: 'req_start_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_start_1');
  assert.equal(result.version, 3);
  assert.equal(updateCalled, false);
});

test('startTournament does not dedupe from unrelated lastClientRequestId pollution', async () => {
  let updateCalled = false;
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
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                throw new Error('document.get:fail requested document does not exist');
              }
            };
          }
        };
      }
      return {
        doc() {
          return {
            async get() {
              return {
                data: {
                  ...buildTournament(),
                  settingsConfigured: false,
                  lastClientRequestId: 'update_settings_123'
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
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    clientRequestId: 'update_settings_123'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETTINGS_REQUIRED');
  assert.equal(result.state, 'invalid');
  assert.equal(updateCalled, false);
});

test('startTournament concurrent same clientRequestId only advances tournament once', async () => {
  const state = {
    tournament: buildTournament(),
    requestLog: null
  };
  let barrierCount = 0;
  let releaseBarrier = null;
  const barrierPromise = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const waitForBarrier = async () => {
    barrierCount += 1;
    if (barrierCount >= 2) releaseBarrier();
    await barrierPromise;
  };
  function cloneTournamentData() {
    return JSON.parse(JSON.stringify(state.tournament));
  }
  function applyUpdate(target, data) {
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value && typeof value === 'object' && value.$inc !== undefined) {
        target[key] = (Number(target[key]) || 0) + Number(value.$inc || 0);
        return;
      }
      if (value && typeof value === 'object' && value.$remove) {
        delete target[key];
        return;
      }
      target[key] = value;
    });
  }
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
    async runTransaction(handler) {
      const pending = {
        updateQuery: null,
        updateData: null,
        requestLog: null
      };
      const result = await handler({
        collection(name) {
          if (name === 'client_request_logs') {
            return {
              doc() {
                return {
                  async get() {
                    await waitForBarrier();
                    if (state.requestLog) return { data: state.requestLog };
                    throw new Error('document.get:fail requested document does not exist');
                  },
                  async set(payload) {
                    pending.requestLog = payload.data;
                  }
                };
              }
            };
          }
          if (name === 'tournaments') {
            return {
              doc() {
                return {
                  async get() {
                    return { data: cloneTournamentData() };
                  }
                };
              },
              where(query) {
                pending.updateQuery = query;
                return {
                  async update(payload) {
                    pending.updateData = payload.data;
                    return { stats: { updated: 1 } };
                  }
                };
              }
            };
          }
          throw new Error(`unexpected collection ${name}`);
        }
      });
      if (pending.updateQuery) {
        if (Number(pending.updateQuery.version) !== Number(state.tournament.version || 0)) {
          throw new Error('write conflict');
        }
        applyUpdate(state.tournament, pending.updateData);
      }
      if (pending.requestLog) {
        if (state.requestLog) throw new Error('write conflict');
        state.requestLog = pending.requestLog;
      }
      return result;
    },
    collection(name) {
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                if (state.requestLog) return { data: state.requestLog };
                throw new Error('document.get:fail requested document does not exist');
              }
            };
          }
        };
      }
      if (name === 'tournaments') {
        return {
          doc() {
            return {
              async get() {
                return { data: cloneTournamentData() };
              }
            };
          }
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }
  };
  const { main } = loadMain(db);

  const [first, second] = await Promise.all([
    main({ tournamentId: 't_1', clientRequestId: 'req_start_concurrent_1' }),
    main({ tournamentId: 't_1', clientRequestId: 'req_start_concurrent_1' })
  ]);

  assert.equal(state.tournament.status, 'running');
  assert.equal(state.tournament.version, 3);
  assert.ok(Array.isArray(state.tournament.rounds));
  assert.equal(state.tournament.rounds.length, 1);
  assert.equal(String(state.requestLog.resourceId || ''), 't_1');
  assert.deepEqual([first.state, second.state].sort(), ['deduped', 'started']);
  assert.deepEqual([first.version, second.version], [3, 3]);
});

test('startTournament omits empty clientRequestId when not provided', async () => {
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
            async update() {
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'TOURNAMENT_STARTED');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'clientRequestId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data || {}, 'clientRequestId'), false);
});

test('startTournament maps dirty fixed pair teams to structured invalid code', async () => {
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
      return {
        doc() {
          return {
            async get() {
              return { data: { ...buildTournament(), mode: 'fixed_pair_rr' } };
            }
          };
        },
        where() {
          throw new Error('should not update');
        }
      };
    }
  };
  const { main } = loadMain(db, {
    logic: {
      validateBeforeGenerate() {
        throw new Error('START_PAIR_TEAMS_INVALID:固搭队伍存在重复成员，请先调整');
      }
    }
  });

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'START_PAIR_TEAMS_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '固搭队伍存在重复成员，请先调整');
});
