const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/updateSettings/index.js');
const commonPath = require.resolve('../cloudfunctions/updateSettings/lib/common.js');
const logicPath = require.resolve('../cloudfunctions/updateSettings/logic.js');

function loadMain(db) {
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

  delete require.cache[mainPath];
  delete require.cache[commonPath];
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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    version: 4,
    mode: 'multi_rotate',
    allowOpenTeam: false,
    totalMatches: 4,
    courts: 1,
    players: [
      { id: 'p1', name: 'P1', gender: 'male' },
      { id: 'p2', name: 'P2', gender: 'female' },
      { id: 'p3', name: 'P3', gender: 'male' },
      { id: 'p4', name: 'P4', gender: 'female' }
    ],
    pairTeams: [],
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'total_matches', target: 4 },
      unfinishedPolicy: 'admin_decide'
    }
  };
}

function buildSquadTournament() {
  return {
    _id: 't_squad',
    creatorId: 'u_admin',
    status: 'draft',
    version: 6,
    mode: 'squad_doubles',
    allowOpenTeam: false,
    totalMatches: 1,
    courts: 2,
    players: [
      { id: 'A1', name: 'A1', squad: 'A' },
      { id: 'A2', name: 'A2', squad: 'A' },
      { id: 'A3', name: 'A3', squad: 'A' },
      { id: 'A4', name: 'A4', squad: 'A' },
      { id: 'B1', name: 'B1', squad: 'B' },
      { id: 'B2', name: 'B2', squad: 'B' },
      { id: 'B3', name: 'B3', squad: 'B' },
      { id: 'B4', name: 'B4', squad: 'B' }
    ],
    pairTeams: [],
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'target_wins', target: 1 },
      unfinishedPolicy: 'admin_decide'
    }
  };
}

test('updateSettings writes normalized settings and rules through the direct index handler', async () => {
  let updateQuery = null;
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
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    name: '  周五夜场  ',
    totalMatches: 3,
    courts: 2,
    pointsPerGame: 15
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SETTINGS_UPDATED');
  assert.equal(result.state, 'updated');
  assert.equal(result.version, 5);
  assert.deepEqual(updateQuery, { _id: 't_1', version: 4 });
  assert.equal(writtenData.name, '周五夜场');
  assert.equal(writtenData.totalMatches, 3);
  assert.equal(writtenData.courts, 2);
  assert.equal(writtenData.settingsConfigured, true);
  assert.deepEqual(writtenData.version, { $inc: 1 });
  assert.equal(writtenData.rules.pointsPerGame, 15);
  assert.deepEqual(writtenData.rules.endCondition, {
    type: 'total_matches',
    target: 3
  });
});

test('updateSettings rejects invalid courts for 6-player fixed rotation', async () => {
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
                      players: Array.from({ length: 6 }, (_, index) => ({
                        id: `p${index + 1}`,
                        name: `P${index + 1}`
                      }))
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
    totalMatches: 9,
    courts: 2
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETTINGS_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '6人转只能使用 1 场地');
  assert.equal(updateCalled, false);
});

test('updateSettings allows two courts for 8-player fixed rotation', async () => {
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
                      presetKey: 'rotation_8',
                      playerLimit: 8,
                      players: Array.from({ length: 8 }, (_, index) => ({
                        id: `p${index + 1}`,
                        name: `P${index + 1}`
                      }))
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    totalMatches: 14,
    courts: 2
  });

  assert.equal(result.ok, true);
  assert.equal(writtenData.courts, 2);
  assert.equal(writtenData.totalMatches, 14);
  assert.equal(writtenData.settingsConfigured, true);
});

test('updateSettings syncs fixed rotation tournament name with preset label', async () => {
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
                      presetKey: 'rotation_7',
                      playerLimit: 7,
                      players: Array.from({ length: 7 }, (_, index) => ({
                        id: `p${index + 1}`,
                        name: `P${index + 1}`
                      }))
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
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    name: '周末自定义赛',
    totalMatches: 14,
    courts: 1
  });

  assert.equal(result.ok, true);
  assert.equal(writtenData.name, '7人转');
  assert.equal(writtenData.totalMatches, 14);
});

test('updateSettings returns SETTINGS_INVALID when provided name is blank', async () => {
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
                  return { data: buildTournament() };
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
    name: '   '
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETTINGS_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '赛事名称不能为空');
  assert.equal(updateCalled, false);
});

test('updateSettings treats repeated clientRequestId as deduped success', async () => {
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
                  return { data: { ...buildTournament(), lastClientRequestId: 'req_settings_1' } };
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
    totalMatches: 3,
    courts: 2,
    clientRequestId: 'req_settings_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_settings_1');
  assert.equal(result.version, 4);
  assert.equal(updateCalled, false);
});

test('updateSettings rejects target_wins when derived scheduled matches exceed max', async () => {
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
                  return { data: buildSquadTournament() };
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
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    tournamentId: 't_1',
    totalMatches: 1,
    courts: 2,
    endConditionType: 'target_wins',
    endConditionTarget: 200
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETTINGS_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '结束条件会产生 399 场，不能超过最大可选 210 场');
  assert.equal(updateCalled, false);
});
