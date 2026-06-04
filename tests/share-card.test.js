const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas, loadImage } = require('canvas');

const shareCard = require('../miniprogram/core/shareCard');

function makeDataUrl() {
  const canvas = createCanvas(120, 120);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b6f4d';
  ctx.fillRect(0, 0, 120, 120);
  ctx.fillStyle = '#fff';
  ctx.fillRect(32, 32, 56, 56);
  return canvas.toDataURL('image/png');
}

test('shareCard formats fallback win rate from wins and total', () => {
  const fmtWinRate = shareCard._private.fmtWinRate;
  assert.equal(fmtWinRate('0%', 8, 10), '80%');
  assert.equal(fmtWinRate('', 5, 8), '62.5%');
  assert.equal(fmtWinRate(0.875, 0, 0), '87.5%');
  assert.equal(fmtWinRate('100%', 10, 10), '100%');
});

test('shareCard keeps avg score at one decimal place', () => {
  const fmtAvgScore = shareCard._private.fmtAvgScore;
  assert.equal(fmtAvgScore(16), '16.0');
  assert.equal(fmtAvgScore(16.26), '16.3');
  assert.equal(fmtAvgScore(120), '99.9');
});

test('shareCard keeps zero-value summary pills visible', () => {
  assert.deepEqual(shareCard._private.buildPillTexts({
    totalMatches: 0,
    maxWinStreak: 0,
    avgScore: 0
  }, 0), ['共0场', '连胜0场', '场均得分0.0']);
});

test('shareCard uses medal backgrounds for top three and fallback color for others', () => {
  assert.equal(shareCard.getBgPath(1), shareCard.BG_CLOUD_PATHS[1]);
  assert.equal(shareCard.getBgPath(2), shareCard.BG_CLOUD_PATHS[2]);
  assert.equal(shareCard.getBgPath(3), shareCard.BG_CLOUD_PATHS[3]);
  assert.equal(shareCard.getBgPath(4), shareCard.NORMAL_BG_COLOR);
  assert.equal(shareCard.getBgPath(0), shareCard.NORMAL_BG_COLOR);
});

test('shareCard draws non-medal ranks with fallback color instead of rejecting', async () => {
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, shareCard.DRAW_SIZE.height);
  let drawnBg = false;
  const result = await shareCard.drawShareCard(canvas, { rank: 4, userName: '测试', eventName: '测试赛' }, {
    dpr: 1,
    loadImage,
    exportCanvas(targetCanvas) {
      // Verify the background was filled with NORMAL_BG_COLOR
      const pixel = targetCanvas.getContext('2d').getImageData(250, 250, 1, 1).data;
      assert.deepEqual(Array.from(pixel), [12, 90, 59, 255]); // #0C5A3B
      drawnBg = true;
      return 'test.png';
    }
  });
  assert.equal(result, 'test.png');
  assert.equal(drawnBg, true);
});

test('shareCard resolves cloud and network image sources to local paths', async () => {
  const resolveImageSource = shareCard._private.resolveImageSource;
  shareCard._private._clearImagePathCache();

  let getImageInfoCalls = 0;
  let downloadCalls = 0;
  const wx = {
    getImageInfo(options) {
      getImageInfoCalls += 1;
      options.success({ path: `/tmp/from-info-${getImageInfoCalls}.png` });
    },
    cloud: {
      downloadFile(options) {
        downloadCalls += 1;
        options.success({ tempFilePath: `/tmp/from-cloud-${downloadCalls}.png` });
      }
    }
  };

  const cloudPath = await resolveImageSource('cloud://env/share-cards/a.png', { wx, now: 1000 });
  const cachedCloudPath = await resolveImageSource('cloud://env/share-cards/a.png', { wx, now: 2000 });
  const networkPath = await resolveImageSource('https://thirdwx.qlogo.cn/avatar.png', { wx, now: 3000 });

  assert.equal(cloudPath, '/tmp/from-cloud-1.png');
  assert.equal(cachedCloudPath, '/tmp/from-cloud-1.png');
  assert.equal(networkPath, '/tmp/from-info-1.png');
  assert.equal(downloadCalls, 1);
  assert.equal(getImageInfoCalls, 1);
});

