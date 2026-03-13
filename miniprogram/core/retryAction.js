const actionGuard = require('./actionGuard');

function buildRetryActionKey(ctx, text, options = {}) {
  const explicit = String(options.actionKey || '').trim();
  if (explicit) return `retry:${explicit}`;
  const route = String((ctx && ctx.route) || '').trim() || 'page';
  const tournamentId = String((ctx && ctx.data && ctx.data.tournamentId) || '').trim();
  const label = String(text || '').trim() || 'last_action';
  return `retry:${route}:${tournamentId}:${label}`;
}

function setLastFailedAction(ctx, text, fn, options = {}) {
  if (!ctx) return;
  ctx._lastFailedAction = typeof fn === 'function'
    ? {
        actionKey: buildRetryActionKey(ctx, text, options),
        run: fn
      }
    : null;
  if (typeof ctx.setData !== 'function') return;
  ctx.setData({
    canRetryAction: !!ctx._lastFailedAction,
    lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
  });
}

function clearLastFailedAction(ctx) {
  if (!ctx) return;
  ctx._lastFailedAction = null;
  if (typeof ctx.setData !== 'function') return;
  ctx.setData({ canRetryAction: false, lastFailedActionText: '' });
}

function retryLastAction(ctx) {
  const entry = ctx && ctx._lastFailedAction;
  if (!entry || typeof entry.run !== 'function') return Promise.resolve();
  return actionGuard.run(entry.actionKey, () => entry.run());
}

function createRetryMethods() {
  return {
    setLastFailedAction(text, fn, options) {
      setLastFailedAction(this, text, fn, options);
    },

    clearLastFailedAction() {
      clearLastFailedAction(this);
    },

    retryLastAction() {
      return retryLastAction(this);
    }
  };
}

module.exports = {
  setLastFailedAction,
  clearLastFailedAction,
  retryLastAction,
  createRetryMethods
};
