const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/joinTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/joinTournament/lib/mode.js');
const shareActivityPath = require.resolve('../cloudfunctions/joinTournament/lib/share-activity.js');

function loadMain(db, openidOrOptions = 'u_join') {
  const options = openidOrOptions && typeof openidOrOptions === 'object' ? openidOrOptions : {};
  const openid = typeof openidOrOptions === 'string' ? openidOrOptions : String(options.openid || 'u_join');
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

function buildTournament() {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'squad_doubles',
    version: 3,
    players: [
      { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male', squad: 'A' }
    ],
    playerIds: ['u_admin']
  };
}

test('joinTournament adds player with normalized profile fallback and squad choice', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where(query) {
          assert.deepEqual(query, { openid: 'u_join' });
          return {
            limit(value) {
              assert.equal(value, 1);
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
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
                  return { data: buildTournament() };
                },
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
    squadChoice: 'b'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(result.state, 'joined');
  assert.equal(result.version, 4);
  assert.deepEqual(result.player, {
    id: 'u_join',
    name: '球友A',
    avatar: 'cloud://avatar/a.png',
    gender: 'female',
    squad: 'B'
  });
  assert.equal(writtenData.version, 4);
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'u_join']);
  assert.equal(writtenData.players.length, 2);
  assert.deepEqual(writtenData.players[1], result.player);
});

test('joinTournament refreshes draft updatable share count after successful join', async () => {
  const openapiCalls = [];
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
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
            doc() {
              return {
                async get() {
                  return {
                    data: {
                      ...buildTournament(),
                      playerLimit: 8,
                      shareActivityId: 'act_join',
                      shareActivityExpireAtMs: Date.now() + 120_000,
                      shareActivityState: 0,
                      shareActivityVersionType: 'release'
                    }
                  };
                },
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
    squadChoice: 'b'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(openapiCalls.length, 1);
  assert.deepEqual(openapiCalls[0], {
    activityId: 'act_join',
    targetState: 0,
    templateInfo: {
      parameterList: [
        { name: 'member_count', value: '2' },
        { name: 'room_limit', value: '8' }
      ]
    }
  });
});

test('joinTournament rejects new members once fixed rotation quota is full', async () => {
  let writeCalled = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      mode: 'multi_rotate',
                      presetKey: 'rotation_6',
                      playerLimit: 6,
                      players: Array.from({ length: 6 }, (_, index) => ({
                        id: index === 0 ? 'u_admin' : `u_${index}`,
                        name: `球友${index}`,
                        avatar: `cloud://avatar/${index}`,
                        gender: index % 2 === 0 ? 'male' : 'female'
                      }))
                    }
                  };
                },
                async update() {
                  writeCalled = true;
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
    nickname: '新球友',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PLAYER_LIMIT_REACHED');
  assert.equal(result.state, 'invalid');
  assert.equal(result.message, '该赛制最多 6 人参赛');
  assert.equal(writeCalled, false);
});

test('joinTournament still allows existing member profile update when quota is full', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      mode: 'multi_rotate',
                      presetKey: 'rotation_6',
                      playerLimit: 6,
                      version: 8,
                      players: [
                        { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male' },
                        { id: 'u_join', name: '旧昵称', avatar: 'cloud://avatar/old', gender: 'female' },
                        { id: 'u_2', name: '球友2', avatar: 'cloud://avatar/2', gender: 'male' },
                        { id: 'u_3', name: '球友3', avatar: 'cloud://avatar/3', gender: 'female' },
                        { id: 'u_4', name: '球友4', avatar: 'cloud://avatar/4', gender: 'male' },
                        { id: 'u_5', name: '球友5', avatar: 'cloud://avatar/5', gender: 'female' }
                      ],
                      playerIds: ['u_admin', 'u_join', 'u_2', 'u_3', 'u_4', 'u_5']
                    }
                  };
                },
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
    nickname: '新昵称',
    avatar: 'cloud://avatar/new',
    gender: 'male'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOIN_UPDATED');
  assert.equal(writtenData.players.length, 6);
  assert.equal(writtenData.players[1].name, '新昵称');
  assert.equal(writtenData.players[1].gender, 'male');
});

