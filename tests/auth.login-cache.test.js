const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../miniprogram/core/auth');
const storage = require('../miniprogram/core/storage');
const cloud = require('../miniprogram/core/cloud');

test('auth.login uses cached openid when ttl is still valid', async () => {
  const originalGet = storage.get;
  const originalCall = cloud.call;
  const now = Date.now();

  try {
    storage.get = (key) => {
      if (key === auth.OPENID_CACHE_KEY) return 'cached_openid';
      if (key === auth.OPENID_CACHED_AT_KEY) return now - 1000;
      return '';
    };
    cloud.call = async () => {
      throw new Error('should not call login');
    };

    const openid = await auth.login();
    assert.equal(openid, 'cached_openid');
  } finally {
    storage.get = originalGet;
    cloud.call = originalCall;
  }
});

test('auth.login refreshes expired cache and stores openid with cached_at timestamp', async () => {
  const originalGet = storage.get;
  const originalSet = storage.set;
  const originalCall = cloud.call;
  const writes = [];

  try {
    storage.get = (key) => {
      if (key === auth.OPENID_CACHE_KEY) return 'stale_openid';
      if (key === auth.OPENID_CACHED_AT_KEY) return Date.now() - auth.OPENID_CACHE_TTL_MS - 1000;
      return '';
    };
    storage.set = (key, value) => {
      writes.push({ key, value });
    };
    cloud.call = async (name) => {
      assert.equal(name, 'login');
      return { openid: 'fresh_openid' };
    };

    const openid = await auth.login();
    assert.equal(openid, 'fresh_openid');
    assert.equal(writes[0].key, auth.OPENID_CACHE_KEY);
    assert.equal(writes[0].value, 'fresh_openid');
    assert.equal(writes[1].key, auth.OPENID_CACHED_AT_KEY);
    assert.equal(Number.isFinite(writes[1].value), true);
  } finally {
    storage.get = originalGet;
    storage.set = originalSet;
    cloud.call = originalCall;
  }
});

test('auth.login rejects empty openid responses and does not write cache', async () => {
  const originalGet = storage.get;
  const originalSet = storage.set;
  const originalCall = cloud.call;
  let wrote = false;

  try {
    storage.get = () => '';
    storage.set = () => {
      wrote = true;
    };
    cloud.call = async () => ({ openid: '' });

    await assert.rejects(() => auth.login(), /登录失败/);
    assert.equal(wrote, false);
  } finally {
    storage.get = originalGet;
    storage.set = originalSet;
    cloud.call = originalCall;
  }
});
