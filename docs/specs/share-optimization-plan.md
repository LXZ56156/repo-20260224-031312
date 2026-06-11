# 朋友圈/群聊分享方案优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化微信小程序分享方案 — 朋友圈用极简缩略图、群聊用 5:4 卡片、新增 1080×1080 海报生成、支持第 4 名+、提取重复代码

**Architecture:** 修改 shareCard.js 支持多比例和普通排名背景，新增 shareTimelineCard.js（极简缩略图）和 sharePoster.js（海报），新增 sharePageMixin.js 提取 ranking/analytics 重复逻辑

**Tech Stack:** WeChat Mini Program native (WXML/WXSS/JS), Canvas 2D API, CloudBase, node:test + node:assert/strict

---

## 文件结构

```
miniprogram/core/
  shareCard.js           [修改] aspectRatio 参数 + NORMAL_BG_COLOR 常量 + 移除前三名限制
  shareTimelineCard.js   [新增] 极简纯文字缩略图 (onShareTimeline 用)
  sharePoster.js         [新增] 1080×1080 海报生成 + 预览/保存/复制文案
  sharePageMixin.js      [新增] 提取 ranking/analytics 重复的分享逻辑
  shareCardPreheat.js    [修改] 支持多类型 (timeline/appMessage/poster) 预热

miniprogram/pages/
  ranking/index.js       [修改] 使用 mixin，新增海报按钮事件，精简代码
  ranking/index.wxml     [修改] 新增海报按钮 UI + 预览弹窗
  analytics/index.js     [修改] 同上
  analytics/index.wxml   [修改] 同上

tests/
  share-card.test.js           [修改] aspectRatio 测试 + normal rank 非抛错测试
  share-timeline-card.test.js  [新增] 极简缩略图测试
  share-poster.test.js         [新增] 海报生成/降级/文案测试
```

---

### Task 1: shareCard.js — aspectRatio 参数 + 普通排名纯色背景

**Files:**
- Modify: `miniprogram/core/shareCard.js`

**目标:** 让 drawShareCard 支持 5:4 比例和 rank ≥ 4 纯色背景，不再抛错

- [ ] **Step 1: 添加 NORMAL_BG_COLOR 常量，修改 getBgPath**

在 `miniprogram/core/shareCard.js` 的 `BG_CLOUD_PATHS` 定义后，`getBgPath` 前添加：

```js
var NORMAL_BG_COLOR = '#0C5A3B';
```

修改 `getBgPath` 函数：

```js
function getBgPath(rank) {
  var value = Number(rank);
  if (!Number.isInteger(value) || value < 1) return NORMAL_BG_COLOR;
  return BG_CLOUD_PATHS[value] || NORMAL_BG_COLOR;
}
```

- [ ] **Step 2: 在 drawShareCard 中添加 aspectRatio 支持**

在 `drawShareCard` 函数开头（options 初始化之后），根据 aspectRatio 计算实际画布高度：

```js
async function drawShareCard(canvas, data, options) {
  options = options || {};
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('share card canvas is not ready');
  }

  var aspectRatio = String(options.aspectRatio || '1:1').trim();
  var designH = aspectRatio === '5:4' ? 400 : DESIGN_H;
  var heightRatio = designH / DESIGN_H;  // 用于缩放垂直坐标

  var ctx = canvas.getContext('2d');
  var dpr = getPixelRatio(options);
  canvas.width = Math.round(DESIGN_W * dpr);
  canvas.height = Math.round(designH * dpr);
  ctx.scale(canvas.width / DESIGN_W, canvas.height / designH);
  ctx.clearRect(0, 0, DESIGN_W, designH);
  ctx.textBaseline = 'middle';
  // ... 数据初始化不变 ...
```

- [ ] **Step 3: 修改背景绘制逻辑，支持纯色背景**

将步骤 1（背景图）改为：

```js
  var rank = Number(d.rank);
  var bgPath = getBgPath(rank);

  // 1. 背景
  if (bgPath === NORMAL_BG_COLOR || (isCloudPath(bgPath) === false && isNetworkPath(bgPath) === false && bgPath.indexOf('#') === 0)) {
    // 纯色背景：第 4 名+ 品牌色填充
    ctx.fillStyle = bgPath;
    ctx.fillRect(0, 0, DESIGN_W, designH);
  } else {
    try {
      var bg = await loadImage(canvas, bgPath, options);
      ctx.drawImage(bg, 0, 0, DESIGN_W, designH);
    } catch (e) {
      // 图片加载失败降级到纯色背景
      ctx.fillStyle = NORMAL_BG_COLOR;
      ctx.fillRect(0, 0, DESIGN_W, designH);
    }
  }
```

- [ ] **Step 4: 5:4 比例下调整垂直坐标**

所有垂直坐标乘以 `heightRatio`。修改以下位置的 y 值（代码中明确标出每个需要改的地方）：

```js
  // 2. 头像
  drawAvatarPlaceholder(ctx, d.userName);  // AVATAR_FRAME.y 是 14，不变

  // 3. 昵称 (y: 37)
  var uf = fitText(ctx, userName, 92, 20, 16, 700, 2);
  ctx.font = (700) + ' ' + uf.size + 'px sans-serif';
  ctx.fillStyle = '#1D2420';
  ctx.textAlign = 'left';
  ctx.fillText(uf.text, 78, 37 * heightRatio);
  var nameW = ctx.measureText(uf.text).width;

  ctx.font = '400 14px sans-serif';
  ctx.fillStyle = '#6F7B74';
  ctx.fillText('的比赛战绩', 78 + nameW + 10, 37 * heightRatio);

  // 4. 赛事名 (y: 75)
  var eventName = String(d.eventName || '羽毛球比赛');
  var etSize = eventTitleSize(ctx, eventName);
  var evf = fitText(ctx, eventName, 340, etSize, 24, 800, 2);
  ctx.font = '800 ' + evf.size + 'px sans-serif';
  ctx.fillStyle = '#00462E';
  ctx.textAlign = 'center';
  ctx.fillText(evf.text, DESIGN_W / 2, 75 * heightRatio);

  // 5. 模式标签 (y: 115)
  var modeText = String(d.mode || '');
  var mf = fitText(ctx, modeText, 104, 14, 11, 500, 1);
  ctx.font = '500 ' + mf.size + 'px sans-serif';
  ctx.fillStyle = '#0C5A3B';
  ctx.textAlign = 'center';
  ctx.fillText(mf.text, DESIGN_W / 2, 115 * heightRatio);

  // 6. 战绩三列 (y: 266, 295)
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

  // 7. 小标签 (y: 321)
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

  // 8. 小程序码 (y: 356, 400, size: 88) — 5:4 时 y 向下移动或移除
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
```

- [ ] **Step 5: 更新 exportCanvas 以使用动态高度**

