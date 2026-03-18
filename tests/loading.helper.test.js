const test = require('node:test');
const assert = require('node:assert/strict');

const loading = require('../miniprogram/core/loading');

test('withLoading shows and hides loading around a successful task', async () => {
  const originalWx = global.wx;
  const events = [];

  global.wx = {
    showLoading(options = {}) {
      events.push(`show:${String(options.title || '')}`);
    },
    hideLoading() {
      events.push('hide');
    }
  };

  try {
    const result = await loading.withLoading('处理中...', async () => 'ok');
    assert.equal(result, 'ok');
    assert.deepEqual(events, ['show:处理中...', 'hide']);
  } finally {
    global.wx = originalWx;
  }
});

test('withLoading hides loading when the task throws', async () => {
  const originalWx = global.wx;
  const events = [];

  global.wx = {
    showLoading(options = {}) {
      events.push(`show:${String(options.title || '')}`);
    },
    hideLoading() {
      events.push('hide');
    }
  };

  try {
    await assert.rejects(async () => {
      await loading.withLoading('处理中...', async () => {
        throw new Error('boom');
      });
    }, /boom/);
    assert.deepEqual(events, ['show:处理中...', 'hide']);
  } finally {
    global.wx = originalWx;
  }
});
