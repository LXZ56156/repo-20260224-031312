const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchLockController } = require('../miniprogram/pages/match/matchLockController');

test('matchLockController teardown clears countdown and heartbeat timers and can release owned lock', async () => {
  const originalWx = global.wx;
  global.wx = { showToast() {} };

  const activeTimers = new Set();
  const clearedTimers = [];
  const calls = [];
  let timerSeed = 0;

  const ctx = {
    data: {
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 1,
      lockState: 'idle',
      lockOwnerName: '',
      lockRemainingMs: 0
    },
    _latestTournament: null,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyTournament() {}
  };

  try {
    const controller = createMatchLockController(ctx, {
      cloud: {
        call: async (name, payload) => {
          calls.push({ name, payload });
          return { ok: true, state: 'released' };
        },
        getUnifiedErrorMessage: () => '失败'
      },
      setIntervalFn: (fn) => {
        const id = `timer_${++timerSeed}`;
        activeTimers.add(id);
        return id;
      },
      clearIntervalFn: (id) => {
        activeTimers.delete(id);
        clearedTimers.push(id);
      }
    });

    controller.setLockState('locked_by_me', {
      ownerId: 'user_1',
      ownerName: '裁判A',
      expireAt: Date.now() + 5000
    }, { skipApply: true });

    assert.equal(activeTimers.size, 2);

    await controller.releaseLockIfOwned();
    controller.teardown({ resetState: true });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'scoreLock');
    assert.equal(calls[0].payload.action, 'release');
    assert.equal(activeTimers.size, 0);
    assert.equal(clearedTimers.length, 2);
    assert.equal(ctx.data.lockState, 'idle');
  } finally {
    global.wx = originalWx;
  }
});
