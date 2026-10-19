'use strict';

// This function is serialized into AppService. Keep every dependency inside it.
// Real native dialogs/navigation are delegated; backend and network are never delegated.
async function nativeIsolationRuntime(command, token, payload) {
  'use strict';
  payload = payload || {};
  const app = typeof getApp === 'function' ? getApp() : null;
  const key = '__nativeAcceptanceIsolation';
  if (!app || !app.globalData || typeof wx !== 'object') return { ok: false, reason: 'runtime-unavailable' };
  if (command !== 'install') {
    const previous = app[key];
    if (!previous || previous.token !== token) return { ok: false, reason: 'owner-mismatch', present: !!previous };
    return previous.dispatch(command, payload);
  }
  if (app[key] || app.__uiCaptureIsolation) return { ok: false, reason: 'isolation-already-present' };
  const initialPages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (initialPages.length !== 1 || (initialPages[0].route || initialPages[0].__route__) !== 'pages/launch/index') return { ok: false, reason: 'start-from-neutral-launch' };
  // App.callFunction's array literals can belong to the injected SDK realm.
  // Page map/slice preserve that species, which WXML does not render as a list.
  // Materialize backend/storage copies in the real App's Array realm instead.
  if (!Array.isArray(app._networkListeners)) return { ok: false, reason: 'application-array-realm-unavailable' };
  const ApplicationArray = Object.getPrototypeOf(app._networkListeners).constructor;
  function copy(value, seen = new Map()) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol') throw Error('Unsupported storage value');
      return value;
    }
    if (seen.has(value)) return seen.get(value);
    const tag = Object.prototype.toString.call(value);
    if (tag === '[object Date]') return new Date(value.getTime());
    if (tag === '[object ArrayBuffer]') return value.slice(0);
    if (ArrayBuffer.isView(value)) return tag === '[object DataView]'
      ? new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) : new value.constructor(value);
    const result = tag === '[object Map]' ? new Map() : tag === '[object Set]' ? new Set() : Array.isArray(value) ? new ApplicationArray() : {};
    seen.set(value, result);
    if (tag === '[object Map]') value.forEach((v, k) => result.set(copy(k, seen), copy(v, seen)));
    else if (tag === '[object Set]') value.forEach(v => result.add(copy(v, seen)));
    else if (tag === '[object Object]' || tag === '[object Array]') Object.keys(value).forEach(name => { result[name] = copy(value[name], seen); });
    else throw Error('Unsupported storage container');
    return result;
  }
  function fingerprint(value, seen = new Map()) {
    if (value === null || typeof value !== 'object') return [typeof value, String(value)];
    if (seen.has(value)) return ['ref', seen.get(value)];
    seen.set(value, seen.size);
    const tag = Object.prototype.toString.call(value);
    if (tag === '[object Date]') return [tag, value.getTime()];
    if (tag === '[object ArrayBuffer]') return [tag, [...new Uint8Array(value)]];
    if (ArrayBuffer.isView(value)) return [tag, [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]];
    if (tag === '[object Map]') return [tag, [...value].map(([k, v]) => [fingerprint(k, seen), fingerprint(v, seen)])];
    if (tag === '[object Set]') return [tag, [...value].map(v => fingerprint(v, seen))];
    return [tag, Object.keys(value).sort().map(name => [name, fingerprint(value[name], seen)])];
  }
  const equal = (a, b) => JSON.stringify(fingerprint(a)) === JSON.stringify(fingerprint(b));
  const own = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
  if (payload.kind !== 'native-acceptance-fixtures-v1' || payload.account !== 'ui-screenshot-user' || !payload.profile
      || !payload.documents || !Object.keys(payload.documents).length
      || Object.entries(payload.documents).some(([id, doc]) => !/^__ui_[a-z0-9_]+$/.test(id) || !doc || doc._id !== id)) {
    return { ok: false, reason: 'invalid-fixtures' };
  }
  const required = ['getStorageInfoSync', 'getStorageSync', 'setStorageSync', 'removeStorageSync'];
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function' || typeof wx.cloud.database !== 'function'
      || required.some(name => typeof wx[name] !== 'function')) return { ok: false, reason: 'missing-sdk' };
  const originalStorage = Object.fromEntries(required.map(name => [name, wx[name]]));
  const storageInfo = originalStorage.getStorageInfoSync.call(wx);
  if (!storageInfo || !Array.isArray(storageInfo.keys)) return { ok: false, reason: 'storage-snapshot-unavailable' };
  const realStorage = new Map(storageInfo.keys.map(name => [name, copy(originalStorage.getStorageSync.call(wx, name))]));
  const virtualStorage = new Map([...realStorage].map(([name, value]) => [name, copy(value)]));
  const globalData = app.globalData;
  const listenerExisted = own(app, '_networkListeners');
  const originalListeners = app._networkListeners;
  // Preserve identity, functions, cycles and nested mutable containers in globalData.
  const graph = [];
  const seen = new Set();
  function snapshot(object) {
    if (!object || typeof object !== 'object' || seen.has(object)) return;
    seen.add(object);
    const tag = Object.prototype.toString.call(object);
    if (tag === '[object Map]') {
      const entries = [...object]; graph.push({ object, tag, entries });
      entries.forEach(([k, v]) => { snapshot(k); snapshot(v); });
    } else if (tag === '[object Set]') {
      const entries = [...object]; graph.push({ object, tag, entries }); entries.forEach(snapshot);
    } else if (tag === '[object Date]') graph.push({ object, tag, time: object.getTime() });
    else if (tag === '[object Object]' || tag === '[object Array]') {
      const descriptors = Object.getOwnPropertyDescriptors(object);
      graph.push({ object, tag, descriptors });
      Reflect.ownKeys(descriptors).forEach(name => { if ('value' in descriptors[name]) snapshot(descriptors[name].value); });
    } else throw Error('Unsupported globalData snapshot container');
  }
  snapshot(globalData); snapshot(originalListeners);
  const state = { token, closing: false, active: true, slots: [], watches: new Set(), listeners: new Map(),
    documents: copy(payload.documents), phase: { kind: 'observe' }, writes: 0, blocked: 0, total: 0,
    nativeEvents: [], requests: [], joinDiagnostics: [], nativePending: new Set(), consumed: false, cleanupAborts: 0 };
  const isolatedError = () => Object.assign(new Error('Native acceptance isolated request'), { code: 'UI_NATIVE_ISOLATED' });
  const rejected = error => { const promise = Promise.reject(error); promise.catch(() => {}); return promise; };
  function record(kind, data = {}, allowed = false) {
    state.total++; if (!allowed) state.blocked++;
    if (state.requests.length < 500) state.requests.push({ kind, allowed,
      ...Object.fromEntries(['name', 'action', 'tournamentId', 'schedulerProfile', 'claimGuestId', 'claimConfirmed', 'expectedVersion', 'totalMatches', 'courts']
        .filter(name => data[name] !== undefined).map(name => [name, copy(data[name])])) });
  }
  function patch(owner, name, replacement) {
    const slot = { owner, name, existed: own(owner, name), value: owner[name], replacement };
    state.slots.push(slot);
    owner[name] = replacement;
    if (typeof owner[name] !== 'function' || owner[name].name !== replacement.name) throw Error(`SDK guard assignment failed: ${name}`);
  }
  function callback(options, response, success = true) {
    if (!state.active || state.closing) return;
    const fn = options && options[success ? 'success' : 'fail'];
    if (typeof fn === 'function') fn(response);
    if (options && typeof options.complete === 'function') options.complete(response);
  }
  function notify(id) {
    for (const watcher of state.watches) if (watcher.id === id) {
      Promise.resolve().then(() => {
        if (state.active && !state.closing && state.watches.has(watcher) && typeof watcher.options.onChange === 'function') {
          watcher.options.onChange({ docs: [copy(state.documents[id])], type: 'init' });
        }
      });
    }
  }
  function rewriteIds(value, oldId, newId) {
    if (value === oldId) return newId;
    if (Array.isArray(value)) return value.map(item => rewriteIds(item, oldId, newId));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteIds(v, oldId, newId)]));
    return value;
  }
  function cloudResult(request) {
    const data = request.data || {};
    if (request.name === '__native_acceptance_probe__' && data.nonce === token) return { ok: true, nonce: token };
    let response = { ok: false, code: 'UI_NATIVE_ISOLATED', message: '隔离验收未配置此请求' };
    const doc = state.documents[data.tournamentId];
    const phase = state.phase;
    let allowed = false;
    const joinChecks = request.name === 'joinTournament' && data.tournamentId === payload.joinId ? {
      active: state.active && !state.closing && !state.consumed,
      phase: phase.kind === 'join' && phase.tournamentId === data.tournamentId,
      draft: !!doc && doc.status === 'draft',
      requestId: typeof data.clientRequestId === 'string' && !!data.clientRequestId,
      fields: Object.keys(data).every(key => ['tournamentId', 'action', 'nickname', 'avatar', 'gender', 'squadChoice', 'clientRequestId', '__traceId'].includes(key)),
      trace: typeof data.__traceId === 'string' && data.__traceId.length <= 96 && /^joinTournament_\d+_[a-z0-9]{0,6}$/.test(data.__traceId),
      action: data.action === 'join', squad: data.squadChoice === undefined || data.squadChoice === '',
      version: !!doc && phase.expectedVersion === (Number(doc.version) || 1),
      capacity: !!doc && (doc.players || []).length < Number(doc.playerLimit),
      notJoined: !!doc && !(doc.players || []).some(player => player.id === payload.account),
      identity: app.globalData.openid === payload.account,
      nickname: data.nickname === payload.profile.nickName, avatar: data.avatar === payload.profile.avatar, gender: data.gender === payload.profile.gender,
    } : null;
    const joinObservation = joinChecks ? { fields: Object.keys(data), phase: phase.kind, expectedVersion: phase.expectedVersion,
      documentVersion: doc && doc.version, playerCount: doc && doc.players.length, playerLimit: doc && doc.playerLimit } : null;
    if (state.active && !state.closing && !state.consumed && doc && doc.status === 'draft'
        && data.tournamentId === phase.tournamentId && typeof data.clientRequestId === 'string' && data.clientRequestId) {
      if (phase.kind === 'save' && request.name === 'updateSettings' && !data.action
          && data.schedulerProfile === phase.schedulerProfile && ['balanced', 'rest', 'coverage'].includes(data.schedulerProfile)
          && data.totalMatches === doc.totalMatches && data.courts === doc.courts
          && (data.name === undefined || data.name === doc.name)
          && (data.pointsPerGame === undefined || data.pointsPerGame === (doc.pointsPerGame || 21))) {
        doc.rules = { ...doc.rules, schedulerProfile: data.schedulerProfile };
        doc.totalMatches = data.totalMatches; doc.courts = data.courts;
        if (data.name !== undefined) doc.name = String(data.name);
        if (data.pointsPerGame !== undefined) doc.pointsPerGame = data.pointsPerGame;
        doc.version = (Number(doc.version) || 1) + 1; doc.updatedAt = Date.now();
        allowed = true; response = { ok: true, version: doc.version };
      } else if (joinChecks && Object.values(joinChecks).every(Boolean)) {
        const player = { id: payload.account, name: data.nickname, avatar: data.avatar, gender: data.gender, squad: '' };
        doc.players = doc.players.concat(player); doc.playerIds = doc.players.map(item => item.id);
        doc.version = (Number(doc.version) || 1) + 1; doc.updatedAt = Date.now();
        allowed = true; response = { ok: true, added: true, version: doc.version, player: copy(player) };
      } else if (phase.kind === 'claim' && request.name === 'joinTournament' && data.action === 'claim_guest'
          && data.claimConfirmed === true && data.claimGuestId === phase.claimGuestId
          && data.expectedVersion === phase.expectedVersion && data.expectedVersion === (Number(doc.version) || 1)
          && data.nickname === payload.profile.nickName && data.avatar === payload.profile.avatar && data.gender === payload.profile.gender) {
        const targets = (doc.players || []).filter(player => player.id === data.claimGuestId && (player.type === 'guest' || player.id.startsWith('guest_')));
        if (targets.length === 1 && !(doc.players || []).some(player => player.id === payload.account)) {
          const target = targets[0], oldId = target.id;
          doc.players = doc.players.map(player => player !== target ? player : { ...player, id: payload.account,
            ...(own(player, 'playerId') ? { playerId: payload.account } : {}), ...(own(player, '_id') ? { _id: payload.account } : {}),
            claimedGuestId: oldId, type: 'user', name: String(data.nickname || payload.profile.nickName),
            avatar: String(data.avatar || payload.profile.avatar), gender: String(data.gender || payload.profile.gender) });
          for (const field of ['playerIds', 'pairTeams', 'rounds', 'rankings']) if (doc[field]) doc[field] = rewriteIds(doc[field], oldId, payload.account);
          doc.version = (Number(doc.version) || 1) + 1; doc.updatedAt = Date.now();
          allowed = true; response = { ok: true, claimed: true, claimedGuestId: oldId, version: doc.version };
        }
      }
      if (allowed) { state.consumed = true; state.writes++; notify(data.tournamentId); }
    }
    if (joinChecks && state.joinDiagnostics.length < 20) state.joinDiagnostics.push({ ...joinObservation, allowed, checks: copy(joinChecks) });
    record('cloud', { ...data, name: request.name }, allowed);
    return response;
  }
  function nativeFixtureCloud(request = {}) {
    const response = { result: cloudResult(request) }; callback(request, response);
    return Promise.resolve(response);
  }
  function nativeFixtureDatabase() {
    const denied = () => { record('database-write'); throw isolatedError(); };
    return { collection(collection) {
      if (collection !== 'tournaments') return denied();
      return { doc(id) {
        if (!own(state.documents, id)) return denied();
        return { get(options) {
          if (state.closing || !state.active) return rejected(isolatedError());
          record('database-read', { tournamentId: id }, true);
          const response = { data: copy(state.documents[id]) }; callback(options, response); return Promise.resolve(response);
        }, watch(options = {}) {
          if (state.closing || !state.active) return denied();
          record('database-watch', { tournamentId: id }, true);
          const watcher = { id, options }; state.watches.add(watcher); notify(id);
          return { close() { state.watches.delete(watcher); } };
        }, set: denied, update: denied, remove: denied, add: denied };
      }, add: denied, where: denied, get: denied, watch: denied, update: denied, remove: denied };
    }, runTransaction: denied, command: {}, serverDate: denied };
  }
  function nativeFixtureNetwork(options = {}) {
    record('network'); const error = isolatedError(); callback(options, error, false);
    const promise = rejected(error); promise.abort = () => {}; return promise;
  }
  function wrapNative(name) {
    const original = wx[name];
    return function nativeFixtureDialog(options = {}) {
      if (!state.active || state.closing) return rejected(isolatedError());
      let settled = false, rejectAbort;
      const abortPromise = new Promise((resolve, reject) => { rejectAbort = reject; });
      abortPromise.catch(() => {});
      const pending = { abort() {
        if (settled) return;
        settled = true; state.cleanupAborts++;
        const error = isolatedError(); rejectAbort(error);
        // Cleanup-only failure settles outstanding page promises under guards.
        // It is never recorded as a real native cancel/selection acceptance.
        if (typeof options.fail === 'function') options.fail(error);
      } };
      state.nativePending.add(pending);
      const wrap = event => value => {
        if (!state.active || state.closing) return;
        if (event !== 'complete') {
          if (settled) return;
          settled = true;
          state.nativePending.delete(pending);
          state.nativeEvents.push({ api: name, event, confirm: value && value.confirm === true,
            cancel: value && value.cancel === true, tapIndex: value && Number.isInteger(value.tapIndex) ? value.tapIndex : null });
        }
        if (typeof options[event] === 'function') options[event](value);
      };
      const result = original.call(wx, { ...options, success: wrap('success'), fail: wrap('fail'), complete: wrap('complete') });
      // Preserve real results while active. A promise from an old dialog must not
      // resume a business continuation after cleanup restored the real SDK.
      if (!result || typeof result.then !== 'function') return result;
      const guarded = Promise.race([result.then(value => state.active && !state.closing
        ? value : new Promise(() => {}), error => state.active && !state.closing ? Promise.reject(error) : new Promise(() => {})), abortPromise]);
      guarded.catch(() => {}); return guarded;
    };
  }
  function nativeFixtureGet(keyName) { return copy(virtualStorage.get(String(keyName))); }
  function nativeFixtureSet(keyName, value) { virtualStorage.set(String(keyName), copy(value)); }
  function nativeFixtureRemove(keyName) { virtualStorage.delete(String(keyName)); }
  function nativeFixtureClear() { virtualStorage.clear(); }
  function nativeFixtureInfo() { return { keys: [...virtualStorage.keys()], currentSize: 0, limitSize: storageInfo.limitSize || 10240 }; }
  function restoreGraph() {
    app.globalData = globalData;
    if (listenerExisted) app._networkListeners = originalListeners; else delete app._networkListeners;
    for (const node of graph) {
      if (node.tag === '[object Map]') { node.object.clear(); node.entries.forEach(([k, v]) => node.object.set(k, v)); }
      else if (node.tag === '[object Set]') { node.object.clear(); node.entries.forEach(value => node.object.add(value)); }
      else if (node.tag === '[object Date]') node.object.setTime(node.time);
      else {
        for (const name of Reflect.ownKeys(node.object)) if (!own(node.descriptors, name)) {
          if (!Reflect.deleteProperty(node.object, name)) throw Error('globalData property removal failed');
        }
        Object.defineProperties(node.object, node.descriptors);
      }
    }
    return app.globalData === globalData && (listenerExisted ? app._networkListeners === originalListeners : !own(app, '_networkListeners'))
      && graph.every(node => {
        if (node.tag === '[object Map]') return node.object.size === node.entries.length && node.entries.every(([k, v]) => node.object.get(k) === v);
        if (node.tag === '[object Set]') return node.object.size === node.entries.length && node.entries.every(value => node.object.has(value));
        if (node.tag === '[object Date]') return node.object.getTime() === node.time;
        const names = Reflect.ownKeys(node.object);
        return names.length === Reflect.ownKeys(node.descriptors).length && names.every(name => {
          const current = Object.getOwnPropertyDescriptor(node.object, name), saved = node.descriptors[name];
          return saved && current.value === saved.value && current.get === saved.get && current.set === saved.set
            && current.enumerable === saved.enumerable && current.configurable === saved.configurable && current.writable === saved.writable;
        });
      });
  }
  function restoreStorage() {
    const keys = originalStorage.getStorageInfoSync.call(wx).keys;
    for (const name of keys) if (!realStorage.has(name)) originalStorage.removeStorageSync.call(wx, name);
    for (const [name, value] of realStorage) if (!keys.includes(name) || !equal(originalStorage.getStorageSync.call(wx, name), value)) originalStorage.setStorageSync.call(wx, name, copy(value));
    const actual = originalStorage.getStorageInfoSync.call(wx).keys;
    return actual.length === realStorage.size && [...realStorage].every(([name, value]) => actual.includes(name) && equal(originalStorage.getStorageSync.call(wx, name), value));
  }
  function quiesce() {
    state.closing = true; state.phase = { kind: 'observe' };
    for (const pending of state.nativePending) { try { pending.abort(); } catch (_) { /* late callbacks remain tombstoned */ } }
    state.watches.clear(); state.listeners.clear(); state.nativePending.clear();
    return { ok: true };
  }
  function summary() {
    return { ok: true, closing: state.closing, writes: state.writes, blocked: state.blocked, requests: copy(state.requests), joinDiagnostics: copy(state.joinDiagnostics),
      total: state.total, watchersRemaining: state.watches.size, listenersRemaining: [...state.listeners.values()].reduce((n, set) => n + set.size, 0),
      nativePending: state.nativePending.size, nativeEvents: copy(state.nativeEvents), cleanupAborts: state.cleanupAborts, configuredNetworkPassthrough: false,
      guardsVerified: state.slots.every(slot => typeof slot.owner[slot.name] === 'function' && slot.owner[slot.name].name === slot.replacement.name) };
  }
  async function probe() {
    const sdk = state.slots.every(slot => typeof slot.owner[slot.name] === 'function' && slot.owner[slot.name].name === slot.replacement.name);
    // Check guards before invoking any nonce method; never probe an original SDK.
    if (!sdk) return { ok: false, sdkGuards: false, virtualStorage: false };
    const response = await wx.cloud.callFunction({ name: '__native_acceptance_probe__', data: { nonce: token } });
    const id = Object.keys(state.documents)[0];
    const read = state.closing ? null : await wx.cloud.database().collection('tournaments').doc(id).get();
    const scratch = `__ui_native_probe_${token}`;
    const previous = virtualStorage.has(scratch), value = virtualStorage.get(scratch);
    wx.setStorageSync(scratch, { nonce: token }); const stored = wx.getStorageSync(scratch); wx.removeStorageSync(scratch);
    if (previous) virtualStorage.set(scratch, value);
    return { ok: !!response.result && response.result.nonce === token && !!stored && stored.nonce === token && sdk
        && (state.closing || !!read && read.data._id === id),
      sdkGuards: sdk, virtualStorage: !!stored && stored.nonce === token };
  }
  async function finish(options = {}) {
    quiesce();
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const neutral = pages.length === 1 && (pages[0].route || pages[0].__route__) === 'pages/launch/index';
    if (!options.rollback && (!options.neutral || !neutral)) return { ok: false, retained: true, reason: 'neutral-page-unverified' };
    try {
      if (!restoreStorage()) throw Error('storage restore verification failed');
      if (!restoreGraph()) throw Error('globalData/listener restore verification failed');
      // Rebuild neutral page projection from the original data while networking is
      // still blocked. Fixture cache entries must not remain visible after restore.
      virtualStorage.clear(); realStorage.forEach((value, name) => virtualStorage.set(name, copy(value)));
      let neutralViewRefreshed = false;
      if (!options.rollback && typeof pages[0].onShow === 'function') { pages[0].onShow(); neutralViewRefreshed = true; }
      if (!restoreStorage() || !restoreGraph()) throw Error('post-neutral state restore verification failed');
      for (const slot of [...state.slots].reverse()) {
        const current = slot.owner[slot.name];
        if (current !== slot.value) {
          if (slot.existed || slot.value !== undefined) slot.owner[slot.name] = slot.value;
          else if (!Reflect.deleteProperty(slot.owner, slot.name)) throw Error('SDK slot removal failed');
        }
        if (typeof slot.value === 'function' && (typeof slot.owner[slot.name] !== 'function' || slot.owner[slot.name].name !== slot.value.name)) throw Error(`SDK restore verification failed: ${slot.name}`);
      }
      const result = { ...summary(), ok: true, storageRestored: true, globalDataRestored: true, sdkRestored: true, neutralViewRefreshed, retained: false };
      state.active = false;
      realStorage.clear(); virtualStorage.clear(); graph.length = 0; seen.clear(); state.slots.length = 0;
      delete app[key]; return result;
    } catch (error) {
      // A partial restore must not expose production networking to a retained fixture.
      for (const slot of state.slots) { try { slot.owner[slot.name] = slot.replacement; } catch (_) { /* report retained below */ } }
      return { ...summary(), ok: false, retained: true, reason: String(error.message || error) };
    }
  }
  state.dispatch = async (action, data) => {
    if (action === 'status') return summary();
    if (action === 'probe') return probe();
    if (action === 'quiesce') return quiesce();
    if (action === 'finish') return finish(data);
    if (action === 'document') return own(state.documents, data.id) ? { ok: true, document: copy(state.documents[data.id]) } : { ok: false };
    if (action === 'arm') {
      if (state.closing || !state.active) return { ok: false, reason: 'closed' };
      const valid = data.kind === 'observe'
        || (data.kind === 'save' && (payload.settingsIds || []).includes(data.tournamentId) && ['balanced', 'rest', 'coverage'].includes(data.schedulerProfile))
        || (data.kind === 'join' && data.tournamentId === payload.joinId && state.documents[data.tournamentId]
          && data.expectedVersion === (Number(state.documents[data.tournamentId].version) || 1)
          && state.documents[data.tournamentId].players.length < Number(state.documents[data.tournamentId].playerLimit))
        || (data.kind === 'claim' && data.tournamentId === payload.claimId && (state.documents[data.tournamentId].players || []).some(player => player.id === data.claimGuestId && player.type === 'guest') && data.expectedVersion === (Number(state.documents[data.tournamentId].version) || 1));
      if (!valid) return { ok: false, reason: 'invalid-phase' };
      state.phase = copy(data); state.consumed = false; return { ok: true };
    }
    return { ok: false, reason: 'unknown-command' };
  };
  app[key] = state;
  try {
    patch(wx.cloud, 'callFunction', nativeFixtureCloud); patch(wx.cloud, 'database', nativeFixtureDatabase);
    const cloudNames = new Set([...Object.getOwnPropertyNames(wx.cloud), ...Object.keys(wx.cloud),
      'callContainer', 'connectContainer', 'uploadFile', 'downloadFile', 'deleteFile', 'getTempFileURL', 'getOpenData', 'Cloud', 'CDN', 'init']);
    for (const name of cloudNames) if (!['callFunction', 'database'].includes(name) && typeof wx.cloud[name] === 'function') patch(wx.cloud, name, nativeFixtureNetwork);
    for (const name of ['request', 'uploadFile', 'downloadFile', 'connectSocket', 'sendSocketMessage', 'createUDPSocket', 'createTCPSocket', 'startLocalServiceDiscovery', 'login', 'reportEvent', 'reportAnalytics', 'getRealtimeLogManager', 'getLogManager']) {
      if (typeof wx[name] === 'function') patch(wx, name, nativeFixtureNetwork);
    }
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket']) if (typeof globalThis[name] === 'function') patch(globalThis, name, function nativeFixtureGlobalNetwork() { throw isolatedError(); });
    for (const name of [...new Set([...Object.keys(wx), ...Object.getOwnPropertyNames(wx)])].filter(name => /^(?:on|off)[A-Z]/.test(name) && typeof wx[name] === 'function')) {
      patch(wx, name, function nativeFixtureListener(fn) {
        const event = name.replace(/^(?:on|off)/, '');
        if (!state.listeners.has(event)) state.listeners.set(event, new Set());
        const set = state.listeners.get(event);
        if (name.startsWith('off')) { if (typeof fn === 'function') set.delete(fn); else set.clear(); }
        else if (typeof fn === 'function') set.add(fn);
      });
    }
    for (const [name, fn] of Object.entries({ getStorageSync: nativeFixtureGet, setStorageSync: nativeFixtureSet, removeStorageSync: nativeFixtureRemove, clearStorageSync: nativeFixtureClear, getStorageInfoSync: nativeFixtureInfo })) patch(wx, name, fn);
    for (const name of ['getStorage', 'setStorage', 'removeStorage', 'clearStorage', 'getStorageInfo']) if (typeof wx[name] === 'function') {
      patch(wx, name, function nativeFixtureAsyncStorage(options = {}) {
        let response = { errMsg: `${name}:ok` };
        if (name === 'getStorage') response.data = nativeFixtureGet(options.key);
        if (name === 'setStorage') nativeFixtureSet(options.key, options.data);
        if (name === 'removeStorage') nativeFixtureRemove(options.key);
        if (name === 'clearStorage') nativeFixtureClear();
        if (name === 'getStorageInfo') response = { ...response, ...nativeFixtureInfo() };
        callback(options, response); return Promise.resolve(response);
      });
    }
    for (const name of ['showModal', 'showActionSheet']) if (typeof wx[name] === 'function') patch(wx, name, wrapNative(name));
    const profile = { ...copy(payload.profile), avatarUrl: payload.profile.avatar };
    for (const [name, value] of Object.entries({ openid: payload.account, openid_cached_at: Date.now(), userProfile: profile,
      profile_completed: true, profile_updated_at: Date.now() })) virtualStorage.set(name, value);
    app.globalData.openid = payload.account;
    const evidence = await probe(); if (!evidence.ok) throw Error('native isolation probe failed');
    return { ...summary(), verified: true, storageSnapshotCount: realStorage.size, probe: evidence };
  } catch (error) {
    const rollback = await finish({ rollback: true });
    return { ok: false, reason: String(error.message || error), rollback, retained: !rollback.ok };
  }
}

module.exports = { nativeIsolationRuntime };
