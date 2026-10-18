const clone = value => JSON.parse(JSON.stringify(value));
const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../miniprogram/core/storage');
const budget = require('../miniprogram/core/storage/cacheBudget');
function setup() {
  const values = new Map();
  global.wx = { getStorageSync: k => values.get(k), setStorageSync: (k,v) => values.set(k, clone(v)),
    removeStorageSync: k => values.delete(k), getStorageInfoSync: () => ({ keys: [...values.keys()] }) };
  global.getCurrentPages = () => [];
  return values;
}
function docs(values) { return [...values.keys()].filter(k => k.startsWith('local_tournament_cache_') && !k.startsWith('local_tournament_cache_at_')); }
test('balanced cache enforces count with LRU and preserves independent snapshots', () => {
  const v = setup();
  for(let i=0;i<50;i++) storage.setLocalTournamentCache('t'+i, { _id:'t'+i });
  storage.setLocalTournamentSnapshot('t1', { id:'t1' });
  storage.getLocalTournamentCache('t0');
  storage.setLocalTournamentCache('t50', { _id:'t50' });
  assert.equal(docs(v).length, 50);
  assert.ok(storage.getLocalTournamentCache('t0'));
  assert.equal(storage.getLocalTournamentCache('t1'), null);
  assert.ok(storage.getLocalTournamentSnapshot('t1'));
});
test('byte budget counts UTF8 and protects active, drafts and pending operations', () => {
  const v=setup();
  global.getCurrentPages = () => [{ data: { tournamentId:'active' } }];
  storage.setScoreDraft('draft',0,0,{ score:1 });
  const release=storage.pinTournamentCache('pending');
  const doc={ padding:'中'.repeat(600000) };
  storage.setLocalTournamentCache('active', doc);
  storage.setLocalTournamentCache('draft', doc);
  storage.setLocalTournamentCache('pending', doc);
  assert.equal(docs(v).length,3);
  assert.equal(budget.byteSize({ v:'中😀' }), Buffer.byteLength(JSON.stringify({v:'中😀'})));
  assert.equal(storage.maintainTournamentCache().overBudget,true);
  release();
  assert.equal(storage.getLocalTournamentCache('pending'),null);
  assert.ok(storage.getLocalTournamentCache('draft'));
});
test('legacy or lost index is rebuilt and storage failure never deletes protected state', () => {
  const v=setup();
  for(let i=0;i<60;i++) v.set('local_tournament_cache_t'+i,{ _id:'t'+i });
  v.set('score_draft_t0_0_0',{ score:2 });
  storage.maintainTournamentCache();
  assert.equal(docs(v).length,50);
  assert.ok(storage.getLocalTournamentCache('t0'));
  const original=wx.removeStorageSync;
  wx.removeStorageSync=()=>{throw Error('storage unavailable');};
  for(let i=60;i<65;i++) storage.setLocalTournamentCache('t'+i,{});
  assert.ok(v.get('score_draft_t0_0_0'));
  wx.removeStorageSync=original;
  delete wx.getStorageInfoSync;
  assert.equal(storage.maintainTournamentCache().skipped,true);
});

test('uncertain writes survive module restarts until the matching request is confirmed', () => {
  const v=setup();
  budget.beginWrite('pending','request-1');
  v.set('local_tournament_cache_pending',{ padding:'x'.repeat(5*1024*1024) });
  storage.maintainTournamentCache();
  assert.ok(v.has('local_tournament_cache_pending'));
  budget.confirmWrite('unrelated-request');
  storage.maintainTournamentCache();
  assert.ok(v.has('local_tournament_cache_pending'));
  budget.confirmWrite('request-1');
  storage.maintainTournamentCache();
  assert.equal(v.has('local_tournament_cache_pending'),false);
});