```js
function exportCanvas(canvas, options) {
  var aspectRatio = String((options && options.aspectRatio) || '1:1').trim();
  var exportH = aspectRatio === '5:4' ? 400 : DESIGN_H;

  if (options && typeof options.exportCanvas === 'function') {
    return Promise.resolve(options.exportCanvas(canvas, { width: DESIGN_W, height: exportH }));
  }
  // ... 其余不变，destHeight 使用 canvas.height ...
  return new Promise(function (resolve, reject) {
    wxApi.canvasToTempFilePath({
      canvas: canvas,
      width: DESIGN_W,
      height: exportH,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: reject
    });
  });
}
```

- [ ] **Step 6: 更新 module.exports 导出 NORMAL_BG_COLOR**

```js
module.exports = {
  DRAW_SIZE: { width: DESIGN_W, height: DESIGN_H },
  BG_CLOUD_PATHS: BG_CLOUD_PATHS,
  NORMAL_BG_COLOR: NORMAL_BG_COLOR,
  getBgPath: getBgPath,
  drawShareCard: drawShareCard,
  _private: {
    // ... 不变 ...
    NORMAL_BG_COLOR: NORMAL_BG_COLOR,
    _clearImagePathCache: function () { imagePathCache = {}; }
  }
};
```

- [ ] **Step 7: 运行现有测试确认不回归**

```bash
node --test tests/share-card.test.js
```
Expected: 所有测试通过（需要更新 rank 4 的 reject 测试）

- [ ] **Step 8: 提交**

```bash
git add miniprogram/core/shareCard.js
git commit -m "feat(shareCard): 支持 aspectRatio 参数和普通排名纯色背景"
```

---

### Task 2: shareTimelineCard.js — 极简纯文字朋友圈缩略图

**Files:**
- Create: `miniprogram/core/shareTimelineCard.js`

**目标:** 提供 onShareTimeline 专用的极简文字缩略图，不包含头像/小程序码等细节

- [ ] **Step 1: 创建 shareTimelineCard.js**

```js
/**
 * 朋友圈极简缩略图
 * 纯文字排版：大号排名 + 赛事名 + 胜负记录
 * 无头像、小程序码等细节，适配朋友圈 ~80×80 px 显示区域
 */
var DESIGN_W = 500;
var DESIGN_H = 400;
var BG_COLOR = '#0C5A3B';
var shareCardStats = require('./shareCardStats');

function getPixelRatio(options) {
  var explicitDpr = Number(options && options.dpr);
  if (Number.isFinite(explicitDpr) && explicitDpr > 0) return explicitDpr;
  return 2;
}

function measure(ctx, text, size, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px sans-serif';
  return ctx.measureText(text).width;
}

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

async function drawTimelineCard(canvas, data, options) {
  options = options || {};
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('timeline card canvas is not ready');
  }

  var ctx = canvas.getContext('2d');
  var dpr = getPixelRatio(options);
  canvas.width = Math.round(DESIGN_W * dpr);
  canvas.height = Math.round(DESIGN_H * dpr);
  ctx.scale(canvas.width / DESIGN_W, canvas.height / DESIGN_H);
  ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.textBaseline = 'middle';

  var d = {
    userName: '', eventName: '', mode: '',
    wins: 0, losses: 0,
    totalMatches: null,
    rank: 1
  };
  if (data) {
    Object.keys(d).forEach(function (k) { if (data[k] !== undefined && data[k] !== null) d[k] = data[k]; });
  }

  var winsNum = Number(d.wins) || 0;
  var lossesNum = Number(d.losses) || 0;
  var rank = Number(d.rank) || 1;

  // 1. 纯色背景
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // 2. 顶部细线装饰
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(40, 30, DESIGN_W - 80, 2);

  // 3. 排名 — 超大字号
  var rankText = '#' + rank;
  ctx.font = '800 120px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(rankText, DESIGN_W / 2, 170);

  // 4. 赛事名 — 中号，自适应宽度
  var eventName = String(d.eventName || '羽毛球比赛');
  var ef = fitText(ctx, eventName, DESIGN_W - 80, 32, 20, 700, 2);
  ctx.font = '700 ' + ef.size + 'px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(ef.text, DESIGN_W / 2, 260);

  // 5. 战绩行 — 胜/负
  var recordText = winsNum + '胜 ' + lossesNum + '负';
  ctx.font = '600 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(recordText, DESIGN_W / 2, 320);

  // 6. 底部品牌标识
  ctx.font = '400 14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('羽球轮转助手', DESIGN_W / 2, 375);

  // 7. 导出
  return exportTimelineCanvas(canvas, options);
}

function exportTimelineCanvas(canvas, options) {
  if (options && typeof options.exportCanvas === 'function') {
    return Promise.resolve(options.exportCanvas(canvas, { width: DESIGN_W, height: DESIGN_H }));
  }

  if (typeof wx === 'undefined' || typeof wx.canvasToTempFilePath !== 'function') {
    return Promise.reject(new Error('wx.canvasToTempFilePath is not available'));
  }

  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      width: DESIGN_W,
      height: DESIGN_H,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: reject
    });
  });
}

module.exports = {
  DRAW_SIZE: { width: DESIGN_W, height: DESIGN_H },
  drawTimelineCard: drawTimelineCard,
  _private: {
    fitText: fitText,
    measure: measure
  }
};
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/core/shareTimelineCard.js
git commit -m "feat(shareTimelineCard): 新增朋友圈极简纯文字缩略图"
```

---

### Task 3: sharePoster.js — 1080×1080 海报生成 + 预览/保存/复制

**Files:**
- Create: `miniprogram/core/sharePoster.js`

**目标:** 提供战绩海报生成、预览弹窗、保存到相册、复制分享文案

- [ ] **Step 1: 创建 sharePoster.js**

