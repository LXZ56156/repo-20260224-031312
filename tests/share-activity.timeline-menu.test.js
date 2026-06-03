const test = require('node:test');
const assert = require('node:assert/strict');

const shareActivityPath = require.resolve('../miniprogram/core/shareActivity');

function loadShareActivity() {
  delete require.cache[shareActivityPath];
  return require(shareActivityPath);
}

test('shareActivity strips Android-only timeline menus on iOS', async () => {
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    getDeviceInfo() {
      return { platform: 'ios' };
    },
    showShareMenu(options) {
      calls.push(options);
      options.success({});
    }
  };

  try {
    const shareActivity = loadShareActivity();
    assert.equal(await shareActivity.showShareMenuBestEffort({
      menus: ['shareAppMessage', 'shareTimeline']
    }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].withShareTicket, true);
    assert.equal(Object.prototype.hasOwnProperty.call(calls[0], 'menus'), false);
  } finally {
    global.wx = originalWx;
    delete require.cache[shareActivityPath];
  }
});

test('shareActivity keeps explicit timeline menus on Android', async () => {
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    getDeviceInfo() {
      return { platform: 'android' };
    },
    showShareMenu(options) {
      calls.push(options);
      options.success({});
    }
  };

  try {
    const shareActivity = loadShareActivity();
    assert.equal(await shareActivity.showShareMenuBestEffort({
      menus: ['shareAppMessage', 'shareTimeline']
    }), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].menus, ['shareAppMessage', 'shareTimeline']);
  } finally {
    global.wx = originalWx;
    delete require.cache[shareActivityPath];
  }
});
