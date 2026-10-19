'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nativeIsolationRuntime } = require('../scripts/dev/weapp-ui-native-isolation');

function fixture() {
  return { kind: 'native-acceptance-fixtures-v1', account: 'ui-screenshot-user', profile: { nickName: '截图球友', avatar: 'cloud://ui-screenshot/avatar.png', gender: 'male' },
    documents: { __ui_settings: { _id: '__ui_settings', name: 'fixture', creatorId: 'ui-screenshot-user', status: 'draft', version: 1, totalMatches: 21, courts: 2, rules: { schedulerProfile: 'balanced' }, players: [] },
      __ui_claim: { _id: '__ui_claim', creatorId: '__ui_owner', status: 'draft', version: 1, players: [{ id: 'guest_ui_1', type: 'guest', name: '阿杰', squad: 'A' }, { id: 'guest_ui_2', type: 'guest', name: '阿杰', squad: 'B' }], playerIds: ['guest_ui_1', 'guest_ui_2'], pairTeams: [{ playerIds: ['guest_ui_1', 'guest_ui_2'] }], rounds: [], rankings: [] } }, settingsIds: ['__ui_settings'], claimId: '__ui_claim' };
}
function host() {
  const real = { cloud: 0, database: 0, network: 0, listener: 0, ui: [] };
  const store = new Map([['openid', 'real-account'], ['other', { nested: [1, 2] }]]);
  const app = { globalData: { openid: 'real-account', nested: { list: [1, 2] }, map: new Map([['before', 1]]) }, _networkListeners: [() => {}] };
  const wx = { cloud: {
    callFunction: async function originalCloud() { real.cloud++; throw Error('REAL CLOUD'); },
    database: function originalDatabase() { real.database++; throw Error('REAL DATABASE'); },
    uploadFile: async function originalCloudUpload() { real.network++; throw Error('REAL UPLOAD'); },
  }, getStorageInfoSync() { return { keys: [...store.keys()], currentSize: 1, limitSize: 100 }; },
  getStorageSync(key) { return store.get(key); }, setStorageSync(key, value) { store.set(key, value); },
  removeStorageSync(key) { store.delete(key); }, clearStorageSync() { store.clear(); },
  getStorage() {}, setStorage() {}, removeStorage() {}, clearStorage() {}, getStorageInfo() {},
  request() { real.network++; }, uploadFile() { real.network++; }, connectSocket() { real.network++; },
  onNetworkStatusChange() { real.listener++; }, offNetworkStatusChange() { real.listener++; },
  reportEvent() { real.network++; },
  showActionSheet(options) { real.ui.push(options); }, showModal(options) { real.ui.push(options); },
  };
  const originals = { cloud: wx.cloud.callFunction, database: wx.cloud.database, request: wx.request, set: wx.setStorageSync, on: wx.onNetworkStatusChange };
  const pages = [{ route: 'pages/launch/index' }];
  const context = vm.createContext({ wx, getApp: () => app, getCurrentPages: () => pages, console, setTimeout, clearTimeout, Promise });
  const run = (command, payload = {}, token = 'test-owner') => { context.command = command; context.payload = payload; context.ownerToken = token; return vm.runInContext(`(${nativeIsolationRuntime.toString()})(command, ownerToken, payload)`, context); };
  return { real, store, app, wx, originals, pages, run };
}

test('unknown cloud, database writes and network calls never reach original SDK; all storage is virtual', async () => {
  const h = host();
  assert.equal((await h.run('install', fixture())).ok, true);
  assert.equal((await h.run('probe')).ok, true);
  assert.equal((await h.wx.cloud.callFunction({ name: 'deployAnything', data: {} })).result.ok, false);
  assert.throws(() => h.wx.cloud.database().collection('production'), /isolated/i);
  assert.throws(() => h.wx.cloud.database().collection('tournaments').doc('__ui_settings').update({ data: {} }), /isolated/i);
  await assert.rejects(h.wx.request({ url: 'https://example.com' }), /isolated/i);
  await assert.rejects(h.wx.cloud.uploadFile({ filePath: 'private' }), /isolated/i);
  h.wx.setStorageSync('new', 'temporary'); h.wx.removeStorageSync('other');
  assert.equal(h.store.has('new'), false); assert.equal(h.store.has('other'), true);
  assert.equal(h.wx.getStorageSync('new'), 'temporary');
  assert.deepEqual([h.real.cloud, h.real.database, h.real.network], [0, 0, 0]);
  assert.equal((await h.run('finish', { neutral: true })).ok, true);
  assert.equal(h.store.get('openid'), 'real-account');
});

