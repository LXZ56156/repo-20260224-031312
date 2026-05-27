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
  const cloudCalls = [];
  global.wx = {
    updateShareMenu(options) {
      updateCalls.push(options);
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
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].isUpdatableMessage, true);
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
