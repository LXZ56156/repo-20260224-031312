/**
 * 分享卡片 Canvas 叠加层
 * 固定背景图 + 动态头像/文字/小程序码叠加
 * 所有坐标基于 500×500 设计坐标系
 */
var DESIGN_W = 500;
var DESIGN_H = 500;
var IMAGE_PATH_CACHE_TTL_MS = 50 * 60 * 1000;
var AVATAR_FRAME = { x: 19, y: 14, size: 41 };
var systemInfo = require('./systemInfo');

var BG_CLOUD_PATHS = {
  1: 'cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-gold.png',
  2: 'cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-silver.png',
  3: 'cloud://cloud1-1ghmqjyt6428702b.636c-cloud1-1ghmqjyt6428702b-1403446496/share-cards/share-bg-bronze.png'
};

var NORMAL_BG_COLOR = '#0C5A3B';

var imagePathCache = {};

function roundedRect(ctx, x, y, width, height, radius) {
  var r = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getBgPath(rank) {
  var value = Number(rank);
  if (!Number.isInteger(value) || value < 1) return NORMAL_BG_COLOR;
  return BG_CLOUD_PATHS[value] || NORMAL_BG_COLOR;
}

function nowMs(options) {
  var value = Number(options && options.now);
  return Number.isFinite(value) ? value : Date.now();
}

function getWxApi(options) {
  if (options && options.wx) return options.wx;
  if (typeof wx !== 'undefined') return wx;
  return null;
}

function isCloudPath(src) {
  return String(src || '').trim().indexOf('cloud://') === 0;
}

function isNetworkPath(src) {
  return /^https?:\/\//i.test(String(src || '').trim());
}

function getCachedPath(src, options) {
  var key = String(src || '').trim();
  var entry = imagePathCache[key];
  if (!entry || !entry.path) return '';
  if (Number(entry.expiresAt) && Number(entry.expiresAt) <= nowMs(options)) {
    delete imagePathCache[key];
    return '';
  }
  return entry.path;
}

function setCachedPath(src, path, options) {
  var key = String(src || '').trim();
  var value = String(path || '').trim();
  if (!key || !value) return value;
  imagePathCache[key] = {
    path: value,
    expiresAt: nowMs(options) + IMAGE_PATH_CACHE_TTL_MS
  };
  return value;
}

function callGetImageInfo(wxApi, src) {
  if (!wxApi || typeof wxApi.getImageInfo !== 'function') return Promise.resolve('');
  return new Promise(function (resolve) {
    wxApi.getImageInfo({
      src: src,
      success: function (res) {
        resolve(String(res && res.path || src || '').trim());
      },
      fail: function () {
        resolve('');
      }
    });
  });
}

function callCloudDownload(wxApi, fileID) {
  if (!wxApi || !wxApi.cloud || typeof wxApi.cloud.downloadFile !== 'function') return Promise.resolve('');
  return new Promise(function (resolve) {
    wxApi.cloud.downloadFile({
      fileID: fileID,
      success: function (res) {
        resolve(String(res && res.tempFilePath || '').trim());
      },
      fail: function () {
        resolve('');
      }
    });
  });
}

function callCloudTempUrl(wxApi, fileID) {
  if (!wxApi || !wxApi.cloud || typeof wxApi.cloud.getTempFileURL !== 'function') return Promise.resolve('');
  return wxApi.cloud.getTempFileURL({ fileList: [fileID] }).then(function (res) {
    var list = (res && res.fileList) || [];
    var item = list[0] || {};
    var status = item.status;
    var statusOk = status === undefined || status === null || Number(status) === 0;
    return statusOk ? String(item.tempFileURL || '').trim() : '';
  }).catch(function () {
    return '';
  });
}

async function resolveImageSource(src, options) {
  var value = String(src || '').trim();
  if (!value) return '';

  if (options && typeof options.resolveImageSource === 'function') {
    var custom = await options.resolveImageSource(value);
    if (custom !== undefined && custom !== null) return String(custom || '').trim();
  }

  var cached = getCachedPath(value, options);
  if (cached) return cached;

  var wxApi = getWxApi(options);
  if (isCloudPath(value)) {
    var localPath = await callCloudDownload(wxApi, value);
    if (localPath) return setCachedPath(value, localPath, options);

    var tempUrl = await callCloudTempUrl(wxApi, value);
    if (tempUrl) {
      var tempLocal = await callGetImageInfo(wxApi, tempUrl);
      return setCachedPath(value, tempLocal || tempUrl, options);
    }
    return value;
  }

  if (isNetworkPath(value)) {
    var infoPath = await callGetImageInfo(wxApi, value);
    return infoPath ? setCachedPath(value, infoPath, options) : value;
  }

  return value;
}

async function loadImage(canvas, src, options) {
  var imageSrc = await resolveImageSource(src, options);
  if (!imageSrc) throw new Error('empty image source');
  if (options && typeof options.loadImage === 'function') {
    return options.loadImage(imageSrc, { originalSrc: src });
  }
  if (!canvas || typeof canvas.createImage !== 'function') {
    throw new Error('canvas.createImage is not available');
  }
  return new Promise(function (resolve, reject) {
    var img = canvas.createImage();
    img.onload = function () { resolve(img); };
    img.onerror = function (err) { reject(err || new Error('image load failed')); };
    img.src = imageSrc;
  });
}

function drawCoverImage(ctx, image, x, y, width, height) {
  var sourceWidth = Number(image && (image.naturalWidth || image.width)) || width;
  var sourceHeight = Number(image && (image.naturalHeight || image.height)) || height;
  var sourceRatio = sourceWidth / sourceHeight;
  var targetRatio = width / height;
  var sx = 0;
  var sy = 0;
  var sw = sourceWidth;
  var sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawAvatarPlaceholder(ctx, userName) {
  var center = AVATAR_FRAME.x + AVATAR_FRAME.size / 2;
  var initial = String(userName || '球员').trim().slice(0, 1) || '球';
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, AVATAR_FRAME.y + AVATAR_FRAME.size / 2, AVATAR_FRAME.size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#0C5A3B';
  ctx.fillRect(AVATAR_FRAME.x, AVATAR_FRAME.y, AVATAR_FRAME.size, AVATAR_FRAME.size);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, center, AVATAR_FRAME.y + AVATAR_FRAME.size / 2 + 1);
  ctx.restore();
}

function drawNormalShareBackground(ctx, designH, rank) {
  var heightRatio = designH / DESIGN_H;
  var gradient = ctx.createLinearGradient(0, 0, 0, designH);
  gradient.addColorStop(0, '#0C5A3B');
  gradient.addColorStop(1, '#083E2C');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, DESIGN_W, designH);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(36, 92 * heightRatio);
  ctx.lineTo(464, 92 * heightRatio);
  ctx.moveTo(76, designH - 92);
  ctx.lineTo(424, designH - 92);
  ctx.moveTo(82, designH);
  ctx.lineTo(188, 150 * heightRatio);
  ctx.moveTo(418, designH);
  ctx.lineTo(312, 150 * heightRatio);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 190, 103 * heightRatio, 120, 24, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  var rankY = designH === 400 ? 112 : 154;
  var rankH = designH === 400 ? 56 : 66;
  var rankRadius = designH === 400 ? 18 : 22;
  var rankCenterY = rankY + rankH / 2;
  ctx.save();
  roundedRect(ctx, 142, rankY, 216, rankH, rankRadius);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 ' + (designH === 400 ? 18 : 20) + 'px sans-serif';
  ctx.fillText('第', 193, rankCenterY);
  ctx.font = '800 ' + (designH === 400 ? 44 : 54) + 'px sans-serif';
  ctx.fillText(String(Number(rank) || 4), 250, rankCenterY + 1);
  ctx.font = '700 ' + (designH === 400 ? 18 : 20) + 'px sans-serif';
  ctx.fillText('名', 307, rankCenterY);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 70, 222 * heightRatio, 360, 126 * heightRatio, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_FRAME.x + AVATAR_FRAME.size / 2, AVATAR_FRAME.y + AVATAR_FRAME.size / 2, AVATAR_FRAME.size / 2 + 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fill();
  ctx.restore();
}

