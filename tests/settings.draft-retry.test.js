'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const pagePath = require.resolve('../miniprogram/pages/settings/index');

function context(t) {
  const originalPage = global.Page;
  const originalWx = global.wx;
  let definition;
  global.Page = (value) => { definition = value; };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  global.wx = { showLoading() {}, hideLoading() {}, showToast() {} };
  t.after(() => { global.wx = originalWx; delete require.cache[pagePath]; });
  const ctx = { ...definition, data: globalThis.structuredClone(definition.data), openid: 'admin',
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback.call(this);
    }
  };
  ctx.data.tournamentId = 'settings_draft';
  ctx.handleWriteError = () => {};
  return ctx;
}

function tournament(overrides = {}) {
  return { _id: 'settings_draft', name: '原名', status: 'draft', creatorId: 'admin',
    mode: 'multi_rotate', totalMatches: 1, courts: 1,
    players: Array.from({ length: 4 }, (_, i) => ({ id: `u${i}`, name: `球友${i}` })),
    rules: { pointsPerGame: 21 }, ...overrides };
}

test('settings roster refresh preserves edited fields and updates authoritative constraints', (t) => {
  const ctx = context(t);
  const original = tournament();
  ctx.applyTournament(original);
  ctx.onNameInput({ detail: { value: '未保存名称' } });
  ctx.setTotalMatches(2);
  ctx.onPickCourts({ detail: { value: 1 } });
  ctx.onPickPointsPerGame({ detail: { value: 0 } });
  ctx.applyTournament({ ...original, players: [...original.players, { id: 'new', name: '新增' }] });
  assert.equal(ctx.data.name, '未保存名称');
  assert.equal(ctx.data.editM, 2);
  assert.equal(ctx.data.editC, 2);
  assert.equal(ctx.data.pointsPerGame, 11);
  assert.equal(ctx.data.pointsIndex, 0);
  assert.equal(ctx.data.courtIndex, 1);
  assert.equal(ctx.data.playersCount, 5);
  assert.equal(ctx.data.tournament.players.length, 5);
  assert.equal(ctx.data.endConditionTarget, 2);
  ctx.applyTournament({ ...original, creatorId: 'other', players: original.players.slice(0, 3) });
  assert.equal(ctx.data.name, '未保存名称');
  assert.equal(ctx.data.isAdmin, false);
  assert.equal(ctx.data.canConfigureSettings, false);
  assert.equal(ctx.data.playersCount, 3);
});

test('settings synchronization preserves squad end-condition draft and applies status changes', async (t) => {
  const ctx = context(t);
  const original = tournament({ mode: 'squad_doubles' });
  ctx.applyTournament(original);
  ctx.onPickEndConditionType({ detail: { value: 1 } });
  ctx.onPickEndConditionTarget({ detail: { value: 5 } });
  const type = ctx.data.endConditionType;
  ctx.applyTournament({ ...original, updatedAt: '2026-10-03' });
  assert.equal(ctx.data.endConditionType, type);
  assert.equal(ctx.data.endConditionTarget, 6);
  ctx.applyTournament({ ...original, status: 'running' });
  assert.equal(ctx.data.isDraft, false);
  assert.equal(ctx.data.tournament.status, 'running');
  let writes = 0;
  t.mock.method(cloud, 'call', async () => { writes += 1; });
  await ctx.saveSettings();
  assert.equal(writes, 0);
});

test('settings refresh preserves a custom match draft before the first saved configuration', (t) => {
  const ctx = context(t);
  const original = tournament({ totalMatches: 0,
    players: Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, name: `球友${i}` })) });
  ctx.applyTournament(original);
  ctx.setTotalMatches(2);
  ctx.applyTournament({ ...original, version: 2 });
  assert.equal(ctx.data.editM, 2);
  assert.equal(ctx.data.endConditionTarget, 2);
});

test('settings retry fixes payload and request ID while a new save captures new values with a new ID', async (t) => {
  const ctx = context(t);
  const original = tournament();
  ctx.applyTournament(original);
  ctx.onNameInput({ detail: { value: '目标名' } });
  ctx.onPickPointsPerGame({ detail: { value: 0 } });
  const calls = [];
  t.mock.method(cloud, 'call', async (name, payload) => {
    assert.equal(name, 'updateSettings');
    calls.push({ ...payload });
    throw new Error('network timeout');
  });
  ctx.fetchTournament = async () => { ctx.applyTournament(original); };
  await ctx.saveSettings();
  assert.equal(ctx.data.canRetryAction, true);
  ctx.applyTournament({ ...original, version: 2 });
  assert.equal(ctx.data.canRetryAction, true);
  ctx.onNameInput({ detail: { value: '主动新输入' } });
  ctx.onPickPointsPerGame({ detail: { value: 1 } });
  await ctx.retryLastAction();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1].name, '目标名');
  assert.equal(calls[1].pointsPerGame, 11);
  await ctx.saveSettings();
  assert.equal(calls[2].name, '主动新输入');
  assert.equal(calls[2].pointsPerGame, 15);
  assert.notEqual(calls[2].clientRequestId, calls[0].clientRequestId);
});

