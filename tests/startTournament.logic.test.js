const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/startTournament/logic');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

function makeSquadPlayers(aCount, bCount) {
  const players = [];
  for (let i = 0; i < aCount; i += 1) {
    players.push({ id: `A${i + 1}`, name: `A${i + 1}`, squad: 'A' });
  }
  for (let i = 0; i < bCount; i += 1) {
    players.push({ id: `B${i + 1}`, name: `B${i + 1}`, squad: 'B' });
  }
  return players;
}

test('calcMaxMatches computes C(n,4)*3', () => {
  assert.equal(logic.calcMaxMatches(3), 0);
  assert.equal(logic.calcMaxMatches(4), 3);
  assert.equal(logic.calcMaxMatches(8), 210);
});

test('validateBeforeGenerate rejects insufficient players', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({ players: makePlayers(3), totalMatches: 1, courts: 1 }),
    /参赛人数不足/
  );
});

test('validateBeforeGenerate requires fixed rotation player count to be exact', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({
      mode: 'multi_rotate',
      presetKey: 'rotation_6',
      playerLimit: 6,
      settingsConfigured: true,
      players: makePlayers(5),
      totalMatches: 9,
      courts: 1
    }),
    /6人转需要正好 6 人参赛，当前 5 人/
  );
  assert.throws(
    () => logic.validateBeforeGenerate({
      mode: 'multi_rotate',
      presetKey: 'rotation_6',
      playerLimit: 6,
      settingsConfigured: true,
      players: makePlayers(7),
      totalMatches: 9,
      courts: 1
    }),
    /6人转需要正好 6 人参赛，当前 7 人/
  );
});

test('validateBeforeGenerate allows 8-player rotation on two courts', () => {
  const out = logic.validateBeforeGenerate({
    mode: 'multi_rotate',
    presetKey: 'rotation_8',
    playerLimit: 8,
    settingsConfigured: true,
    players: makePlayers(8),
    totalMatches: 14,
    courts: 2
  });

  assert.equal(out.mode, 'multi_rotate');
  assert.equal(out.players.length, 8);
  assert.equal(out.courts, 2);
  assert.equal(out.totalMatches, 14);
});

test('validateBeforeGenerate rejects duplicate player ids', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({
      players: [
        { id: 'p1', name: 'P1' },
        { id: 'p1', name: 'P1 duplicate' },
        { id: 'p2', name: 'P2' },
        { id: 'p3', name: 'P3' }
      ],
      totalMatches: 1,
      courts: 1
    }),
    /重复成员/
  );
});

test('validateBeforeGenerate rejects players missing ids', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({
      players: [
        { id: 'p1', name: 'P1' },
        { id: '   ', name: 'P2' },
        { id: 'p3', name: 'P3' },
        { id: 'p4', name: 'P4' }
      ],
      totalMatches: 1,
      courts: 1
    }),
    /缺少唯一标识/
  );
});

test('validateBeforeGenerate rejects totalMatches over max', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({ players: makePlayers(4), totalMatches: 4, courts: 1 }),
    /总场次不能超过最大可选/
  );
});

test('validateBeforeGenerate rejects target_wins when derived scheduled matches exceed max', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({
      players: makeSquadPlayers(4, 4),
      totalMatches: 1,
      courts: 2,
      mode: 'squad_doubles',
      rules: {
        endCondition: { type: 'target_wins', target: 200 }
      }
    }),
    /结束条件会产生 399 场，不能超过最大可选 210 场/
  );
});

test('validateBeforeGenerate rejects total_rounds when effective scheduled matches exceed max', () => {
  assert.throws(
    () => logic.validateBeforeGenerate({
      players: makeSquadPlayers(4, 4),
      totalMatches: 1,
      courts: 2,
      mode: 'squad_doubles',
      rules: {
        endCondition: { type: 'total_rounds', target: 106 }
      }
    }),
    /结束条件会产生 212 场，不能超过最大可选 210 场/
  );
});

