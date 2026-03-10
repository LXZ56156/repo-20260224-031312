const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const retryAction = require('../miniprogram/core/retryAction');

test('retryAction.createRetryMethods manages last failed action state on page contexts', () => {
  const methods = retryAction.createRetryMethods();
  const ctx = {
    data: {},
    setData(patch) {
      this.data = { ...this.data, ...(patch || {}) };
    },
    ...methods
  };

  let retried = 0;
  ctx.setLastFailedAction('重试提交', () => {
    retried += 1;
  });
  assert.equal(ctx.data.canRetryAction, true);
  assert.equal(ctx.data.lastFailedActionText, '重试提交');

  ctx.retryLastAction();
  assert.equal(retried, 1);

  ctx.clearLastFailedAction();
  assert.equal(ctx.data.canRetryAction, false);
  assert.equal(ctx.data.lastFailedActionText, '');
});

test('retryAction.presentWriteError forwards normalized options to cloud layer', () => {
  const originalPresentWriteError = cloud.presentWriteError;
  let payload = null;

  cloud.presentWriteError = (options) => {
    payload = options;
    return { level: 'conflict' };
  };

  try {
    const result = retryAction.presentWriteError({}, new Error('写入冲突'), '保存失败', {
      conflictContent: '刷新后重试',
      onRefresh() {}
    });
    assert.deepEqual(result, { level: 'conflict' });
    assert.equal(payload.fallbackMessage, '保存失败');
    assert.equal(payload.conflictContent, '刷新后重试');
    assert.equal(typeof payload.onRefresh, 'function');
  } finally {
    cloud.presentWriteError = originalPresentWriteError;
  }
});
