const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchLockController } = require('../miniprogram/pages/match/matchLockController');

function createCtx() {
  return {
    data: {
      tournamentId: 't_1',
      roundIndex: 0,
      matchIndex: 0,
      lockState: 'idle',
      lockOwnerId: '',
      lockOwnerName: '',
      lockRemainingMs: 0,
      batchMode: false
    },
    _latestTournament: null,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyTournament() {}
  };
}

test('match lock messaging differentiates occupied finished and forbidden states', () => {
  const originalWx = global.wx;
  const toastCalls = [];
  global.wx = {
    showToast(payload) {
      toastCalls.push(payload);
    }
  };

  try {
    const ctx = createCtx();
    const controller = createMatchLockController(ctx, {
      cloud: {
        call() {
          throw new Error('not used');
        },
        getUnifiedErrorMessage() {
          return '失败';
        }
      }
    });

    controller.applyScoreLockResult({
      ok: false,
      code: 'LOCK_OCCUPIED',
      state: 'occupied',
      ownerName: '裁判A',
      message: '当前有人正在录入比分'
    });
    controller.applyScoreLockResult({
      ok: false,
      code: 'MATCH_FINISHED',
      state: 'finished',
      message: '该场已结束'
    });
    controller.applyScoreLockResult({
      ok: false,
      code: 'LOCK_FORBIDDEN',
      state: 'forbidden',
      message: '仅管理员或参赛成员可录分'
    });

    assert.equal(toastCalls.length, 3);
    assert.equal(toastCalls[0].title, '当前由 裁判A 正在录分');
    assert.equal(toastCalls[1].title, '该场已结束');
    assert.equal(toastCalls[2].title, '仅管理员或参赛成员可录分');
  } finally {
    global.wx = originalWx;
  }
});
