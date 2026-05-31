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
      action: 'getOrCreate',
      tournamentId: 't_1',
      versionType: 'trial'
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
    assert.equal(ctx.data.dynamicSharePreparing, false);
    assert.equal(ctx.data.dynamicShareReady, true);
    assert.equal(ctx.data.dynamicShareError, '');
    assert.equal(ctx.data.dynamicShareUnavailableReason, '');

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
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
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
    await ctx._dynamicShareInflightPromise;

    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
    assert.equal(share.path, '/pages/share-entry/index?tournamentId=t_1');
    assert.equal(Object.prototype.hasOwnProperty.call(share, 'promise'), false);
    assert.equal(updateCalls.length, 2);
    assert.equal(updateCalls.every((call) => call.isUpdatableMessage === false), true);
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
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
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
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
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
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
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

test('lobby dynamic share uses manageActivityId getOrCreate without wx.createActivityId', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const showCalls = [];
  const cloudCalls = [];
  global.wx = {
    showShareMenu(options) {
      showCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'trial' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    return { ok: true, code: 'SHARE_ACTIVITY_READY', activityId: 'act_server', state: 'ready' };
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

    assert.equal(cloudCalls.length, 1);
    assert.equal(cloudCalls[0].name, 'manageActivityId');
    assert.deepEqual(cloudCalls[0].data, {
      action: 'getOrCreate',
      tournamentId: 't_1',
      versionType: 'trial'
    });

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
    assert.equal(updateCalls[0].activityId, 'act_server');
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share accepts winner activityId returned by manageActivityId', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'release' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    return { ok: true, code: 'SHARE_ACTIVITY_READY', activityId: 'act_winner', state: 'ready' };
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
    assert.equal(cloudCalls.length, 1);
    assert.equal(cloudCalls[0].data.action, 'getOrCreate');
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share reads activityId from server data fallback', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalGetRuntimeEnv = cloudCore.getRuntimeEnv;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.getRuntimeEnv = () => ({ envVersion: 'release' });
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    return { ok: true, code: 'SHARE_ACTIVITY_READY', data: { activityId: 'act_data_1' } };
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
    assert.equal(updateCalls[0].activityId, 'act_data_1');
    assert.equal(cloudCalls.length, 1);
    assert.equal(cloudCalls[0].name, 'manageActivityId');
    assert.deepEqual(cloudCalls[0].data, {
      action: 'getOrCreate',
      tournamentId: 't_1',
      versionType: 'release'
    });
  } finally {
    cloudCore.call = originalCall;
    cloudCore.getRuntimeEnv = originalGetRuntimeEnv;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share getOrCreate ineligible degrades to normal share', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async (name, data) => {
    if (data.action === 'getOrCreate') {
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

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);

    const share = ctx.onShareAppMessage();
    await ctx._dynamicShareInflightPromise;
    assert.equal(share.title, '周末比赛，加入羽毛球比赛');
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby dynamic share getOrCreate failure clears inflight and degrades to ordinary share', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  const cloudCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async (name, data) => {
    cloudCalls.push({ name, data });
    return { ok: false, code: 'PERMISSION_DENIED', state: 'forbidden', message: '无权限准备动态分享' };
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
    assert.equal(cloudCalls.length, 1);
    assert.equal(cloudCalls[0].data.action, 'getOrCreate');
    assert.equal(ctx._dynamicShareInflightPromise, null);
    assert.equal(ctx._dynamicShareInflightBaseKey, '');
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);
    assert.equal(ctx.data.dynamicSharePreparing, false);
    assert.equal(ctx.data.dynamicShareReady, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'permission_denied');
    assert.match(ctx.data.dynamicShareError, /无权限准备动态分享/);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records explicit local reasons when dynamic share is not eligible', () => {
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  const definition = loadLobbyPageDefinition();

  try {
    const runningCtx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'running',
      playerLimit: 8,
      players: []
    });
    const noLimitCtx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      playerLimit: 0,
      players: []
    });

    runningCtx.ensureDynamicShareReady(runningCtx.data.tournament);
    noLimitCtx.ensureDynamicShareReady(noLimitCtx.data.tournament);

    assert.equal(runningCtx.data.dynamicShareReady, false);
    assert.equal(runningCtx.data.dynamicShareUnavailableReason, 'not_draft');
    assert.equal(noLimitCtx.data.dynamicShareReady, false);
    assert.equal(noLimitCtx.data.dynamicShareUnavailableReason, 'player_limit_required');
    assert.equal(updateCalls.length, 2);
    assert.equal(updateCalls.every((call) => call.isUpdatableMessage === false), true);
  } finally {
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records API unsupported when updateShareMenu is unavailable', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => ({ ok: true, activityId: 'act_ready' });
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(result, false);
    assert.equal(ctx.data.dynamicShareReady, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'api_unsupported');
    assert.match(ctx.data.dynamicShareError, /wx\.updateShareMenu unavailable/);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records create_activity_id_failed when server activity creation fails', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => {
    throw new Error('updatableMessage.createActivityId unavailable');
  };
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(result, false);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'create_activity_id_failed');
    assert.match(ctx.data.dynamicShareError, /createActivityId unavailable/);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records show_share_menu_failed when showShareMenu rejects', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.fail === 'function') options.fail({ errCode: 500, errMsg: 'show rejected' });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => ({ ok: true, activityId: 'act_ready' });
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(result, false);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);
    assert.equal(ctx.data.dynamicShareReady, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'show_share_menu_failed');
    assert.match(ctx.data.dynamicShareError, /wx\.showShareMenu failed/);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records update_share_menu_failed when updateShareMenu rejects', async () => {
  const cloudCore = require(cloudCorePath);
  const originalCall = cloudCore.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (options.isUpdatableMessage === false) {
        if (typeof options.success === 'function') options.success({ ok: true });
        return;
      }
      if (typeof options.fail === 'function') options.fail({ errCode: 500, errMsg: 'update rejected' });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => ({ ok: true, activityId: 'act_ready' });
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(result, false);
    assert.equal(updateCalls.length, 2);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
    assert.equal(updateCalls[1].isUpdatableMessage, false);
    assert.equal(ctx.data.dynamicShareReady, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'update_share_menu_failed');
    assert.match(ctx.data.dynamicShareError, /update rejected/);
  } finally {
    cloudCore.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});

