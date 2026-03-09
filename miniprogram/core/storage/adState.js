const { get, set } = require('./base');

const AD_GUARD_EXPOSURE_PREFIX = 'ad_guard_last_exposure_';
const AD_GUARD_SPLASH_KEY = 'ad_guard_last_splash_at';

function getAdLastExposure(page) {
  const key = String(page || '').trim();
  if (!key) return 0;
  return Number(get(`${AD_GUARD_EXPOSURE_PREFIX}${key}`, 0)) || 0;
}

function setAdLastExposure(page, ts = Date.now()) {
  const key = String(page || '').trim();
  if (!key) return;
  set(`${AD_GUARD_EXPOSURE_PREFIX}${key}`, Number(ts) || Date.now());
}

function getAdLastSplashAt() {
  return Number(get(AD_GUARD_SPLASH_KEY, 0)) || 0;
}

function setAdLastSplashAt(ts = Date.now()) {
  set(AD_GUARD_SPLASH_KEY, Number(ts) || Date.now());
}

module.exports = {
  getAdLastExposure,
  setAdLastExposure,
  getAdLastSplashAt,
  setAdLastSplashAt
};
