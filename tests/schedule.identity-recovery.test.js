'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../miniprogram/core/auth');
const nav = require('../miniprogram/core/nav');
const pagePath = require.resolve('../miniprogram/pages/schedule/index');

function context(t) {
  const originalPage = global.Page;
  const originalApp = global.getApp;
  const originalWx = global.wx;
  let definition;
  global.Page = (value) => { definition = value; };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  global.getApp = () => ({ globalData: { openid: '' } });
  global.wx = { getStorageSync() { return ''; }, showShareMenu() {} };
  t.after(() => { global.getApp = originalApp; global.wx = originalWx; delete require.cache[pagePath]; });
  const ctx = { ...definition, data: globalThis.structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch); },
    fetchTournament: async () => {}, startWatch() {}, hasActiveWatch() { return true; }
  };
  return ctx;
}

function tournament() {
  return { _id: 'schedule_auth', name: '身份恢复', creatorId: 'admin', status: 'running', mode: 'multi_rotate',
    players: [], rounds: [{ matches: [{ status: 'pending', teamA: [], teamB: [] }] }] };
}

test('schedule late login restores score permission and action without another tournament fetch', async (t) => {
  const ctx = context(t);
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  t.mock.method(auth, 'login', () => pending);
  ctx.onLoad({ tournamentId: 'schedule_auth' });
  ctx.applyTournament(tournament());
  assert.equal(ctx.data.canEditScore, false);
  resolve('admin');
  await pending;
  await Promise.resolve();
  assert.equal(ctx.openid, 'admin');
  assert.equal(ctx.data.canEditScore, true);
  assert.equal(ctx.data.nextActionKey, 'batch');
});

for (const leave of ['onHide', 'onUnload']) {
  test(`schedule identity resolution after ${leave} cannot write page state`, async (t) => {
    const ctx = context(t);
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    t.mock.method(auth, 'login', () => pending);
    ctx.onLoad({ tournamentId: 'schedule_auth' });
    ctx.applyTournament(tournament());
    ctx[leave]();
    const snapshot = globalThis.structuredClone(ctx.data);
    resolve('admin');
    await pending;
    await Promise.resolve();
    assert.equal(ctx.openid, '');
    assert.deepEqual(ctx.data, snapshot);
  });
}

test('schedule ignores old identity after hide/show and applies only the new visible request', async (t) => {
  const ctx = context(t);
  const resolvers = [];
  t.mock.method(auth, 'login', () => new Promise((resolve) => { resolvers.push(resolve); }));
  ctx.onLoad({ tournamentId: 'schedule_auth' });
  ctx.applyTournament(tournament());
  ctx.onHide();
  ctx.onShow();
  assert.equal(resolvers.length, 2);
  resolvers[0]('stale');
  await Promise.resolve();
  assert.equal(ctx.openid, '');
  resolvers[1]('admin');
  await Promise.resolve();
  assert.equal(ctx.openid, 'admin');
  assert.equal(ctx.data.canEditScore, true);
});

test('schedule load-error home action calls the shared home navigation', (t) => {
  const ctx = context(t);
  let calls = 0;
  t.mock.method(nav, 'goHome', () => { calls += 1; });
  assert.equal(typeof ctx.goHome, 'function');
  ctx.goHome();
  assert.equal(calls, 1);
});
