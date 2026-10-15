const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');

const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

function loadHomePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[homePagePath];
  require(homePagePath);
  global.Page = originalPage;
  return definition;
}

function createHomePageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update, cb) {
      this.data = { ...this.data, ...(update || {}) };
      if (typeof cb === 'function') cb();
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._closeAllSwipe = () => {};
  ctx.clearLastFailedAction = () => {
    ctx.clearedLastFailedAction = true;
  };
  return ctx;
}


async function withHome(run) {
  const oldWx = global.wx;
  const oldApp = global.getApp;
  const names = ['getRecentTournamentIds', 'getLocalTournamentCacheInfo', 'setLocalTournamentCache', 'upsertLocalCompletedTournamentSnapshot', 'removeLocalCompletedTournamentSnapshot', 'removeLocalTournamentCache', 'setHomeSortMode'];
  const originals = Object.fromEntries(names.map((name) => [name, storage[name]]));
  const ids = ['a', 'b', 'c', 'gone'];
  const docs = [
    {_id: 'a', name: 'A', status: 'finished', players: [{id: '1'}, {id: '2'}], updatedAt: 2000},
    {_id: 'b', name: 'B', status: 'running', players: [{id: '1'}], updatedAt: 3000},
    {_id: 'c', name: 'C', status: 'draft', players: [{id: '1'}, {id: '2'}], updatedAt: 4000}
  ];
  let reads = 0;
  const modes = [];
  global.getApp = () => ({globalData: {openid: 'viewer'}});
  global.wx = {cloud: {database: () => ({command: {in: (value) => value}, collection: () => ({where: () => ({get: async () => { reads += 1; return {data: docs}; }})})})}, showToast() {}};
  storage.getRecentTournamentIds = () => ids.slice();
  storage.getLocalTournamentCacheInfo = () => null;
  for (const name of names.slice(2)) storage[name] = () => {};
  storage.setHomeSortMode = (mode) => modes.push(mode);
  try {
    const ctx = createHomePageContext(loadHomePageDefinition());
    await ctx.loadRecents();
    await run({ctx, ids, docs, modes, reads: () => reads});
  } finally {
    Object.assign(storage, originals);
    global.wx = oldWx;
    global.getApp = oldApp;
    delete require.cache[homePagePath];
  }
}
const choose = (ctx, mode) => ctx.onChangeSortMode({currentTarget: {dataset: {mode}}});

test('complete remote home list sorts all three modes locally with original ties and missing cards', async () => {
  await withHome(async ({ctx, reads, modes}) => {
    const map = ctx._rawDocsMap;
    const updatedAt = ctx.data.syncLastUpdatedAt;
    let closed = 0;
    ctx._closeAllSwipe = () => { closed += 1; };
    ctx.setData({filterStatus: 'running'});
    choose(ctx, 'players');
    assert.deepEqual(ctx.data.items.map((item) => item._id), ['c', 'a', 'b', 'gone']);
    choose(ctx, 'status');
    assert.deepEqual(ctx.data.items.map((item) => item._id), ['b', 'c', 'a', 'gone']);
    choose(ctx, 'updated');
    assert.deepEqual(ctx.data.items.map((item) => item._id), ['c', 'b', 'a', 'gone']);
    assert.equal(reads(), 1);
    assert.deepEqual(modes, ['players', 'status', 'updated']);
    assert.equal(closed, 3);
    assert.equal(ctx._rawDocsMap, map);
    assert.equal(ctx.data.syncLastUpdatedAt, updatedAt);
    assert.equal(ctx.data.syncRefreshing, false);
    assert.equal(ctx.data.syncUsingCache, false);
    assert.equal(ctx.data.filterStatus, 'running');
    assert.equal(ctx.data.statusCountMissing, 1);
    assert.equal(ctx.data.statusCountRunning, 1);
    await ctx.loadRecents();
    assert.equal(reads(), 2, 'explicit refresh still reads remotely');
  });
});

for (const [name, mutate] of [
  ['cached fallback', (ctx) => ctx.setData({syncUsingCache: true})],
  ['refresh in flight', (ctx) => ctx.setData({syncRefreshing: true})],
  ['read error', (ctx) => ctx.setData({loadError: true})],
  ['partial list', (ctx) => ctx.setData({items: ctx.data.items.slice(1)})],
  ['changed recent IDs', (_ctx, ids) => ids.push('new')],
  ['same length but different IDs', (ctx) => ctx.setData({items: ctx.data.items.map((item, i) => i ? item : {...item, _id: 'different'})})]
]) {
  test('home sort retains remote refresh for ' + name, async () => {
    await withHome(async ({ctx, ids, reads}) => {
      mutate(ctx, ids);
      choose(ctx, 'players');
      assert.equal(reads(), 2);
    });
  });
}

test('same sort mode is a no-op', async () => {
  await withHome(async ({ctx, reads, modes}) => {
    choose(ctx, 'updated');
    assert.equal(reads(), 1);
    assert.deepEqual(modes, []);
  });
});
