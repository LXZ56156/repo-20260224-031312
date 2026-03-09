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
  assert.equal(preview.joinAllowed, true);
  assert.equal(preview.primaryAction.text, '加入比赛');
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

test('shareMeta builds live watch state for running tournament viewers', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('running'),
    openid: 'u_new'
  });
  assert.equal(preview.viewMode, 'live-watch');
  assert.equal(preview.primaryAction.text, '查看赛况');
  assert.equal(preview.showRankingPreview, true);
  assert.equal(preview.rankingsPreview[0].name, '组织者');
});

test('shareMeta builds result view state for finished tournament viewers', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: buildTournament('finished'),
    openid: 'u_new'
  });
  assert.equal(preview.viewMode, 'result-view');
  assert.equal(preview.primaryAction.text, '查看结果');
  assert.match(preview.progressText, /已完成 1\/1 场/);
});

test('shareMeta falls back to invalid state for missing tournaments', () => {
  const preview = shareMeta.buildShareEntryViewModel({ tournament: null, openid: 'u_new' });
  assert.equal(preview.viewMode, 'invalid-match');
  assert.equal(preview.primaryAction.text, '重新加载');
});
