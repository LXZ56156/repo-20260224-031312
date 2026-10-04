const test = require('node:test');
const assert = require('node:assert/strict');
const tournamentSync = require('../miniprogram/core/tournamentSync');

function setup(t, pageName = 'share-entry') {
  const original = { wx: global.wx, Page: global.Page, getApp: global.getApp, fetch: tournamentSync.fetchTournament, watch: tournamentSync.startWatch };
  const events = [];
  global.wx = { reportEvent: (name, payload) => { if (name.startsWith('activity_')) events.push({ name, payload }); }, getStorageSync: () => '', getAccountInfoSync: () => ({ miniProgram: {} }) };
  global.getApp = () => ({ globalData: {} });
  let definition;
  global.Page = (value) => { definition = value; };
  const path = require.resolve(`../miniprogram/pages/${pageName}/index`);
  delete require.cache[path];
  require(path);
  const ctx = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
  ctx.applyTournament = (doc) => { ctx.data.tournament = doc; };
  ctx.primeViewerIdentity = () => {};
  tournamentSync.startWatch = () => {};
  t.after(() => { global.wx = original.wx; global.Page = original.Page; global.getApp = original.getApp; tournamentSync.fetchTournament = original.fetch; tournamentSync.startWatch = original.watch; delete require.cache[path]; });
  return { ctx, events };
}

test('share enter starts before load, confirms remote once and never emits departure on hide', async (t) => {
  const { ctx, events } = setup(t);
  let resolve;
  tournamentSync.fetchTournament = () => new Promise((done) => { resolve = done; });
  ctx.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.action, 'share_enter');
  ctx.onHide();
  assert.equal(events.length, 1);
  resolve({ ok: true, source: 'remote', doc: { _id: 'PRIVATE_TOURNAMENT', status: 'running' } });
  await ctx._fetchInflightPromise;
  await Promise.resolve();
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.resultCode, 'TARGET_CONFIRMED');
  ctx.onUnload();
  assert.equal(events.length, 2);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});

test('cached/fallback state never confirms remote; explicit retry starts new entry attempt', async (t) => {
  const { ctx, events } = setup(t);
  const cachedDoc = { _id: 'PRIVATE_TOURNAMENT', status: 'running' };
  tournamentSync.fetchTournament = async () => ({ ok: false, errorType: 'network', cachedDoc });
  ctx.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  await ctx._fetchInflightPromise;
  await Promise.resolve();
  assert.equal(ctx.data.tournament, cachedDoc);
  assert.equal(events[1].payload.result, 'failure');
  assert.equal(events[1].payload.resultCode, 'LOAD_FAILED');
  tournamentSync.fetchTournament = async () => ({ ok: false, errorType: 'network' });
  await ctx.onRetry();
  assert.equal(events.length, 4);
  assert.equal(events[3].payload.resultCode, 'LOAD_FAILED');
  assert.notEqual(events[0].payload.operationId, events[2].payload.operationId);
  ctx.onUnload();
});

test('watch reuse_cache is unconfirmed while a fresh realtime snapshot confirms entry', async (t) => {
  const { ctx, events } = setup(t);
  let resolve;
  let onDoc;
  tournamentSync.fetchTournament = () => new Promise((done) => { resolve = done; });
  tournamentSync.startWatch = (_page, _id, callback) => { onDoc = callback; };
  ctx.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  onDoc({ _id: 'PRIVATE_TOURNAMENT', status: 'running' }, { source: 'reuse_cache' });
  assert.equal(events.length, 1);
  onDoc({ _id: 'PRIVATE_TOURNAMENT', status: 'running' }, { source: 'realtime' });
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.resultCode, 'TARGET_CONFIRMED');
  resolve({ ok: false, errorType: 'network' });
  await ctx._fetchInflightPromise;
  await Promise.resolve();
  ctx.onUnload();
  assert.equal(events.length, 2);
});

test('remote document without a usable tournament status is not confirmed', async (t) => {
  const { ctx, events } = setup(t);
  tournamentSync.fetchTournament = async () => ({ ok: true, source: 'remote', doc: { _id: 'PRIVATE_TOURNAMENT', ownerName: 'PRIVATE_NAME' } });
  ctx.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  await ctx._fetchInflightPromise;
  await Promise.resolve();
  assert.equal(events[1].payload.resultCode, 'LOAD_FAILED');
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
  ctx.onUnload();
});

test('missing target, invalid link and pending unload have distinct results; late response cannot replace departure', async (t) => {
  const { ctx, events } = setup(t);
  tournamentSync.fetchTournament = async () => ({ ok: false, errorType: 'not_found' });
  ctx.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  await ctx._fetchInflightPromise;
  await Promise.resolve();
  assert.equal(events[1].payload.resultCode, 'TARGET_MISSING');
  ctx.onUnload();
  const missing = { ...ctx, data: { ...ctx.data } };
  missing.onLoad({});
  assert.equal(events[3].payload.resultCode, 'LINK_INVALID');
  let resolve;
  tournamentSync.fetchTournament = () => new Promise((done) => { resolve = done; });
  const pending = { ...ctx, data: { ...ctx.data, tournament: null } };
  pending.onLoad({ tournamentId: 'PRIVATE_TOURNAMENT' });
  const promise = pending._fetchInflightPromise;
  pending.onHide();
  assert.equal(events.length, 5);
  pending.onUnload();
  assert.equal(events[5].payload.result, 'left');
  resolve({ ok: true, source: 'remote', doc: { _id: 'PRIVATE_TOURNAMENT' } });
  await promise;
  await Promise.resolve();
  assert.equal(events.length, 6);
});

test('ranking only reports actual share callbacks, not share menu/preheat or timeline guide', (t) => {
  const { ctx, events } = setup(t, 'ranking');
  ctx._ensureShareMenu = () => {};
  global.wx.showModal = () => {};
  ctx.onShareTimelineGuide();
  assert.equal(events.length, 0);
  assert.ok(ctx.onShareAppMessage().path);
  assert.equal(ctx.onShareTimeline().title, '羽球轮转助手');
  assert.equal(events.length, 4);
  assert.deepEqual(events.filter((event) => event.name === 'activity_result').map((event) => event.payload.result), ['unknown', 'unknown']);
});
