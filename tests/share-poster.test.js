const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas, loadImage } = require('canvas');

const sharePoster = require('../miniprogram/core/sharePoster');

function makeDataUrl() {
  const canvas = createCanvas(120, 120);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b6f4d';
  ctx.fillRect(0, 0, 120, 120);
  ctx.fillStyle = '#fff';
  ctx.fillRect(32, 32, 56, 56);
  return canvas.toDataURL('image/png');
}

test('poster generates 1080×1080 image for top 3 rank', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  let exportedWidth = 0;
  let exportedHeight = 0;

  const result = await sharePoster.generatePoster(canvas, {
    userName: '林夏',
    eventName: '周三羽毛球夜赛',
    mode: '个人榜',
    wins: 8,
    losses: 2,
    winRate: '80%',
    totalMatches: 10,
    maxWinStreak: 5,
    avgScore: 18.2,
    rank: 1,
    avatarUrl: makeDataUrl(),
    qrCodeUrl: makeDataUrl()
  }, {
    dpr: 1,
    loadImage(src) {
      var img = canvas.createImage();
      return new Promise(function (resolve) {
        img.onload = function () { resolve(img); };
        img.src = src;
      });
    },
    exportCanvas(targetCanvas, size) {
      exportedWidth = size.width;
      exportedHeight = size.height;
      return 'poster-rank1.png';
    }
  });

  assert.equal(result, 'poster-rank1.png');
  assert.equal(exportedWidth, sharePoster.POSTER_SIZE);
  assert.equal(exportedHeight, sharePoster.POSTER_SIZE);
});

test('poster handles normal rank (≥4) with pure color background', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const result = await sharePoster.generatePoster(canvas, {
    userName: '李四',
    eventName: '测试赛',
    mode: '个人榜',
    wins: 5,
    losses: 5,
    winRate: '50%',
    totalMatches: 10,
    rank: 4,
    avatarUrl: ''
  }, {
    dpr: 1,
    loadImage() {
      return Promise.reject(new Error('no image'));
    },
    exportCanvas() { return 'poster-normal.png'; }
  });
  assert.equal(result, 'poster-normal.png');
});

test('poster handles missing avatar gracefully', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const result = await sharePoster.generatePoster(canvas, {
    userName: '王五',
    eventName: '无头像测试赛',
    wins: 3,
    losses: 3,
    rank: 2,
    avatarUrl: ''
  }, {
    dpr: 1,
    loadImage() { return Promise.reject(new Error('no image')); },
    exportCanvas() { return 'no-avatar.png'; }
  });
  assert.equal(result, 'no-avatar.png');
});

test('poster share text is correctly formatted', () => {
  const text = sharePoster.buildShareText({
    eventName: '周三羽毛球夜赛',
    rank: 1,
    wins: 8,
    losses: 2
  });
  assert.ok(text.indexOf('周三羽毛球夜赛') >= 0);
  assert.ok(text.indexOf('第 1 名') >= 0);
  assert.ok(text.indexOf('8胜2负') >= 0);
});

test('poster handles long event names in share text', () => {
  const text = sharePoster.buildShareText({
    eventName: '2026年第三届深圳市高校羽毛球联赛',
    rank: 5,
    wins: 4,
    losses: 6
  });
  assert.ok(text.indexOf('第 5 名') >= 0);
});
