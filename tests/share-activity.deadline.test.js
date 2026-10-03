const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate } = require('node:timers');
const shareActivity = require('../scripts/share-activity-common.template');

const logger = { warn() {} };
const payload = { activityId: 'activity', targetState: 1 };

test('share activity skips an expired request without starting an API or diagnostic write', async () => {
  let apiCalls = 0;
  const cloud = { openapi: { updatableMessage: { async setUpdatableMsg() { apiCalls += 1; } } } };
  const result = await shareActivity.setUpdatableMessageBestEffort(cloud, payload, logger, {
    deadlineAtMs: Date.now() - 1,
    db: { collection() { throw new Error('no diagnostic should be started'); } },
    tournamentId: 't_1'
  });
  assert.equal(result, false);
  assert.equal(apiCalls, 0);
});

test('share activity finishes at the remaining request deadline when OpenAPI never resolves', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  const cloud = { openapi: { updatableMessage: { setUpdatableMsg: () => new Promise(() => {}) } } };
  let diagnosticCalls = 0;
  const pending = shareActivity.setUpdatableMessageBestEffort(cloud, payload, logger, {
    deadlineAtMs: Date.now() + 50,
    db: { collection() { diagnosticCalls += 1; return {}; } },
    tournamentId: 't_1'
  });
  t.mock.timers.tick(50);
  // Drain the current microtasks without advancing any further timeout.
  const state = await Promise.race([pending.then((value) => ({ value })), new Promise((resolve) => setImmediate(() => resolve({ pending: true })))]);
  assert.deepEqual(state, { value: false });
  assert.equal(diagnosticCalls, 0);
});

test('a hanging diagnostic write cannot turn a successful share update into a hanging start request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  let notifyDiagnostic;
  const diagnosticStarted = new Promise((resolve) => { notifyDiagnostic = resolve; });
  const cloud = { openapi: { updatableMessage: { async setUpdatableMsg() {} } } };
  const db = {
    command: { remove: () => ({ $remove: true }) },
    collection() {
      return { doc() { return { update() { notifyDiagnostic(); return new Promise(() => {}); } }; } };
    }
  };
  const pending = shareActivity.setUpdatableMessageBestEffort(cloud, payload, logger, {
    db, tournamentId: 't_1', deadlineAtMs: Date.now() + 2000
  });
  await diagnosticStarted;
  t.mock.timers.tick(500);
  const state = await Promise.race([pending.then((value) => ({ value })), new Promise((resolve) => setImmediate(() => resolve({ pending: true })))]);
  assert.deepEqual(state, { value: true });
});
