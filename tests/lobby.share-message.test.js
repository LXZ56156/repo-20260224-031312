const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');
const cloudCorePath = require.resolve('../miniprogram/core/cloud.js');

function loadLobbyPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[lobbyPagePath];
  require(lobbyPagePath);
  global.Page = originalPage;
  return definition;
}

function createLobbyPageContext(definition, tournament) {
  const ctx = {
    data: {
      ...JSON.parse(JSON.stringify(definition.data)),
      tournamentId: 't_1',
      tournament
    },
    openid: 'u_admin',
    avatarCache: {},
    _pendingIntentAction: '',
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    resolveDisplayPlayersAvatars() {}
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('lobby page uses a unified transfer contract across lifecycle states', () => {
  const definition = loadLobbyPageDefinition();
  try {
    const draftCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'draft' });
    const runningCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'running' });
    const finishedCtx = createLobbyPageContext(definition, { _id: 't_1', name: '周末比赛', status: 'finished' });

    const draftShare = draftCtx.onShareAppMessage();
    const runningShare = runningCtx.onShareAppMessage();
    const finishedShare = finishedCtx.onShareAppMessage();

    assert.equal(draftShare.title, '周末比赛，加入羽毛球比赛');
    assert.equal(draftShare.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(runningShare.title, '周末比赛 赛程对阵已生成');
    assert.equal(runningShare.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(finishedShare.title, '周末比赛 赛事排名已出炉');
    assert.equal(finishedShare.path, '/pages/share-entry/index?tournamentId=t_1');
  } finally {
    delete require.cache[lobbyPagePath];
  }
});

