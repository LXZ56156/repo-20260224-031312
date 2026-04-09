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
