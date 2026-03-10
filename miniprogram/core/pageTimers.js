function ensureTimerMap(ctx) {
  if (!ctx || typeof ctx !== 'object') return {};
  if (!ctx.__pageTimers || typeof ctx.__pageTimers !== 'object') {
    ctx.__pageTimers = {};
  }
  return ctx.__pageTimers;
}

function clearNamedTimer(ctx, name, clearTimeoutFn = clearTimeout) {
  const key = String(name || '').trim();
  if (!key) return;
  const timers = ensureTimerMap(ctx);
  const timerId = timers[key];
  if (!timerId) return;
  clearTimeoutFn(timerId);
  delete timers[key];
}

function setNamedTimer(ctx, name, fn, delay = 0, options = {}) {
  const key = String(name || '').trim();
  if (!key || typeof fn !== 'function') return null;
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  const timers = ensureTimerMap(ctx);
  clearNamedTimer(ctx, key, clearTimeoutFn);
  const timerId = setTimeoutFn(() => {
    if (timers[key] === timerId) delete timers[key];
    fn();
  }, Math.max(0, Number(delay) || 0));
  timers[key] = timerId;
  return timerId;
}

function clearAllTimers(ctx, clearTimeoutFn = clearTimeout) {
  const timers = ensureTimerMap(ctx);
  Object.keys(timers).forEach((key) => {
    const timerId = timers[key];
    if (timerId) clearTimeoutFn(timerId);
    delete timers[key];
  });
}

module.exports = {
  clearNamedTimer,
  setNamedTimer,
  clearAllTimers
};
