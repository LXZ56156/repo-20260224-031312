const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/resetTournament/logic');
const common = require('../cloudfunctions/resetTournament/lib/common');

function fixtureTournament(mode) {
  return {
    mode,
    players: [
      { id: 'u1', name: 'A', squad: 'A' },
      { id: 'u2', name: 'B', squad: 'A' },
      { id: 'u3', name: 'C', squad: 'B' },
      { id: 'u4', name: 'D', squad: 'B' }
    ],
    pairTeams: [
      { id: 'pair_a', name: '晨风', playerIds: ['u1', 'u2'] },
      { id: 'pair_b', name: '山海', playerIds: ['u3', 'u4'] }
    ]
  };
}

test('buildResetTournamentPatch resets player rankings for multi_rotate', () => {
  const patch = logic.buildResetTournamentPatch(fixtureTournament('multi_rotate'));
  assert.equal(patch.status, 'draft');
  assert.equal(patch.rounds.length, 0);
  assert.equal(patch.rankings.length, 4);
  assert.ok(patch.rankings.every((row) => row.entityType === 'player'));
  assert.equal(patch.schedulerMetaJson, '');
  assert.equal(patch.fairnessJson, '');
  assert.equal(patch.playerStatsJson, '');
});

test('buildResetTournamentRemovals explicitly removes fairness, playerStats and schedulerMeta', () => {
  assert.deepEqual(logic.buildResetTournamentRemovals('__REMOVE__'), {
    fairness: '__REMOVE__',
    playerStats: '__REMOVE__',
    schedulerMeta: '__REMOVE__'
  });
});

test('buildResetTournamentPatch resets squad_doubles to team rankings', () => {
  const patch = logic.buildResetTournamentPatch(fixtureTournament('squad_doubles'));
  assert.deepEqual(
    patch.rankings.map((row) => ({ entityType: row.entityType, entityId: row.entityId, name: row.name })),
    [
      { entityType: 'team', entityId: 'A', name: 'A队' },
      { entityType: 'team', entityId: 'B', name: 'B队' }
    ]
  );
});

test('buildResetTournamentPatch resets fixed_pair_rr to pair team rankings', () => {
  const patch = logic.buildResetTournamentPatch(fixtureTournament('fixed_pair_rr'));
  assert.deepEqual(
    patch.rankings.map((row) => ({ entityType: row.entityType, entityId: row.entityId, name: row.name })),
    [
      { entityType: 'team', entityId: 'pair_a', name: '晨风' },
      { entityType: 'team', entityId: 'pair_b', name: '山海' }
    ]
  );
});

test('cleanupScoreLocks removes locks by tournamentId and ignores missing collection', async () => {
  let removed = false;
  const db = {
    collection(name) {
      assert.equal(name, 'score_locks');
      return {
        where(query) {
          assert.deepEqual(query, { tournamentId: 't_1' });
          return {
            async remove() {
              removed = true;
            }
          };
        }
      };
    }
  };
  await common.cleanupScoreLocks(db, 't_1');
  assert.equal(removed, true);

  const missingDb = {
    collection() {
      return {
        where() {
          return {
            async remove() {
              throw new Error('DATABASE_COLLECTION_NOT_EXIST');
            }
          };
        }
      };
    }
  };
  await assert.doesNotReject(async () => common.cleanupScoreLocks(missingDb, 't_1'));
});

test('cleanupScoreLocksBestEffort swallows cleanup errors after reset success', async () => {
  const logs = [];
  await assert.doesNotReject(async () => logic.cleanupScoreLocksBestEffort(
    async () => { throw new Error('cleanup failed'); },
    't_1',
    { error: (...args) => logs.push(args.join(' ')) }
  ));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[resetTournament\] cleanupScoreLocks failed/);
});
