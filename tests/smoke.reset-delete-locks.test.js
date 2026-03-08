const test = require('node:test');
const assert = require('node:assert/strict');

const resetLogic = require('../cloudfunctions/resetTournament/logic');
const deleteLogic = require('../cloudfunctions/deleteTournament/logic');

test('smoke: reset rebuilds rankings and reset/delete both tolerate cleanup failures', async () => {
  const tournament = {
    _id: 't_1',
    mode: 'fixed_pair_rr',
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ],
    pairTeams: [
      { id: 'pair_1', name: '晨风', playerIds: ['u1', 'u2'] },
      { id: 'pair_2', name: '山海', playerIds: ['u3', 'u4'] }
    ]
  };

  const patch = resetLogic.buildResetTournamentPatch(tournament);
  assert.equal(patch.status, 'draft');
  assert.equal(patch.schedulerMetaJson, '');
  assert.deepEqual(
    patch.rankings.map((row) => ({ entityType: row.entityType, entityId: row.entityId })),
    [
      { entityType: 'team', entityId: 'pair_1' },
      { entityType: 'team', entityId: 'pair_2' }
    ]
  );
  assert.deepEqual(resetLogic.buildResetTournamentRemovals('__REMOVE__'), {
    fairness: '__REMOVE__',
    playerStats: '__REMOVE__',
    schedulerMeta: '__REMOVE__'
  });

  const locks = [{ id: 'l_1' }, { id: 'l_2' }];
  await resetLogic.cleanupScoreLocksBestEffort(async () => {
    locks.length = 0;
  }, 't_1', console);
  assert.equal(locks.length, 0);

  const resetLogs = [];
  await assert.doesNotReject(async () => resetLogic.cleanupScoreLocksBestEffort(
    async () => { throw new Error('cleanup failed'); },
    't_1',
    { error: (...args) => resetLogs.push(args.join(' ')) }
  ));
  assert.equal(resetLogs.length, 1);

  const deleteLogs = [];
  await assert.doesNotReject(async () => deleteLogic.cleanupScoreLocksBestEffort(
    async () => { throw new Error('cleanup failed'); },
    't_1',
    { error: (...args) => deleteLogs.push(args.join(' ')) }
  ));
  assert.equal(deleteLogs.length, 1);
});
