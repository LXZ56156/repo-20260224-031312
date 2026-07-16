const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');
const viewModel = require('../miniprogram/pages/settings/settingsViewModel');

test('settings view model turns the page into draft-only tournament editing', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_1',
    name: '周末双打',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: [
      { id: 'u_1', name: 'A' },
      { id: 'u_2', name: 'B' },
      { id: 'u_3', name: 'C' },
      { id: 'u_4', name: 'D' }
    ],
    totalMatches: 6,
    courts: 2,
    rules: {
      pointsPerGame: 15,
      endCondition: { type: 'total_matches', target: 6 }
    }
  }, {
    openid: 'u_1'
  });

  assert.equal(state.pageTitle, '修改比赛');
  assert.equal(state.contextTitle, '仅草稿阶段可修改比赛信息');
  assert.equal(state.name, '周末双打');
  assert.equal(state.pointsPerGame, 15);
  assert.equal(state.showSquadEndCondition, false);
  assert.equal(state.isAdmin, true);
});

test('settings view model exposes squad end condition editing when mode is squad doubles', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_2',
    name: '小队对抗',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_SQUAD_DOUBLES,
    players: [
      { id: 'u_1', name: 'A1', squad: 'A' },
      { id: 'u_2', name: 'A2', squad: 'A' },
      { id: 'u_3', name: 'B1', squad: 'B' },
      { id: 'u_4', name: 'B2', squad: 'B' }
    ],
    totalMatches: 8,
    courts: 2,
    rules: {
      pointsPerGame: 21,
      endCondition: { type: 'target_wins', target: 5 }
    }
  }, {
    openid: 'u_1'
  });

  assert.equal(state.showSquadEndCondition, true);
  assert.equal(state.endConditionType, 'target_wins');
  assert.equal(state.endConditionTarget, 5);
  assert.equal(state.showEndConditionTargetPicker, true);
});

test('settings view model exposes water only for canonical multi_rotate and preserves valid zero default', () => {
  const base = {
    _id: 't_water',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: [
      { id: 'u_1', name: 'A' },
      { id: 'u_2', name: 'B' },
      { id: 'u_3', name: 'C' },
      { id: 'u_4', name: 'D' }
    ],
    totalMatches: 6,
    courts: 1
  };

  const missing = viewModel.buildSettingsViewState(base, { openid: 'u_1' });
  assert.equal(missing.showWaterSettings, true);
  assert.equal(missing.waterEnabled, false);
  assert.equal(missing.waterDefaultUnitsPerLoser, 1);

  const enabled = viewModel.buildSettingsViewState({
    ...base,
    rules: { water: { enabled: true, defaultUnitsPerLoser: 0 } }
  }, { openid: 'u_1' });
  assert.equal(enabled.showWaterSettings, true);
  assert.equal(enabled.waterEnabled, true);
  assert.equal(enabled.waterDefaultUnitsPerLoser, 0);

  const invalid = viewModel.buildSettingsViewState({
    ...base,
    rules: { water: { enabled: true, defaultUnitsPerLoser: 3 } }
  }, { openid: 'u_1' });
  assert.equal(invalid.waterEnabled, false);
  assert.equal(invalid.waterDefaultUnitsPerLoser, 1);

  const squad = viewModel.buildSettingsViewState({
    ...base,
    mode: flow.MODE_SQUAD_DOUBLES,
    rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } }
  }, { openid: 'u_1' });
  assert.equal(squad.showWaterSettings, false);
  assert.equal(squad.waterEnabled, false);
});

test('settings view model exposes fixed fair presets for multi_rotate', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_x',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 8 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 2
  }, { openid: 'u_1' });

  assert.equal(state.useMatchPresetOptions, true);
  assert.equal(state.showAdvancedMatchEntry, true);
  assert.deepEqual(
    state.matchShortcutOptions.map((item) => item.value),
    [8, 14, 16]
  );
  assert.equal(state.currentCustomMatchLabel, '');
  assert.equal(state.coveragePriorityNote, '');
});

