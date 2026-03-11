const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/cloneTournament/logic');

test('cloneTournament preserves squad assignments for squad_doubles copies', () => {
  const out = logic.copyPlayers(
    [
      { id: 'creator', name: '管理员', squad: 'A' },
      { id: 'p2', name: '球友B', squad: 'B' },
      { id: 'p3', name: '球友C', squad: 'x' }
    ],
    'creator',
    (idx) => `guest_${idx}`,
    { preserveSquad: true }
  );

  assert.deepEqual(out.players.map((item) => item.squad), ['A', 'B', '']);
});

test('cloneTournament still clears squad assignments outside squad_doubles mode', () => {
  const out = logic.copyPlayers(
    [
      { id: 'creator', name: '管理员', squad: 'A' },
      { id: 'p2', name: '球友B', squad: 'B' }
    ],
    'creator',
    (idx) => `guest_${idx}`,
    { preserveSquad: false }
  );

  assert.deepEqual(out.players.map((item) => item.squad), ['', '']);
});
