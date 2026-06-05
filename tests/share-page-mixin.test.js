const test = require('node:test');
const assert = require('node:assert/strict');

const sharePageMixinPath = require.resolve('../miniprogram/core/sharePageMixin.js');
const shareCode = require('../miniprogram/core/shareCode');
const sharePoster = require('../miniprogram/core/sharePoster');
const shareCardPreheat = require('../miniprogram/core/shareCardPreheat');

function loadMixin(opts) {
  delete require.cache[sharePageMixinPath];
  return require('../miniprogram/core/sharePageMixin').createSharePageMixin(opts || {
    buildShareCardData() { return { rank: 1, userName: 'test', eventName: '测试赛' }; }
  });
}

test('_buildShareCard never calls shareCode', async () => {
  const originalCall = shareCode.getTournamentShareCode;
  let qrCalls = 0;
  shareCode.getTournamentShareCode = async () => { qrCalls += 1; return 'cloud://test/qr.png'; };

  try {
    const mixin = loadMixin();
    const ctx = {
      _getCanvas() { return Promise.resolve({ getContext() {}, width: 0, height: 0 }); }
    };

    // mock drawShareCard to succeed
    const shareCard = require('../miniprogram/core/shareCard');
    const originalDraw = shareCard.drawShareCard;
    shareCard.drawShareCard = async () => '/tmp/share-card.png';

    await mixin._buildShareCard.call(ctx, { _id: 't1' });

    assert.equal(qrCalls, 0, '_buildShareCard should never call shareCode');

    shareCard.drawShareCard = originalDraw;
  } finally {
    shareCode.getTournamentShareCode = originalCall;
    delete require.cache[sharePageMixinPath];
  }
});

test('_buildPoster handles shareCode failure gracefully', async () => {
  const originalCall = shareCode.getTournamentShareCode;
  let posterCalls = 0;
  shareCode.getTournamentShareCode = async () => {
    throw new Error('qr generation failed');
  };

  const originalGenerate = sharePoster.generatePoster;
  sharePoster.generatePoster = async (_canvas, _data) => {
    posterCalls += 1;
    return '/tmp/poster-no-qr.png';
  };

  try {
    const mixin = loadMixin();
    const ctx = {
      _getCanvas() { return Promise.resolve({ getContext() {}, width: 0, height: 0 }); }
    };

    const result = await mixin._buildPoster.call(ctx, { _id: 't1' });

    assert.equal(posterCalls, 1, 'generatePoster should still be called after shareCode failure');
    assert.equal(result, '/tmp/poster-no-qr.png');
  } finally {
    shareCode.getTournamentShareCode = originalCall;
    sharePoster.generatePoster = originalGenerate;
    delete require.cache[sharePageMixinPath];
  }
});

test('preheatShareImage dispatches to _buildTimelineCard for TYPE_TIMELINE', async () => {
  let timelineCalls = 0;

  try {
    const mixin = loadMixin();
    const ctx = {
      _getCanvas() { return Promise.resolve({ getContext() {}, width: 0, height: 0 }); },
      _buildShareCardData: mixin._buildShareCardData,
      _buildTimelineCard: async () => { timelineCalls += 1; return '/tmp/timeline.png'; },
      _buildShareCard: async () => '/tmp/card.png',
      _buildPoster: async () => '/tmp/poster.png'
    };

    const shareTimelineCard = require('../miniprogram/core/shareTimelineCard');
    const originalDraw = shareTimelineCard.drawTimelineCard;
    shareTimelineCard.drawTimelineCard = async () => '/tmp/timeline.png';

    await shareCardPreheat.preheatShareImage(ctx, { _id: 't_timeline' }, shareCardPreheat.TYPE_TIMELINE);

    assert.equal(timelineCalls, 1, 'TYPE_TIMELINE should call _buildTimelineCard');

    shareTimelineCard.drawTimelineCard = originalDraw;
  } finally {
    delete require.cache[sharePageMixinPath];
  }
});

test('_preheatShareWhenReady only preheats appMessage and timeline, not poster', async () => {
  const preheatCalls = [];
  const originalPreheat = shareCardPreheat.preheatShareImage;
  shareCardPreheat.preheatShareImage = async (ctx, tournament, type) => {
    preheatCalls.push(type);
    return '';
  };

  try {
    const mixin = loadMixin();
    const ctx = {
      _getCanvas() { return Promise.resolve({ getContext() {}, width: 0, height: 0 }); },
      data: { tournament: { _id: 't1' } }
    };

    // Simulate onReady having fired
    mixin.onReady.call(ctx);
    await new Promise(r => setTimeout(r, 0));

    const types = preheatCalls.map(c => c);
    assert.ok(types.includes('appMessage'), 'should preheat appMessage');
    assert.ok(types.includes('timeline'), 'should preheat timeline');
    assert.equal(types.includes('poster'), false, 'should NOT preheat poster');
  } finally {
    shareCardPreheat.preheatShareImage = originalPreheat;
    delete require.cache[sharePageMixinPath];
  }
});

test('noop is a function that does not throw', () => {
  const mixin = loadMixin();
  assert.equal(typeof mixin.noop, 'function');
  assert.doesNotThrow(() => mixin.noop());
});
