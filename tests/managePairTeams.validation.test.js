const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/managePairTeams/logic');

function samplePlayers() {
  return [
    { id: 'u1', name: 'A' },
    { id: 'u2', name: 'B' },
    { id: 'u3', name: 'C' },
    { id: 'u4', name: 'D' },
    { id: 'u5', name: 'E' }
  ];
}

test('create team rejects duplicate member used by another team', () => {
  const teams = [{
    id: 'pair_1',
    name: '第1队',
    playerIds: ['u1', 'u2'],
    locked: true
  }];
  const out = logic.applyAction({
    action: 'create',
    teams,
    players: samplePlayers(),
    validPlayerIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    event: { playerIds: ['u1', 'u3'] }
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'DUPLICATE_PLAYER');
});

test('create team rejects invalid player id', () => {
  const out = logic.applyAction({
    action: 'create',
    teams: [],
    players: samplePlayers(),
    validPlayerIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    event: { playerIds: ['u1', 'x999'] }
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'INVALID_PLAYER');
});

test('auto_generate returns warning when odd player remains', () => {
  const out = logic.applyAction({
    action: 'auto_generate',
    teams: [],
    players: samplePlayers(),
    validPlayerIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    event: {}
  });
  assert.equal(out.ok, true);
  assert.equal(Array.isArray(out.warnings), true);
  assert.equal(out.warnings.length > 0, true);
});
