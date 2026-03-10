const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/scoreLock/logic');

function resolveOwnerName(ownerId, fallback) {
  return fallback || `球友-${ownerId}`;
}

function baseInput(overrides = {}) {
  return {
    action: 'status',
    nowTs: 1_000,
    lockDoc: null,
    admin: false,
    force: false,
    canUseLock: true,
    tournamentStatus: 'running',
    matchExists: true,
    matchStatus: 'pending',
    openid: 'u1',
    ownerName: '球友-u1',
    resolveOwnerName,
    ...overrides
  };
}

test('status returns idle when no active lock exists', () => {
  const out = logic.resolveLockAction(baseInput({ action: 'status' }));
  assert.deepEqual(out.response, {
    ok: true,
    state: 'idle',
    ownerId: '',
    ownerName: '',
    expireAt: 0,
    remainingMs: 0
  });
});

test('acquire creates a lock for current user', () => {
  const out = logic.resolveLockAction(baseInput({ action: 'acquire', nowTs: 2_000 }));
  assert.equal(out.response.ok, true);
  assert.equal(out.response.state, 'acquired');
  assert.equal(out.response.ownerId, 'u1');
  assert.equal(out.nextLockDoc.ownerId, 'u1');
  assert.equal(out.nextLockDoc.expireAt, 2_000 + logic.LOCK_TTL_MS);
});

test('occupied lock blocks non-owner acquire and heartbeat', () => {
  const lockDoc = { ownerId: 'u2', ownerName: '球友-u2', expireAt: 2_000 };
  const acquire = logic.resolveLockAction(baseInput({ action: 'acquire', lockDoc, nowTs: 1_500 }));
  assert.equal(acquire.response.state, 'occupied');
  assert.equal(acquire.response.ownerId, 'u2');

  const heartbeat = logic.resolveLockAction(baseInput({ action: 'heartbeat', lockDoc, nowTs: 1_500 }));
  assert.equal(heartbeat.response.state, 'occupied');
  assert.equal(heartbeat.response.ownerName, '球友-u2');
});

test('heartbeat refreshes owner lock and release removes it', () => {
  const lockDoc = { _id: 't_1_0_0', ownerId: 'u1', ownerName: '球友-u1', expireAt: 2_000 };
  const heartbeat = logic.resolveLockAction(baseInput({ action: 'heartbeat', lockDoc, nowTs: 1_500 }));
  assert.equal(heartbeat.response.state, 'acquired');
  assert.equal(heartbeat.nextLockDoc.expireAt, 1_500 + logic.LOCK_TTL_MS);
  assert.equal(Object.prototype.hasOwnProperty.call(heartbeat.nextLockDoc, '_id'), false);

  const release = logic.resolveLockAction(baseInput({ action: 'release', lockDoc, nowTs: 1_500 }));
  assert.equal(release.response.state, 'released');
  assert.equal(release.removeLock, true);
});

test('expired lock returns expired on heartbeat and can be force acquired by admin', () => {
  const expiredLock = { ownerId: 'u2', ownerName: '球友-u2', expireAt: 900 };
  const heartbeat = logic.resolveLockAction(baseInput({ action: 'heartbeat', lockDoc: expiredLock, nowTs: 1_000 }));
  assert.equal(heartbeat.response.state, 'expired');

  const forceAcquire = logic.resolveLockAction(baseInput({
    action: 'acquire',
    lockDoc: { ownerId: 'u2', ownerName: '球友-u2', expireAt: 2_000 },
    nowTs: 1_000,
    admin: true,
    force: true
  }));
  assert.equal(forceAcquire.response.state, 'acquired');
  assert.equal(forceAcquire.response.ownerId, 'u1');
});

test('finished match and forbidden caller are rejected before lock mutation', () => {
  const finished = logic.resolveLockAction(baseInput({ action: 'acquire', matchStatus: 'finished' }));
  assert.equal(finished.response.state, 'finished');

  const forbidden = logic.resolveLockAction(baseInput({ action: 'acquire', canUseLock: false }));
  assert.equal(forbidden.response.state, 'forbidden');
});
