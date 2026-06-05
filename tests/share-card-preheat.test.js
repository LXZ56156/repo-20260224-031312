const test = require('node:test');
const assert = require('node:assert/strict');

const shareCardPreheat = require('../miniprogram/core/shareCardPreheat');

test('shareCardPreheat merges concurrent builds and reuses the exported image', async () => {
  let builds = 0;
  let resolveBuild;
  const ctx = {
    _buildShareCardData() {
      return { rank: 1, userName: '林夏' };
    },
    _buildShareCard() {
      builds += 1;
      return new Promise((resolve) => {
        resolveBuild = resolve;
      });
    }
  };
  const tournament = { _id: 'tid_1' };

  const first = shareCardPreheat.getPreparedShareCard(ctx, tournament);
  const second = shareCardPreheat.getPreparedShareCard(ctx, tournament);
  await Promise.resolve();
  assert.equal(builds, 1);

  resolveBuild('/tmp/share-card.png');
  assert.equal(await first, '/tmp/share-card.png');
  assert.equal(await second, '/tmp/share-card.png');
  assert.equal(await shareCardPreheat.getPreparedShareCard(ctx, tournament), '/tmp/share-card.png');
  assert.equal(builds, 1);
});

test('shareCardPreheat rebuilds when visible card data changes', async () => {
  let rank = 1;
  let builds = 0;
  const ctx = {
    _buildShareCardData() {
      return { rank, userName: '林夏' };
    },
    async _buildShareCard() {
      builds += 1;
      return `/tmp/share-card-${rank}.png`;
    }
  };
  const tournament = { _id: 'tid_1' };

  assert.equal(await shareCardPreheat.getPreparedShareCard(ctx, tournament), '/tmp/share-card-1.png');
  rank = 2;
  assert.equal(await shareCardPreheat.getPreparedShareCard(ctx, tournament), '/tmp/share-card-2.png');
  assert.equal(builds, 2);
});

test('shareCardPreheat keeps background failures best-effort', async () => {
  const ctx = {
    _buildShareCardData() {
      return { rank: 1 };
    },
    async _buildShareCard() {
      throw new Error('cloud unavailable');
    }
  };

  assert.equal(await shareCardPreheat.preheatShareCard(ctx, { _id: 'tid_1' }), '');
});

test('getPreparedShareImage dispatches to correct builder by type', async () => {
  const calls = [];
  const ctx = {
    _buildShareCardData() { return { rank: 1 }; },
    _buildShareCard() { calls.push('appMessage'); return Promise.resolve('/tmp/card.png'); },
    _buildTimelineCard() { calls.push('timeline'); return Promise.resolve('/tmp/timeline.png'); },
    _buildPoster() { calls.push('poster'); return Promise.resolve('/tmp/poster.png'); }
  };
  const tournament = { _id: 't1' };

  // Clear any cached state on ctx before each call
  await shareCardPreheat.getPreparedShareImage(ctx, tournament, 'appMessage');
  assert.deepEqual(calls, ['appMessage']);

  // Use different tournament to avoid cache hit
  await shareCardPreheat.getPreparedShareImage(ctx, { _id: 't2' }, 'timeline');
  assert.deepEqual(calls, ['appMessage', 'timeline']);

  await shareCardPreheat.getPreparedShareImage(ctx, { _id: 't3' }, 'poster');
  assert.deepEqual(calls, ['appMessage', 'timeline', 'poster']);
});