test('settings retry respects new permission and roster gates', async (t) => {
  const ctx = context(t);
  const original = tournament();
  ctx.applyTournament(original);
  let writes = 0;
  t.mock.method(cloud, 'call', async () => { writes += 1; throw new Error('timeout'); });
  ctx.fetchTournament = async () => { ctx.applyTournament(original); };
  await ctx.saveSettings();
  ctx.applyTournament({ ...original, players: original.players.slice(0, 3) });
  assert.equal(ctx.data.canRetryAction, true);
  await ctx.retryLastAction();
  assert.equal(writes, 1);
});

test('settings successful retry leaves a newer draft available for saving with a new request ID', async (t) => {
  const ctx = context(t);
  let remote = tournament();
  ctx.applyTournament(remote);
  ctx.onNameInput({ detail: { value: '第一次保存' } });
  ctx.onPickPointsPerGame({ detail: { value: 0 } });
  const calls = [];
  const returns = [];
  const originalSetTimeout = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
    if (delay !== 420) return originalSetTimeout(callback, delay, ...args);
    returns.push(callback);
    return returns.length;
  });
  const navigation = [];
  t.mock.method(nav, 'navigateBackOrRedirect', (url) => { navigation.push(url); });
  t.mock.method(cloud, 'call', async (name, payload) => {
    assert.equal(name, 'updateSettings');
    calls.push({ ...payload });
    if (calls.length === 1) throw new Error('network timeout');
    remote = { ...remote, name: payload.name, totalMatches: payload.totalMatches,
      courts: payload.courts, settingsConfigured: true,
      rules: { pointsPerGame: payload.pointsPerGame,
        endCondition: { type: payload.endConditionType, target: payload.endConditionTarget } } };
    return { ok: true };
  });
  ctx.fetchTournament = async () => { ctx.applyTournament(remote); };
  await ctx.saveSettings();
  ctx.onNameInput({ detail: { value: '后来编辑的草稿' } });
  ctx.onPickPointsPerGame({ detail: { value: 1 } });
  await ctx.retryLastAction();
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(ctx.data.name, '后来编辑的草稿');
  assert.equal(ctx.data.pointsPerGame, 15);
  assert.equal(ctx.data.canRetryAction, false);
  assert.equal(ctx.data.settingsBusy, false);
  assert.equal(returns.length, 0, 'the saved older payload must not schedule leaving the newer draft');
  assert.deepEqual(navigation, []);

  await ctx.saveSettings();
  assert.equal(calls[2].name, '后来编辑的草稿');
  assert.equal(calls[2].pointsPerGame, 15);
  assert.notEqual(calls[2].clientRequestId, calls[0].clientRequestId);
  assert.equal(returns.length, 1);
  returns[0]();
  assert.deepEqual(navigation, ['/pages/lobby/index?tournamentId=settings_draft']);
});

test('settings successful retry without a newer draft retains the normal return to lobby', async (t) => {
  const ctx = context(t);
  let remote = tournament();
  ctx.applyTournament(remote);
  ctx.onNameInput({ detail: { value: '保存目标' } });
  let writes = 0;
  const returns = [];
  const originalSetTimeout = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
    if (delay !== 420) return originalSetTimeout(callback, delay, ...args);
    returns.push(callback);
    return returns.length;
  });
  const navigation = [];
  t.mock.method(nav, 'navigateBackOrRedirect', (url) => { navigation.push(url); });
  t.mock.method(cloud, 'call', async (name, payload) => {
    writes += 1;
    if (writes === 1) throw new Error('network timeout');
    remote = { ...remote, name: payload.name, settingsConfigured: true };
    return { ok: true };
  });
  ctx.fetchTournament = async () => { ctx.applyTournament(remote); };
  await ctx.saveSettings();
  await ctx.retryLastAction();
  assert.equal(ctx.data.name, '保存目标');
  assert.equal(ctx.data.canRetryAction, false);
  assert.equal(returns.length, 1);
  returns[0]();
  assert.deepEqual(navigation, ['/pages/lobby/index?tournamentId=settings_draft']);
});
