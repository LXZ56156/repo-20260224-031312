/**
 * 战绩海报生成
 * 1080×1080 PNG，基于 shareCard 布局放大
 * 支持预览、保存到相册、复制分享文案
 */
var shareCard = require('./shareCard');

var POSTER_SIZE = 1080;
var SCALE = POSTER_SIZE / shareCard.DRAW_SIZE.width; // 1080/500 = 2.16
var QR_CENTER_Y = 852;
var QR_RADIUS = 90;
var roundedRect = shareCard._private.roundedRect;

function getPixelRatio(options) {
  var explicitDpr = Number(options && options.dpr);
  if (Number.isFinite(explicitDpr) && explicitDpr > 0) return explicitDpr;
  return 2;
}

// --- 图片加载 ---
function loadPosterImage(canvas, src, options) {
  if (options && typeof options.loadImage === 'function') {
    return options.loadImage(src);
  }
  return shareCard._private.resolveImageSource(src, options).then(function (imageSrc) {
    if (!imageSrc) throw new Error('empty image source');
    return new Promise(function (resolve, reject) {
      var img = canvas.createImage();
      img.onload = function () { resolve(img); };
      img.onerror = function (err) { reject(err || new Error('image load failed')); };
      img.src = imageSrc;
    });
  });
}

// --- 绘制辅助 ---
function drawPosterAvatarPlaceholder(ctx, x, y, size, userName) {
  var centerX = x + size / 2;
  var centerY = y + size / 2;
  var initial = String(userName || '球员').trim().slice(0, 1) || '球';
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#0C5A3B';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 ' + Math.round(size * 0.45) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, centerX, centerY + 1);
  ctx.restore();
}

