const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = require('../miniprogram/core/mode');
const cloud = require('../cloudfunctions/scoreLock/lib/mode');

test('frontend and cloud mode helpers stay consistent for labels and initial rankings', () => {
  const pairTeams = [
    { id: 'pair_1', name: '晨风' },
    { id: 'pair_2', name: '山海' }
  ];
  const players = [
    { id: 'u_1', name: 'A' },
    { id: 'u_2', name: 'B' }
  ];

  assert.equal(frontend.normalizeMode('fixed_pair_rr'), cloud.normalizeMode('fixed_pair_rr'));
  assert.equal(frontend.getModeLabel('squad_doubles'), cloud.getModeLabel('squad_doubles'));
  assert.equal(frontend.normalizePresetKey('rotation_6'), cloud.normalizePresetKey('rotation_6'));
  assert.equal(frontend.getModeDisplayLabel('multi_rotate', 'rotation_8'), cloud.getModeDisplayLabel('multi_rotate', 'rotation_8'));
  assert.equal(frontend.getSynchronizedTournamentName('周末赛', 'multi_rotate', 'rotation_8'), cloud.getSynchronizedTournamentName('周末赛', 'multi_rotate', 'rotation_8'));
  assert.equal(frontend.getTournamentDisplayName({ name: '周末赛', mode: 'multi_rotate', presetKey: 'rotation_7' }), cloud.getTournamentDisplayName({ name: '周末赛', mode: 'multi_rotate', presetKey: 'rotation_7' }));
  assert.deepEqual(frontend.resolveRotationPreset('rotation_7'), cloud.resolveRotationPreset('rotation_7'));
  assert.deepEqual(
    frontend.buildInitialRankings('fixed_pair_rr', players, pairTeams),
    cloud.buildInitialRankings('fixed_pair_rr', players, pairTeams)
  );
});
