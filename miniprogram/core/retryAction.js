const cloud = require('./cloud');

function setLastFailedAction(ctx, text, fn) {
  if (!ctx) return;
  ctx._lastFailedAction = typeof fn === 'function' ? fn : null;
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
  if (ctx && typeof ctx._lastFailedAction === 'function') ctx._lastFailedAction();
}

function presentWriteError(ctx, err, fallbackMessage, options = {}) {
  return cloud.presentWriteError({
    err,
    fallbackMessage,
    conflictTitle: options.conflictTitle,
    conflictContent: options.conflictContent,
    confirmText: options.confirmText,
    cancelText: options.cancelText,
    onRefresh: options.onRefresh,
    onKeepDraft: options.onKeepDraft
  });
}

function createRetryMethods() {
  return {
    setLastFailedAction(text, fn) {
      setLastFailedAction(this, text, fn);
    },

    clearLastFailedAction() {
      clearLastFailedAction(this);
    },

    retryLastAction() {
      retryLastAction(this);
    }
  };
}

module.exports = {
  setLastFailedAction,
  clearLastFailedAction,
  retryLastAction,
  presentWriteError,
  createRetryMethods
};