```js
/**
 * 战绩海报生成
 * 1080×1080 PNG，基于 shareCard 布局放大
 * 支持预览、保存到相册、复制分享文案
 */
var shareCard = require('./shareCard');
var shareCardStats = require('./shareCardStats');
var shareCode = require('./shareCode');

var POSTER_SIZE = 1080;
var SCALE = POSTER_SIZE / shareCard.DRAW_SIZE.width; // 1080/500 = 2.16

function getPixelRatio(options) {
  var explicitDpr = Number(options && options.dpr);
  if (Number.isFinite(explicitDpr) && explicitDpr > 0) return explicitDpr;
  return 2;
}

/**
 * 生成海报
 * @param {Object} canvas - Canvas 节点
 * @param {Object} data - 战绩数据 (同 shareCard.drawShareCard)
 * @param {Object} options
 * @param {string} options.qrCodeUrl - 小程序码 cloud:// 路径
 * @returns {Promise<string>} tempFilePath
 */
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

  // 复用 shareCard 的格式化函数
  var fmt = shareCard._private;

  // 1. 背景
  var bgPath = shareCard.getBgPath(Number(d.rank));
  if (bgPath === shareCard.NORMAL_BG_COLOR) {
    ctx.fillStyle = shareCard.NORMAL_BG_COLOR;
    ctx.fillRect(0, 0, POSTER_SIZE, POSTER_SIZE);
  } else {
    try {
      var bgImg = await loadPosterImage(canvas, bgPath, options);
      ctx.drawImage(bgImg, 0, 0, POSTER_SIZE, POSTER_SIZE);
    } catch (e) {
      ctx.fillStyle = shareCard.NORMAL_BG_COLOR;
      ctx.fillRect(0, 0, POSTER_SIZE, POSTER_SIZE);
    }
  }

  // 2. 头像 — 放大版
  var avatarX = 41 * SCALE;
  var avatarY = 30 * SCALE;
  var avatarSize = 88 * SCALE;
  var avatarCenter = avatarX + avatarSize / 2;
  drawPosterAvatarPlaceholder(ctx, avatarX, avatarY, avatarSize, d.userName);
  if (d.avatarUrl) {
    try {
      var avi = await loadPosterImage(canvas, d.avatarUrl, options);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCenter, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawCoverImageScaled(ctx, avi, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (e) {}
  }

  // 3. 昵称
  var userName = String(d.userName || '球员');
  var nameX = 168 * SCALE;
  var nameY = 80 * SCALE;
  var maxNameW = 200 * SCALE;
  var uf = fitTextScaled(ctx, userName, maxNameW, 44, 34, 700, 4);
  ctx.font = '700 ' + uf.size + 'px sans-serif';
  ctx.fillStyle = '#1D2420';
  ctx.textAlign = 'left';
  ctx.fillText(uf.text, nameX, nameY);
  var nameW = ctx.measureText(uf.text).width;

  ctx.font = '400 30px sans-serif';
  ctx.fillStyle = '#6F7B74';
  ctx.fillText('的比赛战绩', nameX + nameW + 20, nameY);

  // 4. 赛事名
  var eventName = String(d.eventName || '羽毛球比赛');
  var ef = fitTextScaled(ctx, eventName, 730, 70, 52, 800, 4);
  ctx.font = '800 ' + ef.size + 'px sans-serif';
  ctx.fillStyle = '#00462E';
  ctx.textAlign = 'center';
  ctx.fillText(ef.text, POSTER_SIZE / 2, 162 * SCALE);

  // 5. 模式标签
  var modeText = String(d.mode || '');
  var mf = fitTextScaled(ctx, modeText, 225, 30, 24, 500, 2);
  ctx.font = '500 ' + mf.size + 'px sans-serif';
  ctx.fillStyle = '#0C5A3B';
  ctx.textAlign = 'center';
  ctx.fillText(mf.text, POSTER_SIZE / 2, 248 * SCALE);

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
    ctx.fillText(pf.text, p.cx, 693);
  });

  // 8. 小程序码 — 放大版
  if (d.qrCodeUrl) {
    try {
      var qr = await loadPosterImage(canvas, d.qrCodeUrl, options);
      ctx.save();
      ctx.beginPath();
      ctx.arc(POSTER_SIZE / 2, 864, 95, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(qr, POSTER_SIZE / 2 - 95, 864 - 95, 190, 190);
      ctx.restore();
    } catch (e) {}
  }

  // 9. 品牌标识
  ctx.font = '400 22px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.textAlign = 'center';
  ctx.fillText('扫码查看完整赛果 · 羽球轮转助手', POSTER_SIZE / 2, 1030);

  return exportPoster(canvas, options);
}

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

function drawPosterAvatarPlaceholder(ctx, x, y, size, userName) {
  var center = x + size / 2;
  var initial = String(userName || '球员').trim().slice(0, 1) || '球';
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#0C5A3B';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 ' + (size * 0.45) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, center, y + size / 2 + 1);
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

function fitTextScaled(ctx, text, maxWidth, defaultSize, minSize, weight, step) {
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

function measureScaled(ctx, text, size, weight) {
  ctx.font = (weight || 400) + ' ' + size + 'px sans-serif';
  return ctx.measureText(text).width;
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

/**
 * 构建分享文案
 */
function buildShareText(data) {
  var d = data || {};
  var eventName = String(d.eventName || '羽毛球比赛');
  var rank = Number(d.rank) || 1;
  var winsNum = Number(d.wins) || 0;
  var lossesNum = Number(d.losses) || 0;
  return '我在「' + eventName + '」中获得第 ' + rank + ' 名！' + winsNum + '胜' + lossesNum + '负，来围观 → 羽球轮转助手';
}

/**
 * 保存海报到相册
 * @param {string} imageUrl - 临时文件路径
 * @returns {Promise<void>}
 */
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

/**
 * 复制分享文案
 */
function copyShareText(data) {
  var text = buildShareText(data);
  if (typeof wx === 'undefined' || typeof wx.setClipboardData !== 'function') {
    return;
  }
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
    exportPoster: exportPoster
  }
};
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/core/sharePoster.js
git commit -m "feat(sharePoster): 新增 1080×1080 战绩海报生成/预览/保存/复制文案"
```

---

### Task 4: shareCardPreheat.js — 多类型预热支持

**Files:**
- Modify: `miniprogram/core/shareCardPreheat.js`

**目标:** 支持 timeline/appMessage/poster 三种类型的预热，不绑定单一 _buildShareCard 接口

- [ ] **Step 1: 改造 shareCardPreheat.js**

将 `miniprogram/core/shareCardPreheat.js` 替换为：

