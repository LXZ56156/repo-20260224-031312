const test = require('node:test');
const assert = require('node:assert/strict');

const memory = new Map();
global.wx = {
  getStorageSync(key) {
    return memory.has(key) ? memory.get(key) : undefined;
  },
  setStorageSync(key, value) {
    memory.set(key, value);
  },
  removeStorageSync(key) {
    memory.delete(key);
  }
};
global.getApp = () => ({ globalData: { openid: 'u_me' } });

const storage = require('../miniprogram/core/storage');
const { buildLocalPerformancePayload } = require('../miniprogram/core/performanceStats');

function resetStore() {
  memory.clear();
}

function buildFinishedTournament(id = 't1') {
  return {
    _id: id,
    status: 'finished',
    updatedAt: '2026-03-01T10:00:00.000Z',
    playerIds: ['u_me', 'u2', 'u3', 'u4'],
    players: [{ id: 'u_me' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: ['u_me', 'u2'],
        teamB: ['u3', 'u4'],
        score: { teamA: 21, teamB: 17 },
        scoredAt: '2026-03-01T10:10:00.000Z'
      }]
    }]
  };
}

test('local completed snapshot is created and contributes to performance stats', () => {
  resetStore();
  const tournament = buildFinishedTournament('t_local_1');
  const synced = storage.upsertLocalCompletedTournamentSnapshot(tournament, 'u_me');
  assert.equal(synced, true);

  const ids = storage.getLocalCompletedTournamentIds();
  assert.deepEqual(ids, ['t_local_1']);

  const snapshots = storage.getLocalCompletedTournamentSnapshots();
  const stats = buildLocalPerformancePayload(snapshots, 'u_me');
  assert.equal(stats.tournamentsCompleted, 1);
  assert.equal(stats.matchesPlayed, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.pointDiff, 4);
});

test('deleting local snapshot removes it from performance stats immediately', () => {
  resetStore();
  storage.upsertLocalCompletedTournamentSnapshot(buildFinishedTournament('t_local_2'), 'u_me');
  storage.removeLocalCompletedTournamentSnapshot('t_local_2');

  const snapshots = storage.getLocalCompletedTournamentSnapshots();
  const stats = buildLocalPerformancePayload(snapshots, 'u_me');
  assert.equal(stats.tournamentsCompleted, 0);
  assert.equal(stats.matchesPlayed, 0);
  assert.equal(stats.wins, 0);
});

test('unfinished tournaments are not written to local performance ledger', () => {
  resetStore();
  const draftTournament = { ...buildFinishedTournament('t_draft'), status: 'draft' };
  const synced = storage.upsertLocalCompletedTournamentSnapshot(draftTournament, 'u_me');
  assert.equal(synced, false);
  assert.deepEqual(storage.getLocalCompletedTournamentIds(), []);
});