test('settings view model keeps fixed rotation label, quota and court options', () => {
  const six = viewModel.buildSettingsViewState({
    _id: 't_rotation_6',
    name: '周末自定义赛',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    presetKey: 'rotation_6',
    playerLimit: 6,
    settingsConfigured: true,
    players: [{ id: 'u_1', name: '组织者' }],
    totalMatches: 9,
    courts: 1
  }, { openid: 'u_1' });

  assert.equal(six.modeLabel, '6人转');
  assert.equal(six.name, '6人转');
  assert.equal(six.canEditTournamentName, false);
  assert.equal(six.playerLimit, 6);
  assert.equal(six.canConfigureSettings, true);
  assert.deepEqual(six.courtOptions, [1]);
  assert.equal(six.editM, 9);
  assert.equal(six.settingsGateHint, '');

  const eight = viewModel.buildSettingsViewState({
    _id: 't_rotation_8',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    presetKey: 'rotation_8',
    playerLimit: 8,
    settingsConfigured: true,
    players: [{ id: 'u_1', name: '组织者' }],
    totalMatches: 14,
    courts: 2
  }, { openid: 'u_1' });

  assert.equal(eight.modeLabel, '8人转');
  assert.deepEqual(eight.courtOptions, [1, 2]);
  assert.equal(eight.courtIndex, 1);
});

test('settings view model defaults small multi_rotate rosters to partner coverage preset', () => {
  const eightSingleCourt = viewModel.buildSettingsViewState({
    _id: 't_8p_1c',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 8 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 1
  }, { openid: 'u_1' });

  assert.deepEqual(
    eightSingleCourt.matchShortcutOptions.map((item) => item.value),
    [8, 14, 16]
  );
  assert.equal(eightSingleCourt.editM, 14);

  const tenRequestedFourCourts = viewModel.buildSettingsViewState({
    _id: 't_10p_4c',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 10 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 4
  }, { openid: 'u_1' });

  assert.deepEqual(
    tenRequestedFourCourts.matchShortcutOptions.map((item) => item.value),
    [15, 23, 30]
  );
  assert.equal(tenRequestedFourCourts.editM, 23);
});

test('settings view model preserves non-preset saved totals as current custom state', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_custom',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 8 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 2,
    totalMatches: 5
  }, { openid: 'u_1' });

  assert.deepEqual(
    state.matchShortcutOptions.map((item) => item.value),
    [8, 14, 16]
  );
  assert.equal(state.editM, 5);
  assert.equal(state.currentCustomMatchLabel, '当前自定义 5 场');
});

test('settings view model exposes expanded large-roster presets for multi_rotate', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_large_roster',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 20 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 2
  }, { openid: 'u_1' });

  assert.equal(state.useMatchPresetOptions, true);
  assert.deepEqual(
    state.matchShortcutOptions.map((item) => item.value),
    [12, 15, 18]
  );
  assert.equal(state.currentCustomMatchLabel, '');
});

test('settings view model surfaces equal-play recommendation notes when presets accept the tradeoff', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_6p',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 6 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 1
  }, { openid: 'u_1' });

  assert.deepEqual(
    state.matchShortcutOptions.map((item) => item.value),
    [9, 15, 18]
  );
  assert.match(state.coveragePriorityNote, /每人 6 场/);
});

test('settings view model keeps two recommendation slots for 7p rotation', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_7p',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 7 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 1
  }, { openid: 'u_1' });

  assert.deepEqual(
    state.matchShortcutOptions.map((item) => item.value),
    [14, 21]
  );
  assert.equal(state.editM, 14);
});

test('settings view model falls back to custom flow when no fixed fair presets exist', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_25p',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: Array.from({ length: 25 }, (_, i) => ({ id: `u_${i}`, name: String(i) })),
    courts: 1
  }, { openid: 'u_1' });

  assert.equal(state.useMatchPresetOptions, false);
  assert.equal(state.matchShortcutOptions.length, 0);
  assert.equal(state.matchPresetUnavailableHint, '该人数暂不提供固定公平档位');
});

test('settings view model clamps fixed pair total matches to valid round-robin capacity', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_3',
    name: '固定搭档',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_FIXED_PAIR_RR,
    players: [
      { id: 'u_1', name: 'P1' },
      { id: 'u_2', name: 'P2' },
      { id: 'u_3', name: 'P3' },
      { id: 'u_4', name: 'P4' }
    ],
    pairTeams: [
      { id: 'team_1', playerIds: ['u_1', 'u_2'] },
      { id: 'team_2', playerIds: ['u_3', 'u_4'] }
    ],
    totalMatches: 99,
    courts: 2
  }, {
    openid: 'u_1'
  });

  assert.equal(state.maxMatches, 10);
  assert.equal(state.editM, 10);
  assert.equal(state.matchShortcutHint.includes('支持多循环'), true);
  assert.deepEqual(
    state.matchShortcutOptions.map((item) => ({
      label: item.label,
      value: item.value,
      disabled: item.disabled
    })),
    [
      { label: '1轮', value: 1, disabled: false },
      { label: '2轮', value: 2, disabled: false },
      { label: '3轮', value: 3, disabled: false },
      { label: '5轮', value: 5, disabled: false },
      { label: '10轮', value: 10, disabled: false }
    ]
  );
});