function drawChatFooterPatch(ctx) {
  ctx.save();
  roundedRect(ctx, 150, 282, 200, 96, 34);
  ctx.fillStyle = 'rgba(7, 74, 50, 0.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText('点击查看完整战绩', DESIGN_W / 2, 326);
  ctx.font = '400 11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.fillText('羽球轮转助手', DESIGN_W / 2, 350);
  ctx.restore();
}

function drawNormalShareFooter(ctx, designH, hasQrCode) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '500 13px sans-serif';
  if (hasQrCode && designH === DESIGN_H) {
    ctx.fillText('扫码查看完整战绩', DESIGN_W / 2, 456);
    ctx.font = '400 12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.54)';
    ctx.fillText('羽球轮转助手', DESIGN_W / 2, 476);
  } else {
    ctx.fillText('羽球轮转助手', DESIGN_W / 2, designH - 24);
  }
  ctx.restore();
}

// 测量文本宽度
function measure(ctx, text, size, weight) {
  ctx.font = (weight || 400) + ' ' + size + 'px sans-serif';
  return ctx.measureText(text).width;
}

// 按规则逐级缩小字号；仍超宽则截断加省略号
function fitText(ctx, text, maxWidth, defaultSize, minSize, weight, step) {
  step = step || 2;
  var sz = defaultSize;
  while (sz > minSize && measure(ctx, text, sz, weight) > maxWidth) {
    sz -= step;
  }
  if (measure(ctx, text, sz, weight) <= maxWidth) return { text: text, size: sz };
  var s = text;
  while (s.length > 1 && measure(ctx, s + '…', minSize, weight) > maxWidth) {
    s = s.slice(0, -1);
  }
  return { text: s + '…', size: minSize };
}

