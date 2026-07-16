const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/submitScore/logic');

function fixtureTournament() {
  return {
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        teamA: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
        teamB: [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }],
        status: 'pending',
        teamAScore: null,
        teamBScore: null
      }]
    }]
  };
}

function fixtureSquadTargetWinsTournament() {
  return {
    mode: 'squad_doubles',
    rules: { endCondition: { type: 'target_wins', target: 2 } },
    players: [
      { id: 'a1', name: 'A1', squad: 'A' },
      { id: 'a2', name: 'A2', squad: 'A' },
      { id: 'b1', name: 'B1', squad: 'B' },
      { id: 'b2', name: 'B2', squad: 'B' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [
        {
          matchIndex: 0,
          status: 'finished',
          teamA: [{ id: 'a1' }, { id: 'a2' }],
          teamB: [{ id: 'b1' }, { id: 'b2' }],
          score: { teamA: 21, teamB: 18 }
        },
        {
          matchIndex: 1,
          status: 'finished',
          teamA: [{ id: 'a1' }, { id: 'a2' }],
          teamB: [{ id: 'b1' }, { id: 'b2' }],
          score: { teamA: 21, teamB: 19 }
        },
        {
          matchIndex: 2,
          status: 'canceled',
          teamA: [{ id: 'a1' }, { id: 'a2' }],
          teamB: [{ id: 'b1' }, { id: 'b2' }]
        }
      ]
    }]
  };
}

test('buildSubmitResult updates score, ranking and finished status', () => {
  const t = fixtureTournament();
  const out = logic.buildSubmitResult(t, 0, 0, 21, 17, {
    id: 'u2',
    name: 'B',
    scoredAt: '2026-02-28T00:00:00.000Z'
  });

  assert.equal(out.finished, true);
  assert.equal(out.nextStatus, 'finished');
  assert.deepEqual(out.rounds[0].matches[0].score, { teamA: 21, teamB: 17 });
  assert.equal('teamAScore' in out.rounds[0].matches[0], false);
  assert.equal('teamBScore' in out.rounds[0].matches[0], false);
  assert.equal('scoreA' in out.rounds[0].matches[0], false);
  assert.equal('scoreB' in out.rounds[0].matches[0], false);
  assert.equal(out.rounds[0].matches[0].status, 'finished');
  assert.equal(out.rounds[0].matches[0].scorerId, 'u2');
  assert.equal(out.rounds[0].matches[0].scorerName, 'B');
  assert.equal(out.rounds[0].matches[0].scoredAt, '2026-02-28T00:00:00.000Z');

  const top = out.rankings[0];
  assert.equal(top.wins, 1);
  assert.equal(top.pointDiff, 4);
});

test('buildSubmitResult writes the minimal water snapshot without changing rankings', () => {
  const tournament = fixtureTournament();
  tournament.mode = 'multi_rotate';
  tournament.rules = { water: { enabled: true, defaultUnitsPerLoser: 1 } };

  const withoutWater = logic.buildSubmitResult(tournament, 0, 0, 21, 17);
  const withWater = logic.buildSubmitResult(tournament, 0, 0, 21, 17, null, {
    unitsPerLoser: 2
  });

  assert.deepEqual(withWater.rounds[0].matches[0].water, { unitsPerLoser: 2 });
  assert.deepEqual(withWater.rankings, withoutWater.rankings);
});

