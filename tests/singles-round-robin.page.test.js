'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const storage = require('../miniprogram/core/storage');
const lobbyViewModel = require('../miniprogram/pages/lobby/lobbyViewModel');
const { createMatchDraftController } = require('../miniprogram/pages/match/matchDraftController');

function pageContext(t, page) {
  const pagePath = require.resolve(`../miniprogram/pages/${page}/index`);
  const originalPage = global.Page;
  const originalWx = global.wx;
  const memory = new Map();
  let definition;
  global.Page = (value) => { definition = value; };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  global.wx = { showLoading() {}, hideLoading() {}, showToast() {},
    getStorageSync: (key) => memory.get(key), setStorageSync: (key, value) => memory.set(key, value),
    removeStorageSync: (key) => memory.delete(key) };
  t.after(() => { global.wx = originalWx; delete require.cache[pagePath]; });
  return { ...definition, openid: 'admin', data: globalThis.structuredClone(definition.data),
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback.call(this); } };
}

for (const count of [0, 1]) {
  for (const page of ['settings', 'lobby']) {
    test(`singles ${page} saves cycles/points with ${count} player and exact zero matches`, async (t) => {
      const ctx = pageContext(t, page);
      const tournament = { _id: `singles_${page}_${count}`, creatorId: 'admin', name: '单打配置',
        status: 'draft', mode: 'singles_round_robin', courts: 1, totalMatches: 0,
        rules: { cycles: 1, pointsPerGame: 21 },
        players: count ? [{ id: 'admin', name: '管理员' }] : [] };
      if (page === 'settings') ctx.applyTournament(tournament);
      else ctx.setData(lobbyViewModel.buildLobbyViewModel({ tournament, openid: 'admin' }).patch);
      ctx.data.tournamentId = tournament._id;
      assert.equal(ctx.data.canConfigureSettings, true);
      assert.equal(ctx.data.checkStartReady, false);
      const writes = [];
      t.mock.method(cloud, 'call', async (name, payload) => {
        writes.push({ name, payload });
        return { ok: true, code: 'OK', data: {} };
      });
      t.mock.method(nav, 'markRefreshFlag', () => {});
      ctx.fetchTournament = async () => {};
      ctx.clearLastFailedAction = () => {};
      ctx.handleWriteError = (err) => { throw err; };
      ctx.hasUnsavedSettingsDraft = () => true;
      if (page === 'settings') {
        ctx.onPickSinglesCycles({ detail: { value: 1 } });
        ctx.onPickPointsPerGame({ detail: { value: 0 } });
        await ctx.saveSettings();
      } else {
        ctx.onPickQuickSinglesCycles({ detail: { value: 1 } });
        ctx.onPickQuickPointsPerGame({ detail: { value: 0 } });
        await ctx.saveQuickSettings();
      }
      assert.equal(writes.length, 1);
      assert.equal(writes[0].name, 'updateSettings');
      assert.equal(writes[0].payload.cycles, 2);
      assert.equal(writes[0].payload.pointsPerGame, 11);
      assert.equal(writes[0].payload.totalMatches, 0);
      assert.equal(writes[0].payload.endConditionTarget, 0);
    });
  }
}

test('singles editing undo restores persisted local draft without submitting or changing cloud score', (t) => {
  const ctx = pageContext(t, 'match');
  ctx.data = { ...ctx.data, tournamentId: 'singles_undo', roundIndex: 0, matchIndex: 0,
    tournament: { mode: 'singles_round_robin', rules: { pointsPerGame: 21 } },
    match: { status: 'finished', score: { teamA: 21, teamB: 18 } },
    canEdit: true, scoreA: 21, scoreB: 18 };
  ctx.matchDraft = createMatchDraftController(ctx);
  ctx.scoreLockManager = {};
  let writes = 0;
  t.mock.method(cloud, 'call', () => { writes += 1; });
  ctx.setEditableScores(22, 20, { recordHistory: true, persist: true });
  assert.equal(ctx.data.canUndo, true);
  ctx.onUndoStep();
  assert.equal(ctx.data.scoreA, 21);
  assert.equal(ctx.data.scoreB, 18);
  assert.equal(ctx.data.canUndo, false);
  assert.equal(storage.getScoreDraft('singles_undo', 0, 0).scoreB, 18);
  assert.deepEqual(ctx.data.match.score, { teamA: 21, teamB: 18 });
  assert.equal(writes, 0);
});

test('singles display fixtures expose current batch, exact counts and shared ranks', () => {
  const { cases } = require('../scripts/dev/weapp-ui-screenshot-cases');
  const schedule = cases.singlesSchedule7;
  assert.equal(schedule.data.roundsUi[0].isCurrentRound, true);
  assert.equal(schedule.data.roundsUi[1].isCurrentRound, false);
  assert.equal(schedule.data.roundsUi.flatMap((r) => r.matchesUi).length, 3);
  assert.match(schedule.data.roundsUi[0].restText, /轮空：.+；等待下一批：/);
  assert.doesNotMatch(schedule.data.roundsUi[1].restText, /轮空/);
  assert.match(schedule.data.roundsUi[1].restText, /本批暂休/);
  assert.deepEqual(cases.singlesRankingTied.data.rankings.map((r) => r.rank), [1, 1, 3, 3]);
  const preview = cases.singlesShareTied.data.preview.rankingPreview;
  assert.deepEqual(preview.map((r) => r.rank), [1, 1, 3]);
  assert.equal(new Set(preview.map((r) => r.previewKey)).size, 3);
});

test('singles ranking row share selects each tied entity by rankKey and passes its poster data', async (t) => {
  const ctx = pageContext(t, 'ranking');
  const { cases } = require('../scripts/dev/weapp-ui-screenshot-cases');
  Object.assign(ctx.data, globalThis.structuredClone(cases.singlesRankingTied.data));
  const tiedRows = ctx.data.rankings.filter((row) => row.rank === 1);
  assert.equal(tiedRows.length, 2);
  assert.notEqual(tiedRows[0].entityId, tiedRows[1].entityId);
  assert.notEqual(tiedRows[0].rankKey, tiedRows[1].rankKey);
  t.mock.method(require('../miniprogram/core/growthTracker'), 'track', () => {});
  t.mock.method(cloud, 'call', () => { throw new Error('row-share test must not call cloud'); });
  const posterCalls = [];
  // Keep the real row action, card-data builder and preheat/cache path; stub only rendering.
  ctx._buildPoster = async (tournament, cardData) => {
    posterCalls.push({ tournamentId: tournament._id, cardData: { ...cardData } });
    return `/local-test/poster-${posterCalls.length}.png`;
  };
  for (const row of tiedRows) {
    ctx.onShareRankingRow({ currentTarget: { dataset: { rank: 1, rankKey: row.rankKey } } });
    assert.equal(ctx._posterTargetRow.entityId, row.entityId);
    assert.equal(ctx._posterTargetRow.rankKey, row.rankKey);
    await ctx._shareImageBuildPromise_poster;
  }
  assert.equal(posterCalls.length, 2);
  assert.deepEqual(posterCalls.map((call) => call.cardData.userName), tiedRows.map((row) => row.displayName));
  assert.deepEqual(posterCalls.map((call) => call.cardData.rank), [1, 1]);
  assert.ok(posterCalls.every((call) => call.tournamentId === ctx.data.tournament._id));
});
