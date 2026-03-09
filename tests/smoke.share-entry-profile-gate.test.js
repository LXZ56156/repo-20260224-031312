const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/pages/share-entry/flow');
const shareMeta = require('../miniprogram/core/shareMeta');

test('smoke: share-entry keeps preview links compatible and exposes preview modes', () => {
  assert.equal(flow.parseTournamentId({ tournamentId: 't_1' }), 't_1');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tournamentId=t_2&intent=join') }), 't_2');

  const invalid = shareMeta.buildInvalidShareEntryState('链接无效');
  assert.equal(invalid.viewMode, 'invalid-match');
  assert.equal(invalid.primaryAction.text, '重新加载');

  const preview = shareMeta.buildShareEntryViewModel({
    openid: 'viewer_1',
    tournament: {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      creatorId: 'u_admin',
      mode: 'multi_rotate',
      players: [{ id: 'u_admin', name: '组织者' }],
      rankings: [],
      rounds: []
    }
  });
  assert.equal(preview.viewMode, 'join-preview');
  assert.equal(preview.primaryAction.text, '加入比赛');
  assert.match(flow.buildReturnUrl('t_1', 'join'), /\/pages\/share-entry\/index\?tournamentId=t_1&intent=join/);
});
