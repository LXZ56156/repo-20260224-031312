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

function makePosterBgDataUrl(fill = '#f6efe2') {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  return canvas.toDataURL('image/png');
}

function makePosterBgWithAvatarRingDataUrl() {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f0e7';
  ctx.fillRect(0, 0, sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  ctx.strokeStyle = '#00462E';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(85.5, 74.5, 49, 0, Math.PI * 2);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

function makeSolidDataUrl(fill, size = 220) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}

function makeTransparentDataUrl(size = 220) {
  const canvas = createCanvas(size, size);
  return canvas.toDataURL('image/png');
}

test('poster title uses event name and capsule uses mode without duplicate labels', () => {
  const build = sharePoster._private.buildPosterTitleTexts;

  assert.deepEqual(build({ eventName: '林丹馆4.2', mode: '多人转' }), {
    title: '林丹馆4.2',
    capsule: '多人转'
  });
  assert.deepEqual(build({ eventName: '周末8人转', mode: '多人转' }), {
    title: '周末8人转',
    capsule: '多人转'
  });
  assert.deepEqual(build({ eventName: '多人转测试赛', mode: '8人转' }), {
    title: '多人转测试赛',
    capsule: '8人转'
  });
  assert.deepEqual(build({ eventName: '多人转', mode: '多人转' }), {
    title: '多人转',
    capsule: '战绩榜'
  });
  assert.deepEqual(build({ eventName: '林丹馆4.2', mode: '个人榜' }), {
    title: '林丹馆4.2',
    capsule: '战绩榜'
  });
});

test('poster text fitting uses Chinese ellipsis and the tightened title width', () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const ctx = canvas.getContext('2d');
  const fit = sharePoster._private.fitTextScaled;
  const longName = fit(ctx, '黎子轩超长昵称测试A队队长', 170, 34, 26, 600, 2);
  const longTitle = fit(ctx, '2026年深圳湾羽毛球超级长赛事名称测试多人轮转积分赛', 560, 62, 40, 800, 4);
  const sanitized = fit(ctx, '手动输入...测试', 200, 34, 26, 600, 2);

  assert.equal(longName.text.includes('...'), false);
  assert.equal(longTitle.text.includes('...'), false);
  assert.equal(sanitized.text.includes('...'), false);
  assert.ok(longName.text.endsWith('…'));
  assert.ok(longTitle.text.endsWith('…'));
  assert.ok(sanitized.text.includes('…'));
});

