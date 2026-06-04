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

// 向后兼容
function getPreparedShareCard(ctx, tournament) {
  return getPreparedShareImage(ctx, tournament, TYPE_APP_MESSAGE);
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
  getPreparedShareCard: getPreparedShareCard,
  getPreparedShareImage: getPreparedShareImage,
  preheatShareCard: preheatShareCard,
  preheatShareImage: preheatShareImage,
  clearPreparedShareCard: clearPreparedShareCard
};
