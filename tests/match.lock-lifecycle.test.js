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
      expireAt: Date.now() + 5000,
      lockSessionId: 'session_1'
    }, { skipApply: true });

    assert.equal(activeTimers.size, 2);

    await controller.releaseLockIfOwned();
    controller.teardown({ resetState: true });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'scoreLock');
    assert.equal(calls[0].payload.action, 'release');
    assert.equal(calls[0].payload.lockSessionId, 'session_1');
    assert.equal(activeTimers.size, 0);
    assert.equal(clearedTimers.length, 2);
    assert.equal(ctx.data.lockState, 'idle');
  } finally {
    global.wx = originalWx;
  }
});

test('matchLockController release retries once with captured payload after teardown', async () => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const warnCalls = [];
  const calls = [];
  global.wx = { showToast() {} };
  console.warn = (...args) => warnCalls.push(args);

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
          if (calls.length === 1) throw new Error('request:fail timeout');
          return { ok: true, state: 'released' };
        },
        getUnifiedErrorMessage: () => '失败'
      },
      setTimeoutFn: (fn) => {
        if (typeof fn === 'function') fn();
        return 1;
      }
    });

    controller.setLockState('locked_by_me', {
      ownerId: 'user_1',
      ownerName: '裁判A',
      expireAt: Date.now() + 5000,
      lockSessionId: 'session_2'
    }, { skipApply: true });
    controller.setLockState('submitting', {
      ownerId: 'user_1',
      ownerName: '裁判A',
      expireAt: Date.now() + 5000
    }, { skipApply: true });
    controller.setLockState('locked_by_me', {
      ownerId: 'user_1',
      ownerName: '裁判A',
      expireAt: Date.now() + 5000
    }, { skipApply: true });

    const releaseTask = controller.releaseLockIfOwned(false, { retryDelayMs: 0 });
    controller.teardown({ resetState: true });
    const released = await releaseTask;

    assert.equal(released, true);
    assert.equal(ctx.data.lockState, 'idle');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((item) => item.payload.action), ['release', 'release']);
    assert.deepEqual(calls.map((item) => item.payload.lockSessionId), ['session_2', 'session_2']);
    assert.equal(calls[0].payload.tournamentId, 't_1');
    assert.equal(warnCalls.length, 1);
  } finally {
    global.wx = originalWx;
    console.warn = originalWarn;
  }
});

test('matchLockController ignores status started before a newer acquire session', async () => {
  const originalWx = global.wx;
  let resolveStatus;
  global.wx = { showToast() {} };

  const ctx = {
    data: {
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 1,
      match: { status: 'pending' },
      userCanScore: true,
      lockBusy: false,
      lockState: 'locked_by_me',
      lockOwnerName: '',
      lockRemainingMs: 0
    },
    _latestTournament: null,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyTournament() {},
    isPageActive() {
      return true;
    }
  };

  try {
    const controller = createMatchLockController(ctx, {
      cloud: {
        call: () => new Promise((resolve) => {
          resolveStatus = resolve;
        }),
        getUnifiedErrorMessage: () => '失败'
      }
    });
    controller.setLockState('locked_by_me', {
      ownerId: 'user_1',
      expireAt: Date.now() + 5000,
      lockSessionId: 'session_old'
    }, { skipApply: true });

    const statusTask = controller.syncLockStatus(true);
    controller.buildScoreLockPayload('acquire');
    resolveStatus({ ok: true, state: 'idle' });
    await statusTask;

    assert.equal(ctx.data.lockState, 'locked_by_me');
    controller.teardown({ resetState: true });
  } finally {
    global.wx = originalWx;
  }
});
