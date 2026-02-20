const storage = require('./storage');
const cloud = require('./cloud');

async function login() {
  const cached = storage.get('openid', '');
  if (cached) return cached;
  const res = await cloud.call('login');
  const openid = res.openid;
  storage.set('openid', openid);
  return openid;
}

module.exports = { login };