```js
/**
 * 分享卡片预热
 * 支持 timeline / appMessage / poster 三种类型
 */
var TYPE_TIMELINE = 'timeline';
var TYPE_APP_MESSAGE = 'appMessage';
var TYPE_POSTER = 'poster';

function buildCacheKey(tournament, cardData, type) {
  return JSON.stringify({
    tournamentId: String((tournament && tournament._id) || '').trim(),
    type: String(type || TYPE_APP_MESSAGE).trim(),
    cardData: cardData || {}
  });
}

function getPreparedShareImage(ctx, tournament, type) {
  var resolvedType = String(type || TYPE_APP_MESSAGE).trim();
  if (!ctx || typeof ctx._buildShareCardData !== 'function') {
    return Promise.reject(new Error('share card builder is not available'));
  }

  var cardData;
  try {
    cardData = ctx._buildShareCardData(tournament);
  } catch (err) {
    return Promise.reject(err);
  }

  var cacheKey = buildCacheKey(tournament, cardData, resolvedType);

  // 统一缓存 key 前缀
  var cacheImageKey = '_shareImageUrl_' + resolvedType;
  var cacheKeyKey = '_shareImageCacheKey_' + resolvedType;
  var buildKeyKey = '_shareImageBuildKey_' + resolvedType;
  var buildPromiseKey = '_shareImageBuildPromise_' + resolvedType;

  if (ctx[cacheKeyKey] === cacheKey && ctx[cacheImageKey]) {
    return Promise.resolve(ctx[cacheImageKey]);
  }
  if (ctx[buildKeyKey] === cacheKey && ctx[buildPromiseKey]) {
    return ctx[buildPromiseKey];
  }

  var buildPromise = Promise.resolve()
    .then(function () {
      if (resolvedType === TYPE_TIMELINE) {
        return ctx._buildTimelineCard(tournament, cardData);
      }
      if (resolvedType === TYPE_POSTER) {
        return ctx._buildPoster(tournament, cardData);
      }
      return ctx._buildShareCard(tournament, cardData);
    })
    .then(function (imageUrl) {
      var value = String(imageUrl || '').trim();
      if (!value) throw new Error('share image export returned empty imageUrl');
      if (ctx[buildKeyKey] === cacheKey) {
        ctx[cacheKeyKey] = cacheKey;
        ctx[cacheImageKey] = value;
      }
      return value;
    })
    .finally(function () {
      if (ctx[buildPromiseKey] === buildPromise) {
        ctx[buildKeyKey] = '';
        ctx[buildPromiseKey] = null;
      }
    });

  ctx[buildKeyKey] = cacheKey;
  ctx[buildPromiseKey] = buildPromise;
  return buildPromise;
}

function preheatShareImage(ctx, tournament, type) {
  if (!tournament) return Promise.resolve('');
  return getPreparedShareImage(ctx, tournament, type).catch(function () {
    return '';
  });
}

function preheatShareCard(ctx, tournament) {
  return preheatShareImage(ctx, tournament, TYPE_APP_MESSAGE);
}

function clearPreparedShareCard(ctx) {
  if (!ctx) return;
  var types = [TYPE_APP_MESSAGE, TYPE_TIMELINE, TYPE_POSTER];
  types.forEach(function (t) {
    ctx['_shareImageUrl_' + t] = '';
    ctx['_shareImageCacheKey_' + t] = '';
    ctx['_shareImageBuildKey_' + t] = '';
    ctx['_shareImageBuildPromise_' + t] = null;
  });
}

module.exports = {
  TYPE_TIMELINE: TYPE_TIMELINE,
  TYPE_APP_MESSAGE: TYPE_APP_MESSAGE,
  TYPE_POSTER: TYPE_POSTER,
  buildCacheKey: buildCacheKey,
  getPreparedShareCard: getPreparedShareImage,
  getPreparedShareImage: getPreparedShareImage,
  preheatShareCard: preheatShareCard,
  preheatShareImage: preheatShareImage,
  clearPreparedShareCard: clearPreparedShareCard
};
```

- [ ] **Step 2: 运行预热测试确认不回归**

```bash
node --test tests/share-card-preheat.test.js
```
Expected: 所有测试通过（注意测试用的是旧接口名 `getPreparedShareCard`，需要确认兼容）

- [ ] **Step 3: 提交**

```bash
git add miniprogram/core/shareCardPreheat.js
git commit -m "feat(shareCardPreheat): 支持 timeline/appMessage/poster 多类型预热"
```

---

### Task 5: sharePageMixin.js — 提取重复分享逻辑

**Files:**
- Create: `miniprogram/core/sharePageMixin.js`

**目标:** 将 ranking 和 analytics 中重复的分享相关方法提取为一个可混入的模块

- [ ] **Step 1: 创建 sharePageMixin.js**

