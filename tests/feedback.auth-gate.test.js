const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveFeedbackGate } = require('../miniprogram/pages/feedback/gate');

test('feedback gate blocks need_profile with complete-profile action', () => {
  const out = resolveFeedbackGate({ ok: false, reason: 'need_profile' });
  assert.equal(out.blocked, true);
  assert.equal(out.blockNeedProfile, true);
  assert.equal(out.blockTitle, '请先完善资料');
});

test('feedback gate blocks login_failed with retry-only state', () => {
  const out = resolveFeedbackGate({ ok: false, reason: 'login_failed' });
  assert.equal(out.blocked, true);
  assert.equal(out.blockNeedProfile, false);
  assert.equal(out.blockTitle, '登录失败');
});

test('feedback gate clears block when profile is ready', () => {
  const out = resolveFeedbackGate({ ok: true, reason: 'ok' });
  assert.equal(out.blocked, false);
  assert.equal(out.blockMessage, '');
});
