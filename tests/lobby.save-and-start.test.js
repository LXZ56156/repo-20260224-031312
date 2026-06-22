const test = require('node:test');
const assert = require('node:assert/strict');

const lifecycleActions = require('../miniprogram/pages/lobby/lobbyLifecycleActions');

function buildContext(saveResult) {
  const calls = [];
  return {
    calls,
    data: {
      isAdmin: true,
      checkPlayersOk: true,
      tournament: { status: 'draft' }
    },
    async saveQuickSettings(options) {
      calls.push(['save', options]);
      return saveResult;
    },
    async handleStart() {
      calls.push(['start']);
    }
  };
}

test('lobby saveAndStart starts only after default settings are saved', async () => {
  const ctx = buildContext(true);

  await lifecycleActions.saveAndStart.call(ctx);

  assert.deepEqual(ctx.calls, [
    ['save', { silentSuccess: true }],
    ['start']
  ]);
});

test('lobby saveAndStart does not start when saving default settings fails', async () => {
  const ctx = buildContext(false);

  await lifecycleActions.saveAndStart.call(ctx);

  assert.deepEqual(ctx.calls, [
    ['save', { silentSuccess: true }]
  ]);
});