```js
/**
 * 分享页面混入
 * 提取 ranking/analytics 重复的分享相关方法
 */
var shareCard = require('./shareCard');
var shareCardPreheat = require('./shareCardPreheat');
var shareCardStats = require('./shareCardStats');
var shareCode = require('./shareCode');
var shareMeta = require('./shareMeta');
var shareActivity = require('./shareActivity');
var shareTimelineCard = require('./shareTimelineCard');
var sharePoster = require('./sharePoster');

/**
 * 创建分享方法混入
 * @param {Object} opts
 * @param {Function} opts.buildShareCardData - 构建分享卡片数据 (tournament) => cardData
 * @param {string} opts.canvasSelector - Canvas 选择器，默认 '#shareCardCanvas'
 * @param {string} opts.posterCanvasSelector - 海报 Canvas 选择器，默认 '#posterCanvas'
 */
function createSharePageMixin(opts) {
  opts = opts || {};
  var buildShareCardDataFn = opts.buildShareCardData || function () { throw new Error('buildShareCardData not set'); };
  var canvasSelector = String(opts.canvasSelector || '#shareCardCanvas').trim();
  var posterCanvasSelector = String(opts.posterCanvasSelector || '#posterCanvas').trim();

  return {
    onShareAppMessage: function () {
      var tournament = this.data.tournament;
      if (!tournament) {
        return shareMeta.buildShareMessage(null);
      }
      var meta = shareMeta.buildShareMessage(tournament);
      var result = {
        title: meta.title,
        path: meta.path
      };
      // 异步附加 5:4 imageUrl
      var ctx = this;
      result.promise = shareCardPreheat.getPreparedShareImage(ctx, tournament, shareCardPreheat.TYPE_APP_MESSAGE).then(function (imageUrl) {
        return { title: meta.title, path: meta.path, imageUrl: imageUrl };
      }).catch(function () {
        return { title: meta.title, path: meta.path };
      });
      return result;
    },

    onShareTimeline: function () {
      var tournament = this.data.tournament;
      if (!tournament) return { title: '羽球轮转助手' };
      var eventName = tournament.name || '羽毛球比赛';
      var defaultTitle = eventName + ' 赛事排名已出炉';
      var tid = String(tournament._id || '');
      var ctx = this;
      var promise = shareCardPreheat.getPreparedShareImage(ctx, tournament, shareCardPreheat.TYPE_TIMELINE).then(function (imageUrl) {
        return { title: eventName, query: 'tournamentId=' + tid, imageUrl: imageUrl };
      }).catch(function () {
        return { title: defaultTitle, query: 'tournamentId=' + tid };
      });
      return { title: defaultTitle, query: 'tournamentId=' + tid, promise: promise };
    },

    onGeneratePoster: function () {
      var ctx = this;
      var tournament = ctx.data.tournament;
      if (!tournament) {
        wx.showToast({ title: '赛事数据未加载', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '生成海报中...' });
      shareCardPreheat.getPreparedShareImage(ctx, tournament, shareCardPreheat.TYPE_POSTER).then(function (imageUrl) {
        wx.hideLoading();
        ctx.setData({ posterImageUrl: imageUrl, showPosterPreview: true });
      }).catch(function () {
        wx.hideLoading();
        wx.showToast({ title: '海报生成失败，请重试', icon: 'none' });
      });
    },

    onSavePoster: function () {
      var imageUrl = String(this.data.posterImageUrl || '').trim();
      if (!imageUrl) return;
      sharePoster.savePosterToAlbum(imageUrl);
    },

    onCopyPosterText: function () {
      var tournament = this.data.tournament;
      if (!tournament) return;
      var cardData = buildShareCardDataFn.call(this, tournament);
      sharePoster.copyShareText(cardData);
    },

    onClosePosterPreview: function () {
      this.setData({ showPosterPreview: false });
    },

    _buildShareCardData: buildShareCardDataFn,

    _buildShareCard: function (tournament, preparedData) {
      var ctx = this;
      var cardData = preparedData || buildShareCardDataFn.call(ctx, tournament);
      return ctx._getCanvas(canvasSelector).then(function (canvas) {
        if (!canvas) throw new Error('share card canvas not found');
        var qrCodePromise = (shareCard.getBgPath(cardData.rank) !== shareCard.NORMAL_BG_COLOR)
          ? shareCode.getTournamentShareCode(tournament && tournament._id).catch(function () { return ''; })
          : Promise.resolve('');
        return Promise.all([Promise.resolve(canvas), qrCodePromise]).then(function (values) {
          cardData.qrCodeUrl = values[1];
          return shareCard.drawShareCard(values[0], cardData, { aspectRatio: '5:4' });
        });
      });
    },

    _buildTimelineCard: function (tournament, preparedData) {
      var ctx = this;
      var cardData = preparedData || buildShareCardDataFn.call(ctx, tournament);
      return ctx._getCanvas(canvasSelector).then(function (canvas) {
        if (!canvas) throw new Error('timeline card canvas not found');
        return shareTimelineCard.drawTimelineCard(canvas, cardData);
      });
    },

    _buildPoster: function (tournament, preparedData) {
      var ctx = this;
      var cardData = preparedData || buildShareCardDataFn.call(ctx, tournament);
      return ctx._getCanvas(posterCanvasSelector).then(function (canvas) {
        if (!canvas) throw new Error('poster canvas not found');
        return shareCode.getTournamentShareCode(tournament && tournament._id).then(function (codeUrl) {
          cardData.qrCodeUrl = codeUrl || '';
          return sharePoster.generatePoster(canvas, cardData);
        });
      });
    },

    _getCanvas: function (selector) {
      var ctx = this;
      var cacheKey = '_canvas_' + selector.replace(/[^a-zA-Z0-9]/g, '_');
      if (ctx[cacheKey]) return Promise.resolve(ctx[cacheKey]);
      var promiseKey = cacheKey + '_promise';
      if (ctx[promiseKey]) return ctx[promiseKey];
      if (typeof wx !== 'undefined' && typeof wx.createSelectorQuery === 'function') {
        ctx[promiseKey] = new Promise(function (resolve) {
          try {
            wx.createSelectorQuery().select(selector).fields({ node: true }).exec(function (res) {
              var canvas = res && res[0] && res[0].node;
              if (canvas) ctx[cacheKey] = canvas;
              resolve(canvas || null);
            });
          } catch (err) {
            resolve(null);
          }
        }).finally(function () {
          ctx[promiseKey] = null;
        });
        return ctx[promiseKey];
      }
      return Promise.resolve(null);
    },

    _ensureShareMenu: function () {
      shareActivity.showShareMenuBestEffort({ menus: ['shareAppMessage', 'shareTimeline'] });
    },

    _shareReady: false,

    onReady: function () {
      this._shareReady = true;
      var ctx = this;
      ctx._getCanvas(canvasSelector).then(function (canvas) {
        if (canvas && ctx.data.tournament) {
          shareCardPreheat.preheatShareImage(ctx, ctx.data.tournament, shareCardPreheat.TYPE_APP_MESSAGE);
          shareCardPreheat.preheatShareImage(ctx, ctx.data.tournament, shareCardPreheat.TYPE_TIMELINE);
        }
      });
    },

    _preheatShareWhenReady: function (tournament) {
      var ctx = this;
      if (!ctx._shareReady || !tournament) return;
      ctx._getCanvas(canvasSelector).then(function (canvas) {
        if (canvas) {
          shareCardPreheat.preheatShareImage(ctx, tournament, shareCardPreheat.TYPE_APP_MESSAGE);
          shareCardPreheat.preheatShareImage(ctx, tournament, shareCardPreheat.TYPE_TIMELINE);
        }
      });
      ctx._getCanvas(posterCanvasSelector).then(function (canvas) {
        if (canvas) {
          shareCardPreheat.preheatShareImage(ctx, tournament, shareCardPreheat.TYPE_POSTER);
        }
      });
    },

    _clearShareCache: function () {
      shareCardPreheat.clearPreparedShareCard(this);
    }
  };
}

module.exports = {
  createSharePageMixin: createSharePageMixin
};
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/core/sharePageMixin.js
git commit -m "feat(sharePageMixin): 提取 ranking/analytics 重复分享逻辑为混入模块"
```

---

### Task 6: ranking 页面集成

**Files:**
- Modify: `miniprogram/pages/ranking/index.js`
- Modify: `miniprogram/pages/ranking/index.wxml`

**目标:** 使用 sharePageMixin 精简代码，新增海报按钮

- [ ] **Step 1: 修改 ranking/index.js**

核心变更：
1. 删除 `_buildShareCardData`、`_buildShareCard`、`_getPreparedShareCard`、`_preheatShareCardWhenReady`、`_getShareCardCanvas`、`_ensureShareMenu`
2. 删除 `onShareAppMessage`、`onShareTimeline`（由 mixin 提供）
3. 使用 `createSharePageMixin` 并合并到 Page 中
4. 在 `onReady` 中调用 mixin 的 onReady
5. 在 `applyTournament` 中调用 `this._preheatShareWhenReady(t)`
6. 在 `onUnload` 中调用 `this._clearShareCache()`
7. 删除不再需要的 import

具体修改 `miniprogram/pages/ranking/index.js`:

