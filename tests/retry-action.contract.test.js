const test = require('node:test');
const assert = require('node:assert/strict');

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

test('retryAction keeps UI presentation concerns out of the retry module', () => {
  assert.equal(typeof retryAction.presentWriteError, 'undefined');
});

test('retryAction retryLastAction deduplicates repeated retry taps with the same stored action', async () => {
  const methods = retryAction.createRetryMethods();
  let running = 0;
  let executed = 0;
  let release = null;
  const ctx = {
    route: 'pages/lobby/index',
    data: { tournamentId: 't_1' },
    setData() {},
    ...methods
  };

  ctx.setLastFailedAction('重试加入', async () => {
    executed += 1;
    running += 1;
    await new Promise((resolve) => {
      release = () => {
        running -= 1;
        resolve();
      };
    });
  }, {
    actionKey: 'lobby:joinTournament:t_1'
  });

  const first = ctx.retryLastAction();
  const second = ctx.retryLastAction();
  await Promise.resolve();

  assert.equal(executed, 1);
  assert.equal(running, 1);

  release();
  await Promise.all([first, second]);
  assert.equal(running, 0);
});
