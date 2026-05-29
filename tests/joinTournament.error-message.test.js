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

test('joinTournament error helper preserves fixed rotation quota copy from backend', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'PLAYER_LIMIT_REACHED',
    message: '该赛制最多 6 人参赛'
  });

  assert.equal(err.joinCode, 'PLAYER_LIMIT_REACHED');
  assert.equal(joinError.resolveJoinFailureMessage(err), '该赛制最多 6 人参赛');
});

test('joinTournament error helper maps not-joined profile update to refresh guidance', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'PLAYER_NOT_JOINED',
    state: 'not_joined',
    message: '请先加入比赛后再更新参赛信息'
  }, '保存失败，请稍后重试', { action: 'profile_update' });

  assert.equal(err.joinCode, 'PLAYER_NOT_JOINED');
  assert.equal(joinError.resolveJoinFailureMessage(err, '保存失败，请稍后重试', { action: 'profile_update' }), '请刷新比赛后重试');
});
