const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');
const viewModel = require('../miniprogram/pages/settings/settingsViewModel');

test('settings view model marks insufficient draft roster as not ready', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_1',
    status: 'draft',
    creatorId: 'u_1',
    mode: flow.MODE_MULTI_ROTATE,
    players: [
      { id: 'u_1', name: 'A' },
      { id: 'u_2', name: 'B' },
      { id: 'u_3', name: 'C' }
    ],
    totalMatches: 0,
    courts: 1
  }, {
    openid: 'u_1',
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES
  });

  assert.equal(state.playersReady, false);
  assert.equal(state.playersGap, 1);
  assert.equal(state.playersStatusText, '还差 1 人');
  assert.equal(state.isAdmin, true);
});

test('settings view model requires balanced squads for squad doubles', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_2',
    status: 'draft',
    mode: flow.MODE_SQUAD_DOUBLES,
    players: [
      { id: 'u_1', name: 'A1', squad: 'A' },
      { id: 'u_2', name: 'A2', squad: 'A' },
      { id: 'u_3', name: 'A3', squad: 'A' },
      { id: 'u_4', name: 'B1', squad: 'B' }
    ],
    totalMatches: 0,
    courts: 1
  }, {
    openid: 'u_1',
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES
  });

  assert.equal(state.playersReady, false);
  assert.equal(state.playersStatusText, 'A队 3 / B队 1（至少各2人）');
});

test('settings view model uses pair teams to compute fixed pair readiness', () => {
  const state = viewModel.buildSettingsViewState({
    _id: 't_3',
    status: 'draft',
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

  assert.equal(state.playersReady, true);
  assert.equal(state.maxMatches, 1);
  assert.equal(state.editM, 1);
});
