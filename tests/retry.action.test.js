const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');

test('parseCloudError detects conflict errors', () => {
  const parsed = cloud.parseCloudError(new Error('写入冲突 version mismatch'), '失败');
  assert.equal(parsed.isConflict, true);
});

test('parseCloudError detects network errors', () => {
  const parsed = cloud.parseCloudError(new Error('request:fail timeout'), '失败');
  assert.equal(parsed.isNetwork, true);
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

test('cloud.call only shows detailed developer hint outside release env', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const modalCalls = [];

  global.getApp = () => ({
    globalData: {
      runtimeEnv: { envVersion: 'develop' }
    }
  });
  global.wx = {
    showModal(payload) {
      modalCalls.push(payload);
    },
    cloud: {
      callFunction() {
        return Promise.reject(new Error('FUNCTION_NOT_FOUND'));
      }
    }
  };

  try {
    await assert.rejects(() => cloud.call('deleteTournament', {}), /FUNCTION_NOT_FOUND/);
    assert.equal(modalCalls.length, 1);
    assert.match(String(modalCalls[0].content || ''), /cloudfunctions\/deleteTournament/);

    modalCalls.length = 0;
    global.getApp = () => ({
      globalData: {
        runtimeEnv: { envVersion: 'release' }
      }
    });

    await assert.rejects(() => cloud.call('deleteTournament', {}), /FUNCTION_NOT_FOUND/);
    assert.equal(modalCalls.length, 0);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});