test('database fixture arrays and mapped participant previews belong to the business App realm', async () => {
  const h = host(); await h.run('install', fixture());
  try {
    const doc = (await h.wx.cloud.database().collection('tournaments').doc('__ui_claim').get()).data;
    const BusinessArray = Object.getPrototypeOf(h.app._networkListeners).constructor;
    assert.equal(doc.players instanceof BusinessArray, true, 'SDK-injected array literals must not cross into page setData');
    const preview = require('../miniprogram/core/shareMeta').buildShareEntryViewModel({ tournament: doc, openid: fixture().account });
    assert.equal(preview.participantPreviewList.length, 2);
    assert.equal(preview.participantPreviewList instanceof BusinessArray, true, 'map/slice retain the source Array species');
  } finally { await h.run('finish', { neutral: true }); }
});

test('only explicitly armed fixture writes mutate memory, claim requires exact consent/version and preserves membership shape', async () => {
  const h = host(); await h.run('install', fixture());
  const request = { name: 'updateSettings', data: { tournamentId: '__ui_settings', schedulerProfile: 'rest', totalMatches: 21, courts: 2, clientRequestId: 'fixture-request' } };
  assert.equal((await h.wx.cloud.callFunction(request)).result.ok, false);
  await h.run('arm', { kind: 'save', tournamentId: '__ui_settings', schedulerProfile: 'rest' });
  assert.equal((await h.wx.cloud.callFunction(request)).result.ok, true);
  const db = h.wx.cloud.database();
  assert.equal((await db.collection('tournaments').doc('__ui_settings').get()).data.rules.schedulerProfile, 'rest');
  assert.equal((await h.wx.cloud.callFunction(request)).result.ok, false, 'one arm cannot silently permit a second write');
  await h.run('arm', { kind: 'claim', tournamentId: '__ui_claim', claimGuestId: 'guest_ui_2', expectedVersion: 1 });
  const claim = { name: 'joinTournament', data: { tournamentId: '__ui_claim', action: 'claim_guest', claimGuestId: 'guest_ui_2', expectedVersion: 1, claimConfirmed: false, nickname: '截图球友', avatar: fixture().profile.avatar, gender: 'male', clientRequestId: 'fixture-claim' } };
  assert.equal((await h.wx.cloud.callFunction(claim)).result.ok, false);
  claim.data.claimConfirmed = true;
  assert.equal((await h.wx.cloud.callFunction(claim)).result.ok, true);
  const doc = (await db.collection('tournaments').doc('__ui_claim').get()).data;
  assert.equal(doc.players.length, 2); assert.equal(doc.version, 2);
  assert.equal(doc.players[1].id, 'ui-screenshot-user'); assert.equal(doc.players[1].squad, 'B');
  assert.equal(doc.creatorId, '__ui_owner'); assert.equal(doc.pairTeams[0].playerIds[1], 'ui-screenshot-user');
  assert.equal((await h.run('status')).writes, 2);
  await h.run('finish', { neutral: true });
  assert.deepEqual([h.real.cloud, h.real.database], [0, 0]);
});

test('watch handles and listener registrations are local, closed on exceptions/cancellation, and late callbacks cannot invoke business handlers', async () => {
  const h = host(); await h.run('install', fixture());
  let watched = 0, nativeCallback = 0;
  const watcher = h.wx.cloud.database().collection('tournaments').doc('__ui_settings').watch({ onChange() { watched++; } });
  h.wx.onNetworkStatusChange(() => {});
  h.wx.showModal({ success() { nativeCallback++; } });
  await Promise.resolve(); assert.equal(watched, 1);
  assert.equal(h.real.ui.length, 1, 'real native UI is delegated, not simulated');
  await h.run('quiesce');
  h.real.ui[0].success({ confirm: true });
  assert.equal(nativeCallback, 0, 'a late confirmation after abort cannot resume an old write');
  watcher.close();
  const done = await h.run('finish', { neutral: true });
  assert.equal(done.ok, true); assert.equal(done.watchersRemaining, 0); assert.equal(done.listenersRemaining, 0);
  assert.equal(h.real.listener, 0);
});

