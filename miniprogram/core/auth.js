const storage = require('./storage');
const cloud = require('./cloud');

const OPENID_CACHE_KEY = 'openid';
const OPENID_CACHED_AT_KEY = 'openid_cached_at';
const OPENID_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function login() {
  const cached = String(storage.get(OPENID_CACHE_KEY, '') || '').trim();
  const cachedAt = Number(storage.get(OPENID_CACHED_AT_KEY, 0)) || 0;
  if (cached && cachedAt > 0 && (Date.now() - cachedAt) < OPENID_CACHE_TTL_MS) {
    return cached;
  }
  const res = await cloud.call('login');
  if (!res || typeof res !== 'object') {
    throw new Error('登录失败');
  }
  const openid = String(res.openid || '').trim();
  if (!openid) {
    throw new Error('登录失败');
  }
  storage.set(OPENID_CACHE_KEY, openid);
  storage.set(OPENID_CACHED_AT_KEY, Date.now());
  return openid;
}

module.exports = {
  login,
  OPENID_CACHE_KEY,
  OPENID_CACHED_AT_KEY,
  OPENID_CACHE_TTL_MS
};
