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
