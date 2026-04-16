const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/saveUserProfile/index.js');
const commonPath = require.resolve('../cloudfunctions/saveUserProfile/lib/common.js');

function loadMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_profile' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];

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

test('saveUserProfile creates a new profile when none exists', async () => {
  let addPayload = null;
  let createCollectionName = '';
  const db = {
    async createCollection(name) {
      createCollectionName = name;
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where(query) {
          assert.deepEqual(query, { openid: 'u_profile' });
          return {
            limit() {
              return {
                async get() {
                  return { data: [] };
                }
              };
            }
          };
        },
        async add(payload) {
          addPayload = payload.data;
          return { _id: 'profile_1' };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    nickname: '球友A',
    avatar: 'https://avatar/a.png',
    gender: 'male'
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'PROFILE_SAVED',
    message: '已保存资料',
    state: 'updated',
    traceId: '',
    profileId: 'profile_1',
    syncedTournamentCount: 0,
    data: { profileId: 'profile_1', syncedTournamentCount: 0 }
  });
  assert.equal(createCollectionName, 'user_profiles');
  assert.deepEqual(addPayload, {
    openid: 'u_profile',
    nickname: '球友A',
    avatar: 'https://avatar/a.png',
    gender: 'male',
    createdAt: { $serverDate: true },
    updatedAt: { $serverDate: true }
  });
});

test('saveUserProfile updates existing profile in place', async () => {
  let updatePayload = null;
  const db = {
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { data: [{ _id: 'profile_existing' }] };
                }
              };
            }
          };
        },
        doc(id) {
          assert.equal(id, 'profile_existing');
          return {
            async update(payload) {
              updatePayload = payload.data;
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    nickname: '球友B',
    avatar: '',
    gender: 'female'
  });

  assert.deepEqual(result, {
    ok: true,
    code: 'PROFILE_SAVED',
    message: '已保存资料',
    state: 'updated',
    traceId: '',
    profileId: 'profile_existing',
    syncedTournamentCount: 0,
    data: { profileId: 'profile_existing', syncedTournamentCount: 0 }
  });
  assert.deepEqual(updatePayload, {
    nickname: '球友B',
    avatar: '',
    gender: 'female',
    updatedAt: { $serverDate: true }
  });
});

test('saveUserProfile returns structured invalid result for empty nickname', async () => {
  const db = {
    async createCollection() {
      throw new Error('should not create collection');
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      throw new Error('should not query profile');
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    nickname: '   ',
    avatar: '',
    gender: 'male',
    __traceId: 'trace-profile-nickname'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'PROFILE_NICKNAME_REQUIRED',
    message: '昵称不能为空',
    state: 'invalid',
    traceId: 'trace-profile-nickname',
    data: {}
  });
});

test('saveUserProfile returns structured invalid result for unknown gender', async () => {
  const db = {
    async createCollection() {
      throw new Error('should not create collection');
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      throw new Error('should not query profile');
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    nickname: '球友A',
    avatar: '',
    gender: 'unknown',
    __traceId: 'trace-profile-gender'
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'PROFILE_GENDER_REQUIRED',
    message: '性别不能为空',
    state: 'invalid',
    traceId: 'trace-profile-gender',
    data: {}
  });
});

test('saveUserProfile treats repeated clientRequestId as deduped success', async () => {
  let updateCalled = false;
  const tournamentUpdates = [];
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
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
                    resourceId: 'profile_existing'
                  }
                };
              }
            };
          }
        };
      }
      if (name === 'tournaments') {
        return {
          where(query) {
            if (query && query.status) {
              return {
                async get() {
                  return {
                    data: [{
                      _id: 't_running',
                      status: 'running',
                      version: 3,
                      playerIds: ['u_profile'],
                      players: [{ id: 'u_profile', type: 'user', name: '球友B', avatar: '', gender: 'female' }],
                      rounds: [{
                        roundIndex: 0,
                        matches: [{
                          matchIndex: 0,
                          teamA: [{ id: 'u_profile', name: '球友B', avatar: '' }],
                          teamB: [{ id: 'u_other', name: '球友C', avatar: 'cloud://avatar/other' }]
                        }],
                        restPlayers: [{ id: 'u_profile', name: '球友B', avatar: '' }]
                      }]
                    }]
                  };
                }
              };
            }
            return {
              async update(payload) {
                tournamentUpdates.push({ query, data: payload.data });
                return { stats: { updated: 1 } };
              }
            };
          },
          doc() {
            return {
              async get() {
                throw new Error('unexpected refetch');
              }
            };
          }
        };
      }
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    data: [{
                        _id: 'profile_existing',
                      lastClientRequestId: 'req_profile_1',
                      avatar: 'cloud://avatar/b.png'
                    }]
                  };
                }
              };
            }
          };
        },
        doc() {
          updateCalled = true;
          return {
            async update() {}
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    nickname: '球友B',
    avatar: '',
    gender: 'female',
    clientRequestId: 'req_profile_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.clientRequestId, 'req_profile_1');
  assert.equal(result.profileId, 'profile_existing');
  assert.equal(result.syncedTournamentCount, 1);
  assert.equal(updateCalled, false);
  assert.equal(tournamentUpdates.length, 1);
  assert.deepEqual(tournamentUpdates[0].query, { _id: 't_running', version: 3 });
  assert.equal(tournamentUpdates[0].data.players[0].avatar, 'cloud://avatar/b.png');
});
