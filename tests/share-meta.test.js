const test = require('node:test');
const assert = require('node:assert/strict');

const shareMeta = require('../miniprogram/core/shareMeta');

function buildTournament(status, extra = {}) {
  return {
    _id: 't_1',
    name: '周末友谊赛',
    status,
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players: [
      { id: 'u_admin', name: '组织者' },
      { id: 'u_joined', name: '已加入球友' },
      { id: 'u_other', name: '球友B' },
      { id: 'u_other2', name: '球友C' }
    ],
    rankings: [
      { entityType: 'player', entityId: 'u_admin', playerId: 'u_admin', name: '组织者', wins: 2, losses: 0, played: 2, pointsFor: 42, pointsAgainst: 30, pointDiff: 12 },
      { entityType: 'player', entityId: 'u_joined', playerId: 'u_joined', name: '已加入球友', wins: 1, losses: 1, played: 2, pointsFor: 39, pointsAgainst: 35, pointDiff: 4 }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          { matchIndex: 0, status: 'finished', teamA: ['u_admin', 'u_joined'], teamB: ['u_other', 'u_other2'], score: { teamA: 21, teamB: 18 } }
        ]
      }
    ],
    ...extra
  };
}

test('shareMeta builds join preview for draft tournaments', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('draft'),
    openid: 'u_new'
  });
  assert.equal(preview.viewMode, 'join-preview');
  assert.equal(preview.viewModeLabel, '未加入');
  assert.equal(preview.joinAllowed, true);
  assert.equal(preview.primaryAction.text, '加入比赛');
  assert.equal(preview.secondaryAction, null);
  assert.equal(preview.organizerName, '组织者');
});

test('shareMeta builds joined entry state for joined viewer', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('draft'),
    openid: 'u_joined'
  });
  assert.equal(preview.viewMode, 'joined-entry');
  assert.equal(preview.joined, true);
  assert.equal(preview.primaryAction.text, '进入比赛');
});

test('shareMeta keeps unjoined running viewers on the same not-joined surface', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('running'),
    openid: 'u_new'
  });
  assert.equal(preview.viewMode, 'join-closed');
  assert.equal(preview.primaryAction.text, '查看比赛');
  assert.equal(preview.secondaryAction, null);
  assert.equal(preview.showRankingPreview, false);
  assert.match(preview.progressText, /已完成/);
});

test('shareMeta shows result-oriented action for joined finished viewers', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('finished'),
    openid: 'u_joined'
  });
  assert.equal(preview.viewMode, 'joined-entry');
  assert.equal(preview.primaryAction.text, '查看结果');
  assert.match(preview.availabilityText, /已结束/);
});

test('shareMeta shows schedule-oriented action for joined running viewers', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('running'),
    openid: 'u_joined'
  });
  assert.equal(preview.viewMode, 'joined-entry');
  assert.equal(preview.primaryAction.text, '查看赛程');
  assert.match(preview.availabilityText, /赛程/);
});

test('shareMeta keeps unjoined finished viewers on the same not-joined surface', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('finished'),
    openid: 'u_new'
  });
  assert.equal(preview.viewMode, 'join-closed');
  assert.equal(preview.primaryAction.text, '查看结果');
  assert.equal(preview.secondaryAction, null);
  assert.match(preview.progressText, /已完成 1\/1 场/);
});

test('shareMeta falls back to invalid state for missing tournaments', () => {
  const preview = shareMeta.buildShareEntryViewModel({ tournament: null, openid: 'u_new' });
  assert.equal(preview.viewMode, 'invalid-match');
  assert.equal(preview.primaryAction.text, '重新加载');
  assert.equal(preview.secondaryAction.text, '返回首页');
});

test('shareMeta can build retryable sync failure state separately from invalid links', () => {
  const preview = shareMeta.buildRetryableShareEntryState('同步失败，请稍后重试');
  assert.equal(preview.viewMode, 'retryable-error');
  assert.equal(preview.viewModeLabel, '同步失败');
  assert.equal(preview.primaryAction.text, '重新加载');
  assert.equal(preview.secondaryAction.text, '返回首页');
});

test('shareMeta builds lifecycle-agnostic share copy', () => {
  const draftShare = shareMeta.buildShareMessage(buildTournament('draft'));
  const runningShare = shareMeta.buildShareMessage(buildTournament('running'));
  const finishedShare = shareMeta.buildShareMessage(buildTournament('finished'));

  assert.equal(draftShare.title, '周末友谊赛 · 查看比赛');
  assert.equal(draftShare.intent, 'view');
  assert.equal(draftShare.buttonText, '转发');
  assert.equal(runningShare.title, '周末友谊赛 · 查看比赛');
  assert.equal(runningShare.path, '/pages/share-entry/index?tournamentId=t_1');
  assert.equal(finishedShare.title, '周末友谊赛 · 查看比赛');
  assert.equal(finishedShare.panelTitle, '转发比赛');
});
