const crypto = require('node:crypto');

const CLIENT_REQUEST_LOG_COLLECTION = 'client_request_logs';

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

function isDocNotExists(err) {
  const msg = errMsg(err).toLowerCase();
  return msg.includes('document.get:fail') || msg.includes('does not exist') || msg.includes('not found');
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

function normalizeResultCode(code, fallback = 'OP_FAILED') {
  const normalized = String(code || '').trim().toUpperCase().replace(/\s+/g, '_');
  return normalized || String(fallback || 'OP_FAILED').trim().toUpperCase() || 'OP_FAILED';
}

function buildResultData(source = {}, preset = {}) {
  const reserved = new Set(['ok', 'code', 'message', 'state', 'traceId', 'data']);
  const output = {};
  const presetData = preset.data && typeof preset.data === 'object' && !Array.isArray(preset.data) ? preset.data : null;
  const sourceData = source.data && typeof source.data === 'object' && !Array.isArray(source.data) ? source.data : null;
  if (presetData) Object.assign(output, presetData);
  if (sourceData) Object.assign(output, sourceData);

  [preset, source].forEach((input) => {
    if (!input || typeof input !== 'object') return;
    Object.keys(input).forEach((key) => {
      if (reserved.has(key)) return;
      output[key] = input[key];
    });
  });

  return output;
}

function withWriteResult(result = {}, defaults = {}) {
  const source = (result && typeof result === 'object') ? result : {};
  const preset = (defaults && typeof defaults === 'object') ? defaults : {};
  const ok = source.ok === false ? false : preset.ok !== false;
  const output = { ...source };
  output.ok = ok;
  output.code = normalizeResultCode(source.code || preset.code || (ok ? 'OK' : 'OP_FAILED'), ok ? 'OK' : 'OP_FAILED');
  output.message = String(source.message || preset.message || (ok ? '操作成功' : '操作失败')).trim() || (ok ? '操作成功' : '操作失败');
  output.state = String(source.state || preset.state || '').trim();
  output.traceId = String(source.traceId || preset.traceId || '').trim();
  output.data = buildResultData(source, preset);
  return output;
}

function okResult(code = 'OK', message = '操作成功', extra = {}) {
  return withWriteResult(extra, { ok: true, code, message });
}

function failResult(code = 'OP_FAILED', message = '操作失败', extra = {}) {
  return withWriteResult({ ...extra, ok: false }, { ok: false, code, message });
}

async function ensureCollection(db, name) {
  if (!db || typeof db.createCollection !== 'function') return;
  try {
    await db.createCollection(String(name || '').trim());
  } catch (_) {
    // ignore
  }
}

async function runTransactionCompat(db, handler) {
  if (!db || typeof handler !== 'function') {
    throw new Error('transaction handler required');
  }
  if (typeof db.runTransaction === 'function') {
    return db.runTransaction(handler);
  }
  return handler({
    collection(name) {
      return db.collection(name);
    }
  });
}

function normalizeClientRequestLogPart(value) {
  return String(value || '').trim();
}

function buildClientRequestLogId(options = {}) {
  const scope = normalizeClientRequestLogPart(options.scope);
  const subjectKey = normalizeClientRequestLogPart(options.subjectKey);
  const operatorOpenId = normalizeClientRequestLogPart(options.operatorOpenId);
  const clientRequestId = normalizeClientRequestLogPart(options.clientRequestId);
  if (!scope || !subjectKey || !operatorOpenId || !clientRequestId) return '';
  const digest = crypto.createHash('sha1')
    .update([scope, subjectKey, operatorOpenId, clientRequestId].join('\n'))
    .digest('hex');
  return `req_${digest}`;
}

function isSuccessfulClientRequestLog(log) {
  return !!(log && String(log.status || '').trim() === 'succeeded');
}

async function getClientRequestLog(reader, options = {}) {
  const logId = buildClientRequestLogId(options);
  if (!logId || !reader || typeof reader.collection !== 'function') return null;
  try {
    const res = await reader.collection(CLIENT_REQUEST_LOG_COLLECTION).doc(logId).get();
    return res && res.data ? res.data : null;
  } catch (err) {
    if (isDocNotExists(err) || isCollectionNotExists(err)) return null;
    throw err;
  }
}

function buildClientRequestLogData(db, options = {}) {
  const scope = normalizeClientRequestLogPart(options.scope);
  const subjectKey = normalizeClientRequestLogPart(options.subjectKey);
  const operatorOpenId = normalizeClientRequestLogPart(options.operatorOpenId);
  const clientRequestId = normalizeClientRequestLogPart(options.clientRequestId);
  const status = normalizeClientRequestLogPart(options.status) || 'succeeded';
  const resourceType = normalizeClientRequestLogPart(options.resourceType);
  const resourceId = normalizeClientRequestLogPart(options.resourceId);
  const responseCode = normalizeResultCode(options.responseCode || 'OK');
  const responseState = normalizeClientRequestLogPart(options.responseState);
  return assertNoReservedRootKeys({
    scope,
    subjectKey,
    operatorOpenId,
    clientRequestId,
    status,
    resourceType,
    resourceId,
    responseCode,
    responseState,
    createdAt: typeof (db && db.serverDate) === 'function' ? db.serverDate() : null,
    updatedAt: typeof (db && db.serverDate) === 'function' ? db.serverDate() : null
  }, ['_id'], '请求幂等日志数据');
}

async function upsertClientRequestLog(writer, db, options = {}) {
  const logId = buildClientRequestLogId(options);
  if (!logId || !writer || typeof writer.collection !== 'function') return '';
  await writer.collection(CLIENT_REQUEST_LOG_COLLECTION).doc(logId).set({
    data: buildClientRequestLogData(db, options)
  });
  return logId;
}

function assertNoReservedRootKeys(data, reservedKeys = ['_id'], context = '写入数据') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const hits = (Array.isArray(reservedKeys) ? reservedKeys : ['_id'])
    .map((key) => String(key || '').trim())
    .filter((key) => key && Object.prototype.hasOwnProperty.call(data, key));
  if (hits.length > 0) {
    throw new Error(`${String(context || '写入数据').trim() || '写入数据'}包含保留字段 ${hits.join(', ')}`);
  }
  return data;
}

async function cleanupScoreLocks(db, tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!db || !tid) return;
  try {
    await db.collection('score_locks').where({ tournamentId: tid }).remove();
  } catch (err) {
    if (isCollectionNotExists(err)) return;
    throw err;
  }
}

module.exports = {
  CLIENT_REQUEST_LOG_COLLECTION,
  errMsg,
  isCollectionNotExists,
  isConflictError,
  isDocNotExists,
  assertTournamentExists,
  assertCreator,
  assertDraft,
  assertOptimisticUpdate,
  assertNoReservedRootKeys,
  normalizeConflictError,
  cleanupScoreLocks,
  ensureCollection,
  runTransactionCompat,
  withWriteResult,
  okResult,
  failResult,
  buildResultData,
  buildClientRequestLogId,
  getClientRequestLog,
  upsertClientRequestLog,
  isSuccessfulClientRequestLog
};
