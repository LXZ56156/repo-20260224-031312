const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { setImmediate } = require('node:timers');

const mainPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const sharedPaths = ['common', 'mode', 'share-activity'].map((name) =>
  require.resolve(`../cloudfunctions/joinTournament/lib/${name}.js`));

function fixture(t, { transactionElapsedMs = 0, shareResult = 'pending' } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});
  const calls = { api: [], diagnostics: [], committed: null };
  let notifyApi;
  let notifyDiagnostic;
  const apiStarted = new Promise((resolve) => { notifyApi = resolve; });
  const diagnosticStarted = new Promise((resolve) => { notifyDiagnostic = resolve; });
  const tournament = {
    _id: 't_join', status: 'draft', mode: 'squad_doubles', version: 3,
    players: [{ id: 'u_admin', name: '管理员', avatar: 'cloud://admin', gender: 'male', squad: 'A' }],
    playerIds: ['u_admin'], playerLimit: 8,
    shareActivityId: 'act_join', shareActivityState: 0,
    shareActivityExpireAtMs: Date.now() + 120_000
  };
  const db = {
    command: { remove: () => ({ $remove: true }) },
    serverDate: () => ({ $serverDate: true }),
    collection(name) {
      if (name === 'user_profiles') {
        return { where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) };
      }
      assert.equal(name, 'tournaments');
      return { doc: (id) => {
        assert.equal(id, 't_join');
        return { update(payload) {
          calls.diagnostics.push(payload.data);
          notifyDiagnostic();
          return new Promise(() => {});
        } };
      } };
    },
    async runTransaction(handler) {
      const result = await handler({ collection: () => ({ doc: () => ({
        get: async () => ({ data: tournament }),
        async update(payload) {
          calls.committed = payload.data;
          return { stats: { updated: 1 } };
        }
      }) }) });
      // Simulate elapsed time before the committed transaction returns to the handler.
      t.mock.timers.tick(transactionElapsedMs);
      return result;
    }
  };
  const sdk = {
    init() {}, database: () => db, getWXContext: () => ({ OPENID: 'u_join' }),
    DYNAMIC_CURRENT_ENV: 'test-env',
    openapi: { updatableMessage: { setUpdatableMsg(payload) {
      calls.api.push(payload);
      notifyApi();
      if (shareResult === 'success') return Promise.resolve({});
      if (shareResult === 'failure') return Promise.reject(new Error('share unavailable'));
      return new Promise(() => {});
    } } }
  };
  for (const modulePath of [mainPath, ...sharedPaths]) delete require.cache[modulePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'wx-server-sdk' ? sdk : originalLoad.call(this, request, parent, isMain);
  };
  let main;
  try { ({ main } = require(mainPath)); } finally { Module._load = originalLoad; }
  const startedAtMs = Date.now();
  const pending = main({
    tournamentId: 't_join', nickname: '球友', avatar: 'cloud://join', gender: 'female',
    __traceId: 'trace-join', clientRequestId: 'request-join'
  });
  return { pending, calls, startedAtMs, apiStarted, diagnosticStarted };
}

async function assertCommittedSuccess(pending, calls) {
  // Check settlement without advancing timers or waiting for a real platform timeout.
  const state = await Promise.race([
    pending.then((result) => ({ result })),
    new Promise((resolve) => setImmediate(() => resolve({ pending: true })))
  ]);
  assert.equal(state.pending, undefined, 'optional share work must release the committed response');
  const result = state.result;
  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(result.state, 'joined');
  assert.equal(result.traceId, 'trace-join');
  assert.equal(result.clientRequestId, 'request-join');
  assert.equal(result.version, 4);
  assert.deepEqual(calls.committed.playerIds, ['u_admin', 'u_join']);
  assert.deepEqual(calls.committed.players[1], result.player);
  assert.equal(calls.committed.version, 4);
}

test('join returns committed success within the entry budget when share OpenAPI never resolves', async (t) => {
  const { pending, calls, startedAtMs, apiStarted } = fixture(t, { transactionElapsedMs: 1900 });
  await apiStarted;
  assert.deepEqual(calls.api[0], {
    activityId: 'act_join', targetState: 0,
    templateInfo: { parameterList: [
      { name: 'member_count', value: '2' }, { name: 'room_limit', value: '8' }
    ] }
  });
  t.mock.timers.tick(600);
  await assertCommittedSuccess(pending, calls);
  assert.equal(Date.now() - startedAtMs, 2500);
  assert.equal(calls.diagnostics.length, 0);
});

for (const shareResult of ['success', 'failure']) {
  test(`join returns committed success when ${shareResult} share diagnostics never resolve`, async (t) => {
    const { pending, calls, startedAtMs, diagnosticStarted } = fixture(t, {
      transactionElapsedMs: 2300, shareResult
    });
    await diagnosticStarted;
    assert.equal(calls.api.length, 1);
    assert.equal(calls.diagnostics.length, 1);
    if (shareResult === 'success') {
      assert.deepEqual(calls.diagnostics[0].shareActivityLastError, { $remove: true });
    } else {
      assert.equal(calls.diagnostics[0].shareActivityLastErrorMsg, 'share unavailable');
    }
    t.mock.timers.tick(200);
    await assertCommittedSuccess(pending, calls);
    assert.equal(Date.now() - startedAtMs, 2500);
  });
}

test('join skips optional share work when the committed transaction exhausts the entry budget', async (t) => {
  const { pending, calls, startedAtMs } = fixture(t, { transactionElapsedMs: 2600 });
  await assertCommittedSuccess(pending, calls);
  assert.equal(Date.now() - startedAtMs, 2600);
  assert.equal(calls.api.length, 0);
  assert.equal(calls.diagnostics.length, 0);
});
