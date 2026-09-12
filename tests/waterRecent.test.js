const test = require('node:test');
const assert = require('node:assert/strict');
const { rememberLedger, getRecentLedger } = require('../miniprogram/core/waterRecent');

test('recent ledger is scoped to the current account and keeps only the latest visit', () => {
  const oldWx = global.wx;
  const oldApp = global.getApp;
  const saved = new Map();
  let openid = 'one';
  global.getApp = () => ({ globalData: { openid } });
  global.wx = { getStorageSync: key => saved.get(key), setStorageSync: (key, value) => saved.set(key, value) };
  try {
    assert.equal(getRecentLedger(), null);
    rememberLedger({ id: 'book1', title: '周五晚场' });
    rememberLedger({ id: 'book2', title: '周日球局' });
    assert.deepEqual(getRecentLedger(), { id: 'book2', title: '周日球局' });
    openid = 'two';
    assert.equal(getRecentLedger(), null);
    openid = '';
    rememberLedger({ id: 'anonymous' });
    assert.equal(getRecentLedger(), null);
  } finally { global.wx = oldWx; global.getApp = oldApp; }
});
