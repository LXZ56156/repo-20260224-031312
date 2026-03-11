const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../miniprogram/core/auth');
const storage = require('../miniprogram/core/storage');
const cloud = require('../miniprogram/core/cloud');

test('auth.login de-duplicates concurrent login calls', async () => {
  const originalGet = storage.get;
  const originalSet = storage.set;
  const originalCall = cloud.call;
  let resolveLogin;
  let callCount = 0;

  try {
    auth.__resetLoginStateForTests();
    storage.get = () => '';
    storage.set = () => {};
    cloud.call = async (name) => {
      callCount += 1;
      assert.equal(name, 'login');
      return new Promise((resolve) => {
        resolveLogin = resolve;
      });
    };

    const first = auth.login();
    const second = auth.login();

    resolveLogin({ openid: 'shared_openid' });
    const [openid1, openid2] = await Promise.all([first, second]);

    assert.equal(callCount, 1);
    assert.equal(openid1, 'shared_openid');
    assert.equal(openid2, 'shared_openid');
  } finally {
    auth.__resetLoginStateForTests();
    storage.get = originalGet;
    storage.set = originalSet;
    cloud.call = originalCall;
  }
});
