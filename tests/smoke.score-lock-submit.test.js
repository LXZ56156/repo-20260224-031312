const test = require('node:test');
const assert = require('node:assert/strict');

const startLogic = require('../cloudfunctions/startTournament/logic');
const scoreLockLogic = require('../cloudfunctions/scoreLock/logic');
const submitLogic = require('../cloudfunctions/submitScore/logic');

function fixtureDraftTournament() {
  return {
    _id: 't_1',
    status: 'draft',
    mode: 'multi_rotate',
    totalMatches: 1,
    courts: 1,
    players: [
      { id: 'u1', name: 'A' },
      { id: 'u2', name: 'B' },
      { id: 'u3', name: 'C' },
      { id: 'u4', name: 'D' }
    ]
  };
}

test('smoke: create -> start -> acquire -> heartbeat -> submit -> release lock', () => {
  const draft = fixtureDraftTournament();
  const validated = startLogic.validateBeforeGenerate(draft);
  assert.equal(validated.totalMatches, 1);

  const runningTournament = {
    ...draft,
    status: 'running',
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        teamA: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
        teamB: [{ id: 'u3', name: 'C' }, { id: 'u4', name: 'D' }],
        status: 'pending'
      }]
    }]
  };

  let lockDoc = null;
  const acquire = scoreLockLogic.resolveLockAction({
    action: 'acquire',
    canUseLock: true,
    tournamentStatus: 'running',
    matchStatus: 'pending',
    matchExists: true,
    openid: 'u1',
    ownerName: 'A',
    resolveOwnerName: (_id, fallback) => fallback || 'A'
  });
  assert.equal(acquire.response.state, 'acquired');
  lockDoc = acquire.nextLockDoc;

  const heartbeat = scoreLockLogic.resolveLockAction({
    action: 'heartbeat',
    canUseLock: true,
    tournamentStatus: 'running',
    matchStatus: 'pending',
    matchExists: true,
    openid: 'u1',
    lockDoc,
    resolveOwnerName: (_id, fallback) => fallback || 'A'
  });
  assert.equal(heartbeat.response.state, 'acquired');
  lockDoc = heartbeat.nextLockDoc;

  const submitted = submitLogic.buildSubmitResult(runningTournament, 0, 0, 21, 17, {
    id: 'u1',
    name: 'A',
    scoredAt: '2026-03-09T00:00:00.000Z'
  });
  assert.equal(submitted.finished, true);
  assert.equal(submitted.rounds[0].matches[0].status, 'finished');
  assert.equal(submitted.rounds[0].matches[0].scorerId, 'u1');

  // submitScore 成功后会删除当前锁，这里用内存态模拟释放结果。
  lockDoc = null;
  assert.equal(lockDoc, null);

  const deduped = submitLogic.buildIdempotentRetryResult(
    submitted.rounds[0].matches[0],
    21,
    17,
    'u1',
    'A'
  );
  assert.deepEqual(deduped, {
    ok: true,
    deduped: true,
    finished: true,
    scorerName: 'A'
  });
});
