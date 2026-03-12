const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.equal(cards.admin.actionKey, 'settings');
  assert.equal(cards.joined.active, false);
  assert.equal(cards.viewer.active, false);
  assert.equal(cards.profile_pending.active, false);
  assert.match(cards.admin.summary, /先修改比赛信息/);
  assert.match(cards.profile_pending.summary, /先补昵称和头像/);
  assert.equal(result.patch.statePanelTitle, '开赛前准备');
  assert.equal(result.patch.statePrimaryActionKey, 'settings');
  assert.equal(result.patch.showDraftAdminPanel, true);
  assert.equal(result.patch.showStateChecklist, true);
});

test('lobby template promotes state-driven next step before generic info flow', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );

  const stateIndex = wxml.indexOf('{{statePanelTitle}}');
  const infoIndex = wxml.indexOf('比赛信息');
  assert.notEqual(stateIndex, -1);
  assert.notEqual(infoIndex, -1);
  assert.ok(stateIndex < infoIndex);
  assert.doesNotMatch(wxml, /角色与下一步/);
  assert.doesNotMatch(wxml, /next-action-bar/);
  assert.doesNotMatch(wxml, /state-panel-detail/);
  assert.doesNotMatch(wxml, /stateSecondaryActions/);
  assert.doesNotMatch(wxml, /bindtap="onStateSecondaryTap"/);
  assert.doesNotMatch(wxml, /次级操作/);
  assert.doesNotMatch(wxml, /重置回草稿/);
  assert.doesNotMatch(wxml, /规则说明/);
  assert.match(wxml, /bindtap="onNextActionTap"/);
});
