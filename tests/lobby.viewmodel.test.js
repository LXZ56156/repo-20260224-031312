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

test('lobby view model prefers scheduledMatches over legacy totalMatches after start', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      status: 'running',
      totalMatches: 3,
      scheduledMatches: 5,
      courts: 2,
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

  assert.equal(result.patch.kpiMatches, '5');
  assert.match(result.patch.matchInfoText, /总 5 场/);
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

test('lobby view model keeps fixed rotation label and quota state when not full', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      name: '周末自定义赛',
      presetKey: 'rotation_6',
      playerLimit: 6,
      settingsConfigured: true,
      totalMatches: 9,
      courts: 1,
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' },
        { id: 'u_4', name: '球友4', gender: 'male' }
      ]
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.modeLabel, '6人转');
  assert.equal(result.patch.tournament.name, '6人转');
  assert.equal(result.patch.quickConfigName, '6人转');
  assert.equal(result.patch.quickCanEditTournamentName, false);
  assert.equal(result.patch.kpiPlayers, '5/6');
  assert.equal(result.patch.playerCountText, '5/6 人');
  assert.equal(result.patch.playerLimit, 6);
  assert.equal(result.patch.checkPlayersOk, false);
  assert.equal(result.patch.checkSettingsOk, true);
  assert.equal(result.patch.checkStartReady, false);
  assert.equal(result.patch.playersChecklistHint, '还差 1 人');
  assert.equal(result.patch.primaryTaskKey, 'share');
  assert.match(result.patch.primaryTaskSummary, /还差 1 人/);
});

test('lobby view model lets full fixed rotation draft go straight to start', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      presetKey: 'rotation_8',
      playerLimit: 8,
      settingsConfigured: true,
      totalMatches: 14,
      courts: 2,
      players: Array.from({ length: 8 }, (_, index) => ({
        id: index === 0 ? 'u_admin' : `u_${index}`,
        name: `球友${index}`,
        gender: index % 2 === 0 ? 'male' : 'female'
      }))
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.modeLabel, '8人转');
  assert.equal(result.patch.kpiPlayers, '8/8');
  assert.equal(result.patch.checkStartReady, true);
  assert.equal(result.patch.primaryTaskKey, 'start');
  assert.equal(result.patch.featuredChecklistItem.key, 'start');
});

test('lobby view model hides quick match shortcuts before 4 players', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament(),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(result.patch.quickMatchShortcutOptions, []);
});

test('lobby view model exposes optimized fixed fair presets for multi_rotate', () => {
  const players = Array.from({ length: 8 }, (_, index) => ({
    id: `u_${index}`,
    name: `球友${index}`,
    gender: index % 2 === 0 ? 'male' : 'female'
  }));
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players,
      courts: 2
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.value),
    [8, 14, 16]
  );
  assert.equal(result.patch.quickCurrentCustomMatchLabel, '');
  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.disabled),
    [false, false, false]
  );
  assert.equal(result.patch.quickShowAdvancedMatchEntry, true);
  assert.equal(result.patch.quickShowAdvancedMatchPicker, false);
});

test('lobby view model keeps historical custom totals outside the fixed preset list', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players: [
        { id: 'u_admin', name: '组织者', gender: 'male' },
        { id: 'u_1', name: '球友1', gender: 'male' },
        { id: 'u_2', name: '球友2', gender: 'female' },
        { id: 'u_3', name: '球友3', gender: 'female' }
      ],
      totalMatches: 4
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.value),
    [1, 2, 3]
  );
  assert.equal(result.patch.quickCurrentCustomMatchLabel, '当前自定义 4 场');
});

test('lobby view model exposes expanded large-roster presets for multi_rotate', () => {
  const players = Array.from({ length: 20 }, (_, index) => ({
    id: `u_${index}`,
    name: `球友${index}`,
    gender: index % 2 === 0 ? 'male' : 'female'
  }));
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players,
      courts: 2
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.deepEqual(
    result.patch.quickMatchShortcutOptions.map((item) => item.value),
    [12, 15, 18]
  );
  assert.equal(result.patch.quickCurrentCustomMatchLabel, '');
});

test('lobby view model falls back to settings-only custom flow when no preset case exists', () => {
  const result = viewModel.buildLobbyViewModel({
    tournament: buildTournament({
      players: Array.from({ length: 25 }, (_, index) => ({
        id: `u_${index}`,
        name: `球友${index}`,
        gender: index % 2 === 0 ? 'male' : 'female'
      })),
      courts: 1
    }),
    openid: 'u_admin',
    data: {}
  });

  assert.equal(result.patch.quickUseMatchPresetOptions, false);
  assert.deepEqual(result.patch.quickMatchShortcutOptions, []);
  assert.equal(result.patch.quickShowAdvancedMatchEntry, false);
  assert.equal(result.patch.quickShowAdvancedMatchPicker, false);
  assert.equal(
    result.patch.quickMatchPresetUnavailableHint,
    '该人数暂不提供固定公平档位，请到“修改比赛”里自定义总场数'
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
      value: item.value,
      disabled: item.disabled
    })),
    [
      { value: 3, disabled: false },
      { value: 6, disabled: false },
      { value: 9, disabled: false },
      { value: 15, disabled: false },
      { value: 30, disabled: false }
    ]
  );
});
