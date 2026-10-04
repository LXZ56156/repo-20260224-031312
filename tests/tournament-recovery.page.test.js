const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../miniprogram/core/cloud');
const storage = require('../miniprogram/core/storage');

function createPage() {
  let definition;
  const original = global.Page;
  global.Page = (value) => { definition = value; };
  try {
    const file = require.resolve('../miniprogram/pages/tournament-list/index');
    delete require.cache[file];
    require(file);
  } finally { global.Page = original; }
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
}
function response(items, nextCursor = '') {
  return { ok: true, code: 'TOURNAMENTS_FOUND', items, hasMore: !!nextCursor, nextCursor, completePage: true };
}
function row(id) { return { id, name: id, mode: 'multi_rotate', status: 'draft', roles: ['owner'], completedMatches: 0, totalMatches: 0 }; }

test('recovery stale responses cannot replace a refreshed list or write local performance snapshots', async () => {
  const oldCall = cloud.call;
  const oldStorage = storage.upsertLocalCompletedTournamentSnapshot;
  const calls = [];
  let localWrites = 0;
  cloud.call = async (name, data) => {
    assert.equal(name, 'getMyTournaments');
    calls.push(data);
    return new Promise((resolve) => calls[calls.length - 1].resolve = resolve);
  };
  storage.upsertLocalCompletedTournamentSnapshot = () => { localWrites += 1; };
  try {
    const page = createPage();
    const first = page.loadList(true);
    const refresh = page.loadList(true);
    calls[1].resolve(response([row('new')]));
    await refresh;
    calls[0].resolve(response([row('old')]));
    await first;
    assert.deepEqual(page.data.items.map((item) => item.id), ['new']);
    assert.equal(localWrites, 0);
    assert.equal(page.data.loading, false);
  } finally { cloud.call = oldCall; storage.upsertLocalCompletedTournamentSnapshot = oldStorage; }
});

test('recovery page failure retains rows and original cursor for a successful manual retry', async () => {
  const oldCall = cloud.call;
  const calls = [];
  let attempt = 0;
  cloud.call = async (_name, data) => {
    calls.push(data.cursor);
    if (++attempt === 1) return response([row('one')], 'same-page');
    if (attempt === 2) throw new Error('cloud.callFunction:fail node_modules/private/file.js');
    return response([row('one'), row('two')]);
  };
  try {
    const page = createPage();
    await page.loadList(true);
    await page.loadList(false);
    assert.deepEqual(page.data.items.map((item) => item.id), ['one']);
    assert.equal(page.data.error.includes('node_modules'), false);
    await page.retry();
    assert.deepEqual(calls, ['', 'same-page', 'same-page']);
    assert.deepEqual(page.data.items.map((item) => item.id), ['one', 'two']);
    assert.equal(page.data.hasMore, false);
    assert.equal(page.data.error, '');
  } finally { cloud.call = oldCall; }
});

test('recovery unload invalidates pending response; opening uses existing tournament route', async () => {
  const oldCall = cloud.call;
  const oldWx = global.wx;
  let resolve;
  let target;
  cloud.call = () => new Promise((done) => { resolve = done; });
  global.wx = { navigateTo(options) { target = options.url; } };
  try {
    const page = createPage();
    const pending = page.loadList(true);
    page.onUnload();
    resolve(response([row('late')]));
    await pending;
    assert.deepEqual(page.data.items, []);
    page.data.items = [row('known')];
    page.openTournament({ currentTarget: { dataset: { id: 'known' } } });
    assert.equal(target, '/pages/share-entry/index?tournamentId=known');
    page.openTournament({ currentTarget: { dataset: { id: 'forged' } } });
    assert.equal(target, '/pages/share-entry/index?tournamentId=known');
  } finally { cloud.call = oldCall; global.wx = oldWx; }
});

test('retrying a failed refresh repeats the first page instead of skipping to an older cursor', async () => {
  const oldCall = cloud.call;
  let attempt = 0;
  const cursors = [];
  cloud.call = async (_name, data) => {
    cursors.push(data.cursor);
    attempt += 1;
    if (attempt === 1) return response([row('old')], 'older-page');
    if (attempt === 2) throw new Error('网络异常，请重试');
    return response([row('new')]);
  };
  try {
    const page = createPage();
    await page.loadList(true);
    await page.loadList(true);
    assert.deepEqual(page.data.items.map((item) => item.id), ['old']);
    await page.retry();
    assert.deepEqual(cursors, ['', '', '']);
    assert.deepEqual(page.data.items.map((item) => item.id), ['new']);
  } finally { cloud.call = oldCall; }
});
