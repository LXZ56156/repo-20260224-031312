const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/cloneTournament/logic');

test('copyPlayers keeps creator and remaps guests', () => {
  const sourcePlayers = [
    { id: 'creator-openid', name: '管理员', avatar: 'a.png', gender: 'male' },
    { id: 'p2', name: '球友B', avatar: 'b.png', gender: 'female' },
    { id: 'p3', name: '球友C', avatar: 'c.png', gender: 'unknown' }
  ];
  const out = logic.copyPlayers(sourcePlayers, 'creator-openid', (idx) => `guest_${idx}`);
  assert.equal(out.players[0].id, 'creator-openid');
  assert.equal(out.players[0].type, 'user');
  assert.equal(out.players[1].id, 'guest_1');
  assert.equal(out.players[2].id, 'guest_2');
  assert.equal(out.playerIdMap.p2, 'guest_1');
  assert.equal(out.playerIdMap.p3, 'guest_2');
});

test('copyPairTeams preserves team name and remaps members for fixed pair replay', () => {
  const out = logic.copyPairTeams(
    [
      { id: 'pair_a', name: '晨风', playerIds: ['p1', 'p2'] },
      { id: 'pair_b', name: '山海', playerIds: ['p3', 'p4'] }
    ],
    {
      p1: 'n1',
      p2: 'n2',
      p3: 'n3',
      p4: 'n4'
    }
  );

  assert.deepEqual(out, [
    { id: 'pair_a', name: '晨风', playerIds: ['n1', 'n2'], locked: true },
    { id: 'pair_b', name: '山海', playerIds: ['n3', 'n4'], locked: true }
  ]);
});

test('copyPairTeams drops incomplete teams after player remap', () => {
  const out = logic.copyPairTeams(
    [
      { id: 'pair_a', name: '晨风', playerIds: ['p1', 'p2'] },
      { id: 'pair_b', name: '山海', playerIds: ['p3', 'p4'] }
    ],
    {
      p1: 'n1',
      p2: 'n2',
      p3: 'n3'
    }
  );

  assert.deepEqual(out, [
    { id: 'pair_a', name: '晨风', playerIds: ['n1', 'n2'], locked: true }
  ]);
});
