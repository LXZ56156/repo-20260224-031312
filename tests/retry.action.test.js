const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const writeErrorUi = require('../miniprogram/core/writeErrorUi');

test('parseCloudError detects conflict errors', () => {
  const parsed = cloud.parseCloudError(new Error('写入冲突 version mismatch'), '失败');
  assert.equal(parsed.isConflict, true);
});

test('parseCloudError detects network errors', () => {
  const parsed = cloud.parseCloudError(new Error('request:fail timeout'), '失败');
  assert.equal(parsed.isNetwork, true);
});

test('parseCloudError detects invalid root _id write shape errors', () => {
  const parsed = cloud.parseCloudError(new Error('document.set:fail -501007 invalid parameters. 不能更新_id的值'), '失败');
  assert.equal(parsed.isInvalidWriteShape, true);
  assert.equal(cloud.classifyCloudError(parsed), 'param');
});

test('parseCloudError keeps fallback when message empty', () => {
  const parsed = cloud.parseCloudError(null, '操作失败');
  assert.equal(parsed.userMessage, '操作失败');
});

test('classifyCloudError maps permission and param', () => {
  const permission = cloud.classifyCloudError(cloud.parseCloudError(new Error('无权限操作'), '失败'));
  const param = cloud.classifyCloudError(cloud.parseCloudError(new Error('参数不合法'), '失败'));
  assert.equal(permission, 'permission');
  assert.equal(param, 'param');
});

test('getUnifiedErrorMessage returns normalized network message', () => {
  const msg = cloud.getUnifiedErrorMessage(new Error('request:fail timeout'), '失败');
  assert.equal(msg, '网络异常，请重试');
});

test('getUnifiedErrorMessage normalizes invalid root _id write shape errors', () => {
  const msg = cloud.getUnifiedErrorMessage(new Error('document.set:fail -501007 invalid parameters. 不能更新_id的值'), '失败');
  assert.equal(msg, '参数有误，请检查');
});

test('getUnifiedErrorMessage hides internal unknown cloud details in release env', () => {
  const originalGetApp = global.getApp;
  global.getApp = () => ({
    globalData: {
      runtimeEnv: { envVersion: 'release' }
    }
  });

  try {
    const msg = cloud.getUnifiedErrorMessage(new Error('FunctionName parameter could not be found: deleteTournament'), '失败，请稍后重试');
    assert.equal(msg, '失败，请稍后重试');
  } finally {
    global.getApp = originalGetApp;
  }
});

test('getUnifiedErrorMessage adds a short diagnostic id without exposing internal details', () => {
  const originalGetApp = global.getApp;
  global.getApp = () => ({ globalData: { runtimeEnv: { envVersion: 'release' } } });

  try {
    const msg = cloud.getUnifiedErrorMessage({
      message: 'internal stack detail',
      traceId: 'trace_delete_12345678'
    }, '删除失败');
    assert.equal(msg, '删除失败，请稍后重试（诊断号 12345678）');
    assert.equal(msg.includes('internal stack detail'), false);
  } finally {
    global.getApp = originalGetApp;
  }
});

