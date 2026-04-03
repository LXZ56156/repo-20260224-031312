const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const storage = require('../miniprogram/core/storage');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

function createContext(data = {}) {
  const ctx = {
    data: { ...(data || {}) },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(lobbyDraftActions || {}).forEach((key) => {
    if (typeof lobbyDraftActions[key] === 'function') ctx[key] = lobbyDraftActions[key];
  });
  return ctx;
}

function buildStartedTournament(id = 't_start') {
  return {
    _id: id,
    status: 'running',
    rounds: [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'pending' }] }]
  };
}

function installImmediateTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (fn) => {
    if (typeof fn === 'function') fn();
    return 1;
  };
  global.clearTimeout = () => {};
  return () => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  };
}

function installWxStub() {
  const originalWx = global.wx;
  const toasts = [];
  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(payload = {}) {
      toasts.push(payload);
    }
  };
  return {
    toasts,
    restore() {
      global.wx = originalWx;
    }
  };
}

function createStartContext() {
  const ctx = createContext({
    tournamentId: 't_start',
    tournament: { _id: 't_start', status: 'draft', rounds: [] },
    isAdmin: true,
    checkPlayersOk: true,
    checkSettingsOk: true
  });
  ctx._latestTournament = null;
  ctx._setLastFailedCalls = 0;
  ctx._writeErrorCalls = 0;
  ctx._clearLastFailedCalls = 0;
  ctx._appliedTournament = null;
  ctx.fetchTournament = async () => {};
  ctx.setTournament = (tournament) => {
    ctx._appliedTournament = tournament;
    ctx.setData({ tournament });
  };
  ctx.setLastFailedAction = () => {
    ctx._setLastFailedCalls += 1;
  };
  ctx.handleWriteError = () => {
    ctx._writeErrorCalls += 1;
  };
  ctx.clearLastFailedAction = () => {
    ctx._clearLastFailedCalls += 1;
  };
  return ctx;
}