function drawCoverImageScaled(ctx, image, x, y, width, height) {
  var sourceWidth = Number(image && (image.naturalWidth || image.width)) || width;
  var sourceHeight = Number(image && (image.naturalHeight || image.height)) || height;
  var sourceRatio = sourceWidth / sourceHeight;
  var targetRatio = width / height;
  var sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function measureScaled(ctx, text, size, weight) {
  ctx.font = (weight || 400) + ' ' + size + 'px sans-serif';
  return ctx.measureText(text).width;
}

function normalizePosterEllipsis(text) {
  return String(text || '').replace(/\.{3,}/g, '…');
}

function fitTextScaled(ctx, text, maxWidth, defaultSize, minSize, weight, step) {
  text = normalizePosterEllipsis(text);
  step = step || 2;
  var sz = defaultSize;
  while (sz > minSize && measureScaled(ctx, text, sz, weight) > maxWidth) {
    sz -= step;
  }
  if (measureScaled(ctx, text, sz, weight) <= maxWidth) return { text: text, size: sz };
  var s = text;
  while (s.length > 1 && measureScaled(ctx, s + '…', minSize, weight) > maxWidth) {
    s = s.slice(0, -1);
  }
  return { text: s + '…', size: minSize };
}

function getFontSizeFromContext(ctx) {
  var match = String(ctx && ctx.font || '').match(/(\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : 28;
}

function drawPosterText(ctx, text, x, y) {
  text = normalizePosterEllipsis(text);
  if (text.slice(-1) !== '…') {
    ctx.fillText(text, x, y);
    return;
  }

  var base = text.slice(0, -1);
  var previousAlign = ctx.textAlign || 'left';
  var totalWidth = ctx.measureText(text).width;
  var baseWidth = ctx.measureText(base).width;
  var startX = x;
  if (previousAlign === 'center') {
    startX = x - totalWidth / 2;
  } else if (previousAlign === 'right' || previousAlign === 'end') {
    startX = x - totalWidth;
  }

  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillText(base, startX, y);
  var fontSize = getFontSizeFromContext(ctx);
  var dotRadius = Math.max(1.4, fontSize * 0.045);
  var dotGap = dotRadius * 2.7;
  var ellipsisCenterX = startX + baseWidth + Math.max(fontSize * 0.22, (totalWidth - baseWidth) / 2);
  var dotY = y + fontSize * 0.16;
  ctx.beginPath();
  ctx.arc(ellipsisCenterX - dotGap, dotY, dotRadius, 0, Math.PI * 2);
  ctx.arc(ellipsisCenterX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.arc(ellipsisCenterX + dotGap, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function normalizePosterLabel(value) {
  return normalizePosterEllipsis(value).replace(/\s+/g, ' ').trim();
}

function normalizePosterCapsule(value) {
  var label = normalizePosterLabel(value);
  if (label === '个人榜' || label === '队伍榜') return '';
  return label;
}

function buildPosterTitleTexts(data) {
  var eventName = normalizePosterLabel(data && data.eventName);
  var mode = normalizePosterCapsule(data && data.mode);
  var title = eventName || mode || '羽毛球比赛';
  var capsule = mode || '战绩榜';
  if (capsule === title) {
    capsule = '战绩榜';
  }
  return { title: title, capsule: capsule };
}

function hasVisibleAvatarChange(before, after, size) {
  if (!before || !after || !before.data || !after.data) return true;
  var beforeData = before.data;
  var afterData = after.data;
  var center = size / 2;
  var radius = size / 2 - 2;
  var sampled = 0;
  var changed = 0;
  var diffTotal = 0;
  for (var y = 4; y < size; y += 4) {
    for (var x = 4; x < size; x += 4) {
      var dx = x + 0.5 - center;
      var dy = y + 0.5 - center;
      if (dx * dx + dy * dy > radius * radius) continue;
      var i = (y * size + x) * 4;
      var diff = Math.abs(afterData[i] - beforeData[i]) +
        Math.abs(afterData[i + 1] - beforeData[i + 1]) +
        Math.abs(afterData[i + 2] - beforeData[i + 2]) +
        Math.abs(afterData[i + 3] - beforeData[i + 3]);
      sampled += 1;
      diffTotal += diff;
      if (diff > 8) changed += 1;
    }
  }
  if (!sampled) return true;
  return changed / sampled > 0.03 || diffTotal / sampled > 5;
}

function drawPosterAvatarImage(ctx, image, x, y, size, userName) {
  var before = null;
  if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
    try {
      before = ctx.getImageData(x, y, size, size);
    } catch (e) {
      before = null;
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawCoverImageScaled(ctx, image, x, y, size, size);
  ctx.restore();

  if (before) {
    try {
      var after = ctx.getImageData(x, y, size, size);
      if (!hasVisibleAvatarChange(before, after, size)) {
        ctx.putImageData(before, x, y);
        drawPosterAvatarPlaceholder(ctx, x, y, size, userName);
        return false;
      }
    } catch (e) {}
  }
  return true;
}

function drawNormalPosterBackground(ctx, rank) {
  var gradient = ctx.createLinearGradient(0, 0, 0, POSTER_SIZE);
  gradient.addColorStop(0, '#0C5A3B');
  gradient.addColorStop(1, '#083E2C');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, POSTER_SIZE, POSTER_SIZE);

  var topGlow = ctx.createRadialGradient(540, 240, 80, 540, 240, 560);
  topGlow.addColorStop(0, 'rgba(255,255,255,0.16)');
  topGlow.addColorStop(0.46, 'rgba(255,255,255,0.05)');
  topGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, POSTER_SIZE, POSTER_SIZE);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(78, 198);
  ctx.lineTo(1002, 198);
  ctx.moveTo(156, 890);
  ctx.lineTo(924, 890);
  ctx.moveTo(178, POSTER_SIZE);
  ctx.lineTo(408, 324);
  ctx.moveTo(902, POSTER_SIZE);
  ctx.lineTo(672, 324);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 890);
  ctx.quadraticCurveTo(540, 810, 1080, 890);
  ctx.moveTo(130, 0);
  ctx.lineTo(420, 1080);
  ctx.moveTo(950, 0);
  ctx.lineTo(660, 1080);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 415, 221, 250, 54, 27);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 300, 310, 480, 138, 44);
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 42px sans-serif';
  ctx.fillText('第', 418, 380);
  ctx.font = '800 112px sans-serif';
  ctx.fillText(String(Number(rank) || 4), POSTER_SIZE / 2, 382);
  ctx.font = '700 42px sans-serif';
  ctx.fillText('名', 662, 380);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.20)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 12;
  roundedRect(ctx, 145, 500, 790, 246, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(85.5, 74.5, 49, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fill();
  ctx.restore();
}

// --- 海报生成 ---
async function generatePoster(canvas, data, options) {
  options = options || {};
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('poster canvas is not ready');
  }

  var ctx = canvas.getContext('2d');
  var dpr = getPixelRatio(options);
  canvas.width = Math.round(POSTER_SIZE * dpr);
  canvas.height = Math.round(POSTER_SIZE * dpr);
  ctx.scale(canvas.width / POSTER_SIZE, canvas.height / POSTER_SIZE);
  ctx.clearRect(0, 0, POSTER_SIZE, POSTER_SIZE);
  ctx.textBaseline = 'middle';

  var d = {
    userName: '', eventName: '', mode: '',
    wins: 0, losses: 0, winRate: '0%',
    totalMatches: null, maxWinStreak: 0, avgScore: '',
    rank: 1, avatarUrl: '', qrCodeUrl: ''
  };
  if (data) {
    Object.keys(d).forEach(function (k) { if (data[k] !== undefined && data[k] !== null) d[k] = data[k]; });
  }

  var winsNum = Number(d.wins) || 0;
  var lossesNum = Number(d.losses) || 0;
  var total = (d.totalMatches != null) ? Number(d.totalMatches) : (winsNum + lossesNum);
  if (total < winsNum + lossesNum) total = winsNum + lossesNum;

  var fmt = shareCard._private;

  // 1. 背景
  var bgPath = shareCard.getBgPath(Number(d.rank));
  var isNormalBg = bgPath === shareCard.NORMAL_BG_COLOR;
  if (bgPath === shareCard.NORMAL_BG_COLOR) {
    drawNormalPosterBackground(ctx, d.rank);
  } else {
    try {
      var bgImg = await loadPosterImage(canvas, bgPath, options);
      ctx.drawImage(bgImg, 0, 0, POSTER_SIZE, POSTER_SIZE);
    } catch (e) {
      drawNormalPosterBackground(ctx, d.rank);
      isNormalBg = true;
    }
  }

  // 2. 头像
  var avatarX = 39;
  var avatarY = 27;
  var avatarSize = 88;
  if (d.avatarUrl) {
    try {
      var avi = await loadPosterImage(canvas, d.avatarUrl, options);
      drawPosterAvatarImage(ctx, avi, avatarX, avatarY, avatarSize, d.userName);
    } catch (e) {
      drawPosterAvatarPlaceholder(ctx, avatarX, avatarY, avatarSize, d.userName);
    }
  } else {
    drawPosterAvatarPlaceholder(ctx, avatarX, avatarY, avatarSize, d.userName);
  }

  // 3. 昵称
  var userName = String(d.userName || '球员');
  var nameX = 168;
  var nameY = 80;
  var maxNameW = 170;
  var uf = fitTextScaled(ctx, userName, maxNameW, 34, 26, 600, 2);
  ctx.font = '600 ' + uf.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? '#FFFFFF' : '#1D2420';
  ctx.textAlign = 'left';
  drawPosterText(ctx, uf.text, nameX, nameY);
  var nameW = ctx.measureText(uf.text).width;

  ctx.font = '400 27px sans-serif';
  ctx.fillStyle = isNormalBg ? 'rgba(255,255,255,0.72)' : '#6F7B74';
  ctx.fillText('的比赛战绩', nameX + nameW + 12, nameY);

  // 4. 赛事名
  var titleTexts = buildPosterTitleTexts(d);
  var ef = fitTextScaled(ctx, titleTexts.title, 560, 62, 40, 800, 4);
  ctx.font = '800 ' + ef.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? '#FFFFFF' : '#00462E';
  ctx.textAlign = 'center';
  drawPosterText(ctx, ef.text, POSTER_SIZE / 2, 162);

  // 5. 模式标签
  var mf = fitTextScaled(ctx, titleTexts.capsule, 225, 30, 24, 500, 2);
  ctx.font = '500 ' + mf.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? 'rgba(255,255,255,0.86)' : '#0C5A3B';
  ctx.textAlign = 'center';
  drawPosterText(ctx, mf.text, POSTER_SIZE / 2, 248);

  // 6. 战绩三列
  var winRateText = fmt.fmtWinRate(d.winRate, winsNum, total);
  var hasDecimal = winRateText.indexOf('.') >= 0;
  var wrSz = winRateText.length <= 3 ? 74 : (hasDecimal ? 64 : 68);

  var columns = [
    { val: fmt.fmtCount(winsNum), label: '胜场', cx: 264, sz: 78 },
    { val: fmt.fmtCount(lossesNum), label: '负场', cx: 540, sz: 78 },
    { val: winRateText, label: '胜率', cx: 816, sz: wrSz }
  ];

  ctx.fillStyle = '#00462E';
  ctx.textAlign = 'center';
  columns.forEach(function (c) {
    ctx.font = '800 ' + c.sz + 'px sans-serif';
    ctx.fillText(c.val, c.cx, 574);
  });

  ctx.font = '500 32px sans-serif';
  ctx.fillStyle = '#587367';
  columns.forEach(function (c) {
    ctx.fillText(c.label, c.cx, 637);
  });

  // 7. 小标签
  var pillTexts = fmt.buildPillTexts(d, total);
  var pills = [
    { text: pillTexts[0], cx: 264, maxW: 143 },
    { text: pillTexts[1], cx: 540, maxW: 177 },
    { text: pillTexts[2], cx: 816, maxW: 181 }
  ];
  ctx.fillStyle = '#0C5A3B';
  pills.forEach(function (p) {
    if (!p.text) return;
    var pf = fitTextScaled(ctx, p.text, p.maxW, 26, 22, 500, 2);
    ctx.font = '500 ' + pf.size + 'px sans-serif';
    drawPosterText(ctx, pf.text, p.cx, 693);
  });

  // 8. 小程序码 — 圆形裁剪，放大版
  if (d.qrCodeUrl) {
    try {
      var qr = await loadPosterImage(canvas, d.qrCodeUrl, options);
      ctx.save();
      ctx.beginPath();
      ctx.arc(POSTER_SIZE / 2, QR_CENTER_Y, QR_RADIUS, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(qr, POSTER_SIZE / 2 - QR_RADIUS, QR_CENTER_Y - QR_RADIUS, QR_RADIUS * 2, QR_RADIUS * 2);
      ctx.restore();
    } catch (e) {}
  }

  if (isNormalBg) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '400 30px sans-serif';
    ctx.fillText('扫码查看完整战绩', POSTER_SIZE / 2, 985);
    ctx.font = '400 26px sans-serif';
    ctx.fillText('羽球轮转助手', POSTER_SIZE / 2, 1030);
  }

  return exportPoster(canvas, options);
}

function exportPoster(canvas, options) {
  if (options && typeof options.exportCanvas === 'function') {
    return Promise.resolve(options.exportCanvas(canvas, { width: POSTER_SIZE, height: POSTER_SIZE }));
  }

  if (typeof wx === 'undefined' || typeof wx.canvasToTempFilePath !== 'function') {
    return Promise.reject(new Error('wx.canvasToTempFilePath is not available'));
  }

  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      width: POSTER_SIZE,
      height: POSTER_SIZE,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: reject
    });
  });
}

