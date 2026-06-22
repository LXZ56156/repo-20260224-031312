const test = require('node:test');
const assert = require('node:assert/strict');

const viewModel = require('../miniprogram/pages/lobby/lobbyViewModel');

function buildTournament() {
  return {
    _id: 't_lobby_roles',
    name: '管理员分区视图',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    settingsConfigured: false,
    version: 2,
    players: [
      { id: 'u_admin', name: '组织者', gender: 'male' },
      { id: 'u_1', name: '球友1', gender: 'female' }
    ],
    rankings: [],
    rounds: []
  };
}

test('lobby admin view model separates role lanes and keeps admin lane active', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_admin',
    data: {}
  });
  const cards = Object.fromEntries(result.patch.roleCards.map((item) => [item.key, item]));

  assert.equal(cards.admin.active, true);
  assert.equal(cards.admin.actionKey, 'share');
  assert.equal(cards.admin.actionText, '邀请球友');
  assert.equal(cards.joined.active, false);
  assert.equal(cards.viewer.active, false);
  assert.equal(cards.profile_pending.active, false);
  assert.match(cards.admin.summary, /名单未就绪/);
  assert.match(cards.profile_pending.summary, /先补昵称和头像/);
  assert.equal(result.patch.statePanelTitle, '下一步');
  assert.equal(result.patch.statePrimaryActionKey, 'share');
  assert.equal(result.patch.showDraftAdminPanel, true);
  assert.equal(Object.hasOwn(result.patch, 'showStateChecklist'), false);
  assert.equal(Object.hasOwn(result.patch, 'featuredChecklistItem'), false);
});

test('lobby admin draft view keeps state-driven CTA ahead of generic info actions', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.statePanelTitle, '下一步');
  assert.equal(result.patch.statePrimaryActionKey, 'share');
  assert.equal(result.patch.statePrimaryActionText, '邀请球友');
  assert.equal(result.patch.nextActionKey, 'share');
  assert.equal(result.patch.nextActionDetail.includes('名单未就绪'), true);
  assert.equal(Object.hasOwn(result.patch, 'showStateChecklist'), false);
});