test('joinTournament profile_update updates an existing member without growing roster', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      version: 9,
                      players: [
                        { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male', squad: 'A' },
                        { id: 'u_join', name: '旧昵称', avatar: 'cloud://avatar/old', gender: 'female', squad: 'B' }
                      ],
                      playerIds: ['u_admin', 'u_join']
                    }
                  };
                },
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
    action: 'profile_update',
    tournamentId: 't_1',
    nickname: '新昵称',
    avatar: 'cloud://avatar/new',
    gender: 'male',
    squadChoice: 'a'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOIN_UPDATED');
  assert.equal(result.state, 'updated');
  assert.equal(writtenData.players.length, 2);
  assert.equal(writtenData.players[1].name, '新昵称');
  assert.equal(writtenData.players[1].avatar, 'cloud://avatar/new');
  assert.equal(writtenData.players[1].gender, 'male');
  assert.equal(writtenData.players[1].squad, 'A');
});

test('joinTournament profile_update rejects non-member without adding or claiming guest', async () => {
  let writeCalled = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      players: [
                        { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male' },
                        { id: 'guest_1', name: '待认领', type: 'guest', gender: 'female' }
                      ],
                      playerIds: ['u_admin', 'guest_1']
                    }
                  };
                },
                async update() {
                  writeCalled = true;
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
    action: 'profile_update',
    tournamentId: 't_1',
    nickname: '待认领',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PLAYER_NOT_JOINED');
  assert.equal(result.state, 'not_joined');
  assert.equal(writeCalled, false);
});

test('joinTournament still allows claiming a guest because roster size does not grow', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      mode: 'multi_rotate',
                      presetKey: 'rotation_6',
                      playerLimit: 6,
                      version: 4,
                      players: [
                        { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male' },
                        { id: 'guest_1', name: '待认领', type: 'guest', gender: 'female' },
                        { id: 'u_2', name: '球友2', avatar: 'cloud://avatar/2', gender: 'male' },
                        { id: 'u_3', name: '球友3', avatar: 'cloud://avatar/3', gender: 'female' },
                        { id: 'u_4', name: '球友4', avatar: 'cloud://avatar/4', gender: 'male' },
                        { id: 'u_5', name: '球友5', avatar: 'cloud://avatar/5', gender: 'female' }
                      ],
                      playerIds: ['u_admin', 'guest_1', 'u_2', 'u_3', 'u_4', 'u_5'],
                      rounds: [],
                      rankings: [],
                      pairTeams: []
                    }
                  };
                },
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
    nickname: '待认领',
    avatar: 'cloud://avatar/claimed',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  assert.equal(result.claimed, true);
  assert.equal(writtenData.players.length, 6);
  assert.equal(writtenData.players.some((item) => item.id === 'guest_1'), false);
  assert.equal(writtenData.players.some((item) => item.id === 'u_join'), true);
});

test('joinTournament omits empty clientRequestId on successful join', async () => {
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      return handler({
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return { data: buildTournament() };
                },
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
    squadChoice: 'b'
  });

  assert.equal(result.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'clientRequestId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data || {}, 'clientRequestId'), false);
});

test('joinTournament returns PROFILE_MINIMUM_REQUIRED when neither payload nor profile is complete', async () => {
  let writeCalled = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      return handler({
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return { data: buildTournament() };
                },
                async update() {
                  writeCalled = true;
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
    nickname: '',
    avatar: '',
    gender: ''
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_MINIMUM_REQUIRED');
  assert.equal(result.state, 'invalid');
  assert.match(String(result.message || ''), /请先完善/);
  assert.equal(writeCalled, false);
});

test('joinTournament treats retry after applied join as deduped success', async () => {
  let writeCalled = false;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        }
      };
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
                      _id: 't_1',
                      creatorId: 'u_admin',
                      status: 'draft',
                      mode: 'squad_doubles',
                      version: 5,
                      players: [
                        { id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male', squad: 'A' },
                        { id: 'u_join', name: '球友A', avatar: 'cloud://avatar/a.png', gender: 'female', squad: 'B' }
                      ],
                      playerIds: ['u_admin', 'u_join']
                    }
                  };
                },
                async update() {
                  writeCalled = true;
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
    nickname: '球友A',
    avatar: 'cloud://avatar/a.png',
    gender: 'female',
    squadChoice: 'b',
    clientRequestId: 'req_join_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_join_1');
  assert.equal(result.version, 5);
  assert.equal(writeCalled, false);
});
