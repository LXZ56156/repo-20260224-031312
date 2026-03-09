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

test('buildSubmitResult throws on invalid target round or match', () => {
  const t = fixtureTournament();
  assert.throws(() => logic.buildSubmitResult(t, 99, 0, 21, 18), /轮次不存在/);
  assert.throws(() => logic.buildSubmitResult(t, 0, 99, 21, 18), /比赛不存在/);
});