test('poster generates 1080×1080 image for top 3 rank', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  let exportedWidth = 0;
  let exportedHeight = 0;

  const result = await sharePoster.generatePoster(canvas, {
    userName: '林夏',
    eventName: '周三羽毛球夜赛',
    mode: '多人转',
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

test('poster handles normal rank (≥4) with readable fallback layout', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  const result = await sharePoster.generatePoster(canvas, {
    userName: '李四',
    eventName: '测试赛',
    mode: '多人转',
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
    exportCanvas(targetCanvas) {
      const ctx = targetCanvas.getContext('2d');
      const panelPixel = ctx.getImageData(540, 520, 1, 1).data;
      assert.ok(panelPixel[0] > 220 && panelPixel[1] > 220 && panelPixel[2] > 220, 'normal poster stats panel should be light');
      const footer = ctx.getImageData(380, 960, 320, 90).data;
      let lightPixels = 0;
      for (let i = 0; i < footer.length; i += 4) {
        if (footer[i] > 210 && footer[i + 1] > 210 && footer[i + 2] > 210 && footer[i + 3] > 0) lightPixels += 1;
      }
      assert.ok(lightPixels > 400, 'normal poster should keep a readable footer');
      return 'poster-normal.png';
    }
  });
  assert.equal(result, 'poster-normal.png');
});

test('poster keeps medal footer pixels from the fixed background', async () => {
  const medalCanvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  let medalFooterPixel = null;
  await sharePoster.generatePoster(medalCanvas, {
    userName: '林夏',
    eventName: '奖牌背景测试',
    rank: 1,
    avatarUrl: '',
    qrCodeUrl: ''
  }, {
    dpr: 1,
    loadImage() {
      return loadImage(makePosterBgDataUrl('#ffffff'));
    },
    exportCanvas(targetCanvas) {
      medalFooterPixel = Array.from(targetCanvas.getContext('2d').getImageData(540, 1030, 1, 1).data);
      return 'poster-medal-footer.png';
    }
  });

  assert.deepEqual(medalFooterPixel, [255, 255, 255, 255]);
});

test('poster leaves the fixed avatar ring visible around a white avatar', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  let ringPixel = null;
  await sharePoster.generatePoster(canvas, {
    userName: 'LZX',
    eventName: '纯白头像测试',
    rank: 3,
    avatarUrl: makeSolidDataUrl('#ffffff', 180),
    qrCodeUrl: ''
  }, {
    dpr: 1,
    loadImage(src) {
      if (src.indexOf('cloud://') === 0) return loadImage(makePosterBgWithAvatarRingDataUrl());
      return loadImage(src);
    },
    exportCanvas(targetCanvas) {
      ringPixel = Array.from(targetCanvas.getContext('2d').getImageData(85, 25, 1, 1).data);
      return 'poster-white-avatar-frame.png';
    }
  });

  assert.notDeepEqual(ringPixel, [255, 255, 255, 255]);
});

test('poster keeps a real pure white avatar but falls back for transparent avatars', async () => {
  async function renderAvatarPixel(avatarUrl, userName) {
    const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
    let pixel = null;
    await sharePoster.generatePoster(canvas, {
      userName,
      eventName: '头像测试',
      rank: 1,
      avatarUrl,
      qrCodeUrl: ''
    }, {
      dpr: 1,
      loadImage(src) {
        if (src.indexOf('cloud://') === 0) return loadImage(makePosterBgWithAvatarRingDataUrl());
        return loadImage(src);
      },
      exportCanvas(targetCanvas) {
        pixel = Array.from(targetCanvas.getContext('2d').getImageData(49, 71, 1, 1).data);
        return 'poster-avatar-test.png';
      }
    });
    return pixel;
  }

  const whitePixel = await renderAvatarPixel(makeSolidDataUrl('#ffffff', 180), '白');
  const transparentPixel = await renderAvatarPixel(makeTransparentDataUrl(180), '透');

  assert.deepEqual(whitePixel, [255, 255, 255, 255]);
  assert.ok(transparentPixel[1] > transparentPixel[0], 'transparent avatar should be replaced by green fallback');
  assert.ok(transparentPixel[1] > transparentPixel[2], 'transparent avatar should be replaced by green fallback');
});

test('poster draws QR inside the fixed bottom white circle without a custom base', async () => {
  const canvas = createCanvas(sharePoster.POSTER_SIZE, sharePoster.POSTER_SIZE);
  let centerPixel = null;
  let outerPixel = null;
  await sharePoster.generatePoster(canvas, {
    userName: '李四',
    eventName: '二维码位置测试',
    rank: 1,
    avatarUrl: '',
    qrCodeUrl: makeSolidDataUrl('#ff0000', 220)
  }, {
    dpr: 1,
    loadImage(src) {
      if (src.indexOf('cloud://') === 0) return loadImage(makePosterBgDataUrl('#ffffff'));
      return loadImage(src);
    },
    exportCanvas(targetCanvas) {
      const ctx = targetCanvas.getContext('2d');
      centerPixel = Array.from(ctx.getImageData(540, 852, 1, 1).data);
      outerPixel = Array.from(ctx.getImageData(540, 760, 1, 1).data);
      return 'poster-fixed-qr.png';
    }
  });

  assert.ok(centerPixel[0] > 240 && centerPixel[1] < 10 && centerPixel[2] < 10, 'QR should be centered at y=852');
  assert.deepEqual(outerPixel, [255, 255, 255, 255]);
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
  assert.ok(text.indexOf('排名第 1') >= 0);
  assert.ok(text.indexOf('8胜2负') >= 0);
});

test('poster handles long event names in share text', () => {
  const text = sharePoster.buildShareText({
    eventName: '2026年第三届深圳市高校羽毛球联赛',
    rank: 5,
    wins: 4,
    losses: 6
  });
  assert.ok(text.indexOf('排名第 5') >= 0);
});