test('lobby records template_info_invalid before calling updateShareMenu', async () => {
  const cloudCore = require(cloudCorePath);
  const shareActivity = require('../miniprogram/core/shareActivity');
  const originalCall = cloudCore.call;
  const originalBuildShareMenuTemplateInfo = shareActivity.buildShareMenuTemplateInfo;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  const updateCalls = [];
  global.wx = {
    showShareMenu(options) {
      if (typeof options.success === 'function') options.success({ ok: true });
    },
    updateShareMenu(options) {
      updateCalls.push(options);
      if (typeof options.success === 'function') options.success({ ok: true });
    }
  };
  global.getApp = () => ({ globalData: { openid: 'u_admin' } });
  storage.addRecentTournamentId = () => {};
  cloudCore.call = async () => ({ ok: true, activityId: 'act_ready' });
  shareActivity.buildShareMenuTemplateInfo = () => ({
    templateId: '',
    parameterList: [{ name: 'member_count', value: '1' }]
  });
  const definition = loadLobbyPageDefinition();

  try {
    const ctx = createLobbyPageContext(definition, {
      _id: 't_1',
      status: 'draft',
      version: 1,
      playerLimit: 8,
      players: [{ id: 'u_admin' }]
    });
    ctx.setTournament(ctx.data.tournament);
    const result = await ctx._dynamicShareInflightPromise;

    assert.equal(result, false);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, false);
    assert.equal(ctx.data.dynamicShareUnavailableReason, 'template_info_invalid');
    assert.match(ctx.data.dynamicShareError, /templateInfo invalid/);
  } finally {
    cloudCore.call = originalCall;
    shareActivity.buildShareMenuTemplateInfo = originalBuildShareMenuTemplateInfo;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
    global.getApp = originalGetApp;
    global.wx = originalWx;
    delete require.cache[lobbyPagePath];
  }
});