test('finally restoration preserves full real storage, nested globalData, original listener arrays and SDK functions', async () => {
  const h = host(), global = h.app.globalData, listeners = h.app._networkListeners;
  await h.run('install', fixture());
  h.app.globalData.nested.list.push(3); h.app.globalData.map.set('new', 2);
  h.app.globalData.extra = true; h.app._networkListeners.push(() => {});
  h.app.globalData = { replaced: true }; h.app._networkListeners = [];
  h.wx.clearStorageSync(); h.wx.setStorageSync('other', 'changed');
  h.store.set('external-during-isolation', 'must restore');
  const done = await h.run('finish', { neutral: true });
  assert.equal(done.ok, true); assert.equal(done.storageRestored, true); assert.equal(done.globalDataRestored, true);
  assert.equal(h.app.globalData, global); assert.deepEqual(global.nested.list, [1, 2]);
  assert.deepEqual([...global.map], [['before', 1]]); assert.equal('extra' in global, false);
  assert.equal(h.app._networkListeners, listeners); assert.equal(listeners.length, 1);
  assert.equal(h.store.has('external-during-isolation'), false);
  for (const [actual, expected] of [[h.wx.cloud.callFunction, h.originals.cloud], [h.wx.cloud.database, h.originals.database], [h.wx.request, h.originals.request], [h.wx.setStorageSync, h.originals.set], [h.wx.onNetworkStatusChange, h.originals.on]]) assert.equal(actual, expected);
});

test('installation failure rolls back changed functions and state; unverified neutral cleanup retains fail-closed guards', async () => {
  const h = host();
  Object.defineProperty(h.wx, 'request', { value: h.originals.request, writable: false, configurable: true });
  const failed = await h.run('install', fixture());
  assert.equal(failed.ok, false); assert.equal(failed.rollback.ok, true);
  assert.equal(h.wx.cloud.callFunction, h.originals.cloud); assert.equal(h.wx.cloud.database, h.originals.database);
  assert.equal(h.app.__nativeAcceptanceIsolation, undefined);
  const h2 = host(); await h2.run('install', fixture()); h2.pages[0].route = 'pages/settings/index';
  assert.equal((await h2.run('finish', { neutral: true })).ok, false);
  assert.notEqual(h2.wx.cloud.callFunction, h2.originals.cloud);
  h2.pages[0].route = 'pages/launch/index';
  assert.equal((await h2.run('finish', { neutral: true })).ok, true);
});

test('a lost guard is detected before any original cloud nonce probe can run', async () => {
  const h = host(); await h.run('install', fixture());
  h.wx.cloud.callFunction = h.originals.cloud;
  assert.equal((await h.run('probe')).ok, false);
  assert.equal(h.real.cloud, 0);
  assert.equal((await h.run('finish', { neutral: true })).ok, true);
});

test('failed storage rollback retains guards and the snapshot until a verified recovery succeeds', async () => {
  const h = host();
  const set = h.wx.setStorageSync;
  let fail = false;
  h.wx.setStorageSync = function originalRecoverableSet(k, v) { if (fail) throw Error('restore denied'); return set(k, v); };
  await h.run('install', fixture());
  h.store.set('openid', 'outside-change'); fail = true;
  const first = await h.run('finish', { neutral: true });
  assert.equal(first.ok, false); assert.equal(first.retained, true);
  assert.equal((await h.wx.cloud.callFunction({ name: 'unknown' })).result.ok, false);
  assert.equal(h.real.cloud, 0);
  fail = false;
  assert.equal((await h.run('finish', { neutral: true })).ok, true);
  assert.equal(h.store.get('openid'), 'real-account');
});

