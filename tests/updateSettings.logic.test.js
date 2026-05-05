const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/updateSettings/logic');

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

test('parsePosInt normalizes numeric input', () => {
  assert.equal(logic.parsePosInt('', 10), null);
  assert.equal(logic.parsePosInt('3.8', 10), 3);
  assert.equal(logic.parsePosInt('18', 10), 10);
  assert.equal(logic.parsePosInt('abc', 10), null);
});

test('validateSettings allows preconfiguration when players less than 4', () => {
  const out = logic.validateSettings(makePlayers(3), 1, 1);
  assert.equal(out.maxMatches, 0);
  assert.equal(out.patch.totalMatches, 1);
  assert.equal(out.patch.courts, 1);
  assert.equal(out.patch.settingsConfigured, true);
});

test('validateSettings rejects totalMatches over max', () => {
  assert.throws(
    () => logic.validateSettings(makePlayers(4), 9, 1),
    /总场次不能超过最大可选/
  );
});

test('validateSettings rejects duplicate player ids', () => {
  assert.throws(
    () => logic.validateSettings([
      { id: 'p1', name: 'P1' },
      { id: 'p1', name: 'P1 duplicate' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' }
    ], 1, 1),
    /重复成员/
  );
});

test('validateSettings rejects target_wins when derived scheduled matches exceed max', () => {
  assert.throws(
    () => logic.validateSettings(
      makeSquadPlayers(4, 4),
      1,
      2,
      'squad_doubles',
      [],
      {
        resolvedTotalMatches: 1,
        endConditionType: 'target_wins',
        endConditionTarget: 200
      }
    ),
    /结束条件会产生 399 场，不能超过最大可选 210 场/
  );
});

test('validateSettings rejects total_rounds when effective scheduled matches exceed max', () => {
  assert.throws(
    () => logic.validateSettings(
      makeSquadPlayers(4, 4),
      1,
      2,
      'squad_doubles',
      [],
      {
        resolvedTotalMatches: 1,
        resolvedCourts: 2,
        endConditionType: 'total_rounds',
        endConditionTarget: 106
      }
    ),
    /结束条件会产生 212 场，不能超过最大可选 210 场/
  );
});

test('validateSettings builds patch and sets settingsConfigured only when both present', () => {
  const partial = logic.validateSettings(makePlayers(8), 5, null);
  assert.equal(partial.patch.totalMatches, 5);
  assert.equal(Object.prototype.hasOwnProperty.call(partial.patch, 'settingsConfigured'), false);

  const full = logic.validateSettings(makePlayers(8), 5, 2);
  assert.equal(full.patch.totalMatches, 5);
  assert.equal(full.patch.courts, 2);
  assert.equal(full.patch.settingsConfigured, true);
});

test('validateSettings returns derived scheduledMatches for target_wins', () => {
  const out = logic.validateSettings(
    makeSquadPlayers(4, 4),
    1,
    2,
    'squad_doubles',
    [],
    {
      resolvedTotalMatches: 1,
      endConditionType: 'target_wins',
      endConditionTarget: 3
    }
  );
  assert.equal(out.scheduledMatches, 5);
});

test('validateSettings returns effective scheduledMatches for total_rounds', () => {
  const out = logic.validateSettings(
    makeSquadPlayers(5, 4),
    1,
    3,
    'squad_doubles',
    [],
    {
      resolvedTotalMatches: 1,
      resolvedCourts: 3,
      endConditionType: 'total_rounds',
      endConditionTarget: 6
    }
  );
  assert.equal(out.scheduledMatches, 12);
});

test('validateSettings uses 10-cycle cap for fixed pair round robin', () => {
  const players = makePlayers(6);
  const pairTeams = [
    { id: 'team_1', playerIds: ['p1', 'p2'] },
    { id: 'team_2', playerIds: ['p3', 'p4'] },
    { id: 'team_3', playerIds: ['p5', 'p6'] }
  ];

  const out = logic.validateSettings(players, 30, 1, 'fixed_pair_rr', pairTeams);
  assert.equal(out.maxMatches, 30);
  assert.throws(
    () => logic.validateSettings(players, 31, 1, 'fixed_pair_rr', pairTeams),
    /总场次不能超过最大可选 30 场/
  );
});
