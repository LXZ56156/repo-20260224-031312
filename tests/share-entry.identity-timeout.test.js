const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../miniprogram/core/auth');
const tournamentSync = require('../miniprogram/core/tournamentSync');

const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
  global.Page = originalPage;
  return definition;
}

function createShareEntryPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  return ctx;
}

function buildDraftTournament() {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players: [{ id: 'u_admin', name: '组织者' }],
    rankings: [],
    rounds: []
  };
}

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

test('share-entry falls back to guest spectating when identity lookup times out', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalLogin = auth.login;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;
  const timers = installFakeTimers();

  global.wx = {};
  global.getApp = () => ({
    globalData: { openid: '' }
  });
  auth.login = () => new Promise(() => {});
  tournamentSync.fetchTournament = async () => ({
    ok: true,
    source: 'remote',
    doc: buildDraftTournament()
  });
  tournamentSync.startWatch = () => {};

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    ctx.onLoad({ tournamentId: 't_1' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(ctx.data.identityPending, true);
    assert.equal(ctx.data.preview.primaryAction.key, 'identity_pending');

    await timers.flushAll();

    assert.equal(ctx.data.identityPending, false);
    assert.equal(ctx.data.identityTimedOut, true);
    assert.equal(ctx.data.preview.primaryAction.key, 'lobby_view');
    assert.equal(ctx.data.preview.secondaryAction.key, 'join');
    assert.match(String(ctx.data.preview.availabilityText || ''), /游客身份/);
  } finally {
    timers.restore();
    global.wx = originalWx;
    global.getApp = originalGetApp;
    auth.login = originalLogin;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[shareEntryPagePath];
  }
});
