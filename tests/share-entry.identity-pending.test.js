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

function buildDraftTournament(players = []) {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'draft',
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players,
    rankings: [],
    rounds: []
  };
}

test('share-entry keeps draft CTA in identity-pending state until viewer identity resolves', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalLogin = auth.login;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;

  let resolveLogin;

  global.wx = {};
  global.getApp = () => ({
    globalData: { openid: '' }
  });
  auth.login = () => new Promise((resolve) => {
    resolveLogin = resolve;
  });
  tournamentSync.fetchTournament = async () => ({
    ok: true,
    source: 'remote',
    doc: buildDraftTournament([{ id: 'u_admin', name: '组织者' }])
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
    assert.equal(ctx.data.preview.primaryAction.text, '识别中...');

    resolveLogin('u_joined');
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    auth.login = originalLogin;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry resolves to enter action once joined viewer identity is ready', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalLogin = auth.login;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;

  let resolveLogin;

  global.wx = {};
  global.getApp = () => ({
    globalData: { openid: '' }
  });
  auth.login = () => new Promise((resolve) => {
    resolveLogin = resolve;
  });
  tournamentSync.fetchTournament = async () => ({
    ok: true,
    source: 'remote',
    doc: buildDraftTournament([
      { id: 'u_admin', name: '组织者' },
      { id: 'u_joined', name: '已加入球友' }
    ])
  });
  tournamentSync.startWatch = () => {};

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    ctx.onLoad({ tournamentId: 't_1' });
    await Promise.resolve();
    await Promise.resolve();

    resolveLogin('u_joined');
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(ctx.data.identityPending, false);
    assert.equal(ctx.data.preview.primaryAction.text, '进入比赛');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    auth.login = originalLogin;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry falls back to join action if identity lookup fails', async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalLogin = auth.login;
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;

  global.wx = {};
  global.getApp = () => ({
    globalData: { openid: '' }
  });
  auth.login = async () => {
    throw new Error('login failed');
  };
  tournamentSync.fetchTournament = async () => ({
    ok: true,
    source: 'remote',
    doc: buildDraftTournament([{ id: 'u_admin', name: '组织者' }])
  });
  tournamentSync.startWatch = () => {};

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    ctx.onLoad({ tournamentId: 't_1' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(ctx.data.identityPending, false);
    assert.equal(ctx.data.preview.primaryAction.text, '加入比赛');
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    auth.login = originalLogin;
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[shareEntryPagePath];
  }
});
