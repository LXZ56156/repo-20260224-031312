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

test('cloud classifies all registered PERMISSION_CODES as permission', () => {
  const permCodes = ['PERMISSION_DENIED', 'LOCK_FORBIDDEN', 'JOIN_DRAFT_ONLY', 'START_DRAFT_ONLY', 'SETTINGS_DRAFT_ONLY'];
  permCodes.forEach((code) => {
    const normalized = cloud.normalizeCloudResult({ ok: false, code, message: `${code} test` }, 'permTest');
    const parsed = cloud.parseCloudError(normalized, '失败');
    assert.equal(parsed.isPermission, true, `${code} should be isPermission`);
    assert.equal(cloud.classifyCloudError(parsed), 'permission', `${code} should classify as permission`);
  });
});

test('cloud classifies all registered PARAM_CODES as param', () => {
  const paramCodes = [
    'ACTION_REQUIRED', 'TOURNAMENT_ID_REQUIRED', 'TOURNAMENT_NOT_FOUND',
    'PROFILE_MINIMUM_REQUIRED', 'SCORE_OUT_OF_RANGE', 'SETTINGS_REQUIRED',
    'SETTINGS_INVALID', 'START_VALIDATION_FAILED'
  ];
  paramCodes.forEach((code) => {
    const normalized = cloud.normalizeCloudResult({ ok: false, code, message: `${code} test` }, 'paramTest');
    const parsed = cloud.parseCloudError(normalized, '失败');
    assert.equal(parsed.isParam, true, `${code} should be isParam`);
    assert.equal(cloud.classifyCloudError(parsed), 'param', `${code} should classify as param`);
  });
});

test('cloud classifies all registered DEDUPED_CODES as deduped', () => {
  const dedupCodes = ['SCORE_SUBMIT_DEDUPED', 'PLAYER_REMOVED_DEDUPED', 'PLAYER_SQUAD_DEDUPED', 'PAIR_TEAMS_DEDUPED'];
  dedupCodes.forEach((code) => {
    const normalized = cloud.normalizeCloudResult({ ok: true, code, message: `${code} test`, deduped: true }, 'dedupTest');
    const parsed = cloud.parseCloudError(normalized, '失败');
    assert.equal(parsed.isDeduped, true, `${code} should be isDeduped`);
    assert.equal(cloud.classifyCloudError(parsed), 'deduped', `${code} should classify as deduped`);
  });
});

test('cloud classifies TIMEOUT code distinctly from NETWORK_ERROR', () => {
  const timeoutNorm = cloud.normalizeCloudResult({ ok: false, code: 'TIMEOUT', message: '超时' }, 'test');
  const networkNorm = cloud.normalizeCloudResult({ ok: false, code: 'NETWORK_ERROR', message: '网络异常' }, 'test');
  const timeoutParsed = cloud.parseCloudError(timeoutNorm);
  const networkParsed = cloud.parseCloudError(networkNorm);

  assert.equal(timeoutParsed.isTimeout, true);
  assert.equal(cloud.classifyCloudError(timeoutParsed), 'timeout');

  assert.equal(networkParsed.isNetwork, true);
  assert.equal(networkParsed.isTimeout, false);
  assert.equal(cloud.classifyCloudError(networkParsed), 'network');
});

test('cloud classifies timeout with English message as both isTimeout and isNetwork', () => {
  const norm = cloud.normalizeCloudResult({ ok: false, code: 'TIMEOUT', message: 'request timeout' }, 'test');
  const parsed = cloud.parseCloudError(norm);
  assert.equal(parsed.isTimeout, true);
  assert.equal(parsed.isNetwork, true);
  assert.equal(cloud.classifyCloudError(parsed), 'timeout');
});

test('cloud classifies unstructured error messages by keyword fallback', () => {
  const cases = [
    { msg: '权限不足，无法操作', expected: 'permission' },
    { msg: '参数缺少必填字段', expected: 'param' },
    { msg: '完全未知的错误信息', expected: 'unknown' }
  ];
  cases.forEach(({ msg, expected }) => {
    const parsed = cloud.parseCloudError({ message: msg }, '失败');
    const level = cloud.classifyCloudError(parsed);
    assert.equal(level, expected, `"${msg}" should classify as ${expected}`);
  });
});

test('cloud getUnifiedErrorMessage returns generic message for unknown errors in release env', () => {
  const originalGetApp = global.getApp;
  global.getApp = () => ({ globalData: { runtimeEnv: { envVersion: 'release' } } });
  try {
    const msg = cloud.getUnifiedErrorMessage({ ok: false, message: '一个罕见的内部错误' }, '操作失败');
    assert.equal(msg, '操作失败，请稍后重试');
  } finally {
    global.getApp = originalGetApp;
  }
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