test('resolveWaterSubmission defaults enabled tournaments and rejects invalid or disabled writes', () => {
  const enabled = {
    mode: 'multi_rotate',
    rules: { water: { enabled: true, defaultUnitsPerLoser: 2 } }
  };
  assert.deepEqual(logic.resolveWaterSubmission(enabled, undefined, false), {
    ok: true,
    snapshot: { unitsPerLoser: 2 }
  });
  assert.deepEqual(logic.resolveWaterSubmission(enabled, 0, true), {
    ok: true,
    snapshot: { unitsPerLoser: 0 }
  });
  assert.deepEqual(logic.resolveWaterSubmission(enabled, 3, true), {
    ok: false,
    code: 'WATER_UNITS_INVALID',
    message: '打水瓶数仅支持 0、1、2'
  });
  for (const malformed of [true, false, ' ', [1], {}]) {
    assert.deepEqual(logic.resolveWaterSubmission(enabled, malformed, true), {
      ok: false,
      code: 'WATER_UNITS_INVALID',
      message: '打水瓶数仅支持 0、1、2'
    });
  }
  assert.deepEqual(logic.resolveWaterSubmission(enabled, ' 1 ', true), {
    ok: true,
    snapshot: { unitsPerLoser: 1 }
  });
  assert.deepEqual(logic.resolveWaterSubmission({ mode: 'multi_rotate', rules: {} }, 1, true), {
    ok: false,
    code: 'WATER_NOT_ENABLED',
    message: '当前赛事未开启打水记账'
  });
  assert.deepEqual(logic.resolveWaterSubmission({ mode: 'squad_doubles', rules: enabled.rules }, undefined, false), {
    ok: true,
    snapshot: null
  });
});

test('resolveWaterSubmission preserves a finished match snapshot when a legacy retry omits water units', () => {
  const enabled = {
    mode: 'multi_rotate',
    rules: { water: { enabled: true, defaultUnitsPerLoser: 2 } }
  };

  assert.deepEqual(logic.resolveWaterSubmission(enabled, undefined, false, {
    status: 'finished',
    water: { unitsPerLoser: 1 }
  }), {
    ok: true,
    snapshot: { unitsPerLoser: 1 }
  });
  assert.deepEqual(logic.resolveWaterSubmission(enabled, undefined, false, {
    status: 'finished'
  }), {
    ok: true,
    snapshot: undefined
  });
});

test('buildSubmitResult keeps running when remaining matches not finished', () => {
  const t = fixtureTournament();
  t.rounds.push({
    roundIndex: 1,
    matches: [{
      matchIndex: 0,
      teamA: [{ id: 'u1' }, { id: 'u3' }],
      teamB: [{ id: 'u2' }, { id: 'u4' }],
      status: 'pending'
    }]
  });

  const out = logic.buildSubmitResult(t, 0, 0, 21, 18);
  assert.equal(out.finished, false);
  assert.equal(out.nextStatus, 'running');
});

test('buildSubmitResult revives scoreless canceled matches when edited target_wins no longer has a winner', () => {
  const t = fixtureSquadTargetWinsTournament();
  const out = logic.buildSubmitResult(t, 0, 1, 18, 21);

  assert.equal(out.rounds[0].matches[1].status, 'finished');
  assert.deepEqual(out.rounds[0].matches[1].score, { teamA: 18, teamB: 21 });
  assert.equal(out.rounds[0].matches[2].status, 'pending');
  assert.equal(out.finished, false);
  assert.equal(out.nextStatus, 'running');
  assert.equal(out.rankings.find((row) => row.entityId === 'A').wins, 1);
  assert.equal(out.rankings.find((row) => row.entityId === 'B').wins, 1);
});

test('buildSubmitResult re-cancels revived target_wins matches when a winner still exists', () => {
  const t = fixtureSquadTargetWinsTournament();
  const out = logic.buildSubmitResult(t, 0, 1, 22, 20);

  assert.equal(out.rounds[0].matches[2].status, 'canceled');
  assert.equal(out.finished, true);
  assert.equal(out.nextStatus, 'finished');
  assert.equal(out.rankings.find((row) => row.entityId === 'A').wins, 2);
});

test('buildSubmitResult does not revive canceled matches that already carry a valid score', () => {
  const t = fixtureSquadTargetWinsTournament();
  t.rounds[0].matches[2].score = { teamA: 21, teamB: 17 };
  const out = logic.buildSubmitResult(t, 0, 1, 18, 21);

  assert.equal(out.rounds[0].matches[2].status, 'canceled');
  assert.equal(out.finished, true);
  assert.equal(out.nextStatus, 'finished');
});

test('buildSubmitResult throws on invalid target round or match', () => {
  const t = fixtureTournament();
  assert.throws(() => logic.buildSubmitResult(t, 99, 0, 21, 18), /轮次不存在/);
  assert.throws(() => logic.buildSubmitResult(t, 0, 99, 21, 18), /比赛不存在/);
});
