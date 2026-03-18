const runningActions = new Map();
const DEFAULT_TIMEOUT_MS = 15000;

function normalizeKey(key) {
  return String(key || '').trim();
}

function isBusy(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  return runningActions.has(normalized);
}

function clear(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  release(normalized, 'manual');
}

function syncPageBusy(ctx, dataField, key) {
  if (!ctx || typeof ctx.setData !== 'function' || !dataField) return;
  ctx.setData({ [dataField]: isBusy(key) });
}

function normalizeTimeoutMs(value) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.floor(timeoutMs);
}

function addReleaseListener(entry, listener) {
  if (!entry || typeof listener !== 'function') return;
  entry.releaseListeners.add(listener);
}

function notifyRelease(entry, payload) {
  if (!entry || !(entry.releaseListeners instanceof Set)) return;
  for (const listener of entry.releaseListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('actionGuard release listener failed', err);
    }
  }
}

function release(key, reason = 'settled') {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const entry = runningActions.get(normalized);
  if (!entry || entry.released) return;
  entry.released = true;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  runningActions.delete(normalized);
  notifyRelease(entry, { key: normalized, reason });
}

function run(key, fn, options = {}) {
  const normalized = normalizeKey(key);
  if (!normalized || typeof fn !== 'function') {
    return Promise.resolve();
  }
  const existing = runningActions.get(normalized);
  if (existing) {
    addReleaseListener(existing, options.onRelease);
    return existing.task;
  }

  let settleResolve = null;
  let settleReject = null;
  const entry = {
    task: null,
    timer: null,
    released: false,
    releaseListeners: new Set()
  };
  addReleaseListener(entry, options.onRelease);
  const baseTask = new Promise((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });
  const task = baseTask.finally(() => {
    release(normalized, 'settled');
  });

  entry.task = task;
  if (options.releaseOnTimeout !== false) {
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    entry.timer = setTimeout(() => {
      const current = runningActions.get(normalized);
      if (current !== entry) return;
      console.warn('actionGuard timeout release', normalized, timeoutMs);
      release(normalized, 'timeout');
    }, timeoutMs);
  }

  runningActions.set(normalized, entry);
  try {
    Promise.resolve(fn()).then(settleResolve, settleReject);
  } catch (err) {
    settleReject(err);
  }
  return task;
}

function runWithPageBusy(ctx, dataField, key, fn, options = {}) {
  const normalized = normalizeKey(key);
  const task = run(normalized, fn, {
    ...options,
    onRelease: () => {
      syncPageBusy(ctx, dataField, normalized);
      if (typeof options.onRelease === 'function') options.onRelease();
    }
  });
  syncPageBusy(ctx, dataField, key);
  return Promise.resolve(task);
}

function runCriticalWrite(key, fn, options = {}) {
  return run(key, fn, {
    ...options,
    releaseOnTimeout: false
  });
}

function runWithCriticalPageBusy(ctx, dataField, key, fn, options = {}) {
  return runWithPageBusy(ctx, dataField, key, fn, {
    ...options,
    releaseOnTimeout: false
  });
}

module.exports = {
  run,
  runCriticalWrite,
  isBusy,
  clear,
  runWithPageBusy,
  runWithCriticalPageBusy,
  DEFAULT_TIMEOUT_MS
};