test('handleStart treats timeout as success when latest tournament snapshot is already running', async () => {
  const restoreTimers = installImmediateTimers();
  const wxBox = installWxStub();
  const originalCloudCall = cloud.call;
  const originalParseCloudError = cloud.parseCloudError;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const originalSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;
  let refreshCount = 0;
  let scheduledTournamentId = '';
  let fetchCount = 0;

  try {
    const ctx = createStartContext();
    const startedDoc = buildStartedTournament();
    cloud.call = async () => {
      ctx._latestTournament = startedDoc;
      throw new Error('network timeout');
    };
    cloud.parseCloudError = () => ({ isTimeout: true, isNetwork: false });
    nav.markRefreshFlag = () => {
      refreshCount += 1;
    };
    nav.goSchedule = (tournamentId) => {
      scheduledTournamentId = tournamentId;
    };
    storage.getSchedulerProfile = () => 'rest';
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      return { ok: false, cachedDoc: null };
    };

    await ctx.handleStart();

    assert.equal(fetchCount, 0);
    assert.equal(ctx._clearLastFailedCalls, 1);
    assert.equal(ctx._setLastFailedCalls, 0);
    assert.equal(ctx._writeErrorCalls, 0);
    assert.equal(refreshCount, 1);
    assert.equal(scheduledTournamentId, 't_start');
    assert.equal(ctx.data.tournament.status, 'running');
    assert.equal(wxBox.toasts.some((item) => item.title === '已开赛'), true);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    restoreTimers();
    wxBox.restore();
    cloud.call = originalCloudCall;
    cloud.parseCloudError = originalParseCloudError;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    storage.getSchedulerProfile = originalSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('handleStart treats timeout as success when first remote refresh confirms running state', async () => {
  const restoreTimers = installImmediateTimers();
  const wxBox = installWxStub();
  const originalCloudCall = cloud.call;
  const originalParseCloudError = cloud.parseCloudError;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const originalSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;
  let fetchCount = 0;

  try {
    const ctx = createStartContext();
    const startedDoc = buildStartedTournament();
    cloud.call = async () => {
      throw new Error('network timeout');
    };
    cloud.parseCloudError = () => ({ isTimeout: true, isNetwork: true });
    nav.markRefreshFlag = () => {};
    nav.goSchedule = () => {};
    storage.getSchedulerProfile = () => 'rest';
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      return { ok: true, doc: startedDoc };
    };

    await ctx.handleStart();

    assert.equal(fetchCount, 1);
    assert.equal(ctx._clearLastFailedCalls, 1);
    assert.equal(ctx._setLastFailedCalls, 0);
    assert.equal(ctx._writeErrorCalls, 0);
    assert.equal(ctx.data.tournament.status, 'running');
    assert.equal(wxBox.toasts.some((item) => item.title === '已开赛'), true);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    restoreTimers();
    wxBox.restore();
    cloud.call = originalCloudCall;
    cloud.parseCloudError = originalParseCloudError;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    storage.getSchedulerProfile = originalSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('handleStart treats timeout as success when second remote refresh confirms running state', async () => {
  const restoreTimers = installImmediateTimers();
  const wxBox = installWxStub();
  const originalCloudCall = cloud.call;
  const originalParseCloudError = cloud.parseCloudError;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const originalSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;
  let fetchCount = 0;

  try {
    const ctx = createStartContext();
    const startedDoc = buildStartedTournament();
    cloud.call = async () => {
      throw new Error('network timeout');
    };
    cloud.parseCloudError = () => ({ isTimeout: true, isNetwork: true });
    nav.markRefreshFlag = () => {};
    nav.goSchedule = () => {};
    storage.getSchedulerProfile = () => 'rest';
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return { ok: true, doc: { _id: 't_start', status: 'draft', rounds: [] } };
      }
      return { ok: true, doc: startedDoc };
    };

    await ctx.handleStart();

    assert.equal(fetchCount, 2);
    assert.equal(ctx._clearLastFailedCalls, 1);
    assert.equal(ctx._setLastFailedCalls, 0);
    assert.equal(ctx._writeErrorCalls, 0);
    assert.equal(ctx.data.tournament.status, 'running');
    assert.equal(wxBox.toasts.some((item) => item.title === '已开赛'), true);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    restoreTimers();
    wxBox.restore();
    cloud.call = originalCloudCall;
    cloud.parseCloudError = originalParseCloudError;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    storage.getSchedulerProfile = originalSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('handleStart keeps failure flow when timeout recovery cannot confirm running state', async () => {
  const restoreTimers = installImmediateTimers();
  const wxBox = installWxStub();
  const originalCloudCall = cloud.call;
  const originalParseCloudError = cloud.parseCloudError;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const originalSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;
  let fetchCount = 0;
  let scheduledTournamentId = '';

  try {
    const ctx = createStartContext();
    cloud.call = async () => {
      throw new Error('network timeout');
    };
    cloud.parseCloudError = () => ({ isTimeout: true, isNetwork: false });
    nav.markRefreshFlag = () => {};
    nav.goSchedule = (tournamentId) => {
      scheduledTournamentId = tournamentId;
    };
    storage.getSchedulerProfile = () => 'rest';
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      return { ok: true, doc: { _id: 't_start', status: 'draft', rounds: [] } };
    };

    await ctx.handleStart();

    assert.equal(fetchCount, 2);
    assert.equal(ctx._clearLastFailedCalls, 0);
    assert.equal(ctx._setLastFailedCalls, 1);
    assert.equal(ctx._writeErrorCalls, 1);
    assert.equal(scheduledTournamentId, '');
    assert.equal(wxBox.toasts.some((item) => item.title === '已开赛'), false);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    restoreTimers();
    wxBox.restore();
    cloud.call = originalCloudCall;
    cloud.parseCloudError = originalParseCloudError;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    storage.getSchedulerProfile = originalSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});

test('handleStart does not enter timeout recovery for non-timeout write failures', async () => {
  const restoreTimers = installImmediateTimers();
  const wxBox = installWxStub();
  const originalCloudCall = cloud.call;
  const originalParseCloudError = cloud.parseCloudError;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const originalGoSchedule = nav.goSchedule;
  const originalSchedulerProfile = storage.getSchedulerProfile;
  const originalFetchTournament = tournamentSync.fetchTournament;
  let fetchCount = 0;

  try {
    const ctx = createStartContext();
    cloud.call = async () => {
      throw new Error('validation failed');
    };
    cloud.parseCloudError = () => ({ isTimeout: false, isNetwork: false });
    nav.markRefreshFlag = () => {};
    nav.goSchedule = () => {};
    storage.getSchedulerProfile = () => 'rest';
    tournamentSync.fetchTournament = async () => {
      fetchCount += 1;
      return { ok: true, doc: buildStartedTournament() };
    };

    await ctx.handleStart();

    assert.equal(fetchCount, 0);
    assert.equal(ctx._clearLastFailedCalls, 0);
    assert.equal(ctx._setLastFailedCalls, 1);
    assert.equal(ctx._writeErrorCalls, 1);
    assert.equal(wxBox.toasts.some((item) => item.title === '已开赛'), false);
  } finally {
    actionGuard.clear('lobby:startTournament:t_start');
    restoreTimers();
    wxBox.restore();
    cloud.call = originalCloudCall;
    cloud.parseCloudError = originalParseCloudError;
    nav.markRefreshFlag = originalMarkRefreshFlag;
    nav.goSchedule = originalGoSchedule;
    storage.getSchedulerProfile = originalSchedulerProfile;
    tournamentSync.fetchTournament = originalFetchTournament;
  }
});
