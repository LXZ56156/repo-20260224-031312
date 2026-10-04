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
