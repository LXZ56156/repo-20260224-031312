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
  assert.match(cards.admin.summary, /先保存比赛参数/);
  assert.match(cards.profile_pending.summary, /先补昵称和头像/);
});

test('lobby template exposes role overview card before generic info flow', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );

  const roleIndex = wxml.indexOf('角色与下一步');
  const infoIndex = wxml.indexOf('本场信息');
  assert.notEqual(roleIndex, -1);
  assert.notEqual(infoIndex, -1);
  assert.ok(roleIndex < infoIndex);
  assert.match(wxml, /bindtap="onRoleActionTap"/);
  assert.match(wxml, /下一步：\{\{item\.actionText\}\}/);
});
