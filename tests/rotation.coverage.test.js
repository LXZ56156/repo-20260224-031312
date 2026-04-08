const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

function normalizeTeam(team) {
  return team.slice().sort().join('&');
}

function matchupKey(match) {
  return [normalizeTeam(match.teamA || []), normalizeTeam(match.teamB || [])].sort().join(' vs ');
}

function collectMatches(schedule) {
  return (schedule.rounds || []).flatMap((round) => round.matches || []);
}

function playSpread(schedule, players) {
  const playCount = (schedule.playerStats && schedule.playerStats.playCount) || {};
  const values = players.map((player) => Number(playCount[player.id]) || 0);
  return Math.max(...values) - Math.min(...values);
}

test('generateSchedule covers all exact doubles matchups for 5 players and 15 matches', () => {
  const players = makePlayers(5);
  const out = generateSchedule(players, 15, 1, { seed: 7 });
  const matches = collectMatches(out);
  const unique = new Set(matches.map(matchupKey));

  assert.equal(matches.length, 15);
  assert.equal(unique.size, 15);
  assert.equal(playSpread(out, players), 0);
});

test('generateSchedule keeps 5 players / 8 matches fair while still preferring new exact matchups', () => {
  const players = makePlayers(5);

  for (const seed of [1, 7, 42]) {
    const out = generateSchedule(players, 8, 1, { seed });
    const matches = collectMatches(out);
    const unique = new Set(matches.map(matchupKey));

    assert.equal(matches.length, 8);
    assert.equal(unique.size, 8, `seed=${seed}`);
    assert.ok(playSpread(out, players) <= 1, `seed=${seed}`);
  }
});

test('generateSchedule still avoids player collisions inside the same round on dual courts', () => {
  const players = makePlayers(8);
  const out = generateSchedule(players, 12, 2, { seed: 11 });

  for (const round of out.rounds || []) {
    const seen = new Set();
    for (const match of round.matches || []) {
      for (const id of [...(match.teamA || []), ...(match.teamB || [])]) {
        assert.equal(seen.has(id), false, `round=${round.roundIndex} player=${id}`);
        seen.add(id);
      }
    }
  }
});

test('generateSchedule covers all partner pairs for 6 players and 8 matches across multiple seeds', () => {
  // 6人8场：16个搭档槽 >= 15对，理论上可全覆盖
  const players = makePlayers(6);
  const totalPairs = 6 * 5 / 2; // 15

  for (const seed of [1, 7, 42, 99, 123]) {
    const out = generateSchedule(players, 8, 1, { seed });
    const partnerSeen = new Set();
    for (const match of collectMatches(out)) {
      const [a1, a2] = (match.teamA || []).slice().sort();
      const [b1, b2] = (match.teamB || []).slice().sort();
      partnerSeen.add(`${a1}|${a2}`);
      partnerSeen.add(`${b1}|${b2}`);
    }
    assert.equal(partnerSeen.size, totalPairs, `seed=${seed} covered=${partnerSeen.size}/${totalPairs}`);
  }
});

test('generateSchedule rejects duplicate player ids before scheduling', () => {
  assert.throws(
    () => generateSchedule([
      { id: 'p1', name: 'P1' },
      { id: 'p1', name: 'P1 duplicate' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' }
    ], 1, 1, { seed: 11 }),
    /重复成员/
  );
});
