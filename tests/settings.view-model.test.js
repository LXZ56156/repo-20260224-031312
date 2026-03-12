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
    openid: 'u_1',
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES
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
    openid: 'u_1',
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES
  });

  assert.equal(state.showSquadEndCondition, true);
  assert.equal(state.endConditionType, 'target_wins');
  assert.equal(state.endConditionTarget, 5);
  assert.equal(state.showEndConditionTargetPicker, true);
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
    openid: 'u_1',
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES
  });

  assert.equal(state.maxMatches, 1);
  assert.equal(state.editM, 1);
});
