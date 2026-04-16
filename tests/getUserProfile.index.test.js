const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/getUserProfile/index.js');

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

test('getUserProfile returns normalized profile fields from collection record', async () => {
  const db = {
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where(query) {
          assert.deepEqual(query, { openid: 'u_profile' });
          return {
            limit(n) {
              assert.equal(n, 1);
              return {
                async get() {
                  return {
                    data: [{
                      nickname: ' 球友A ',
                      avatar: ' https://avatar/a.png ',
                      gender: 'FEMALE'
                    }]
                  };
                }
              };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main();

  assert.deepEqual(result, {
    ok: true,
    code: 'PROFILE_READY',
    message: '已读取资料',
    state: 'ready',
    traceId: '',
    profile: {
      nickName: '球友A',
      avatar: 'https://avatar/a.png',
      gender: 'female'
    },
    data: {
      profile: {
        nickName: '球友A',
        avatar: 'https://avatar/a.png',
        gender: 'female'
      }
    }
  });
});

test('getUserProfile returns null profile when collection does not exist', async () => {
  const db = {
    collection() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  throw new Error('collection not exists');
                }
              };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({ __traceId: 'trace-profile-collection-missing' });
  assert.deepEqual(result, {
    ok: true,
    code: 'PROFILE_READY',
    message: '已读取资料',
    state: 'ready',
    traceId: 'trace-profile-collection-missing',
    profile: null,
    data: { profile: null }
  });
});

test('getUserProfile returns structured failure when database read errors are not collection-missing', async () => {
  const db = {
    collection() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  throw new Error('database connection reset');
                }
              };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({ __traceId: 'trace-profile-load-failed' });
  assert.deepEqual(result, {
    ok: false,
    code: 'PROFILE_LOAD_FAILED',
    message: '读取资料失败，请稍后重试',
    state: '',
    traceId: 'trace-profile-load-failed',
    data: {}
  });
});