```js
// 修改 import 部分（删除不需要的，添加 mixin）
const normalize = require('../../core/normalize');
const nav = require('../../core/nav');
const pageTitle = require('../../core/pageTitle');
const pageTournamentSync = require('../../core/pageTournamentSync');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const avatarDisplay = require('../../core/avatarDisplay');
const uiPreferences = require('../../core/uiPreferences');
const shareActivity = require('../../core/shareActivity');
const shareCardStats = require('../../core/shareCardStats');
const tournamentEntry = require('../../core/tournamentEntry');
const sharePageMixin = require('../../core/sharePageMixin');

// ... rankingSyncController 不变 ...

// 在 Page 调用之前创建 mixin
var shareMixin = sharePageMixin.createSharePageMixin({
  canvasSelector: '#shareCardCanvas',
  posterCanvasSelector: '#posterCanvas',
  buildShareCardData: function (tournament) {
    var openid = this.openid || (getApp().globalData.openid || '');
    var rankings = this.data.rankings || [];
    var currentRow = null;
    for (var i = 0; i < rankings.length; i++) {
      if (String(rankings[i].playerId || rankings[i].entityId || '') === openid) {
        currentRow = rankings[i];
        break;
      }
    }
    if (!currentRow) {
      if (rankings.length) currentRow = rankings[0];
      else throw new Error('no ranking data');
    }
    var players = Array.isArray(tournament.players) ? tournament.players : [];
    var playerRecord = players.find(function (p) { return String(p.id || '') === String(currentRow.playerId || currentRow.entityId || ''); }) || {};
    var cardStats = shareCardStats.buildShareCardStats(tournament, currentRow);
    return {
      userName: currentRow.displayName || currentRow.name || '球员',
      eventName: tournament.name || '羽毛球比赛',
      mode: this.data.rankingTypeLabel || '',
      wins: currentRow.wins || 0,
      losses: currentRow.losses || 0,
      winRate: cardStats.winRate,
      totalMatches: cardStats.totalMatches,
      maxWinStreak: cardStats.maxWinStreak,
      avgScore: cardStats.avgScore,
      rank: Number(currentRow.rank) || 1,
      avatarUrl: String(playerRecord.avatar || playerRecord.avatarUrl || ''),
      appName: '羽球轮转助手'
    };
  }
});

Page({
  data: {
    // ... 现有 data 不变 ...
    posterImageUrl: '',
    showPosterPreview: false
  },

  ...rankingSyncController,
  ...shareMixin,  // 混入分享方法

  onLoad(options) {
    const tid = tournamentEntry.parseTournamentIdFromPageOptions(options || {});
    this.ensureAvatarRuntime();
    pageTournamentSync.initTournamentSync(this);
    this.openid = (getApp().globalData.openid || '');
    this.setData({
      tournamentId: tid,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', tid),
      ...uiPreferences.readUiPreferencePatch()
    });

    const app = getApp();
    const initialOffline = !!(app && app.globalData && app.globalData.networkOffline);
    this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: initialOffline }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    if (!tid) {
      this.setData({
        loadError: true,
        loadErrorTitle: '链接无效',
        loadErrorMessage: '请确认比赛链接是否完整。',
        showLoadErrorHome: true
      });
      return;
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
    this._ensureShareMenu();
  },

  // onReady 由 mixin 提供, 但需要额外处理：
  // shareMixin.onReady 中包含了预热逻辑
  // 原 onReady 只是设置 _shareCardReady = true 和调 _preheatShareCardWhenReady
  // mixin 的 onReady 已经做了这些，不需要额外的 onReady

  onHide() {
    pageTournamentSync.pauseTournamentSync(this);
  },

  onShow() {
    this.refreshUiPreferences();
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  refreshUiPreferences() {
    this.setData(uiPreferences.readUiPreferencePatch());
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    this._clearShareCache();
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
    this._avatarResolveGen = Number(this._avatarResolveGen || 0) + 1;
  },

  applyTournament(t) {
    // ... 现有逻辑完全不变 ...
    if (!t) return;
    this.ensureAvatarRuntime();
    t = normalize.normalizeTournament(t);
    const tournamentName = flow.getTournamentDisplayName(t, '未命名赛事');
    if (tournamentName !== String(t.name || '').trim()) {
      t = { ...t, name: tournamentName };
    }
    pageTitle.setTournamentPageTitle(this, '赛事排名', t);
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const isTeamMode = mode === flow.MODE_SQUAD_DOUBLES || mode === flow.MODE_FIXED_PAIR_RR;
    const rankingTypeLabel = isTeamMode ? '队伍榜' : '个人榜';
    const rawRankings = rankingCore.buildRankingWithTrend(t);

    const players = Array.isArray(t.players) ? t.players : [];
    const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
    const playerMap = buildPlayerMap(players);
    const playerNameMap = {};
    for (const p of players) {
      const pid = String((p && p.id) || '').trim();
      if (pid) playerNameMap[pid] = String((p && (p.nickName || p.nickname || p.name)) || '').trim() || pid;
    }
    const decoratedRankings = rawRankings.map((row, idx) => {
      let displayName = String(row && row.name || '').trim();
      let subtitle = '';
      if (isTeamMode) {
        const eid = String(row.entityId || row.playerId || '').trim();
        const pair = pairTeams.find((pt) => String(pt && pt.id || '') === eid);
        if (pair && Array.isArray(pair.playerIds)) {
          subtitle = pair.playerIds.map((id) => playerNameMap[String(id || '')] || String(id || '')).join(' / ');
        }
        if (!subtitle && (eid === 'A' || eid === 'B')) {
          const members = players
            .filter((p) => String((p && p.squad) || '').toUpperCase() === eid)
            .map((p) => String((p && (p.nickName || p.nickname || p.name)) || '').trim() || '球员');
          if (members.length) subtitle = members.join(' / ');
        }
        if (mode === flow.MODE_FIXED_PAIR_RR && subtitle) {
          displayName = subtitle;
          subtitle = displayName !== String(row && row.name || '').trim()
            ? String(row && row.name || '').trim()
            : '';
        }
      }
      const showTrend = Number(row.played) >= 2;
      return {
        ...row,
        rank: idx + 1,
        displayName: displayName || String(row && row.name || '').trim() || '队伍',
        subtitle,
        showTrend,
        avatarItems: buildRankingAvatarItems(row, mode, pairTeams, playerMap, this.avatarCache || {})
      };
    });

    this.setData({
      loadError: false,
      tournament: t,
      rankings: decoratedRankings,
      rankingTypeLabel,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', this.data.tournamentId)
    });
    this.refreshAvatarDisplays();
    this._preheatShareWhenReady(t);
  },

  // ... 其余方法不变 (ensureAvatarRuntime, refreshAvatarDisplays, onAvatarImageError, onPrimaryNavTap, goHome) ...
});
```

注意：还需要删除文件中原来的以下方法定义：
- `onShareAppMessage`
- `onShareTimeline`
- `_buildShareCardData`
- `_buildShareCard`
- `_getPreparedShareCard`
- `_preheatShareCardWhenReady`
- `_getShareCardCanvas`
- `_ensureShareMenu`

- [ ] **Step 2: 修改 ranking/index.wxml**

在 `rating/index.wxml` 中添加海报 Canvas 和海报复古按钮。在 `<canvas>` 标签后、container 之前：

```html
<canvas type="2d" id="shareCardCanvas" style="position:fixed;left:100vw;width:250px;height:250px;"></canvas>
<canvas type="2d" id="posterCanvas" style="position:fixed;left:200vw;width:250px;height:250px;"></canvas>

<!-- 海报预览弹窗 -->
<view class="poster-overlay" wx:if="{{showPosterPreview}}" bindtap="onClosePosterPreview">
  <view class="poster-preview" catchtap="">
    <image class="poster-image" src="{{posterImageUrl}}" mode="widthFix" show-menu-by-longpress="{{true}}"></image>
    <view class="poster-actions">
      <button class="btn btn-primary" bindtap="onSavePoster">保存到相册</button>
      <button class="btn btn-subtle" bindtap="onCopyPosterText">复制分享文案</button>
    </view>
    <view class="poster-close" bindtap="onClosePosterPreview">✕</view>
  </view>
</view>
```

