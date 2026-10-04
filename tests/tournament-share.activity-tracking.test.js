const test = require('node:test');
const assert = require('node:assert/strict');
const shareCardPreheat = require('../miniprogram/core/shareCardPreheat');
const sharePoster = require('../miniprogram/core/sharePoster');

function setup(t, pageName) {
  const original = { wx: global.wx, Page: global.Page, getApp: global.getApp, getImage: shareCardPreheat.getPreparedShareImage };
  const events = [];
  global.wx = {
    reportEvent: (name, payload) => { if (name.startsWith('activity_')) events.push({ name, payload }); },
    showShareMenu: (options = {}) => { if (options.success) options.success({}); }, showModal: () => {}, showLoading: () => {}, hideLoading: () => {}
  };
  global.getApp = () => ({ globalData: {} });
  shareCardPreheat.getPreparedShareImage = async () => '/tmp/share-card.png';
  let definition;
  global.Page = (value) => { definition = value; };
  const pagePath = require.resolve(`../miniprogram/pages/${pageName}/index`);
  delete require.cache[pagePath];
  require(pagePath);
  const ctx = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
  ctx.data.tournament = { _id: 'PRIVATE_TOURNAMENT', name: 'PRIVATE_NAME', status: 'finished', players: [], rounds: [], rankings: [] };
  ctx.ensureDynamicShareReady = () => {};
  t.after(() => { global.wx = original.wx; global.Page = original.Page; global.getApp = original.getApp; shareCardPreheat.getPreparedShareImage = original.getImage; delete require.cache[pagePath]; });
  return { ctx, events };
}

for (const pageName of ['ranking', 'analytics', 'lobby']) {
  test(`${pageName} actual share hooks emit one unknown pair without altering share payload`, async (t) => {
    const { ctx, events } = setup(t, pageName);
    const hooks = pageName === 'lobby' ? ['onShareAppMessage'] : ['onShareAppMessage', 'onShareTimeline'];
    if (pageName === 'lobby') ctx.onShareButtonTouchStart();
    assert.equal(events.length, 0);
    for (const hook of hooks) {
      const before = events.length;
      const share = ctx[hook]();
      assert.equal(share.title, 'PRIVATE_NAME 赛事排名已出炉');
      if (hook === 'onShareAppMessage') assert.equal(share.path, '/pages/share-entry/index?tournamentId=PRIVATE_TOURNAMENT');
      else assert.equal(share.query, 'tournamentId=PRIVATE_TOURNAMENT');
      assert.equal(events.length - before, 2);
      const [attempt, result] = events.slice(before);
      assert.equal(attempt.name, 'activity_attempt');
      assert.equal(result.name, 'activity_result');
      assert.equal(attempt.payload.action, 'tournament_share');
      assert.equal(result.payload.result, 'unknown');
      assert.equal(result.payload.resultCode, 'DELIVERY_UNKNOWN');
      assert.equal(attempt.payload.operationId, result.payload.operationId);
      assert.notEqual(attempt.payload.eventId, result.payload.eventId);
      if (share.promise) assert.equal((await share.promise).imageUrl, '/tmp/share-card.png');
      assert.equal(events.length - before, 2, 'image preparation does not imply delivery');
    }
    assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
    global.wx.reportEvent = () => { throw new Error('analytics failed'); };
    for (const hook of hooks) {
      const share = ctx[hook]();
      assert.ok(share.title);
      if (share.promise) await share.promise;
    }
    global.wx.reportEvent = () => Promise.reject(new Error('async analytics failed'));
    for (const hook of hooks) {
      const share = ctx[hook]();
      assert.ok(share.title);
      if (share.promise) await share.promise;
    }
  });
}

test('mixin menu/preheat/poster/save/copy do not count delivery attempts', async (t) => {
  const { ctx, events } = setup(t, 'analytics');
  const original = { preheat: shareCardPreheat.preheatShareImage, save: sharePoster.savePosterToAlbum, copy: sharePoster.copyShareText };
  t.after(() => { shareCardPreheat.preheatShareImage = original.preheat; sharePoster.savePosterToAlbum = original.save; sharePoster.copyShareText = original.copy; });
  shareCardPreheat.preheatShareImage = async () => '/tmp/preheated.png';
  sharePoster.savePosterToAlbum = async () => {};
  sharePoster.copyShareText = () => {};
  ctx._getCanvas = async () => ({});
  ctx._buildShareCardData = () => ({});
  // Use the actual mixin copy action without page-specific card statistics.
  const mixin = require('../miniprogram/core/sharePageMixin').createSharePageMixin({ buildShareCardData: () => ({}) });
  ctx._ensureShareMenu();
  ctx.onShareTimelineGuide();
  ctx.onReady();
  ctx._preheatShareWhenReady(ctx.data.tournament);
  ctx.onGeneratePoster();
  await new Promise((resolve) => setTimeout(resolve, 0));
  ctx.onSavePoster();
  mixin.onCopyPosterText.call(ctx);
  assert.equal(events.length, 0);
});

test('water share remains outside tournament tracking', (t) => {
  const { ctx, events } = setup(t, 'water');
  ctx.onShareAppMessage();
  assert.equal(events.length, 0);
});
