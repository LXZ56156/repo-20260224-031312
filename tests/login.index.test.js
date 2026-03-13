const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/login/index.js');

function loadMain(context) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    getWXContext() {
      return context;
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

test('login returns openid appid and normalized empty unionid', async () => {
  const { main } = loadMain({
    OPENID: 'u_login',
    APPID: 'wx-app',
    UNIONID: ''
  });

  const result = await main();
  assert.deepEqual(result, {
    openid: 'u_login',
    appid: 'wx-app',
    unionid: ''
  });
});