test('validateBeforeGenerate returns normalized values', () => {
  const out = logic.validateBeforeGenerate({ players: makePlayers(6), totalMatches: 5, courts: 99 });
  assert.equal(out.players.length, 6);
  assert.equal(out.totalMatches, 5);
  assert.equal(out.courts, 10);
  assert.equal(out.maxMatches > 0, true);
});

test('validateBeforeGenerate derives scheduledMatches for target_wins', () => {
  const out = logic.validateBeforeGenerate({
    players: makeSquadPlayers(4, 4),
    totalMatches: 1,
    courts: 2,
    mode: 'squad_doubles',
    rules: {
      endCondition: { type: 'target_wins', target: 3 }
    }
  });
  assert.equal(out.totalMatches, 1);
  assert.equal(out.scheduledMatches, 5);
  assert.deepEqual(out.rules.endCondition, { type: 'target_wins', target: 3 });
});

test('validateBeforeGenerate derives scheduledMatches for total_rounds using effective courts', () => {
  const out = logic.validateBeforeGenerate({
    players: makeSquadPlayers(5, 4),
    totalMatches: 1,
    courts: 3,
    mode: 'squad_doubles',
    rules: {
      endCondition: { type: 'total_rounds', target: 6 }
    }
  });
  assert.equal(out.totalMatches, 1);
  assert.equal(out.courts, 3);
  assert.equal(out.scheduledMatches, 12);
  assert.deepEqual(out.rules.endCondition, { type: 'total_rounds', target: 6 });
});

test('validateBeforeGenerate accepts doubles alias and maps to multi_rotate', () => {
  const players = [
    { id: 'p1', name: 'P1', gender: 'male' },
    { id: 'p2', name: 'P2', gender: 'male' },
    { id: 'p3', name: 'P3', gender: 'female' },
    { id: 'p4', name: 'P4', gender: 'unknown' }
  ];
  const out = logic.validateBeforeGenerate({
    players,
    totalMatches: 1,
    courts: 1,
    mode: 'doubles'
  });
  assert.equal(out.mode, 'multi_rotate');
  assert.equal(out.maxMatches > 0, true);
});

test('validateBeforeGenerate accepts explicit multi_rotate regardless of gender mix', () => {
  const players = [
    { id: 'p1', name: 'P1', gender: 'male' },
    { id: 'p2', name: 'P2', gender: 'male' },
    { id: 'p3', name: 'P3', gender: 'female' },
    { id: 'p4', name: 'P4', gender: 'unknown' }
  ];
  const out = logic.validateBeforeGenerate({
    players,
    totalMatches: 1,
    courts: 1,
    mode: 'multi_rotate'
  });
  assert.equal(out.mode, 'multi_rotate');
  assert.equal(out.maxMatches > 0, true);
});

test('validateBeforeGenerate uses 10-cycle cap for fixed pair round robin', () => {
  const players = makePlayers(6);
  const out = logic.validateBeforeGenerate({
    players,
    totalMatches: 30,
    courts: 1,
    mode: 'fixed_pair_rr',
    pairTeams: [
      { id: 'team_1', playerIds: ['p1', 'p2'] },
      { id: 'team_2', playerIds: ['p3', 'p4'] },
      { id: 'team_3', playerIds: ['p5', 'p6'] }
    ]
  });

  assert.equal(out.mode, 'fixed_pair_rr');
  assert.equal(out.maxMatches, 30);
  assert.equal(out.pairTeams.length, 3);
});

test('validateBeforeGenerate blocks fixed pair start when pairTeams are dirty', () => {
  const players = makePlayers(4);
  assert.throws(
    () => logic.validateBeforeGenerate({
      players,
      totalMatches: 3,
      courts: 1,
      mode: 'fixed_pair_rr',
      pairTeams: [
        { id: 'team_1', playerIds: ['p1', 'p2'] },
        { id: 'team_2', playerIds: ['p2', 'p3'] }
      ]
    }),
    /START_PAIR_TEAMS_INVALID/
  );
});
