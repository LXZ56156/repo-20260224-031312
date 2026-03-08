const runningActions = new Map();

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
  runningActions.delete(normalized);
}

function syncPageBusy(ctx, dataField, key) {
  if (!ctx || typeof ctx.setData !== 'function' || !dataField) return;
  ctx.setData({ [dataField]: isBusy(key) });
}

function run(key, fn) {
  const normalized = normalizeKey(key);
  if (!normalized || typeof fn !== 'function') {
    return Promise.resolve();
  }
  if (runningActions.has(normalized)) {
    return runningActions.get(normalized);
  }

  let settleResolve = null;
  let settleReject = null;
  const baseTask = new Promise((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });
  const task = baseTask.finally(() => {
      if (runningActions.get(normalized) === task) {
        runningActions.delete(normalized);
      }
    });

  runningActions.set(normalized, task);
  try {
    Promise.resolve(fn()).then(settleResolve, settleReject);
  } catch (err) {
    settleReject(err);
  }
  return task;
}

function runWithPageBusy(ctx, dataField, key, fn) {
  const task = run(key, fn);
  syncPageBusy(ctx, dataField, key);
  return Promise.resolve(task).finally(() => {
    syncPageBusy(ctx, dataField, key);
  });
}

module.exports = {
  run,
  isBusy,
  clear,
  runWithPageBusy
};
