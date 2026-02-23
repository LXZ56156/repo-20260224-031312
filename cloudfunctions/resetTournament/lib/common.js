function errMsg(err) {
  return String((err && (err.message || err.errMsg)) || err || '');
}

function isCollectionNotExists(err) {
  const msg = errMsg(err);
  return msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection not exists') || msg.includes('ResourceNotFound') || msg.includes('-502005');
}

function isConflictError(err) {
  const msg = errMsg(err).toLowerCase();
  return msg.includes('冲突') || msg.includes('conflict') || msg.includes('version');
}

function assertTournamentExists(t) {
  if (!t) throw new Error('赛事不存在');
  return t;
}

function assertCreator(t, openid, message = '无权限') {
  if (!t || !openid || String(t.creatorId || '') !== String(openid || '')) {
    throw new Error(message);
  }
}

function assertDraft(t, message = '非草稿阶段不可操作') {
  if (!t || String(t.status || '') !== 'draft') {
    throw new Error(message);
  }
}

function assertOptimisticUpdate(updRes, message = '写入冲突，请刷新赛事后重试') {
  if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
    throw new Error(message);
  }
}

function normalizeConflictError(err, fallbackMessage = '操作失败') {
  if (isConflictError(err)) {
    return new Error('写入冲突，请刷新赛事后重试');
  }
  const msg = errMsg(err) || fallbackMessage;
  return new Error(msg);
}

module.exports = {
  errMsg,
  isCollectionNotExists,
  isConflictError,
  assertTournamentExists,
  assertCreator,
  assertDraft,
  assertOptimisticUpdate,
  normalizeConflictError
};
