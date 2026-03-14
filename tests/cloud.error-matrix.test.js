const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');

test('cloud classifies major structured error states consistently', () => {
  const matrix = [
    {
      name: 'conflict',
      input: { ok: false, code: 'VERSION_CONFLICT', message: '写入冲突，请刷新后重试', state: 'conflict' },
      level: 'conflict',
      userMessage: '写入冲突，请刷新后重试',
      flag: 'isConflict'
    },
    {
      name: 'network',
      input: { ok: false, code: 'NETWORK_ERROR', message: '网络异常，请重试', state: 'network' },
      level: 'network',
      userMessage: '网络异常，请重试',
      flag: 'isNetwork'
    },
    {
      name: 'timeout',
      input: { ok: false, code: 'REQUEST_TIMEOUT', message: '请求超时，请重试', state: 'timeout' },
      level: 'timeout',
      userMessage: '请求超时，请重试',
      flag: 'isTimeout'
    },
    {
      name: 'finished',
      input: { ok: false, code: 'MATCH_FINISHED', message: '该场已结束', state: 'finished' },
      level: 'finished',
      userMessage: '该场已结束',
      flag: 'isFinished'
    },
    {
      name: 'deduped',
      input: { ok: true, code: 'PLAYER_REMOVED_DEDUPED', message: '参赛成员已移除', state: 'deduped', deduped: true },
      level: 'deduped',
      userMessage: '参赛成员已移除',
      flag: 'isDeduped'
    },
    {
      name: 'permission',
      input: { ok: false, code: 'PERMISSION_DENIED', message: '仅管理员可操作', state: 'forbidden' },
      level: 'permission',
      userMessage: '仅管理员可操作',
      flag: 'isPermission'
    },
    {
      name: 'param',
      input: { ok: false, code: 'SETTINGS_INVALID', message: '总场次不能超过最大可选 3 场', state: 'invalid' },
      level: 'param',
      userMessage: '总场次不能超过最大可选 3 场',
      flag: 'isParam'
    }
  ];

  matrix.forEach((entry) => {
    const normalized = cloud.normalizeCloudResult(entry.input, 'matrixTest');
    const parsed = cloud.parseCloudError(normalized, '失败');
    assert.equal(cloud.classifyCloudError(parsed), entry.level, entry.name);
    assert.equal(cloud.getUnifiedErrorMessage(normalized, '失败'), entry.userMessage, entry.name);
    assert.equal(parsed[entry.flag], true, `${entry.name}:${entry.flag}`);
  });
});

test('cloud normalizeCloudResult preserves legacy extras at root and in data', () => {
  const normalized = cloud.normalizeCloudResult({
    feedbackId: 'fb_1',
    state: 'saved'
  }, 'feedbackSubmit');

  assert.equal(normalized.ok, true);
  assert.equal(normalized.feedbackId, 'fb_1');
  assert.deepEqual(normalized.data, { feedbackId: 'fb_1' });
  assert.equal(normalized.state, 'saved');
});
