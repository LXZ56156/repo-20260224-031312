const test = require('node:test');
const assert = require('node:assert/strict');
const viewModel = require('../miniprogram/pages/lobby/lobbyViewModel');

test('lobby admin draft view prioritizes拉人流程并 keeps destructive reset entry removed', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: {
      _id: 't_admin_actions',
      name: '管理员操作',
      status: 'draft',
      creatorId: 'u_admin',
      mode: 'multi_rotate',
      settingsConfigured: false,
      version: 1,
      players: [
        { id: 'u_admin', name: '管理员', gender: 'male' },
        { id: 'u_1', name: '球友A', gender: 'female' }
      ],
      pairTeams: [],
      rankings: [],
      rounds: []
    },
    openid: 'u_admin',
    data: {}
  });
  const checklistTitles = (result.patch.checklistItems || []).map((item) => item.title);

  assert.equal(result.patch.nextActionKey, 'share');
  assert.equal(result.patch.nextActionText, '转发');
  assert.equal(result.patch.featuredChecklistItem.key, 'players');
  assert.equal(result.patch.playerRosterHint, '长按成员可移除');
  assert.deepEqual(
    result.patch.secondaryChecklistItems.map((item) => item.key),
    ['settings', 'start']
  );
  assert.equal(checklistTitles.includes('1. 修改比赛'), true);
  assert.equal(checklistTitles.includes('2. 转发比赛'), true);
  assert.equal(checklistTitles.includes('重置回草稿'), false);
});

test('lobby member draft view hints self removal only', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: {
      _id: 't_member_remove_hint',
      name: '成员操作',
      status: 'draft',
      creatorId: 'u_admin',
      mode: 'multi_rotate',
      settingsConfigured: false,
      version: 1,
      players: [
        { id: 'u_admin', name: '管理员', gender: 'male' },
        { id: 'u_member', name: '球友A', gender: 'female' }
      ],
      pairTeams: [],
      rankings: [],
      rounds: []
    },
    openid: 'u_member',
    data: {}
  });

  assert.equal(result.patch.isAdmin, false);
  assert.equal(result.patch.myJoined, true);
  assert.equal(result.patch.playerRosterHint, '长按自己可退出');
});