在页面合适位置（如 hero 区域或底部）添加"生成海报"按钮：

```html
<!-- 在 hero 区域的 analytics-hero-actions 风格中添加 -->
<view class="hero reveal reveal-1">
  <view class="hero-kicker">积分榜</view>
  <view class="hero-title">{{rankingTypeLabel}}</view>
  <view class="hero-sub">{{tournament.name}}</view>
  <view class="hero-actions">
    <button class="btn btn-outline btn-sm" bindtap="onGeneratePoster">生成战绩海报</button>
  </view>
</view>
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/ranking/index.js miniprogram/pages/ranking/index.wxml
git commit -m "feat(ranking): 集成 sharePageMixin，新增海报生成按钮"
```

---

### Task 7: analytics 页面集成

**Files:**
- Modify: `miniprogram/pages/analytics/index.js`
- Modify: `miniprogram/pages/analytics/index.wxml`

**目标:** 同 ranking 页面，使用 sharePageMixin + 海报按钮

- [ ] **Step 1: 修改 analytics/index.js**

```js
// 修改 import 部分
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const loading = require('../../core/loading');
const pageTournamentSync = require('../../core/pageTournamentSync');
const writeErrorUi = require('../../core/writeErrorUi');
const retryAction = require('../../core/retryAction');
const nav = require('../../core/nav');
const adGuard = require('../../core/adGuard');
const pageTitle = require('../../core/pageTitle');
const shareCardStats = require('../../core/shareCardStats');
const tournamentEntry = require('../../core/tournamentEntry');
const analyticsLogic = require('./logic');
const sharePageMixin = require('../../core/sharePageMixin');

// ... analyticsSyncController 不变 ...

// 创建 mixin
var shareMixin = sharePageMixin.createSharePageMixin({
  canvasSelector: '#shareCardCanvas',
  posterCanvasSelector: '#posterCanvas',
  buildShareCardData: function (tournament) {
    var openid = this.openid || (getApp().globalData.openid || '');
    var playerStats = this.data.playerStats || [];
    var currentPlayer = null;
    for (var i = 0; i < playerStats.length; i++) {
      if (String(playerStats[i].playerId || playerStats[i].entityId || '') === openid) {
        currentPlayer = playerStats[i];
        break;
      }
    }
    if (!currentPlayer) {
      if (playerStats.length) currentPlayer = playerStats[0];
      else throw new Error('no player data');
    }
    var players = Array.isArray(tournament.players) ? tournament.players : [];
    var playerRecord = players.find(function (p) { return String(p.id || '') === String(currentPlayer.playerId || currentPlayer.entityId || ''); }) || {};
    var cardStats = shareCardStats.buildShareCardStats(tournament, currentPlayer);
    return {
      userName: currentPlayer.name || '球员',
      eventName: tournament.name || '羽毛球比赛',
      mode: this.data.modeLabel || '',
      wins: currentPlayer.wins || 0,
      losses: currentPlayer.losses || 0,
      winRate: cardStats.winRate,
      totalMatches: cardStats.totalMatches,
      maxWinStreak: cardStats.maxWinStreak,
      avgScore: cardStats.avgScore,
      rank: Number(currentPlayer.rank) || 1,
      avatarUrl: String(playerRecord.avatar || playerRecord.avatarUrl || ''),
      appName: '羽球轮转助手'
    };
  }
});

Page({
  data: {
    // ... 现有 data 不变 ...
    posterImageUrl: '',
    showPosterPreview: false
  },

  ...analyticsSyncController,
  ...retryAction.createRetryMethods(),
  ...shareMixin,

  onLoad(options) {
    // ... 现有逻辑不变，但 onReady 由 mixin 处理 ...
    const tid = tournamentEntry.parseTournamentIdFromPageOptions(options || {});
    pageTournamentSync.initTournamentSync(this);
    this.setData({ tournamentId: tid });
    this.openid = (getApp().globalData.openid || '');

    const app = getApp();
    this.setData(pageTournamentSync.composePageSyncPatch(this, {
      networkOffline: !!(app && app.globalData && app.globalData.networkOffline)
    }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    if (!tid) {
      this.setData({
        loadError: true,
        loadErrorTitle: '链接无效',
        loadErrorMessage: '请确认比赛链接是否完整。',
        showLoadErrorHome: true
      });
      return;
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
    this._ensureShareMenu();
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    this._clearShareCache();
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  applyTournament(tournament) {
    // ... 现有逻辑不变，最后改为调 mixin 预热方法 ...
    if (!tournament) return;
    const analytics = analyticsLogic.computeAnalytics(tournament);
    const report = analyticsLogic.buildBattleReport(analytics);
    const pageModel = analyticsLogic.buildAnalyticsPageModel(analytics, report);
    const fullRankings = Array.isArray(pageModel.fullRankings) ? pageModel.fullRankings : [];
    pageTitle.setTournamentPageTitle(this, '赛事复盘', analytics.tournament);
    this.setData({
      loadError: false,
      tournament: analytics.tournament,
      summary: analytics.summary,
      top3: pageModel.top3,
      top3Cards: pageModel.top3Cards,
      playerStats: analytics.playerStats,
      pairHot: analytics.pairHot.slice(0, 3),
      duelHot: analytics.duelHot.slice(0, 3),
      rankingTitle: analytics.rankingTitle,
      rankingUnit: analytics.rankingUnit,
      reportLines: report.lines,
      reportShareText: report.shareText,
      reportHeadline: report.headline,
      reportBriefText: report.briefText,
      modeLabel: pageModel.modeLabel,
      statusLabel: pageModel.statusLabel,
      topSectionTitle: pageModel.topSectionTitle,
      heroHeadline: pageModel.heroHeadline,
      heroStats: pageModel.heroStats,
      summaryStats: pageModel.summaryStats,
      focusFacts: pageModel.focusFacts,
      fullRankings,
      displayRankings: fullRankings.slice(0, 5),
      showAllRankings: false
    });
    this.clearLastFailedAction();
    this._preheatShareWhenReady(analytics.tournament);
  },

  // ... 其余方法 (toggleRankingRows, copyBattleReport, copyBriefReport, cloneCurrentTournament, goHome, refreshAnalyticsAdSlot, onRetry) 不变 ...
});
```

删除 analytics/index.js 中原来的：
- `onReady`
- `onShareAppMessage`
- `onShareTimeline`
- `_buildShareCardData`
- `_buildShareCard`
- `_getPreparedShareCard`
- `_preheatShareCardWhenReady`
- `_getShareCardCanvas`
- `_ensureShareMenu`

- [ ] **Step 2: 修改 analytics/index.wxml**

