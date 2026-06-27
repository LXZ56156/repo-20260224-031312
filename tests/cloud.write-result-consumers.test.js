const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadPageDefinition,
  createPageContext,
  createContext
} = require('./timeout-reentry.helpers');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const profileCore = require('../miniprogram/core/profile');
const lobbyDraftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

const launchPagePath = require.resolve('../miniprogram/pages/launch/index.js');
const feedbackPagePath = require.resolve('../miniprogram/pages/feedback/index.js');

test('launch create treats structured ok:false result as failure instead of success redirect', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  const originalEnsureProfile = profileCore.ensureProfileForAction;
  const originalBuildTournamentUrl = nav.buildTournamentUrl;
  const toastCalls = [];
  const redirectCalls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(options = {}) {
      toastCalls.push(options);
    },
    redirectTo(options = {}) {
      redirectCalls.push(options);
    }
  };

  try {
    const definition = loadPageDefinition(launchPagePath);
    const ctx = createPageContext(definition);

    profileCore.ensureProfileForAction = async () => ({
      ok: true,
      profile: { nickName: '发起人', avatar: 'cloud://avatar/create', gender: 'male' }
    });
    nav.buildTournamentUrl = () => {
      throw new Error('should not navigate on structured failure');
    };
    cloud.call = async () => ({
      ok: false,
      code: 'SETTINGS_INVALID',
      message: '赛事名称不能为空',
      state: 'invalid',
      traceId: 'trace-create-consumer',
      data: {}
    });

    await ctx.createSelectedTournament({ mode: 'multi_rotate', presetKey: 'custom', cardKey: 'multi' });

    assert.equal(ctx.data.createBusy, false);
    assert.equal(ctx.data.canRetryAction, true);
    assert.equal(redirectCalls.length, 0);
    assert.equal(toastCalls.length, 1);
    assert.equal(toastCalls[0].title, '赛事名称不能为空');
  } finally {
    actionGuard.clear('launch:createTournament');
    global.wx = originalWx;
    cloud.call = originalCall;
    profileCore.ensureProfileForAction = originalEnsureProfile;
    nav.buildTournamentUrl = originalBuildTournamentUrl;
    delete require.cache[launchPagePath];
  }
});

test('feedback onSubmit treats structured ok:false result as failure instead of success modal', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  const toastCalls = [];
  const modalCalls = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast(options = {}) {
      toastCalls.push(options);
    },
    showModal(options = {}) {
      modalCalls.push(options);
    }
  };

  try {
    const definition = loadPageDefinition(feedbackPagePath);
    const ctx = createPageContext(definition, {
      blocked: false,
      content: '这是一条足够长的反馈内容，用于验证结构化失败消费。',
      contentLength: 24,
      contact: 'wx:test',
      submitting: false
    });

    cloud.call = async () => ({
      ok: false,
      code: 'FEEDBACK_RATE_LIMITED',
      message: '提交太频繁，请稍后再试',
      state: 'invalid',
      traceId: 'trace-feedback-consumer',
      data: {}
    });

    await ctx.onSubmit();

    assert.equal(ctx.data.submitting, false);
    assert.equal(modalCalls.length, 0);
    assert.equal(toastCalls.length, 1);
    assert.equal(toastCalls[0].title, '提交太频繁，请稍后再试');
    assert.equal(ctx.data.content.length > 0, true);
  } finally {
    actionGuard.clear('feedback:submit');
    global.wx = originalWx;
    cloud.call = originalCall;
    delete require.cache[feedbackPagePath];
  }
});

test('lobby quickImportPlayers routes structured ok:false result into handleWriteError', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const handleErrors = [];
  const lastFailed = [];
  let fetchCalled = false;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    pageScrollTo() {}
  };

  try {
    cloud.call = async () => ({
      ok: false,
      code: 'TOURNAMENT_NOT_FOUND',
      message: '赛事不存在',
      state: 'not_found',
      traceId: 'trace-import-consumer',
      data: {}
    });
    nav.markRefreshFlag = () => {
      throw new Error('should not mark refresh on structured failure');
    };

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_import',
      isAdmin: true,
      tournament: { status: 'draft' },
      quickImportText: '球友A 球友B'
    });
    ctx.fetchTournament = async () => {
      fetchCalled = true;
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (text, fn, options) => {
      lastFailed.push({ text, fn: typeof fn, options });
    };
    ctx.handleWriteError = (err, fallbackMessage) => {
      handleErrors.push({ err, fallbackMessage });
    };

    await ctx.quickImportPlayers();

    assert.equal(fetchCalled, false);
    assert.equal(lastFailed.length, 1);
    assert.equal(lastFailed[0].text, '快速导入参赛者');
    assert.equal(handleErrors.length, 1);
    assert.equal(handleErrors[0].fallbackMessage, '导入失败');
    assert.equal(handleErrors[0].err.code, 'TOURNAMENT_NOT_FOUND');
    assert.equal(handleErrors[0].err.state, 'not_found');
  } finally {
    actionGuard.clear('lobby:addPlayers:t_import');
    global.wx = originalWx;
    cloud.call = originalCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});

test('lobby removePlayer routes structured ok:false result into handleWriteError', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const handleErrors = [];
  const lastFailed = [];
  let fetchCalled = false;
  const pendingModalTasks = [];

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    showModal(options = {}) {
      const task = options && typeof options.success === 'function'
        ? options.success({ confirm: true, cancel: false })
        : null;
      if (task && typeof task.then === 'function') pendingModalTasks.push(task);
    }
  };

  try {
    cloud.call = async () => ({
      ok: false,
      code: 'TOURNAMENT_NOT_FOUND',
      message: '赛事不存在',
      state: 'not_found',
      traceId: 'trace-remove-consumer',
      data: {}
    });
    nav.markRefreshFlag = () => {
      throw new Error('should not mark refresh on structured failure');
    };

    const ctx = createContext(lobbyDraftActions, {
      tournamentId: 't_remove',
      isAdmin: true,
      tournament: {
        status: 'draft',
        players: [
          { id: 'u_admin', name: '管理员' },
          { id: 'p_remove', name: '待移除' }
        ]
      },
      displayPlayers: [
        { id: 'u_admin', name: '管理员' },
        { id: 'p_remove', name: '待移除' }
      ]
    });
    ctx.openid = 'u_admin';
    ctx.fetchTournament = async () => {
      fetchCalled = true;
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = (text, fn, options) => {
      lastFailed.push({ text, fn: typeof fn, options });
    };
    ctx.handleWriteError = (err, fallbackMessage) => {
      handleErrors.push({ err, fallbackMessage });
    };

    ctx.onPlayerLongPress({ currentTarget: { dataset: { player: 'p_remove', name: '待移除' } } });
    await Promise.all(pendingModalTasks);

    assert.equal(fetchCalled, false);
    assert.equal(lastFailed.length, 1);
    assert.equal(lastFailed[0].text, '移除参赛成员');
    assert.equal(handleErrors.length, 1);
    assert.equal(handleErrors[0].fallbackMessage, '移除失败');
    assert.equal(handleErrors[0].err.code, 'TOURNAMENT_NOT_FOUND');
    assert.equal(handleErrors[0].err.state, 'not_found');
  } finally {
    actionGuard.clear('lobby:removePlayer:t_remove:p_remove');
    global.wx = originalWx;
    cloud.call = originalCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});
