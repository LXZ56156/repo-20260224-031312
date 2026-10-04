const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('../miniprogram/pages/lobby/lobbyViewModel');
const settingsVm = require('../miniprogram/pages/settings/settingsViewModel');
const coManagerActions = require('../miniprogram/pages/lobby/lobbyCoManagerActions');
const lifecycleActions = require('../miniprogram/pages/lobby/lobbyLifecycleActions');
const cloud = require('../miniprogram/core/cloud');

function fixture(status = 'draft') {
  return { _id: 't1', name: 'Role', creatorId: 'owner', status, version: 1, mode: 'multi_rotate', totalMatches: 1, courts: 1,
    settingsConfigured: true, coManagers: ['b'], players: [
      { id: 'owner', name: 'Owner' }, { id: 'b', name: 'Bound' }, { id: 'c', name: 'C' }, { id: 'guest_1', name: 'Guest', type: 'guest' }
    ], playerIds: ['owner', 'b', 'c', 'guest_1', 'stale'] };
}

test('co-manager gets draft management and settings but retains false owner marker; owner-only role actions are separate', () => {
  const t = fixture();
  const owner = vm.buildLobbyViewModel({ tournament: t, openid: 'owner' }).patch;
  assert.equal(owner.showCoManagerManagement, true);
  assert.equal(owner.coManagerCandidates.find((p) => p.id === 'guest_1').bound, false);
  assert.equal(owner.coManagerCandidates.find((p) => p.id === 'b').isCoManager, true);
  const b = vm.buildLobbyViewModel({ tournament: t, openid: 'b' }).patch;
  assert.equal(b.isAdmin, false);
  assert.equal(b.isCoManager, true);
  assert.equal(b.canManageTournament, true);
  assert.equal(b.showDraftAdminPanel, true);
  assert.equal(b.showCoManagerManagement, false);
  assert.equal(b.currentRoleTitle, '协管');
  const settings = settingsVm.buildSettingsFormState(t, { openid: 'b' });
  assert.equal(settings.isAdmin, false);
  assert.equal(settings.canManageTournament, true);
});

test('running roster role controls remain owner-only; revoke refresh immediately removes management panel', () => {
  const t = fixture('running');
  const owner = vm.buildLobbyViewModel({ tournament: t, openid: 'owner' }).patch;
  assert.equal(owner.showCoManagerManagement, true);
  const b = vm.buildLobbyViewModel({ tournament: t, openid: 'b' }).patch;
  assert.equal(b.showDraftAdminPanel, false);
  assert.equal(b.showCoManagerManagement, false);
  t.status = 'draft'; t.coManagers = [];
  const revoked = vm.buildLobbyViewModel({ tournament: t, openid: 'b', data: b }).patch;
  assert.equal(revoked.canManageTournament, false);
  assert.equal(revoked.isCoManager, false);
  assert.equal(revoked.showDraftAdminPanel, false);
  assert.equal(revoked.canEditScore, true);
});

test('owner role operation retains its payload for timeout retry even when roster update now shows granted; co-manager cannot call it', async () => {
  const previousWx = global.wx;
  const previousCall = cloud.call;
  const t = fixture(); t.coManagers = [];
  let retry;
  let fail = true;
  const calls = [];
  const page = { ...coManagerActions, openid: 'owner', _latestTournament: t, data: { tournamentId: 't1', tournament: t },
    setData(patch) { Object.assign(this.data, patch); }, clearLastFailedAction() {},
    setLastFailedAction(text, action) { retry = action; }, handleWriteError() {}, fetchTournament: async () => {} };
  global.wx = { showToast() {} };
  cloud.call = async (name, payload) => {
    calls.push({ name, payload });
    if (fail) { fail = false; throw { code: 'TIMEOUT' }; }
    return { ok: true };
  };
  try {
    const event = { currentTarget: { dataset: { player: 'b' } } };
    await page.onToggleCoManager(event);
    t.coManagers = ['b'];
    await retry();
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[1].payload.action, 'grant');
    await page.onToggleCoManager(event);
    assert.equal(calls[2].payload.action, 'revoke');
    assert.notEqual(calls[2].payload.clientRequestId, calls[0].payload.clientRequestId);
    page.openid = 'b';
    assert.equal(await page.onToggleCoManager(event), false);
    assert.equal(calls.length, 3);
  } finally { global.wx = previousWx; cloud.call = previousCall; }
});