```html
<canvas type="2d" id="shareCardCanvas" style="position:fixed;left:100vw;width:250px;height:250px;"></canvas>
<canvas type="2d" id="posterCanvas" style="position:fixed;left:200vw;width:250px;height:250px;"></canvas>

<!-- 海报预览弹窗（同 ranking） -->
<view class="poster-overlay" wx:if="{{showPosterPreview}}" bindtap="onClosePosterPreview">
  <view class="poster-preview" catchtap="">
    <image class="poster-image" src="{{posterImageUrl}}" mode="widthFix" show-menu-by-longpress="{{true}}"></image>
    <view class="poster-actions">
      <button class="btn btn-primary" bindtap="onSavePoster">保存到相册</button>
      <button class="btn btn-subtle" bindtap="onCopyPosterText">复制分享文案</button>
    </view>
    <view class="poster-close" bindtap="onClosePosterPreview">✕</view>
  </view>
</view>
```

在 analytics 页面的 hero 区域添加"生成战绩海报"按钮（在"再办一场"按钮旁边）：

```html
<view class="analytics-hero-actions">
  <button class="btn btn-primary btn-sm analytics-hero-primary" bindtap="cloneCurrentTournament">再办一场</button>
  <button class="btn btn-outline btn-sm" bindtap="onGeneratePoster">生成战绩海报</button>
</view>
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/analytics/index.js miniprogram/pages/analytics/index.wxml
git commit -m "feat(analytics): 集成 sharePageMixin，新增海报生成按钮"
```

---

### Task 8: 更新现有 share-card 测试

**Files:**
- Modify: `tests/share-card.test.js`

**目标:** 添加 aspectRatio 测试、普通排名非抛错测试，更新 rank 4 reject 测试

- [ ] **Step 1: 修改 rank 4 测试**

将原来的 reject 测试改为非抛错测试：

```js
test('shareCard supports normal ranks (≥4) with pure color background', async () => {
  const canvas = createCanvas(shareCard.DRAW_SIZE.width, shareCard.DRAW_SIZE.height);
  // rank 4 不再抛错
  const result = await shareCard.drawShareCard(canvas, {
    userName: '李四',
    eventName: '测试赛',
    mode: '个人榜',
    wins: 5,
    losses: 5,
    winRate: '50%',
    totalMatches: 10,
    maxWinStreak: 2,
    avgScore: 12.5,
    rank: 4,
    avatarUrl: '',
    qrCodeUrl: ''
  }, {
    dpr: 1,
    loadImage,
    exportCanvas(targetCanvas) {
      const pixel = targetCanvas.getContext('2d').getImageData(250, 200, 1, 1).data;
      // 验证画布有内容（非透明）
      assert.notDeepEqual(Array.from(pixel), [0, 0, 0, 0]);
      return 'normal-rank.png';
    }
  });
  assert.equal(result, 'normal-rank.png');
});
```

- [ ] **Step 2: 添加 5:4 aspectRatio 测试**

```js
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
```

- [ ] **Step 3: 添加长赛事名测试**

```js
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
```

- [ ] **Step 4: 运行测试**

```bash
node --test tests/share-card.test.js
```
Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add tests/share-card.test.js
git commit -m "test(shareCard): 添加 aspectRatio/normal rank/长赛事名测试"
```

---

### Task 9: 新增 share-timeline-card 测试

**Files:**
- Create: `tests/share-timeline-card.test.js`

- [ ] **Step 1: 创建测试文件**

```js
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
      // 背景不是透明
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
```

- [ ] **Step 2: 运行测试**

```bash
node --test tests/share-timeline-card.test.js
```
Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add tests/share-timeline-card.test.js
git commit -m "test(shareTimelineCard): 添加极简缩略图测试"
```

---

### Task 10: 新增 share-poster 测试

**Files:**
- Create: `tests/share-poster.test.js`

- [ ] **Step 1: 创建测试文件**

```js
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
      if (src && src.indexOf('data:') === 0) {
        return new Promise(function (resolve) {
          var img = canvas.createImage();
          img.onload = function () { resolve(img); };
          img.src = src;
        });
      }
      return new Promise(function (resolve) {
        var img = canvas.createImage();
        img.onload = function () { resolve(img); };
        img.src = makeDataUrl();
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
    loadImage(src) {
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
```

- [ ] **Step 2: 运行测试**

```bash
node --test tests/share-poster.test.js
```
Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add tests/share-poster.test.js
git commit -m "test(sharePoster): 添加海报生成/降级/文案测试"
```

---

### Task 11: 全量测试 + 回归验证

- [ ] **Step 1: 运行所有分享相关测试**

```bash
node --test tests/share-card.test.js tests/share-card-stats.test.js tests/share-card-preheat.test.js tests/share-code.test.js tests/share-timeline-card.test.js tests/share-poster.test.js tests/share-meta.test.js
```
Expected: 所有测试通过

- [ ] **Step 2: 运行全量测试**

```bash
node --test tests/*.test.js
```
Expected: 全部通过，无回归

- [ ] **Step 3: 提交（如有遗漏文件）**

```bash
git add -A
git commit -m "chore: 分享方案优化完成，全量测试通过"
```

---

## 真机验收清单

| # | 验收项 | 操作 | 预期 |
|---|--------|------|------|
| 1 | 朋友圈分享缩略图 | ranking 页右上角 ··· → 分享到朋友圈 | 显示极简文字卡片（排名 #N + 赛事名 + 战绩），不显示头像/小程序码 |
| 2 | 朋友圈分享降级 | 断网后分享朋友圈 | 仍可分享，显示纯文字标题 |
| 3 | 群聊分享 5:4 卡片 | ranking 页右上角 ··· → 转发给朋友 | 聊天卡片显示 5:4 战绩图（有头像+赛事名+战绩） |
| 4 | 群聊分享降级 | Canvas 渲染失败时转发 | 仍可分享，卡片无图但标题正确 |
| 5 | 生成海报（前三名） | ranking 页点击「生成战绩海报」 | 弹窗显示 1080×1080 海报，含头像+战绩+小程序码 |
| 6 | 海报保存到相册 | 海报预览页点击「保存到相册」 | 授权后保存成功，相册中出现海报 |
| 7 | 复制分享文案 | 海报预览页点击「复制分享文案」 | toast "文案已复制"，剪贴板含排名信息 |
| 8 | 普通排名海报 | 第 4 名+ 生成海报 | 纯色深绿背景，无金银铜纹理，内容完整 |
| 9 | 无头像海报 | 未设置头像的球员生成海报 | 首字占位头像正常显示 |
| 10 | 长赛事名 | 赛事名超过 15 字生成海报 | 文字自适应缩小，不溢出 |
| 11 | analytics 页海报 | analytics 页点击「生成战绩海报」 | 与 ranking 页效果一致 |
| 12 | 预热不卡顿 | 进入 ranking 页后立即点分享 | 图片已预热，秒出 |
| 13 | 朋友圈图片缓存 | 同一比赛多次分享朋友圈 | 使用缓存，不重复渲染 |