test('controller finally cleans a thrown/cancelled action and a lost installation response, releasing its own lock', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dev/weapp-ui-native-acceptance.js'), 'utf8');
  for (const lostInstallReply of [false, true]) {
    const h = host(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-acceptance-test-'));
    let releases = 0, disconnects = 0, lost = false;
    const mp = { async evaluate(fn, command, token, payload) {
      const result = await h.run(command, payload, token);
      if (lostInstallReply && command === 'install' && !lost) { lost = true; throw Error('lost response'); }
      return result;
    }, disconnect() { disconnects++; } };
    const tools = { REPOSITORY_ROOT: directory, readRuntimeConfig: () => ({ sessionFile: path.join(directory, 'session.json') }),
      acquireSessionLock: () => ({}), releaseSessionLockOrThrow: () => { releases++; },
      currentGitManifest: () => ({ ok: true }), hashCanonical: JSON.stringify, timeout: promise => promise,
      openMiniProgram: async () => ({ miniProgram: mp }), verifySessionBinding: async () => ({ ok: true, checks: { marker: true } }),
      cleanupCaptureRun: async () => ({ ok: true }) };
    const module = { exports: {} };
    const localRequire = name => name === './weapp-ui-screenshot' ? tools : name === './weapp-ui-native-isolation'
      ? { nativeIsolationRuntime } : name === './weapp-ui-native-fixtures' ? { buildNativeFixtures: fixture }
        : name === './weapp-ui-native-recovery' ? require('../scripts/dev/weapp-ui-native-recovery') : require(name);
    const context = vm.createContext({ require: localRequire, module, exports: module.exports, process: { env: { COMPUTERNAME: 'VM' }, pid: 1 }, console });
    try {
      vm.runInContext(`(function(require,module,exports){${source}\n})(require,module,exports)`, context);
      await assert.rejects(module.exports.withNativeAcceptance(null, async () => { throw Error('user cancelled'); }), lostInstallReply ? /lost response/ : /user cancelled/);
      assert.equal(releases, 1); assert.equal(disconnects, 1);
      assert.equal(h.app.__nativeAcceptanceIsolation, undefined);
      assert.equal(h.wx.cloud.callFunction, h.originals.cloud);
      assert.equal(h.store.get('openid'), 'real-account');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('the actual scheduler handler saves its selected profile through the isolated backend; real storage/network stay untouched', async () => {
  const h = host();
  Object.assign(h.wx, { showLoading() {}, hideLoading() {}, showToast() {} });
  await h.run('install', fixture());
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/settings/settingsActions.js'), 'utf8');
  const cloud = { call: async (name, data) => (await h.wx.cloud.callFunction({ name, data })).result,
    assertWriteResult: result => { if (!result.ok) throw Error('write denied'); } };
  const actionGuard = { isBusy: () => false, runWithCriticalPageBusy: async (page, key, action, fn) => {
    page.setData({ [key]: true }); try { return await fn(); } finally { page.setData({ [key]: false }); }
  } };
  const module = { exports: {} };
  const requireStub = name => name.endsWith('/cloud') ? cloud : name.endsWith('/actionGuard') ? actionGuard
    : name.endsWith('/clientRequest') ? { resolveClientRequestId: () => 'fixture-real-save' }
      : name.endsWith('/uxFlow') ? { getSynchronizedTournamentName: name => name }
        : name.endsWith('/nav') ? { markRefreshFlag: () => { h.app.globalData.needRefreshTournament = '__ui_settings'; }, setLobbyIntent() {} } : {};
  vm.runInNewContext(`(function(require,module){${source}\n})(require,module)`, { require: requireStub, module, wx: h.wx, setTimeout, clearTimeout });
  const page = { ...module.exports, _lifecycleGeneration: 1,
    data: { tournamentId: '__ui_settings', tournament: fixture().documents.__ui_settings, name: 'fixture',
      canManageTournament: true, isDraft: true, canConfigureSettings: true, showSchedulerProfile: true,
      schedulerProfile: 'balanced', schedulerProfileOptions: [{ key: 'balanced' }, { key: 'rest', label: '休息优先', hint: 'fixture hint' }], editM: 21, editC: 2 },
    setData(value) { Object.assign(this.data, value); }, clearLastFailedAction() {}, hasUnsavedSettingsDraft: () => true,
    async fetchTournament(id) { this.data.tournament = (await h.wx.cloud.database().collection('tournaments').doc(id).get()).data; } };
  page.onPickSchedulerProfile({ detail: { value: 1 } });
  assert.equal(page.data.schedulerProfile, 'rest');
  await h.run('arm', { kind: 'save', tournamentId: '__ui_settings', schedulerProfile: 'rest' });
  await page.saveSettings();
  assert.equal(page.data.tournament.rules.schedulerProfile, 'rest');
  const status = await h.run('status');
  assert.equal(status.writes, 1); assert.equal(status.requests.filter(r => r.kind === 'cloud' && r.name === 'updateSettings' && r.allowed).length, 1);
  await h.run('finish', { neutral: true });
  assert.equal(h.app.globalData.openid, 'real-account'); assert.equal(h.app.globalData.needRefreshTournament, undefined);
  assert.deepEqual([h.real.cloud, h.real.database, h.real.network], [0, 0, 0]);
});

test('the real member-claim decision requires native list and second confirmation; cancellation emits no write', async () => {
  const h = host(); await h.run('install', fixture());
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/core/memberClaim.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module){${source}\n})(require,module)`, { wx: h.wx, module,
    require: name => name === './storage' ? { get: () => 'ui-screenshot-user' } : { getTournamentPlayerLimit: () => 2 } });
  const doc = fixture().documents.__ui_claim;
  const cancelled = module.exports.chooseMemberClaim(doc);
  await Promise.resolve();
  assert.equal(h.real.ui[0].itemList[1], '2. 阿杰（B队） / 搭档阿杰');
  h.real.ui[0].success({ tapIndex: 1 }); await Promise.resolve(); await Promise.resolve();
  assert.match(h.real.ui[1].content, /2\. 阿杰/);
  h.real.ui[1].success({ confirm: false, cancel: true });
  assert.equal(await cancelled, null); assert.equal((await h.run('status')).writes, 0);
  const accepted = module.exports.chooseMemberClaim(doc); await Promise.resolve();
  h.real.ui[2].success({ tapIndex: 1 }); await Promise.resolve(); await Promise.resolve();
  h.real.ui[3].success({ confirm: true, cancel: false });
  const choice = await accepted;
  assert.equal(choice.claimGuestId, 'guest_ui_2'); assert.equal(choice.claimConfirmed, true);
  await h.run('arm', { kind: 'claim', tournamentId: '__ui_claim', claimGuestId: 'guest_ui_2', expectedVersion: 1 });
  const result = await h.wx.cloud.callFunction({ name: 'joinTournament', data: { ...choice, tournamentId: '__ui_claim',
    nickname: fixture().profile.nickName, avatar: fixture().profile.avatar, gender: 'male', clientRequestId: 'fixture-real-claim' } });
  assert.equal(result.result.ok, true); assert.equal((await h.run('status')).writes, 1);
  await h.run('finish', { neutral: true }); assert.equal(h.real.cloud, 0);
});

test('non-full ordinary join appends one member without claiming guests or granting management', async () => {
  const f = require('../scripts/dev/weapp-ui-native-fixtures').buildNativeFixtures();
  assert.ok(f.joinId, 'ordinary join needs its own non-full fixture');
  const original = JSON.parse(JSON.stringify(f.documents[f.joinId]));
  assert.equal(original.players.length, 5); assert.equal(original.playerLimit, 6);
  assert.equal(f.entries.shareJoinOpenSlot.selectorExpectations['.participant-avatar-img'], 5);
  assert.equal(require('../scripts/dev/weapp-ui-screenshot').cases.shareDraft.selectorExpectations['.participant-avatar-img'], 6);
  const h = host(); await h.run('install', f);
  try {
    const source = fs.readFileSync(path.join(__dirname, '../miniprogram/core/memberClaim.js'), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(`(function(require,module){${source}\n})(require,module)`, { wx: h.wx, module,
      require: name => name === './storage' ? { get: () => f.account } : require('../miniprogram/core/mode') });
    const choiceTask = module.exports.chooseMemberClaim(original); await Promise.resolve();
    const sheet = h.real.ui[0]; assert.equal(sheet.itemList.at(-1), '不认领，以新成员加入');
    sheet.success({ tapIndex: sheet.itemList.length - 1 });
    const choice = await choiceTask; assert.equal(choice.action, 'join'); assert.equal(choice.claimGuestId, undefined);
    const base = require('../miniprogram/core/joinTournament').buildJoinPayload({ tournamentId: f.joinId, mode: original.mode, profile: f.profile, localProfile: f.profile });
    const request = { name: 'joinTournament', data: { ...base, ...choice, clientRequestId: 'ordinary-join-test',
      __traceId: require('../miniprogram/core/trace').createTraceId('joinTournament') } };
    assert.equal((await h.wx.cloud.callFunction(request)).result.ok, false, 'join requires an explicit arm');
    assert.equal((await h.run('arm', { kind: 'join', tournamentId: f.claimId, expectedVersion: 1 })).ok, false, 'full claim fixture cannot be armed for ordinary join');
    assert.equal((await h.run('arm', { kind: 'join', tournamentId: f.joinId, expectedVersion: 1 })).ok, true);
    assert.equal((await h.wx.cloud.callFunction({ name: 'manageActivityId', data: { tournamentId: f.joinId, action: 'getOrCreate' } })).result.ok, false);
    assert.equal((await h.wx.cloud.callFunction({ ...request, data: { ...request.data, claimGuestId: 'guest_ui_claim_2' } })).result.ok, false);
    assert.equal((await h.wx.cloud.callFunction({ ...request, data: { ...request.data, coManagers: [f.account] } })).result.ok, false);
    assert.equal((await h.wx.cloud.callFunction({ ...request, data: { ...request.data, __traceId: 'unexpected' } })).result.ok, false);
    const response = (await h.wx.cloud.callFunction(request)).result;
    assert.equal(response.ok, true); assert.equal(response.added, true); assert.equal(response.claimed, undefined);
    const doc = (await h.wx.cloud.database().collection('tournaments').doc(f.joinId).get()).data;
    assert.equal(doc.players.length, 6); assert.equal(doc.version, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(doc.players.slice(0, 5))), original.players);
    assert.deepEqual(JSON.parse(JSON.stringify(doc.playerIds.slice(0, 5))), original.playerIds);
    assert.equal(doc.players.at(-1).id, f.account); assert.equal(doc.players.at(-1).claimedGuestId, undefined);
    const permission = require('../miniprogram/permission/permission');
    assert.equal(permission.isParticipant(doc, f.account), true); assert.equal(permission.canManageTournament(doc, f.account), false);
    assert.equal((await h.wx.cloud.callFunction(request)).result.ok, false, 'one arm permits only one append');
    assert.equal((await h.run('status')).writes, 1); assert.equal(h.real.ui.length, 1, 'ordinary join does not confirm a guest');
    assert.deepEqual([h.real.cloud, h.real.database, h.real.network], [0, 0, 0]);
  } finally { assert.equal((await h.run('finish', { neutral: true })).ok, true); }
});

test('the production cloud adapter trace field is accepted only for the armed ordinary-join fixture', async () => {
  const f = require('../scripts/dev/weapp-ui-native-fixtures').buildNativeFixtures();
  const h = host(); await h.run('install', f);
  try {
    const captured = [], module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../miniprogram/core/cloud.js'), 'utf8');
    vm.runInNewContext(`(function(require,module){${source}\n})(require,module)`, {
      wx: { cloud: { callFunction(request) { captured.push(JSON.parse(JSON.stringify(request))); return h.wx.cloud.callFunction(request); } } },
      console, module, setTimeout, clearTimeout,
      require(name) {
        if (name === './trace') return require('../miniprogram/core/trace');
        if (name === './storage/cacheBudget') return { pin: () => () => {}, beginWrite() {}, confirmWrite() {} };
        if (name === './activityTracker') return { begin() {}, finish() {} };
        if (name === '../config/env') return { resolveRuntimeEnv: () => ({ envVersion: 'develop' }) };
        throw Error(`Unexpected cloud dependency: ${name}`);
      },
    });
    const data = { tournamentId: f.joinId, action: 'join', nickname: f.profile.nickName, avatar: f.profile.avatar,
      gender: f.profile.gender, squadChoice: '', clientRequestId: 'production-adapter-join' };
    await h.run('arm', { kind: 'join', tournamentId: f.joinId, expectedVersion: 1 });
    const result = await module.exports.call('joinTournament', data);
    assert.match(captured[0].data.__traceId, /^joinTournament_\d+_[a-z0-9]+$/);
    assert.equal(result.ok, true, JSON.stringify({ capturedKeys: Object.keys(captured[0].data) }));
    const state = await h.run('status');
    assert.equal(state.writes, 1);
    assert.equal(state.joinDiagnostics.at(-1).checks.fields, true);
    assert.equal(state.joinDiagnostics.at(-1).checks.trace, true);
    assert.equal(Object.values(state.joinDiagnostics.at(-1).checks).every(Boolean), true);
    const after = (await h.wx.cloud.database().collection('tournaments').doc(f.joinId).get()).data;
    assert.equal(after.players.length, 6); assert.equal(after.version, 2);
    assert.equal(require('../miniprogram/permission/permission').canManageTournament(after, f.account), false);
    assert.deepEqual(JSON.parse(JSON.stringify(after.players.slice(0, 5))), f.documents[f.joinId].players);
    assert.equal((await module.exports.call('joinTournament', { ...data, coManagers: [f.account] })).ok, false);
    assert.deepEqual([h.real.cloud, h.real.database, h.real.network], [0, 0, 0]);
  } finally { assert.equal((await h.run('finish', { neutral: true })).ok, true); }
});

test('storage snapshots preserve Date/binary values and neutral projection is refreshed before original SDK restoration', async () => {
  const h = host();
  h.store.set('date', new Date(1234)); h.store.set('bytes', new Uint8Array([1, 2, 3]));
  let seenOpenid;
  h.pages[0].onShow = () => { seenOpenid = h.wx.getStorageSync('openid'); };
  await h.run('install', fixture());
  assert.equal(h.wx.getStorageSync('date').getTime(), 1234);
  const value = h.wx.getStorageSync('bytes'); value[0] = 99;
  assert.equal(h.store.get('bytes')[0], 1);
  const done = await h.run('finish', { neutral: true });
  assert.equal(done.ok, true); assert.equal(done.neutralViewRefreshed, true);
  assert.equal(seenOpenid, 'real-account'); assert.equal(h.store.get('date').getTime(), 1234);
  assert.deepEqual([...h.store.get('bytes')], [1, 2, 3]);
});

test('cleanup-only abort settles a pending real claim decision without fabricating a native cancel event', async () => {
  const h = host(); await h.run('install', fixture());
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/core/memberClaim.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module){${source}\n})(require,module)`, { wx: h.wx, module,
    require: name => name === './storage' ? { get: () => 'ui-screenshot-user' } : { getTournamentPlayerLimit: () => 2 } });
  const choice = module.exports.chooseMemberClaim(fixture().documents.__ui_claim);
  await Promise.resolve();
  await h.run('quiesce');
  assert.equal(await choice, null);
  const status = await h.run('status');
  assert.equal(status.cleanupAborts, 1); assert.equal(status.nativeEvents.length, 0); assert.equal(status.writes, 0);
  await h.run('finish', { neutral: true });
  h.real.ui[0].success({ tapIndex: 1 });
  await Promise.resolve(); assert.equal(h.real.ui.length, 1); assert.equal(h.real.cloud, 0);
});

test('interactive backend fixtures agree with production name/court normalization before any real picker save', () => {
  const { buildNativeFixtures } = require('../scripts/dev/weapp-ui-native-fixtures');
  const { buildSettingsViewState } = require('../miniprogram/pages/settings/settingsViewModel');
  const flow = require('../miniprogram/core/uxFlow');
  const f = buildNativeFixtures();
  for (const id of f.settingsIds) {
    const doc = f.documents[id], data = buildSettingsViewState(doc, { openid: f.account });
    assert.equal(doc.name, flow.getSynchronizedTournamentName(data.name, doc.mode, doc.presetKey));
    assert.equal(doc.courts, data.editC); assert.equal(doc.totalMatches, data.editM);
    assert.equal(data.canManageTournament, true); assert.equal(data.canConfigureSettings, true);
    const entry = Object.values(f.entries).find(value => value.id === id);
    const hasShortcut = !!(data.matchShortcutHint || data.matchShortcutOptions.length || data.matchPresetUnavailableHint);
    assert.equal(entry.formLabels.length, 5 + Number(hasShortcut));
    assert.equal(entry.formLabels.includes('快捷设置'), hasShortcut);
    assert.equal(entry.formLabels.includes('排程偏好'), true);
  }
});
