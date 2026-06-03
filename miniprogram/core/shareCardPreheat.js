function buildCacheKey(tournament, cardData) {
  return JSON.stringify({
    tournamentId: String((tournament && tournament._id) || '').trim(),
    cardData: cardData || {}
  });
}

function getPreparedShareCard(ctx, tournament) {
  if (!ctx || typeof ctx._buildShareCardData !== 'function' || typeof ctx._buildShareCard !== 'function') {
    return Promise.reject(new Error('share card builder is not available'));
  }

  var cardData;
  try {
    cardData = ctx._buildShareCardData(tournament);
  } catch (err) {
    return Promise.reject(err);
  }

  var cacheKey = buildCacheKey(tournament, cardData);
  if (ctx._shareCardCacheKey === cacheKey && ctx._shareCardImageUrl) {
    return Promise.resolve(ctx._shareCardImageUrl);
  }
  if (ctx._shareCardBuildKey === cacheKey && ctx._shareCardBuildPromise) {
    return ctx._shareCardBuildPromise;
  }

  var buildPromise = Promise.resolve()
    .then(function () {
      return ctx._buildShareCard(tournament, cardData);
    })
    .then(function (imageUrl) {
      var value = String(imageUrl || '').trim();
      if (!value) throw new Error('share card export returned empty imageUrl');
      if (ctx._shareCardBuildKey === cacheKey) {
        ctx._shareCardCacheKey = cacheKey;
        ctx._shareCardImageUrl = value;
      }
      return value;
    })
    .finally(function () {
      if (ctx._shareCardBuildPromise === buildPromise) {
        ctx._shareCardBuildKey = '';
        ctx._shareCardBuildPromise = null;
      }
    });

  ctx._shareCardBuildKey = cacheKey;
  ctx._shareCardBuildPromise = buildPromise;
  return buildPromise;
}

function preheatShareCard(ctx, tournament) {
  if (!tournament) return Promise.resolve('');
  return getPreparedShareCard(ctx, tournament).catch(function () {
    return '';
  });
}

function clearPreparedShareCard(ctx) {
  if (!ctx) return;
  ctx._shareCardCacheKey = '';
  ctx._shareCardImageUrl = '';
  ctx._shareCardBuildKey = '';
  ctx._shareCardBuildPromise = null;
}

module.exports = {
  buildCacheKey,
  getPreparedShareCard,
  preheatShareCard,
  clearPreparedShareCard
};