test('lobby setTournament preheats draft fixed-limit updatable share before onShareAppMessage', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const showCalls = [];
  const shareEvents = [];
  const cloudCalls = [];
  global.wx = {
    showShareMenu(options) {
      showCalls.push(options);
      shareEvents.push('show');
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      shareEvents.push('update');
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'trial' });
  cloudCore.call = async (name, data, options) => {
    cloudCalls.push({ name, data, options });
    return {
      ok: true,
      activityId: 'act_1',
      data: { activityId: 'act_1' }
    };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 3,
      mode: 'multi_rotate',
      playerLimit: 8,
      players: [{ id: 'u_admin' }, { id: 'u_2' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(cloudCalls.length, 1);
    assert.equal(cloudCalls[0].name, 'manageActivityId');
    assert.deepEqual(cloudCalls[0].data, {
      action: 'checkOnly',
      tournamentId: 't_1'
    });
    assert.deepEqual(cloudCalls[0].options, { retry: true });
    assert.equal(showCalls.length, 1);
    assert.equal(showCalls[0].withShareTicket, true);
    assert.equal(shareEvents[0], 'show');
    assert.equal(shareEvents[1], 'update');
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
    assert.equal(updateCalls[0].withShareTicket, true);
    assert.equal(updateCalls[0].activityId, 'act_1');
    assert.equal(updateCalls[0].templateInfo.templateId, '21B034D08C5615B9889CE362BB957B1EE69A584B');
    assert.deepEqual(updateCalls[0].templateInfo.parameterList, [
      { name: 'member_count', value: '2' },
      { name: 'room_limit', value: '8' }
    ]);

    const share = ctx.onShareAppMessage();

    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(Object.prototype.hasOwnProperty.call(share, 'promise'), false);
    assert.equal(cloudCalls.length, 1);
    assert.equal(updateCalls.length, 1);
    assert.equal(showCalls.length, 1);
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share preheat failure degrades to ordinary share without promise', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => {
    throw new Error('network failed');
  };
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: []
    });
    ctx.setTournament(ctx.data.tournament);
    await ctx._dynamicShareInflightPromise;

    const share = ctx.onShareAppMessage();

    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(Object.prototype.hasOwnProperty.call(share, 'promise'), false);
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0].isUpdatableMessage, false);
    assert.equal(Object.prototype.hasOwnProperty.call(updateCalls[0], 'withShareTicket'), false);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby keeps preheated dynamic share through onHide and clears it on unload', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => ({
    ok: true,
    activityId: 'act_ready',
    data: { activityId: 'act_ready' }
  });
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    await ctx._dynamicShareInflightPromise;
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, true);

    ctx.onHide();
    assert.equal(updateCalls.length, 1);

    ctx.onUnload();
    assert.equal(updateCalls.length, 2);
    assert.equal(updateCalls[1].isUpdatableMessage, false);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby avoids repeated dynamic share preheat for unchanged tournament snapshot', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  let cloudCallCount = 0;
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => {
    cloudCallCount += 1;
    return {
      ok: true,
      activityId: 'act_deduped',
      data: { activityId: 'act_deduped' }
    };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 7,
      playerLimit: 8,
      players: [{ id: 'u_admin' }, { id: 'u_2' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;
    ctx.setTournament(JSON.parse(JSON.stringify(tournament)));

    assert.equal(cloudCallCount, 1);
    assert.equal(updateCalls.length, 1);
    assert.equal(ctx._dynamicShareReadyKey, 't_1|7|draft|2|8|act_deduped');
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby clears stale dynamic share menu before preheating changed tournament snapshot', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  let cloudCallCount = 0;
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => {
    cloudCallCount += 1;
    return {
      ok: true,
      activityId: 'act_same',
      data: { activityId: 'act_same' }
    };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const first = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 7,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    };
    const second = {
      ...first,
      version: 8,
      players: [{ id: 'u_admin' }, { id: 'u_2' }]
    };
    const ctx = createLobbyPageContext(definition, first);
    ctx.setTournament(first);
    await ctx._dynamicShareInflightPromise;
    ctx.setTournament(second);
    await ctx._dynamicShareInflightPromise;

    assert.equal(cloudCallCount, 2);
    assert.equal(updateCalls.length, 3);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
    assert.equal(updateCalls[1].isUpdatableMessage, false);
    assert.equal(updateCalls[2].isUpdatableMessage, true);
    assert.deepEqual(updateCalls[2].templateInfo.parameterList, [
      { name: 'member_count', value: '2' },
      { name: 'room_limit', value: '8' }
    ]);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share checkOnly not_ready -> wx.createActivityId -> store -> updateShareMenu', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const showCalls = [];
  const createCalls = [];
  const cloudCalls = [];
  let createCallCount = 0;
  global.wx = {
    showShareMenu(options) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId(options) {
      createCallCount += 1;
      createCalls.push(options);
      if (typeof options.success === 'function') {
        options.success({ activityId: 'act_client', expirationTime: Date.now() + 86400000 });
      }
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'trial' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    if (data.action === 'checkOnly') {
      return { ok: false, code: 'SHARE_ACTIVITY_NOT_READY', state: 'not_ready' };
    }
    if (data.action === 'store') {
      return { ok: true, code: 'SHARE_ACTIVITY_STORED', activityId: 'act_client', state: 'ready' };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 3,
      mode: 'multi_rotate',
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(cloudCalls.length, 2);
    assert.equal(cloudCalls[0].name, 'manageActivityId');
    assert.deepEqual(cloudCalls[0].data, { action: 'checkOnly', tournamentId: 't_1' });
    assert.equal(cloudCalls[1].name, 'manageActivityId');
    assert.equal(cloudCalls[1].data.action, 'store');
    assert.equal(cloudCalls[1].data.activityId, 'act_client');
    assert.equal(cloudCalls[1].data.versionType, 'trial');

    assert.equal(createCallCount, 1);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
    assert.equal(updateCalls[0].activityId, 'act_client');
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share store concurrent winner overwrites local activityId', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId(options) {
      if (typeof options.success === 'function') {
        options.success({ activityId: 'act_late_1', expirationTime: Date.now() + 86400000 });
      }
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'release' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    if (data.action === 'checkOnly') {
      return { ok: false, code: 'SHARE_ACTIVITY_NOT_READY', state: 'not_ready' };
    }
    if (data.action === 'store') {
      return { ok: true, code: 'SHARE_ACTIVITY_READY', activityId: 'act_winner', state: 'ready' };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 3,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].activityId, 'act_winner');
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share createActivityId handles snake_case fields', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  let createResult = null;
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId(options) {
      if (typeof options.success === 'function') {
        createResult = {
          activity_id: 'act_snake_1',
          expiration_time: 1700000000
        };
        options.success(createResult);
      }
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'release' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    if (data.action === 'checkOnly') {
      return { ok: false, code: 'SHARE_ACTIVITY_NOT_READY', state: 'not_ready' };
    }
    if (data.action === 'store') {
      return { ok: true, code: 'SHARE_ACTIVITY_STORED', activityId: data.activityId };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 3,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].activityId, 'act_snake_1');
    assert.equal(cloudCalls[1].name, 'manageActivityId');
    assert.equal(cloudCalls[1].data.action, 'store');
    assert.equal(cloudCalls[1].data.activityId, 'act_snake_1');
    assert.equal(String(cloudCalls[1].data.expirationTime), '1700000000');
    assert.ok(createResult !== null);
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share createActivityId falls back to 24h when expiration is missing', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  const beforeCreate = Date.now();
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId(options) {
      if (typeof options.success === 'function') {
        options.success({ activityId: 'act_noexp_1' });
      }
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'release' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    if (data.action === 'checkOnly') {
      return { ok: false, code: 'SHARE_ACTIVITY_NOT_READY', state: 'not_ready' };
    }
    if (data.action === 'store') {
      return { ok: true, code: 'SHARE_ACTIVITY_STORED', activityId: data.activityId };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const tournament = {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 3,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    };
    const ctx = createLobbyPageContext(definition, tournament);
    ctx.setTournament(tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].activityId, 'act_noexp_1');
    assert.equal(cloudCalls[1].data.activityId, 'act_noexp_1');
    const sentExp = Number(cloudCalls[1].data.expirationTime);
    const TTL_24H = 24 * 60 * 60 * 1000;
    assert.ok(sentExp >= beforeCreate + TTL_24H);
    assert.ok(sentExp <= Date.now() + TTL_24H + 5000);
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share checkOnly ineligible degrades to normal share without creating activityId', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  let createCalled = false;
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId() {
      createCalled = true;
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async (name, data) => {
    if (data.action === 'checkOnly') {
      return {
        ok: false,
        code: 'SHARE_ACTIVITY_DRAFT_ONLY',
        state: 'forbidden',
        message: '仅未开赛赛事可使用动态分享'
      };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: []
    });
    ctx.setTournament(ctx.data.tournament);
    await ctx._dynamicShareInflightPromise;

    assert.equal(createCalled, false);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);

    const share = ctx.onShareAppMessage();
    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share createActivityId timeout clears inflight and degrades to ordinary share', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const updateCalls = [];
  let createCallCount = 0;
  global.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, Math.min(Number(ms) || 0, 1), ...args);
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    createActivityId() {
      createCallCount += 1;
      return undefined;
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async (name, data) => {
    if (data.action === 'checkOnly') {
      return { ok: false, code: 'SHARE_ACTIVITY_NOT_READY', state: 'not_ready' };
    }
    return { ok: false };
  };
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      name: '周末比赛',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const share = ctx.onShareAppMessage();
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(Object.prototype.hasOwnProperty.call(share, 'promise'), false);
    assert.equal(result, false);
    assert.equal(createCallCount, 1);
    assert.equal(ctx._dynamicShareInflightPromise, null);
    assert.equal(ctx._dynamicShareInflightBaseKey, '');
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    delete require.cache[lobbyPagePath];
  }
});
