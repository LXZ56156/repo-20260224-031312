const test = require('node:test');
const assert = require('node:assert/strict');

const joinError = require('../miniprogram/core/joinTournamentError');

test('joinTournament error helper prefers stable codes over raw backend messages', () => {
  const err = joinError.normalizeJoinFailure({
    ok: false,
    code: 'JOIN_DRAFT_ONLY',
    message: '非草稿阶段不可加入/修改'
  });

  assert.equal(err.joinCode, 'JOIN_DRAFT_ONLY');
  assert.equal(joinError.resolveJoinFailureMessage(err), '比赛当前不可加入，可先查看赛况或结果');
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
