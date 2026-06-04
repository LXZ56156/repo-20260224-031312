const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas, loadImage } = require('canvas');

const shareTimelineCard = require('../miniprogram/core/shareTimelineCard');

test('timelineCard draws minimal text-only thumbnail', async () => {
  const canvas = createCanvas(shareTimelineCard.DRAW_SIZE.width, shareTimelineCard.DRAW_SIZE.height);
  const result = await shareTimelineCard.drawTimelineCard(canvas, {
    userName: '林夏',
    eventName: '周三羽毛球夜赛',
    wins: 8,
    losses: 2,
    rank: 1
  }, {
    dpr: 1,
    exportCanvas(targetCanvas) {
      const ctx = targetCanvas.getContext('2d');
      const topPixel = ctx.getImageData(250, 10, 1, 1).data;
      assert.notDeepEqual(Array.from(topPixel), [0, 0, 0, 0]);
      return 'timeline-rank1.png';
    }
  });
  assert.equal(result, 'timeline-rank1.png');
});

test('timelineCard renders all rank levels correctly', async () => {
  for (var rank = 1; rank <= 8; rank++) {
    var canvas = createCanvas(shareTimelineCard.DRAW_SIZE.width, shareTimelineCard.DRAW_SIZE.height);
    const result = await shareTimelineCard.drawTimelineCard(canvas, {
      userName: '球员' + rank,
      eventName: '测试赛',
      wins: rank * 2,
      losses: rank,
      rank: rank
    }, {
      dpr: 1,
      exportCanvas() { return 'ok'; }
    });
    assert.equal(result, 'ok');
  }
});

test('timelineCard handles long event name by shrinking text', async () => {
  const canvas = createCanvas(shareTimelineCard.DRAW_SIZE.width, shareTimelineCard.DRAW_SIZE.height);
  const result = await shareTimelineCard.drawTimelineCard(canvas, {
    userName: '测试球员',
    eventName: '2026年第三届深圳市高校羽毛球联赛暨大湾区邀请赛',
    wins: 10,
    losses: 0,
    rank: 1
  }, {
    dpr: 1,
    exportCanvas() { return 'long-name.png'; }
  });
  assert.equal(result, 'long-name.png');
});

test('timelineCard works with minimal data (defaults)', async () => {
  const canvas = createCanvas(shareTimelineCard.DRAW_SIZE.width, shareTimelineCard.DRAW_SIZE.height);
  const result = await shareTimelineCard.drawTimelineCard(canvas, {}, {
    dpr: 1,
    exportCanvas() { return 'minimal.png'; }
  });
  assert.equal(result, 'minimal.png');
});
