const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');

test('cloud parses structured conflict responses without falling back to message string matching', () => {
  const parsed = cloud.parseCloudError({
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '写入冲突，请刷新后重试',
    state: 'conflict',
    traceId: 'trace_conflict'
  }, '失败');

  assert.equal(parsed.code, 'VERSION_CONFLICT');
  assert.equal(parsed.state, 'conflict');
  assert.equal(parsed.traceId, 'trace_conflict');
  assert.equal(cloud.classifyCloudError(parsed), 'conflict');
});

test('cloud preserves structured param and permission messages for user-facing feedback', () => {
  const paramMessage = cloud.getUnifiedErrorMessage({
    ok: false,
    code: 'SCORE_OUT_OF_RANGE',
    message: '比分不能超过 60 分',
    state: 'invalid'
  }, '失败');
  const permissionMessage = cloud.getUnifiedErrorMessage({
    ok: false,
    code: 'PERMISSION_DENIED',
    message: '仅管理员可操作',
    state: 'forbidden'
  }, '失败');

  assert.equal(paramMessage, '比分不能超过 60 分');
  assert.equal(permissionMessage, '仅管理员可操作');
});

test('cloud assertWriteResult throws a normalized error that keeps code state and traceId', () => {
  assert.throws(() => {
    cloud.assertWriteResult({
      ok: false,
      code: 'SETTINGS_INVALID',
      message: '总场次不能超过最大可选 3 场',
      state: 'invalid',
      traceId: 'trace_settings'
    }, '保存失败');
  }, (err) => {
    assert.equal(err.message, '总场次不能超过最大可选 3 场');
    assert.equal(err.code, 'SETTINGS_INVALID');
    assert.equal(err.state, 'invalid');
    assert.equal(err.traceId, 'trace_settings');
    return true;
  });
});
