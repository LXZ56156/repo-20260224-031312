const storage = require('./storage');

const DEFAULT_PAGE_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_SESSION_LIMIT = 2;

function readApp() {
  try {
    return getApp();
  } catch (_) {
    return null;
  }
}

function ensureSessionCounter() {
  const app = readApp();
  if (!app || !app.globalData) return 0;
  const raw = Number(app.globalData.adSessionExposureCount);
  const count = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  app.globalData.adSessionExposureCount = count;
  return count;
}

function setSessionCounter(count) {
  const app = readApp();
  if (!app || !app.globalData) return;
  const n = Number(count);
  app.globalData.adSessionExposureCount = Number.isFinite(n) && n >= 0 ? n : 0;
}

function shouldExposePageSlot(page, options = {}) {
  const p = String(page || '').trim();
  if (!p) return false;

  const now = Date.now();
  const cooldownMs = Number(options.cooldownMs) > 0 ? Number(options.cooldownMs) : DEFAULT_PAGE_COOLDOWN_MS;
  const sessionLimit = Number(options.sessionLimit) > 0 ? Number(options.sessionLimit) : DEFAULT_SESSION_LIMIT;

  const lastExposure = storage.getAdLastExposure(p);
  if (lastExposure > 0 && (now - lastExposure) < cooldownMs) return false;

  const count = ensureSessionCounter();
  if (count >= sessionLimit) return false;
  return true;
}

function markPageExposed(page) {
  const p = String(page || '').trim();
  if (!p) return;
  storage.setAdLastExposure(p, Date.now());
  const current = ensureSessionCounter();
  setSessionCounter(current + 1);
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function shouldShowDailySplash() {
  const last = storage.getAdLastSplashAt();
  if (!last) return true;
  return !isSameDay(last, Date.now());
}

function markSplashShown() {
  storage.setAdLastSplashAt(Date.now());
}

module.exports = {
  shouldExposePageSlot,
  markPageExposed,
  shouldShowDailySplash,
  markSplashShown
};
