const test = require('node:test');
const assert = require('node:assert/strict');

const base = require('../miniprogram/core/storage/base');

test('storage base reports sync write and delete failures', () => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);
  global.wx = {
    getStorageSync() {
      return 'ok';
    },
    setStorageSync() {
      throw new Error('storage full');
    },
    removeStorageSync() {
      throw new Error('remove failed');
    }
  };

  try {
    assert.equal(base.get('key', 'fallback'), 'ok');
    assert.equal(base.set('key', 'value'), false);
    assert.equal(base.del('key'), false);
    assert.equal(warnCalls.length, 2);
    assert.match(String(warnCalls[0][0] || ''), /storage set failed/);
    assert.match(String(warnCalls[1][0] || ''), /storage remove failed/);
  } finally {
    global.wx = originalWx;
    console.warn = originalWarn;
  }
});

test('storage base warns on read failure and returns fallback', () => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);
  global.wx = {
    getStorageSync() {
      throw new Error('read failed');
    }
  };

  try {
    assert.equal(base.get('key', 'fallback'), 'fallback');
    assert.equal(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0] || ''), /storage read failed/);
  } finally {
    global.wx = originalWx;
    console.warn = originalWarn;
  }
});
