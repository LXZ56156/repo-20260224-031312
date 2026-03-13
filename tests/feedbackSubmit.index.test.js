const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/feedbackSubmit/index.js');
const commonPath = require.resolve('../cloudfunctions/feedbackSubmit/lib/common.js');

function loadMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_feedback' };
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

test('feedbackSubmit writes sanitized feedback when no recent duplicate exists', async () => {
  let addPayload = null;
  let createCollectionName = '';
  const db = {
    command: {
      gte(value) {
        return { $gte: value };
      }
    },
    async createCollection(name) {
      createCollectionName = name;
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'feedbacks');
      return {
        where(query) {
          assert.equal(query.openid, 'u_feedback');
          assert.ok(query.createdAtMs.$gte > 0);
          return {
            limit(n) {
              assert.equal(n, 1);
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
          return { _id: 'fb_1' };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    category: ' 功能建议 ',
    content: ' 这个排赛页希望支持更多过滤条件 \r\n',
    contact: ' wx:test '
  });

  assert.deepEqual(result, { ok: true, feedbackId: 'fb_1' });
  assert.equal(createCollectionName, 'feedbacks');
  assert.equal(addPayload.openid, 'u_feedback');
  assert.equal(addPayload.category, '功能建议');
  assert.equal(addPayload.content, '这个排赛页希望支持更多过滤条件');
  assert.equal(addPayload.contact, 'wx:test');
});

test('feedbackSubmit rejects rapid duplicate submission within one minute', async () => {
  const db = {
    command: {
      gte(value) {
        return { $gte: value };
      }
    },
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
                  return { data: [{ _id: 'fb_old' }] };
                }
              };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  await assert.rejects(() => main({
    category: '其他',
    content: '这是一条足够长的反馈内容，用于测试限流逻辑'
  }), /提交太频繁/);
});
