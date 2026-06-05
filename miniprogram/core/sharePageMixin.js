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
 * @param {Object} opts
 * @param {Function} opts.buildShareCardData - (tournament) => cardData, page-specific
 * @param {string} [opts.canvasSelector] - default '#shareCardCanvas'
 * @param {string} [opts.posterCanvasSelector] - default '#posterCanvas'
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
      var ctx = this;
      // 异步附加 5:4 imageUrl，失败时降级为无图
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

    onShareTimelineGuide: function () {
      this._ensureShareMenu();
      if (typeof wx !== 'undefined' && wx && typeof wx.showModal === 'function') {
        wx.showModal({
          title: '分享到朋友圈',
          content: '请点击右上角“···”，选择“分享到朋友圈”。',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      if (typeof wx !== 'undefined' && wx && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请点右上角分享', icon: 'none' });
      }
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
        // 只有奖牌背景才获取小程序码（普通排名不需要在小聊天卡片中显示小程序码）
        var qrPromise = (shareCard.getBgPath(cardData.rank) !== shareCard.NORMAL_BG_COLOR)
          ? shareCode.getTournamentShareCode(tournament && tournament._id).catch(function () { return ''; })
          : Promise.resolve('');
        return Promise.all([Promise.resolve(canvas), qrPromise]).then(function (values) {
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
      // 缓存 key: 把 '#shareCardCanvas' → '_canvas__shareCardCanvas'
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