test('co-manager cannot reach the owner cancel confirmation', () => {
  const previousWx = global.wx;
  let modals = 0;
  global.wx = { showModal() { modals += 1; } };
  try {
    lifecycleActions.cancelTournament.call({ data: { tournament: fixture(), isAdmin: false, canManageTournament: true } });
    assert.equal(modals, 0);
  } finally { global.wx = previousWx; }
});

function realLobbyPage() {
  const pagePath = require.resolve('../miniprogram/pages/lobby/index');
  const previousPage = global.Page;
  let definition;
  global.Page = (value) => { definition = value; };
  try { delete require.cache[pagePath]; require(pagePath); } finally { global.Page = previousPage; }
  const tournament = fixture();
  const writes = [];
  const page = { ...definition, data: { ...definition.data, tournamentId: 't1', tournament },
    openid: 'owner', _latestTournament: tournament, _lifecycleGeneration: 0,
    setData(patch) { writes.push(patch); Object.assign(this.data, patch); },
    handleWriteError() {}, refreshUiPreferences() {}, disablePageDynamicShare() {},
    fetchTournament: async () => {}, hasActiveWatch: () => true };
  return { page, writes };
}

async function pendingRealRetry(t, action) {
  const { page, writes } = realLobbyPage();
  page._latestTournament.coManagers = action === 'revoke' ? ['b'] : [];
  const calls = [];
  let resolve;
  let toasts = 0;
  const previousWx = global.wx;
  global.wx = { showToast() { toasts += 1; } };
  t.after(() => { global.wx = previousWx; });
  t.mock.method(cloud, 'call', async (name, payload) => {
    calls.push({ name, payload });
    if (calls.length === 1) throw { code: 'TIMEOUT' };
    return new Promise((done) => { resolve = done; });
  });
  await page.onToggleCoManager({ currentTarget: { dataset: { player: 'b' } } });
  const failedEntry = page._lastFailedAction;
  const retry = page.retryLastAction();
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1].payload.action, action);
  return { page, writes, failedEntry, retry, succeed: () => resolve({ ok: true }), toasts: () => toasts };
}

for (const action of ['grant', 'revoke']) {
  test(`successful hidden ${action} retry clears its real failed entry on onShow without hidden UI writes`, async (t) => {
    const state = await pendingRealRetry(t, action);
    state.page.onHide();
    state.writes.length = 0;
    state.succeed();
    await state.retry;
    assert.deepEqual(state.writes, [], 'hidden completion, including busy release, must not call setData');
    assert.equal(state.page._lastFailedAction, state.failedEntry);
    state.page.onShow();
    assert.equal(state.page.data.canRetryAction, false);
    assert.equal(state.page._lastFailedAction, null);
    assert.equal(state.page.data.coManagerBusy, false);
    assert.equal(state.toasts(), 0);
  });
}

test('onShow before successful old retry settlement clears only small current-page state without old Toast or fetch', async (t) => {
  const state = await pendingRealRetry(t, 'grant');
  state.page.onHide();
  state.page.onShow();
  let oldFetches = 0;
  state.page.fetchTournament = async () => { oldFetches += 1; };
  state.succeed();
  await state.retry;
  assert.equal(state.page.data.canRetryAction, false);
  assert.equal(state.page._lastFailedAction, null);
  assert.equal(state.page.data.coManagerBusy, false);
  assert.equal(state.toasts(), 0);
  assert.equal(oldFetches, 0);
});

