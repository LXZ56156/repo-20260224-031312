const test = require('node:test');
const assert = require('node:assert/strict');

const joinError = require('../miniprogram/core/joinTournamentError');

test('joinTournament error helper prefers stable codes over raw backend messages', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'JOIN_DRAFT_ONLY',
    message: '非草稿阶段不可加入/修改'
  }, '加入失败，请稍后重试', { action: 'join' });

  assert.equal(err.joinCode, 'JOIN_DRAFT_ONLY');
  assert.equal(joinError.resolveJoinFailureMessage(err, '加入失败，请稍后重试', { action: 'join' }), '比赛当前不可加入，可先查看比赛信息');
});

test('joinTournament error helper can specialize draft-only copy for profile updates', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'JOIN_DRAFT_ONLY',
    message: '非草稿阶段不可加入/修改'
  }, '保存失败，请稍后重试', { action: 'profile_update' });

  assert.equal(err.joinCode, 'JOIN_DRAFT_ONLY');
  assert.equal(joinError.resolveJoinFailureMessage(err, '保存失败，请稍后重试', { action: 'profile_update' }), '比赛已开始，当前不可修改参赛信息');
});

test('joinTournament error helper keeps conflicts stable and explicit', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '并发冲突，请重试'
  });

  assert.equal(err.joinCode, 'VERSION_CONFLICT');
  assert.equal(joinError.resolveJoinFailureMessage(err), '并发冲突，请重试');
});