test('shareCard center-crops rectangular avatars before drawing', () => {
  const calls = [];
  const ctx = {
    drawImage(...args) {
      calls.push(args);
    }
  };
  const drawCoverImage = shareCard._private.drawCoverImage;

  drawCoverImage(ctx, { width: 240, height: 120 }, 19, 14, 41, 41);
  drawCoverImage(ctx, { width: 120, height: 240 }, 19, 14, 41, 41);

  assert.deepEqual(calls[0], [{ width: 240, height: 120 }, 60, 0, 120, 120, 19, 14, 41, 41]);
  assert.deepEqual(calls[1], [{ width: 120, height: 240 }, 0, 60, 120, 120, 19, 14, 41, 41]);
});

test('shareCard draws with 5:4 aspect ratio for chat card', async () => {
  const bgDataUrl = makeDataUrl();
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, 400);
  let exportedSize = null;

  await shareCard.drawShareCard(canvas, {
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
    avatarUrl: makeDataUrl()
  }, {
    dpr: 1,
    aspectRatio: '5:4',
    loadImage,
    resolveImageSource(src) {
      if (shareCard._private.isCloudPath(src)) return bgDataUrl;
      return undefined;
    },
    exportCanvas(targetCanvas, size) {
      exportedSize = size;
      return 'chat-card.png';
    }
  });

  assert.equal(exportedSize.width, 500);
  assert.equal(exportedSize.height, 400);
});

test('shareCard handles very long event names gracefully', async () => {
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, shareCard.DRAW_SIZE.height);
  const longName = '2026年第三届深圳市高校羽毛球联赛暨大湾区邀请赛决赛阶段';
  const result = await shareCard.drawShareCard(canvas, {
    userName: '林夏',
    eventName: longName,
    mode: '个人榜',
    wins: 3,
    losses: 1,
    winRate: '75%',
    totalMatches: 4,
    rank: 2,
    avatarUrl: ''
  }, {
    dpr: 1,
    loadImage,
    exportCanvas() { return 'long-name.png'; }
  });
  assert.equal(result, 'long-name.png');
});

test('shareCard draws a visible fallback avatar when no avatar image is available', () => {
  const canvas = createCanvas(80, 80);
  const ctx = canvas.getContext('2d');

  shareCard._private.drawAvatarPlaceholder(ctx, '');

  assert.deepEqual(Array.from(ctx.getImageData(39, 18, 1, 1).data), [12, 90, 59, 255]);
});

test('shareCard draws with node-canvas adapters', async () => {
  const bgDataUrl = makeDataUrl();
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, shareCard.DRAW_SIZE.height);
  let exported = false;

  const result = await shareCard.drawShareCard(canvas, {
    userName: '林夏',
    eventName: '周三羽毛球夜赛',
    mode: '个人榜',
    wins: 8,
    losses: 2,
    winRate: '0%',
    totalMatches: 10,
    maxWinStreak: 5,
    avgScore: 18.2,
    rank: 1,
    avatarUrl: makeDataUrl(),
    qrCodeUrl: makeDataUrl()
  }, {
    dpr: 1,
    loadImage,
    resolveImageSource(src) {
      if (shareCard._private.isCloudPath(src)) return bgDataUrl;
      return undefined;
    },
    exportCanvas(targetCanvas) {
      exported = true;
      const pixel = targetCanvas.getContext('2d').getImageData(250, 266, 1, 1).data;
      assert.notDeepEqual(Array.from(pixel), [0, 0, 0, 0]);
      return 'node-preview.png';
    }
  });

  assert.equal(result, 'node-preview.png');
  assert.equal(exported, true);
});
