const test = require('node:test');
const assert = require('node:assert/strict');

const rankingCore = require('../miniprogram/core/rankingCore');
const {
  normalizeUnitsPerLoser,
  normalizeWaterConfig,
  deriveWaterLedger
} = require('../miniprogram/core/waterLedger');

function makePlayers() {
  return [
    { id: 'u1', name: '阿杰' },
    { id: 'u2', name: '小林' },
    { id: 'u3', name: '王敏' },
    { id: 'u4', name: '陈晨' },
    { id: 'u5', name: '周周' }
  ];
}

function makeMatch({
  matchIndex = 0,
  status = 'finished',
  scoreA = 21,
  scoreB = 18,
  unitsPerLoser = 1,
  teamA = ['u1', 'u2'],
  teamB = ['u3', 'u4']
} = {}) {
  const players = Object.fromEntries(makePlayers().map((player) => [player.id, player]));
  const match = {
    matchIndex,
    status,
    teamA: teamA.map((id) => ({ ...players[id] })),
    teamB: teamB.map((id) => ({ ...players[id] })),
    score: { teamA: scoreA, teamB: scoreB }
  };
  if (unitsPerLoser !== undefined) match.water = { unitsPerLoser };
  return match;
}

function makeTournament(matches, water = { enabled: true, defaultUnitsPerLoser: 1 }) {
  return {
    mode: 'multi_rotate',
    players: makePlayers(),
    rules: { water },
    rounds: [{ roundIndex: 0, matches }]
  };
}

test('water config is enabled only for canonical multi_rotate with a valid default', () => {
  assert.equal(normalizeUnitsPerLoser(0), 0);
  assert.equal(normalizeUnitsPerLoser('2'), 2);
  assert.equal(normalizeUnitsPerLoser(' 1 '), 1);
  assert.equal(normalizeUnitsPerLoser(1.5), null);
  assert.equal(normalizeUnitsPerLoser(3), null);
  for (const malformed of [true, false, ' ', [1], {}]) {
    assert.equal(normalizeUnitsPerLoser(malformed), null);
  }

  assert.deepEqual(normalizeWaterConfig('multi_rotate', {
    water: { enabled: true, defaultUnitsPerLoser: 0 }
  }), {
    enabled: true,
    defaultUnitsPerLoser: 0
  });
  assert.deepEqual(normalizeWaterConfig('', {
    water: { enabled: true, defaultUnitsPerLoser: 1 }
  }), {
    enabled: false,
    defaultUnitsPerLoser: 1
  });
  assert.deepEqual(normalizeWaterConfig('squad_doubles', {
    water: { enabled: true, defaultUnitsPerLoser: 1 }
  }), {
    enabled: false,
    defaultUnitsPerLoser: 1
  });
  assert.deepEqual(normalizeWaterConfig('multi_rotate', {
    water: { enabled: true, defaultUnitsPerLoser: 3 }
  }), {
    enabled: false,
    defaultUnitsPerLoser: 1
  });
});

test('water ledger accumulates 0/1/2 units and sorts by net, wins, then name', () => {
  const ledger = deriveWaterLedger(makeTournament([
    makeMatch({ matchIndex: 0, unitsPerLoser: 0 }),
    makeMatch({ matchIndex: 1, unitsPerLoser: 1 }),
    makeMatch({
      matchIndex: 2,
      scoreA: 17,
      scoreB: 21,
      unitsPerLoser: 2,
      teamA: ['u1', 'u5'],
      teamB: ['u3', 'u4']
    })
  ]));

  assert.equal(ledger.enabled, true);
  assert.equal(ledger.hasRecords, true);
  assert.equal(ledger.recordedMatchCount, 3);
  assert.deepEqual(
    ledger.rows.map((row) => ({
      playerId: row.playerId,
      wonUnits: row.wonUnits,
      treatUnits: row.treatUnits,
      netUnits: row.netUnits,
      netText: row.netText
    })),
    [
      { playerId: 'u4', wonUnits: 2, treatUnits: 1, netUnits: 1, netText: '+1' },
      { playerId: 'u3', wonUnits: 2, treatUnits: 1, netUnits: 1, netText: '+1' },
      { playerId: 'u2', wonUnits: 1, treatUnits: 0, netUnits: 1, netText: '+1' },
      { playerId: 'u1', wonUnits: 1, treatUnits: 2, netUnits: -1, netText: '-1' },
      { playerId: 'u5', wonUnits: 0, treatUnits: 2, netUnits: -2, netText: '-2' }
    ]
  );
  assert.equal(
    ledger.rows.reduce((sum, row) => sum + row.wonUnits, 0),
    ledger.rows.reduce((sum, row) => sum + row.treatUnits, 0)
  );
});

test('water ledger ignores missing snapshots, invalid scores, canceled matches and malformed teams', () => {
  const missingSnapshot = makeMatch({ matchIndex: 0 });
  delete missingSnapshot.water;
  const ledger = deriveWaterLedger(makeTournament([
    missingSnapshot,
    makeMatch({ matchIndex: 1, status: 'pending', unitsPerLoser: 1 }),
    makeMatch({ matchIndex: 2, status: 'canceled', unitsPerLoser: 1 }),
    makeMatch({ matchIndex: 3, scoreA: 21, scoreB: 21, unitsPerLoser: 1 }),
    makeMatch({ matchIndex: 4, unitsPerLoser: 3 }),
    makeMatch({ matchIndex: 5, unitsPerLoser: 1, teamB: ['u3'] })
  ]));

  assert.equal(ledger.enabled, true);
  assert.equal(ledger.hasRecords, false);
  assert.equal(ledger.recordedMatchCount, 0);
  assert.deepEqual(ledger.rows, []);
});

test('water ledger fully recomputes after a score winner flip', () => {
  const before = deriveWaterLedger(makeTournament([
    makeMatch({ scoreA: 21, scoreB: 18, unitsPerLoser: 2 })
  ]));
  const after = deriveWaterLedger(makeTournament([
    makeMatch({ scoreA: 18, scoreB: 21, unitsPerLoser: 2 })
  ]));

  assert.equal(before.rows.find((row) => row.playerId === 'u1').netUnits, 2);
  assert.equal(after.rows.find((row) => row.playerId === 'u1').netUnits, -2);
  assert.equal(after.rows.find((row) => row.playerId === 'u3').netUnits, 2);
});

test('water fields never affect formal rankings and empty rounds produce an empty ledger', () => {
  const base = makeTournament([
    makeMatch({ unitsPerLoser: undefined })
  ]);
  const withWater = makeTournament([
    makeMatch({ unitsPerLoser: 2 })
  ]);

  assert.deepEqual(rankingCore.computeRankings(withWater), rankingCore.computeRankings(base));
  assert.deepEqual(deriveWaterLedger(makeTournament([])), {
    enabled: true,
    hasRecords: false,
    recordedMatchCount: 0,
    rows: []
  });
});
