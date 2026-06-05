/**
 * 朋友圈极简缩略图
 * 纯文字排版：大号排名 + 赛事名 + 胜负记录
 * 无头像、小程序码等细节，适配朋友圈 ~80×80 px 显示区域
 */
var DESIGN_W = 500;
var DESIGN_H = 500;
var BG_COLOR = '#0C5A3B';

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

  // 1. 纯色背景
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // 2. 顶部细线装饰
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(40, 55, DESIGN_W - 80, 2);

  // 3. 排名 — 超大字号
  var rankText = '#' + Number(d.rank || 1);
  ctx.font = '800 120px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(rankText, DESIGN_W / 2, 210);

  // 4. 赛事名 — 中号，自适应宽度
  var eventName = String(d.eventName || '羽毛球比赛');
  var ef = fitText(ctx, eventName, DESIGN_W - 80, 32, 20, 700, 2);
  ctx.font = '700 ' + ef.size + 'px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(ef.text, DESIGN_W / 2, 310);

  // 5. 战绩行 — 胜/负
  var recordText = winsNum + '胜 ' + lossesNum + '负';
  ctx.font = '600 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(recordText, DESIGN_W / 2, 370);

  // 6. 底部品牌标识
  ctx.font = '400 14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('羽球轮转助手', DESIGN_W / 2, 440);

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