test('cloud.call only attaches detailed developer hint outside release env', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  let developErr = null;
  let releaseErr = null;

  global.getApp = () => ({
    globalData: {
      runtimeEnv: { envVersion: 'develop' }
    }
  });
  global.wx = {
    cloud: {
      callFunction() {
        return Promise.reject(new Error('FUNCTION_NOT_FOUND'));
      }
    }
  };

  try {
    try {
      await cloud.call('deleteTournament', {});
    } catch (err) {
      developErr = err;
    }
    assert.ok(developErr);
    assert.equal(cloud.getDeveloperHint(developErr).title, '云函数未部署');
    assert.match(String(cloud.getDeveloperHint(developErr).content || ''), /cloudfunctions\/deleteTournament/);

    global.getApp = () => ({
      globalData: {
        runtimeEnv: { envVersion: 'release' }
      }
    });

    try {
      await cloud.call('deleteTournament', {});
    } catch (err) {
      releaseErr = err;
    }
    assert.ok(releaseErr);
    assert.equal(cloud.getDeveloperHint(releaseErr), null);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test('cloud.call does not attach developer hint for invalid write shape errors', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalWarn = console.warn;
  const warnCalls = [];
  let err = null;

  global.getApp = () => ({
    globalData: {
      runtimeEnv: { envVersion: 'trial' }
    }
  });
  console.warn = (...args) => {
    warnCalls.push(args);
  };
  global.wx = {
    cloud: {
      callFunction() {
        return Promise.reject(new Error('document.set:fail -501007 invalid parameters. 不能更新_id的值'));
      }
    }
  };

  try {
    try {
      await cloud.call('scoreLock', {});
    } catch (caught) {
      err = caught;
    }
    assert.ok(err);
    assert.equal(cloud.getDeveloperHint(err), null);
    assert.equal(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0] || ''), /云函数写入参数不合法/);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    console.warn = originalWarn;
  }
});

test('cloud.call retries network failures for idempotent client requests', async () => {
  const originalWx = global.wx;
  const payloads = [];

  global.wx = {
    cloud: {
      callFunction(payload) {
        payloads.push(payload);
        if (payloads.length < 3) {
          return Promise.reject(new Error('request:fail timeout'));
        }
        return Promise.resolve({ result: { ok: true, code: 'SUBMIT_SCORE_OK', state: 'updated' } });
      }
    }
  };

  try {
    const result = await cloud.call('submitScore', {
      tournamentId: 't_1',
      clientRequestId: 'submit_req_1'
    }, {
      retryDelaysMs: [0, 0]
    });

    assert.equal(result.ok, true);
    assert.equal(payloads.length, 3);
    assert.equal(payloads[0].data.__traceId, payloads[1].data.__traceId);
    assert.equal(payloads[1].data.__traceId, payloads[2].data.__traceId);
  } finally {
    global.wx = originalWx;
  }
});

test('cloud.call does not retry business failures or non-idempotent writes without request id', async () => {
  const originalWx = global.wx;
  let conflictCalls = 0;
  let networkCalls = 0;

  global.wx = {
    cloud: {
      callFunction({ name }) {
        if (name === 'updateSettings') {
          conflictCalls += 1;
          return Promise.resolve({
            result: {
              ok: false,
              code: 'VERSION_CONFLICT',
              message: '写入冲突，请重试',
              state: 'conflict'
            }
          });
        }
        networkCalls += 1;
        return Promise.reject(new Error('request:fail timeout'));
      }
    }
  };

  try {
    const conflict = await cloud.call('updateSettings', {
      tournamentId: 't_1',
      clientRequestId: 'settings_req_1'
    }, {
      retryDelaysMs: [0, 0]
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflictCalls, 1);

    await assert.rejects(async () => {
      await cloud.call('createTournament', { name: '周末比赛' }, { retryDelaysMs: [0, 0] });
    }, /timeout/);
    assert.equal(networkCalls, 1);
  } finally {
    global.wx = originalWx;
  }
});

test('writeErrorUi presents developer hint in UI layer when cloud metadata is available', () => {
  const originalWx = global.wx;
  const toastCalls = [];
  const modalCalls = [];
  const err = new Error('FUNCTION_NOT_FOUND');
  err.devHint = {
    title: '云函数未部署',
    content: '请部署 deleteTournament'
  };

  global.wx = {
    showToast(payload) {
      toastCalls.push(payload);
    },
    showModal(payload) {
      modalCalls.push(payload);
    }
  };

  try {
    writeErrorUi.presentWriteError({
      err,
      fallbackMessage: '保存失败'
    });
    assert.equal(toastCalls.length, 1);
    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].title, '云函数未部署');
  } finally {
    global.wx = originalWx;
  }
});
