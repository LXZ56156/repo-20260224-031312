const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/deleteTournament/logic');

test('deleteTournament cleanupScoreLocksBestEffort swallows cleanup errors after delete success', async () => {
  const logs = [];
  await assert.doesNotReject(async () => logic.cleanupScoreLocksBestEffort(
    async () => { throw new Error('cleanup failed'); },
    't_2',
    { error: (...args) => logs.push(args.join(' ')) }
  ));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[deleteTournament\] cleanupScoreLocks failed/);
});
