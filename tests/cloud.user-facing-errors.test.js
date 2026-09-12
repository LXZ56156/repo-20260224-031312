const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../miniprogram/core/cloud');
const { presentWriteError } = require('../miniprogram/core/writeErrorUi');

const sdkFailure = "cloud.callFunction:fail Error: errCode: -504002 | errMsg: Cannot find module './lib/common'\nRequire stack:\n- /var/user/index.js\n    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1140:15)\ntraceId=private-trace";

test('SDK details never become user-facing text in develop trial or release', () => {
  const oldApp = global.getApp;
  try {
    for (const envVersion of ['develop', 'trial', 'release']) {
      global.getApp = () => ({ globalData: { runtimeEnv: { envVersion } } });
      const err = Object.assign(new Error(sdkFailure), { code: 'WATER_SESSION_FAILED', state: 'error', traceId: 'private-trace' });
      assert.equal(cloud.getUserFacingErrorMessage(err, '账本加载失败，请重试'), '账本加载失败，请重试');
      assert.doesNotMatch(cloud.getUnifiedErrorMessage(err, '账本加载失败'), /cloud\.|lib\/|\/var\/|trace|诊断号|Module/);
      assert.equal(cloud.parseCloudError(err, '账本加载失败').rawMessage, sdkFailure);
      assert.equal(cloud.parseCloudError(err, '账本加载失败').userMessage, '账本加载失败');
    }
  } finally { global.getApp = oldApp; }
});

test('technical paths and trace suffixes are hidden while business explanations are retained', () => {
  for (const message of ['TypeError: cannot read property x at C:\\app\\index.js:22:1', '保存失败 traceId=abcdef', 'requestId: abcd /cloudfunctions/waterSession/index.js', 'FUNCTION_NOT_FOUND']) {
    assert.equal(cloud.getUserFacingErrorMessage(new Error(message), '暂时无法保存，请重试'), '暂时无法保存，请重试');
  }
  for (const message of ['仅发起人可以添加球友', '名字已在名单中，请认领已有身份', '写入冲突，请刷新后重试']) {
    assert.equal(cloud.getUserFacingErrorMessage(new Error(message), '失败'), message);
  }
  const conflict = cloud.normalizeWriteFailure({ ok: false, code: 'VERSION_CONFLICT', state: 'conflict', traceId: 'private', message: '写入冲突，请刷新后重试' });
  assert.equal(conflict.state, 'conflict');
  assert.equal(conflict.traceId, 'private');
  assert.equal(conflict.message, '写入冲突，请刷新后重试');
  const failure = cloud.normalizeCloudResult({ ok: false, code: 'WATER_SESSION_FAILED', message: sdkFailure });
  assert.equal(failure.message, '操作失败，请重试');
  assert.equal(failure.rawMessage, sdkFailure);
});

test('cloud rejection keeps diagnostic metadata but its message is safe for legacy consumers', async () => {
  const oldWx = global.wx;
  const err = Object.assign(new Error(sdkFailure), { code: 'FUNCTION_EXECUTION_FAILED' });
  global.wx = { cloud: { callFunction: async () => { throw err; } } };
  try {
    await assert.rejects(cloud.call('waterSession', { action: 'createLedger' }), (received) => {
      assert.equal(received.code, 'FUNCTION_EXECUTION_FAILED');
      assert.equal(received.rawMessage, sdkFailure);
      assert.doesNotMatch(received.message, /cloud\.|Module|lib\/|private/);
      assert.ok(received.traceId);
      return true;
    });
  } finally { global.wx = oldWx; }
});

test('developer repair hints stay out of user-facing modals', () => {
  const oldWx = global.wx;
  const shown = [];
  global.wx = { showToast: (item) => shown.push(item.title), showModal: (item) => shown.push(item.content) };
  try {
    presentWriteError({ err: Object.assign(new Error(sdkFailure), { devHint: { title: '云函数未部署', content: '上传 cloudfunctions/waterSession/lib/common.js' } }), fallbackMessage: '保存失败，请重试' });
    assert.equal(shown.length, 1);
    assert.doesNotMatch(shown[0], /cloudfunctions|lib\/|上传/);
  } finally { global.wx = oldWx; }
});