// 按中文字符数分级定字号：长标题降权，不抢主视觉
function eventTitleSize(_ctx, text) {
  var charCount = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
  var latins = (text.match(/[a-zA-Z0-9]/g) || []).length;
  var w = charCount + latins * 0.5;
  if (w <= 6) return 32;
  if (w <= 10) return 30;
  if (w <= 14) return 26;
  return 24;
}

// --- 数据格式化 ---
function fmtCount(n) {
  var v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '0';
  return v > 99 ? '99+' : String(Math.floor(v));
}

function fmtAvgScore(s) {
  var v = Number(s);
  if (!Number.isFinite(v) || v < 0) return '';
  return v > 99.9 ? '99.9' : v.toFixed(1);
}

function fmtWinRate(value, wins, total) {
  var raw = String(value || '').trim();
  var winsNum = Number(wins) || 0;
  var totalNum = Number(total) || 0;
  if ((!raw || raw === '0' || raw === '0%') && winsNum > 0 && totalNum > 0) {
    raw = String(Math.round((winsNum * 1000) / totalNum) / 10) + '%';
  }
  if (!raw || raw === '0') return '0%';
  if (raw.indexOf('%') >= 0) return raw;

  var numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  if (numeric >= 0 && numeric <= 1) return String(Math.round(numeric * 1000) / 10) + '%';
  return String(Math.round(numeric * 10) / 10) + '%';
}

function buildPillTexts(data, total) {
  var d = data || {};
  return [
    '共' + fmtCount(total) + '场',
    '连胜' + fmtCount(d.maxWinStreak) + '场',
    '场均得分' + (fmtAvgScore(d.avgScore) || '0.0')
  ];
}

function getPixelRatio(options) {
  var explicitDpr = Number(options && options.dpr);
  if (Number.isFinite(explicitDpr) && explicitDpr > 0) return explicitDpr;
  var info = systemInfo.getWindowMetrics();
  var dpr = Number(info && info.pixelRatio);
  if (Number.isFinite(dpr) && dpr > 0) return dpr;
  return 2;
}

