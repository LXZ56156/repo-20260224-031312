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

test('lobby view model turns finished state into summary-only actions and keeps three-item nav', () => {
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
  assert.equal(result.patch.statePrimaryActionKey, '');
  assert.equal(result.patch.nextActionKey, '');
  assert.equal(result.patch.stateSecondaryActions, undefined);
  assert.equal(result.patch.showDraftRules, false);
  assert.equal(result.patch.showDraftAdminPanel, false);
  assert.deepEqual(result.patch.primaryNavItems.map((item) => item.key), ['match', 'ranking', 'schedule']);
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

test('lobby view model hides quick match shortcuts before 4 players', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(result.patch.quickMatchShortcutOptions, []);
});

test('lobby view model de-duplicates quick match shortcuts when players minus one overlaps fixed values', () => {
  const players = Array.from({ length: 7 }, (_, index) => ({
    id: `u_${index}`,
    name: `球友${index}`,
    gender: index % 2 === 0 ? 'male' : 'female'
  }));
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.value),
    [6, 9, 12]
  );
  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.disabled),
    [false, false, false]
  );
});

test('lobby view model disables shortcut values above max matches', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
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

  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => ({
      value: item.value,
      disabled: item.disabled
    })),
    [
      { value: 3, disabled: false },
      { value: 6, disabled: true },
      { value: 9, disabled: true },
      { value: 12, disabled: true }
    ]
  );
});

test('lobby view model exposes fixed pair cycle shortcuts and hint', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: `u_${index}`,
    name: `球友${index}`
  }));
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      mode: 'fixed_pair_rr',
      players,
      pairTeams: [
        { id: 'team_1', playerIds: ['u_0', 'u_1'] },
        { id: 'team_2', playerIds: ['u_2', 'u_3'] },
        { id: 'team_3', playerIds: ['u_4', 'u_5'] }
      ]
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.quickMatchShortcutHint.includes('支持多循环'), true);
  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => ({
      label: item.label,
      value: item.value,
      disabled: item.disabled
    })),
    [
      { label: '1轮', value: 3, disabled: false },
      { label: '2轮', value: 6, disabled: false },
      { label: '3轮', value: 9, disabled: false },
      { label: '5轮', value: 15, disabled: false },
      { label: '10轮', value: 30, disabled: false }
    ]
  );
});