for (const replacement of ['same-key failure', 'same-key failure after onShow', 'new tournament', 'unload']) {
  test(`old successful retry preserves ${replacement} and writes nothing while inactive`, async (t) => {
    const state = await pendingRealRetry(t, 'revoke');
    if (replacement === 'unload') state.page.onUnload(); else state.page.onHide();
    if (replacement.startsWith('same-key')) {
      state.page.setLastFailedAction('较新失败', () => {}, { actionKey: 'lobby:coManagers:t1' });
    }
    const newerEntry = state.page._lastFailedAction;
    if (replacement === 'new tournament') state.page.data.tournamentId = 't2';
    if (replacement === 'same-key failure after onShow') state.page.onShow();
    state.writes.length = 0;
    state.succeed();
    await state.retry;
    if (replacement === 'same-key failure after onShow') {
      assert.deepEqual(state.writes, [{ coManagerBusy: false }]);
    } else {
      assert.deepEqual(state.writes, []);
    }
    assert.equal(state.page._lastFailedAction, newerEntry);
    if (replacement !== 'unload') state.page.onShow();
    assert.equal(state.page._lastFailedAction, newerEntry);
    assert.equal(state.page.data.canRetryAction, true);
    assert.equal(state.toasts(), 0);
  });
}

test('a new normal grant followed by revoke removes the old failed grant retry', async (t) => {
  const { page } = realLobbyPage();
  page._latestTournament.coManagers = [];
  const previousWx = global.wx;
  global.wx = { showToast() {} };
  t.after(() => { global.wx = previousWx; });
  const calls = [];
  t.mock.method(cloud, 'call', async (name, payload) => {
    calls.push({ name, payload });
    if (calls.length === 1) throw { code: 'TIMEOUT' };
    return { ok: true };
  });
  const event = { currentTarget: { dataset: { player: 'b' } } };
  await page.onToggleCoManager(event);
  assert.equal(page.data.canRetryAction, true);
  await page.onToggleCoManager(event);
  assert.equal(page._lastFailedAction, null);
  assert.equal(page.data.canRetryAction, false);
  page._latestTournament.coManagers = ['b'];
  await page.onToggleCoManager(event);
  assert.deepEqual(calls.map((call) => call.payload.action), ['grant', 'grant', 'revoke']);
  assert.notEqual(calls[0].payload.clientRequestId, calls[1].payload.clientRequestId);
  assert.notEqual(calls[1].payload.clientRequestId, calls[2].payload.clientRequestId);
  assert.equal(page._lastFailedAction, null);
  assert.equal(page.data.canRetryAction, false);
  await page.retryLastAction();
  assert.equal(calls.length, 3, 'the superseded grant cannot be replayed after successful revoke');
});

test('a successful normal action preserves a newer same-key failure created while it was pending', async (t) => {
  const { page } = realLobbyPage();
  page._latestTournament.coManagers = [];
  const previousWx = global.wx;
  global.wx = { showToast() {} };
  t.after(() => { global.wx = previousWx; });
  let calls = 0;
  let resolve;
  t.mock.method(cloud, 'call', async () => {
    calls += 1;
    if (calls === 1) throw { code: 'TIMEOUT' };
    return new Promise((done) => { resolve = done; });
  });
  const event = { currentTarget: { dataset: { player: 'b' } } };
  await page.onToggleCoManager(event);
  const oldEntry = page._lastFailedAction;
  const pending = page.onToggleCoManager(event);
  page.setLastFailedAction('较新失败', () => {}, { actionKey: 'lobby:coManagers:t1' });
  const newEntry = page._lastFailedAction;
  assert.notEqual(newEntry, oldEntry);
  resolve({ ok: true });
  await pending;
  assert.equal(page._lastFailedAction, newEntry);
  assert.equal(page.data.canRetryAction, true);
  assert.equal(page.data.coManagerBusy, false);
});
