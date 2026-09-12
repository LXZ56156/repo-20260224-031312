const storage = require('./storage/base');

function accountKey() {
  if (typeof wx === 'undefined') return '';
  let openid = '';
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    openid = String(app && app.globalData && app.globalData.openid || '').trim();
  } catch (_) { /* Use the existing login cache when the app is not ready. */ }
  if (!openid) {
    const cached = storage.get('openid', '');
    if (typeof cached === 'string') openid = cached.trim();
  }
  return openid ? `water_recent_ledger:${openid}` : '';
}

function getRecentLedger() {
  const key = accountKey();
  const saved = key && storage.get(key);
  if (!saved || typeof saved.id !== 'string' || !saved.id.trim()) return null;
  return { id: saved.id, title: String(saved.title || '打水账本') };
}

function rememberLedger(ledger) {
  const key = accountKey();
  if (!key || !ledger || typeof ledger.id !== 'string' || !ledger.id.trim()) return;
  storage.set(key, { id: ledger.id, title: String(ledger.title || '打水账本') });
}

module.exports = { getRecentLedger, rememberLedger };
