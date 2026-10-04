const player = require('./lib/player');
const schedule = require('./lib/schedule');
const mode = require('./lib/mode');

// A round-robin logical round is split into consecutive court batches.
// A bye is recorded once on its first batch; other inactive players are resting.
function buildSinglesSchedule(players, courts = 1, options = {}) {
  const list = schedule.normalizeRosterPlayers(players);
  schedule.assertValidRosterPlayers(list);
  if (list.length < 2 || list.length > 8) throw new Error('单打循环需要 2–8 人参赛');
  const config = mode.getSinglesConfig({ players: list, courts, rules: {
    cycles: options.cycles === undefined ? 1 : options.cycles, pointsPerGame: 21
  } });
  const deadlineAtMs = Number(options.deadlineAtMs);
  const assertDeadline = () => {
    if (Number.isFinite(deadlineAtMs) && Date.now() >= deadlineAtMs) {
      const error = new Error('排阵超时，请重试');
      error.code = 'START_TIMEOUT';
      throw error;
    }
  };
  assertDeadline();
  const ids = list.map(player.extractPlayerId);
  const rounds = [];
  for (let cycleIndex = 1; cycleIndex <= config.cycles; cycleIndex += 1) {
    const ring = ids.slice();
    if (ring.length % 2) ring.push(null);
    for (let logicalRound = 1; logicalRound < ring.length; logicalRound += 1) {
      assertDeadline();
      const pairs = [];
      const byes = [];
      for (let i = 0; i < ring.length / 2; i += 1) {
        const a = ring[i];
        const b = ring[ring.length - 1 - i];
        if (!a || !b) byes.push(a || b);
        else pairs.push(cycleIndex === 1 ? [a, b] : [b, a]);
      }
      const batchCount = Math.ceil(pairs.length / courts);
      for (let batchIndex = 1; batchIndex <= batchCount; batchIndex += 1) {
        const batch = pairs.slice((batchIndex - 1) * courts, batchIndex * courts);
        const active = new Set(batch.flat());
        const waiting = new Set(pairs.slice(batchIndex * courts).flat());
        rounds.push({ roundIndex: rounds.length, cycleIndex, logicalRound, batchIndex, batchCount,
          matches: batch.map(([a, b], matchIndex) => ({ matchIndex, logicalRound, cycleIndex,
            matchType: mode.MODE_SINGLES_ROUND_ROBIN, teamA: [a], teamB: [b] })),
          byePlayers: batchIndex === 1 ? byes.slice() : [],
          waitingPlayers: ids.filter((id) => waiting.has(id)),
          restingPlayers: ids.filter((id) => !active.has(id) && !byes.includes(id) && !waiting.has(id)),
          restPlayers: ids.filter((id) => !active.has(id)) });
      }
      ring.splice(1, 0, ring.pop());
    }
  }
  assertDeadline();
  return { rounds, seed: null, fairnessScore: 0, fairness: {}, playerStats: {},
    schedulerMeta: { engine: 'singles-round-robin-v1', effectiveCourts: Math.min(courts, Math.floor(ids.length / 2)),
      cycles: config.cycles, logicalRounds: config.logicalRounds, batches: rounds.length } };
}

module.exports = { buildSinglesSchedule };
