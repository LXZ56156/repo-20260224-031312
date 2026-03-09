const test = require('node:test');
const assert = require('node:assert/strict');

const memory = new Map();
let legacyReadCount = 0;
global.wx = {
  getStorageSync(key) {
    if (String(key || '').startsWith('local_tournament_snapshot_')) legacyReadCount += 1;
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

function resetStore() {
  memory.clear();
  legacyReadCount = 0;
}

function buildTournament(id, updatedAt) {
  return {
    _id: id,
    status: 'finished',
    updatedAt,
    playerIds: ['u_me', 'u2', 'u3', 'u4'],
    players: [{ id: 'u_me' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: ['u_me', 'u2'],
        teamB: ['u3', 'u4'],
        score: { teamA: 21, teamB: 19 }
      }]
    }]
  };
}

test('local completed tournament snapshots keep sorted order and populate aggregate map', () => {
  resetStore();
  storage.upsertLocalCompletedTournamentSnapshot(buildTournament('t_old', '2026-03-01T10:00:00.000Z'), 'u_me');
  storage.upsertLocalCompletedTournamentSnapshot(buildTournament('t_new', '2026-03-02T10:00:00.000Z'), 'u_me');

  const snapshots = storage.getLocalCompletedTournamentSnapshots();
  assert.deepEqual(snapshots.map((item) => item._id), ['t_new', 't_old']);

  const snapshotMap = storage.get('local_completed_tournament_map_v2', {});
  assert.equal(!!snapshotMap.t_old, true);
  assert.equal(!!snapshotMap.t_new, true);
});

test('local completed tournament snapshots can read legacy per-key cache and backfill aggregate map', () => {
  resetStore();
  storage.set('local_completed_tournament_ids_v1', ['t_legacy']);
  storage.set('local_tournament_snapshot_t_legacy', {
    _id: 't_legacy',
    updatedAtTs: 123,
    status: 'finished',
    players: [],
    rounds: []
  });

  const snapshots = storage.getLocalCompletedTournamentSnapshots();
  assert.deepEqual(snapshots.map((item) => item._id), ['t_legacy']);
  const snapshotMap = storage.get('local_completed_tournament_map_v2', {});
  assert.equal(snapshotMap.t_legacy._id, 't_legacy');
  assert.equal(storage.getLocalCompletedTournamentCompatVersion(), 1);
});

test('local tournament snapshot prefers newer legacy entry and backfills aggregate map', () => {
  resetStore();
  storage.set('local_completed_tournament_map_v2', {
    t_sync: {
      _id: 't_sync',
      updatedAtTs: 100,
      status: 'finished',
      players: [],
      rounds: []
    }
  });
  storage.set('local_tournament_snapshot_t_sync', {
    _id: 't_sync',
    updatedAtTs: 200,
    status: 'finished',
    players: [],
    rounds: []
  });

  const snapshot = storage.getLocalTournamentSnapshot('t_sync');
  assert.equal(snapshot.updatedAtTs, 200);
  assert.equal(storage.get('local_completed_tournament_map_v2', {}).t_sync.updatedAtTs, 200);
  legacyReadCount = 0;
  const cached = storage.getLocalTournamentSnapshot('t_sync');
  assert.equal(cached.updatedAtTs, 200);
  assert.equal(legacyReadCount, 0);
});

test('local completed tournament snapshots prefer newer legacy entries over stale aggregate map', () => {
  resetStore();
  storage.set('local_completed_tournament_ids_v1', ['t_a']);
  storage.set('local_completed_tournament_map_v2', {
    t_a: {
      _id: 't_a',
      updatedAtTs: 100,
      status: 'finished',
      players: [],
      rounds: []
    }
  });
  storage.set('local_tournament_snapshot_t_a', {
    _id: 't_a',
    updatedAtTs: 300,
    status: 'finished',
    players: [],
    rounds: []
  });

  const snapshots = storage.getLocalCompletedTournamentSnapshots();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].updatedAtTs, 300);
  assert.equal(storage.get('local_completed_tournament_map_v2', {}).t_a.updatedAtTs, 300);
  assert.equal(storage.getLocalCompletedTournamentCompatVersion(), 1);
  legacyReadCount = 0;
  const nextSnapshots = storage.getLocalCompletedTournamentSnapshots();
  assert.equal(nextSnapshots[0].updatedAtTs, 300);
  assert.equal(legacyReadCount, 0);
});

test('local completed tournament snapshots trim overflow entries from aggregate map too', () => {
  resetStore();
  const ids = Array.from({ length: 500 }, (_, idx) => `t_${idx}`);
  const snapshotMap = {};
  for (const id of ids) {
    snapshotMap[id] = { _id: id };
  }
  storage.set('local_completed_tournament_ids_v1', ids);
  storage.set('local_completed_tournament_map_v2', snapshotMap);

  storage.upsertLocalCompletedTournamentSnapshot(buildTournament('t_newest', '2026-03-03T10:00:00.000Z'), 'u_me');

  const nextIds = storage.getLocalCompletedTournamentIds();
  assert.equal(nextIds.length, 500);
  assert.equal(nextIds[0], 't_newest');
  assert.equal(nextIds.includes('t_499'), false);

  const nextMap = storage.get('local_completed_tournament_map_v2', {});
  assert.equal(!!nextMap.t_newest, true);
  assert.equal(!!nextMap.t_499, false);
});