// --- 分享文案 ---
function buildShareText(data) {
  var d = data || {};
  var eventName = String(d.eventName || '羽毛球比赛');
  var rank = Number(d.rank) || 1;
  var winsNum = Number(d.wins) || 0;
  var lossesNum = Number(d.losses) || 0;
  return '「' + eventName + '」赛事结果：' + winsNum + '胜' + lossesNum + '负，排名第 ' + rank + ' — 羽球轮转助手';
}

// --- 保存到相册 ---
function savePosterToAlbum(imageUrl) {
  if (typeof wx === 'undefined') return Promise.reject(new Error('not in miniapp env'));
  return new Promise(function (resolve, reject) {
    wx.saveImageToPhotosAlbum({
      filePath: imageUrl,
      success: function () {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
        resolve();
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('auth deny') >= 0) {
          wx.showToast({ title: '请授权保存图片', icon: 'none' });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
        reject(err);
      }
    });
  });
}

// --- 复制文案 ---
function copyShareText(data) {
  var text = buildShareText(data);
  if (typeof wx === 'undefined' || typeof wx.setClipboardData !== 'function') return;
  wx.setClipboardData({
    data: text,
    success: function () {
      wx.showToast({ title: '文案已复制', icon: 'success' });
    }
  });
}

module.exports = {
  POSTER_SIZE: POSTER_SIZE,
  generatePoster: generatePoster,
  buildShareText: buildShareText,
  savePosterToAlbum: savePosterToAlbum,
  copyShareText: copyShareText,
  _private: {
    drawPosterAvatarPlaceholder: drawPosterAvatarPlaceholder,
    drawCoverImageScaled: drawCoverImageScaled,
    fitTextScaled: fitTextScaled,
    buildPosterTitleTexts: buildPosterTitleTexts,
    hasVisibleAvatarChange: hasVisibleAvatarChange,
    drawNormalPosterBackground: drawNormalPosterBackground,
    exportPoster: exportPoster
  }
};
