const test = require('node:test');
const assert = require('node:assert/strict');

const viewModel = require('../miniprogram/pages/lobby/lobbyViewModel');

function buildTournament(overrides = {}) {
  return {
    _id: 't_lobby_vm',
    name: '周中夜场',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    settingsConfigured: true,
    version: 3,
    players: [
      { id: 'u_admin', name: '组织者', gender: 'male' },
      { id: 'u_1', name: '球友1', gender: 'male' },
      { id: 'u_2', name: '球友2', gender: 'female' }
    ],
    rankings: [],
    rounds: [],
    ...overrides
  };
}

test('lobby view model partitions admin role flow and promotes share before backup import', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.currentRoleKey, 'admin');
  assert.equal(result.patch.nextActionKey, 'share');
  assert.equal(result.patch.nextActionText, '转发');
  assert.equal(result.patch.statePanelTitle, '开赛前准备');
  assert.equal(result.patch.statePrimaryActionKey, 'share');
  assert.equal(result.patch.statePrimaryActionText, '转发');
  assert.equal(result.patch.featuredChecklistItem.key, 'players');
  assert.equal(result.patch.featuredChecklistItem.title, '2. 转发比赛');
  assert.equal(result.patch.featuredChecklistItem.state, 'active');
  assert.deepEqual(
    result.patch.secondaryChecklistItems.map((item) => item.title),
    ['1. 修改比赛', '3. 开始比赛']
  );
  assert.deepEqual(
    result.patch.roleCards.map((item) => item.key),
    ['admin', 'joined', 'viewer', 'profile_pending']
  );
  assert.equal(result.patch.checklistItems[1].actionText, '去转发');
  assert.equal(result.patch.stateSecondaryActions, undefined);
});

test('lobby view model promotes settings card when admin draft is missing required configuration', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      settingsConfigured: false,
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ]
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.featuredChecklistItem.key, 'settings');
  assert.equal(result.patch.featuredChecklistItem.title, '1. 修改比赛');
  assert.equal(result.patch.featuredChecklistItem.state, 'active');
  assert.deepEqual(
    result.patch.secondaryChecklistItems.map((item) => item.title),
    ['2. 转发比赛', '3. 开始比赛']
  );
});

test('lobby view model keeps unjoined draft visitors in pending-profile role once they expand join flow', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ]
    }),
    openid: 'u_viewer',
    data: {
      entryMode: '',
      viewOnlyJoinExpanded: true
    }
  });

  assert.equal(result.patch.showJoin, true);
  assert.equal(result.patch.currentRoleKey, 'profile_pending');
  assert.equal(result.patch.nextActionKey, 'profile_join');
  assert.equal(result.patch.nextActionText, '确认加入');
  assert.match(result.patch.nextActionDetail, /先补昵称和头像/);
  assert.equal(result.patch.statePanelTitle, '加入前确认');
  assert.equal(result.patch.statePrimaryActionKey, 'profile_join');
  assert.equal(result.patch.showDraftAdminPanel, false);
});

test('lobby view model turns finished state into result-first actions', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      status: 'finished',
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ]
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.statePanelTitle, '比赛结果');
  assert.equal(result.patch.statePrimaryActionKey, 'analytics');
  assert.equal(result.patch.stateSecondaryActions, undefined);
  assert.equal(result.patch.showDraftRules, false);
  assert.equal(result.patch.showDraftAdminPanel, false);
});

test('lobby view model promotes start card when admin draft is ready to begin', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      settingsConfigured: true,
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ]
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.nextActionKey, 'start');
  assert.equal(result.patch.featuredChecklistItem.key, 'start');
  assert.equal(result.patch.featuredChecklistItem.title, '3. 开始比赛');
  assert.equal(result.patch.featuredChecklistItem.state, 'active');
  assert.deepEqual(
    result.patch.secondaryChecklistItems.map((item) => [item.key, item.state]),
    [['settings', 'done'], ['players', 'done']]
  );
});
