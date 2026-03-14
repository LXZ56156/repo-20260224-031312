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
    data: { profileId: 'profile_1' }
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
    data: { profileId: 'profile_existing' }
  });
  assert.deepEqual(updatePayload, {
    nickname: '球友B',
    avatar: '',
    gender: 'female',
    updatedAt: { $serverDate: true }
  });
});