function exportCanvas(canvas, designH, options) {
  designH = designH || DESIGN_H;
  if (options && typeof options.exportCanvas === 'function') {
    return Promise.resolve(options.exportCanvas(canvas, { width: DESIGN_W, height: designH }));
  }

  var wxApi = getWxApi(options);
  if (!wxApi || typeof wxApi.canvasToTempFilePath !== 'function') {
    return Promise.reject(new Error('wx.canvasToTempFilePath is not available'));
  }

  return new Promise(function (resolve, reject) {
    wxApi.canvasToTempFilePath({
      canvas: canvas,
      width: DESIGN_W,
      height: designH,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: reject
    });
  });
}

// --- 主绘制 ---
async function drawShareCard(canvas, data, options) {
  options = options || {};
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('share card canvas is not ready');
  }

  var aspectRatio = String(options.aspectRatio || '1:1').trim();
  var designH = aspectRatio === '5:4' ? 400 : DESIGN_H;
  var heightRatio = designH / DESIGN_H;

  var ctx = canvas.getContext('2d');
  var dpr = getPixelRatio(options);
  canvas.width = Math.round(DESIGN_W * dpr);
  canvas.height = Math.round(designH * dpr);
  ctx.scale(canvas.width / DESIGN_W, canvas.height / designH);
  ctx.clearRect(0, 0, DESIGN_W, designH);
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

  // 数据合理性修正
  var winsNum = Number(d.wins) || 0;
  var lossesNum = Number(d.losses) || 0;
  var total = (d.totalMatches != null) ? Number(d.totalMatches) : (winsNum + lossesNum);
  if (total < winsNum + lossesNum) total = winsNum + lossesNum;

  var rank = Number(d.rank);
  var bgPath = getBgPath(rank);
  var isNormalBg = bgPath === NORMAL_BG_COLOR;

  // 1. 背景
  if (isNormalBg) {
    drawNormalShareBackground(ctx, designH, rank);
  } else {
    try {
      var bg = await loadImage(canvas, bgPath, options);
      ctx.drawImage(bg, 0, 0, DESIGN_W, designH);
      if (aspectRatio === '5:4') drawChatFooterPatch(ctx);
    } catch (e) {
      drawNormalShareBackground(ctx, designH, rank);
      isNormalBg = true;
    }
  }

  // 2. 头像：首字占位确保空头像和加载失败时仍有完整视觉
  drawAvatarPlaceholder(ctx, d.userName);
  if (d.avatarUrl) {
    try {
      var avi = await loadImage(canvas, d.avatarUrl, options);
      var avatarCenter = AVATAR_FRAME.x + AVATAR_FRAME.size / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCenter, AVATAR_FRAME.y + AVATAR_FRAME.size / 2, AVATAR_FRAME.size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawCoverImage(ctx, avi, AVATAR_FRAME.x, AVATAR_FRAME.y, AVATAR_FRAME.size, AVATAR_FRAME.size);
      ctx.restore();
    } catch (e) {}
  }

  // 3. 昵称（最大宽度92px，截断）+ 后缀
  var userName = String(d.userName || '球员');
  var uf = fitText(ctx, userName, 92, 20, 16, 700, 2);
  ctx.font = (700) + ' ' + uf.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? '#FFFFFF' : '#1D2420';
  ctx.textAlign = 'left';
  ctx.fillText(uf.text, 78, 37 * heightRatio);
  var nameW = ctx.measureText(uf.text).width;

  ctx.font = '400 14px sans-serif';
  ctx.fillStyle = isNormalBg ? 'rgba(255,255,255,0.72)' : '#6F7B74';
  ctx.fillText('的比赛战绩', 78 + nameW + 10, 37 * heightRatio);

  // 4. 赛事名（按长度分级 24~32px，最大宽度340，底线24px截断）
  var eventName = String(d.eventName || '羽毛球比赛');
  var etSize = eventTitleSize(ctx, eventName);
  var evf = fitText(ctx, eventName, 340, etSize, 24, 800, 2);
  ctx.font = '800 ' + evf.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? '#FFFFFF' : '#00462E';
  ctx.textAlign = 'center';
  ctx.fillText(evf.text, DESIGN_W / 2, 75 * heightRatio);

  // 5. 模式标签（胶囊中心250,115，14→11px，最大宽度104）
  var modeText = String(d.mode || '');
  var mf = fitText(ctx, modeText, 104, 14, 11, 500, 1);
  ctx.font = '500 ' + mf.size + 'px sans-serif';
  ctx.fillStyle = isNormalBg ? 'rgba(255,255,255,0.86)' : '#0C5A3B';
  ctx.textAlign = 'center';
  ctx.fillText(mf.text, DESIGN_W / 2, 115 * heightRatio);

  // 6. 战绩三列
  var winRateText = fmtWinRate(d.winRate, winsNum, total);
  var hasDecimal = winRateText.indexOf('.') >= 0;
  var wrSz = winRateText.length <= 3 ? 34 : (hasDecimal ? 30 : 32);

  var columns = [
    { val: fmtCount(winsNum), label: '胜场', cx: 122, sz: 36 },
    { val: fmtCount(lossesNum), label: '负场', cx: 250, sz: 36 },
    { val: winRateText, label: '胜率', cx: 378, sz: wrSz }
  ];

  ctx.fillStyle = '#00462E';
  ctx.textAlign = 'center';
  columns.forEach(function (c) {
    ctx.font = '800 ' + c.sz + 'px sans-serif';
    ctx.fillText(c.val, c.cx, 266 * heightRatio);
  });

  ctx.font = '500 15px sans-serif';
  ctx.fillStyle = '#587367';
  columns.forEach(function (c) {
    ctx.fillText(c.label, c.cx, 295 * heightRatio);
  });

  // 7. 小标签（12→11px 自适应）
  var pillTexts = buildPillTexts(d, total);

  var pills = [
    { text: pillTexts[0], cx: 122, maxW: 66 },
    { text: pillTexts[1], cx: 250, maxW: 82 },
    { text: pillTexts[2], cx: 378, maxW: 84 }
  ];
  ctx.fillStyle = '#0C5A3B';
  pills.forEach(function (p) {
    if (!p.text) return;
    var pf = fitText(ctx, p.text, p.maxW, 12, 10, 500, 1);
    ctx.font = '500 ' + pf.size + 'px sans-serif';
    ctx.fillText(pf.text, p.cx, 321 * heightRatio);
  });

  // 8. 小程序码（圆形裁剪，5:4 比例下不绘制）
  if (d.qrCodeUrl && aspectRatio !== '5:4') {
    try {
      var qr = await loadImage(canvas, d.qrCodeUrl, options);
      ctx.save();
      ctx.beginPath();
      ctx.arc(250, 400 * heightRatio, 44, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(qr, 206, 356 * heightRatio, 88, 88);
      ctx.restore();
    } catch (e) {}
  }

  if (isNormalBg) drawNormalShareFooter(ctx, designH, !!(d.qrCodeUrl && aspectRatio !== '5:4'));

  // 9. 导出（背景图已含品牌名和CTA，不重复绘制）
  return exportCanvas(canvas, designH, options);
}

module.exports = {
  DRAW_SIZE: { width: DESIGN_W, height: DESIGN_H },
  NORMAL_BG_COLOR: NORMAL_BG_COLOR,
  BG_CLOUD_PATHS: BG_CLOUD_PATHS,
  getBgPath: getBgPath,
  drawShareCard: drawShareCard,
  _private: {
    fitText: fitText,
    fmtAvgScore: fmtAvgScore,
    fmtCount: fmtCount,
    fmtWinRate: fmtWinRate,
    buildPillTexts: buildPillTexts,
    drawAvatarPlaceholder: drawAvatarPlaceholder,
    drawNormalShareBackground: drawNormalShareBackground,
    drawChatFooterPatch: drawChatFooterPatch,
    roundedRect: roundedRect,
    drawCoverImage: drawCoverImage,
    isCloudPath: isCloudPath,
    isNetworkPath: isNetworkPath,
    resolveImageSource: resolveImageSource,
    _clearImagePathCache: function () { imagePathCache = {}; }
  }
};
