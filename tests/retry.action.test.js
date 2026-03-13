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
    const msg = cloud.getUnifiedErrorMessage(new Error('FunctionName parameter could not be found: deleteTournament'), '失败');
    assert.equal(msg, '操作失败，请稍后重试');
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
