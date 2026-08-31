const trace = require('./trace');
const envConfig = require('../config/env');

const CONFLICT_CODES = new Set(['VERSION_CONFLICT']);
const NETWORK_CODES = new Set(['NETWORK_ERROR']);
const TIMEOUT_CODES = new Set(['TIMEOUT', 'REQUEST_TIMEOUT']);
const NOT_FOUND_CODES = new Set(['TOURNAMENT_NOT_FOUND']);
const OCCUPIED_CODES = new Set(['LOCK_OCCUPIED']);
const EXPIRED_CODES = new Set(['LOCK_EXPIRED']);
const PERMISSION_CODES = new Set(['PERMISSION_DENIED', 'LOCK_FORBIDDEN', 'JOIN_DRAFT_ONLY', 'START_DRAFT_ONLY', 'SETTINGS_DRAFT_ONLY']);
const PARAM_CODES = new Set([
  'ACTION_REQUIRED',
  'TOURNAMENT_ID_REQUIRED',
  'PROFILE_MINIMUM_REQUIRED',
  'SCORE_OUT_OF_RANGE',
  'SETTINGS_REQUIRED',
  'SETTINGS_INVALID',
  'START_VALIDATION_FAILED',
  'START_PAIR_TEAMS_INVALID',
  'PLAYER_NOT_JOINED',
  'PLAYER_LIMIT_REACHED',
  'PLAYER_LIMIT_EXCEEDED'
]);
const FINISHED_CODES = new Set(['MATCH_FINISHED']);
const CANCELED_CODES = new Set(['MATCH_CANCELED']);
const DEDUPED_CODES = new Set(['SCORE_SUBMIT_DEDUPED', 'PLAYER_REMOVED_DEDUPED', 'PLAYER_SQUAD_DEDUPED', 'PAIR_TEAMS_DEDUPED']);
const READ_ONLY_FUNCTIONS = new Set(['login', 'getUserProfile', 'getMyPerformanceStats']);
const DEFAULT_RETRY_DELAYS_MS = [300, 900];

function normalizeResultCode(err) {
  return String(err && err.code || '').trim().toUpperCase();
}

function normalizeResultState(err) {
  return String(err && err.state || '').trim().toLowerCase();
}

function normalizeTraceId(err) {
  return String(err && (err.traceId || err.__traceId) || '').trim();
}

function extractResultSource(result) {
  if (!result || typeof result !== 'object') return {};
  const source = { ...result };
  [
    'ok',
    'code',
    'message',
    'errMsg',
    'userMessage',
    'state',
    'traceId',
    '__traceId',
    'data',
    'deduped',
    'finished'
  ].forEach((key) => {
    if (source[key] === undefined && result[key] !== undefined) {
      source[key] = result[key];
    }
  });
  return source;
}

function buildDefaultResultCode(name, ok) {
  const normalizedName = String(name || '').trim().replace(/[^a-z0-9]+/ig, '_').replace(/^_+|_+$/g, '').toUpperCase();
  if (normalizedName) return `${normalizedName}_${ok ? 'OK' : 'FAILED'}`;
  return ok ? 'OK' : 'OP_FAILED';
}

function inferResultState(result, ok) {
  const source = result && typeof result === 'object' ? result : {};
  const code = normalizeResultCode(source);
  if (source.state !== undefined && source.state !== null && String(source.state || '').trim()) {
    return String(source.state || '').trim();
  }
  if (source.deduped === true || DEDUPED_CODES.has(code)) return 'deduped';
  if (!ok && OCCUPIED_CODES.has(code)) return 'occupied';
  if (!ok && EXPIRED_CODES.has(code)) return 'expired';
  if (source.finished === true || FINISHED_CODES.has(code)) return 'finished';
  if (!ok && CANCELED_CODES.has(code)) return 'canceled';
  const message = stripCloudPrefix(normalizeErrMsg(source)).toLowerCase();
  if (!ok && (TIMEOUT_CODES.has(code) || message.includes('timeout') || message.includes('超时'))) return 'timeout';
  if (!ok && (NETWORK_CODES.has(code) || message.includes('network') || message.includes('网络'))) return 'network';
  if (!ok && (CONFLICT_CODES.has(code) || message.includes('conflict') || message.includes('冲突'))) return 'conflict';
  if (!ok && NOT_FOUND_CODES.has(code)) return 'not_found';
  if (!ok && (PERMISSION_CODES.has(code) || message.includes('permission') || message.includes('权限'))) return 'forbidden';
  if (!ok && (PARAM_CODES.has(code) || message.includes('invalid') || message.includes('参数'))) return 'invalid';
  return ok ? 'success' : '';
}

function normalizeCloudResult(result, name = '') {
  const source = extractResultSource(result);
  const implicitError = !Object.prototype.hasOwnProperty.call(source, 'ok') &&
    !!String(source.message || source.errMsg || '').trim() &&
    !Object.prototype.hasOwnProperty.call(source, 'data');
  const ok = source.ok !== false && !implicitError;
  const reserved = new Set(['ok', 'code', 'message', 'state', 'traceId', 'data']);
  const extras = {};
  Object.keys(source).forEach((key) => {
    if (reserved.has(key)) return;
    extras[key] = source[key];
  });
  const data = {};
  if (source.data && typeof source.data === 'object' && !Array.isArray(source.data)) {
    Object.assign(data, source.data);
  }
  Object.assign(data, extras);

  return {
    ...source,
    ok,
    code: normalizeResultCode(source) || buildDefaultResultCode(name, ok),
    message: String(source.message || (ok ? '操作成功' : '操作失败')).trim() || (ok ? '操作成功' : '操作失败'),
    state: inferResultState(source, ok),
    traceId: normalizeTraceId(source),
    data
  };
}

function normalizeErrMsg(err) {
  if (!err) return '';
  if (err && typeof err === 'object') {
    const message = String(err.message || err.errMsg || err.userMessage || '').trim();
    if (message) return message;
  }
  return (err.errMsg || err.message || String(err));
}

function stripCloudPrefix(msg) {
  return String(msg || '').replace(/^cloud\.call:fail\s*/i, '').trim();
}

function isInvalidWriteShapeMessage(msg) {
  const normalized = String(msg || '');
  const low = normalized.toLowerCase();
  return (
    low.includes('invalid parameters') ||
    normalized.includes('不能更新_id的值') ||
    normalized.includes('包含保留字段 _id')
  );
}

function attachDeveloperHint(err, hint) {
  if (!err || !hint) return err;
  try {
    err.devHint = {
      title: String(hint.title || '').trim(),
      content: String(hint.content || '').trim()
    };
  } catch (_) {
    // ignore
  }
  return err;
}

function getDeveloperHint(err) {
  const hint = err && err.devHint;
  if (!hint || typeof hint !== 'object') return null;
  const title = String(hint.title || '').trim();
  const content = String(hint.content || '').trim();
  if (!title || !content) return null;
  return { title, content };
}

function parseCloudError(err, fallbackMessage = '操作失败') {
  if (!err) {
    return {
      code: '',
      state: '',
      traceId: '',
      hasStructuredContext: false,
      isTimeout: false,
      isConflict: false,
      isNetwork: false,
      isNotFound: false,
      isOccupied: false,
      isExpired: false,
      isPermission: false,
      isParam: false,
      isInvalidWriteShape: false,
      isFinished: false,
      isCanceled: false,
      isDeduped: false,
      rawMessage: '',
      userMessage: fallbackMessage
    };
  }
  const rawSource = extractResultSource(err);
  const normalized = normalizeCloudResult(err);
  const code = normalizeResultCode(normalized);
  const state = normalizeResultState(normalized);
  const traceId = normalizeTraceId(normalized);
  const rawMessage = normalizeErrMsg(normalized);
  const cleaned = stripCloudPrefix(rawMessage);
  const low = cleaned.toLowerCase();
  const hasStructuredContext = !!(normalizeResultCode(rawSource) || normalizeResultState(rawSource));
  const isTimeout = (
    TIMEOUT_CODES.has(code) ||
    state === 'timeout' ||
    low.includes('timeout') ||
    cleaned.includes('超时')
  );
  const isConflict = (
    CONFLICT_CODES.has(code) ||
    state === 'conflict' ||
    cleaned.includes('写入冲突') ||
    cleaned.includes('并发冲突') ||
    cleaned.includes('冲突') ||
    low.includes('version') ||
    low.includes('conflict')
  );
  const isNetwork = (
    NETWORK_CODES.has(code) ||
    state === 'network' ||
    (isTimeout && state !== 'timeout') ||
    low.includes('network') ||
    low.includes('timeout') ||
    low.includes('fail to connect') ||
    cleaned.includes('网络')
  );
  const isNotFound = (
    NOT_FOUND_CODES.has(code) ||
    state === 'not_found'
  );
  const isOccupied = (
    OCCUPIED_CODES.has(code) ||
    state === 'occupied'
  );
  const isExpired = (
    EXPIRED_CODES.has(code) ||
    state === 'expired'
  );
  const isPermission = (
    PERMISSION_CODES.has(code) ||
    state === 'forbidden'
  );
  const isInvalidWriteShape = isInvalidWriteShapeMessage(cleaned);
  const isParam = (
    PARAM_CODES.has(code) ||
    state === 'invalid' ||
    isInvalidWriteShape
  );
  const isFinished = (
    FINISHED_CODES.has(code) ||
    state === 'finished'
  );
  const isCanceled = (
    CANCELED_CODES.has(code) ||
    state === 'canceled'
  );
  const isDeduped = (
    DEDUPED_CODES.has(code) ||
    state === 'deduped' ||
    err && err.deduped === true
  );

  return {
    code,
    state,
    traceId,
    hasStructuredContext,
    isTimeout,
    isConflict,
    isNetwork,
    isNotFound,
    isOccupied,
    isExpired,
    isPermission,
    isParam,
    isInvalidWriteShape,
    isFinished,
    isCanceled,
    isDeduped,
    rawMessage,
    userMessage: cleaned || fallbackMessage
  };
}

function classifyCloudError(parsed) {
  const p = parsed || {};
  if (p.isConflict) return 'conflict';
  if (p.isTimeout) return 'timeout';
  if (p.isNetwork) return 'network';
  if (p.isNotFound) return 'not_found';
  if (p.isOccupied) return 'occupied';
  if (p.isExpired) return 'expired';
  if (p.isFinished) return 'finished';
  if (p.isCanceled) return 'canceled';
  if (p.isDeduped) return 'deduped';
  if (p.isPermission) return 'permission';
  if (p.isParam || p.isInvalidWriteShape) return 'param';
  const low = String(p.userMessage || '').toLowerCase();
  if (
    low.includes('permission') ||
    low.includes('权限') ||
    low.includes('无权限') ||
    low.includes('仅管理员')
  ) return 'permission';
  if (
    low.includes('invalid') ||
    low.includes('不合法') ||
    low.includes('参数') ||
    low.includes('缺少')
  ) return 'param';
  return 'unknown';
}

function getRuntimeEnv() {
  try {
    if (typeof getApp === 'function') {
      const app = getApp();
      const runtimeEnv = app && app.globalData && app.globalData.runtimeEnv;
      if (runtimeEnv && typeof runtimeEnv === 'object') return runtimeEnv;
    }
  } catch (_) {
    // ignore
  }
  return envConfig.resolveRuntimeEnv();
}

function getUnifiedErrorMessage(err, fallbackMessage = '操作失败') {
  const parsed = parseCloudError(err, fallbackMessage);
  const level = classifyCloudError(parsed);
  if (level === 'timeout') return parsed.hasStructuredContext ? (parsed.userMessage || '请求超时，请重试') : '网络异常，请重试';
  if (level === 'network') return '网络异常，请重试';
  if (level === 'conflict') {
    return parsed.hasStructuredContext
      ? (parsed.userMessage || '数据已被其他人更新，请刷新后重试')
      : '数据已被其他人更新，请刷新后重试';
  }
  if (level === 'occupied' || level === 'expired' || level === 'finished' || level === 'canceled' || level === 'deduped') {
    return parsed.userMessage || fallbackMessage;
  }
  if (level === 'not_found') {
    return parsed.hasStructuredContext
      ? (parsed.userMessage || '赛事不存在')
      : '赛事不存在';
  }
  if (level === 'permission') {
    return parsed.hasStructuredContext
      ? (parsed.userMessage || '权限不足')
      : '权限不足';
  }
  if (level === 'param') {
    return parsed.hasStructuredContext
      ? (parsed.userMessage || '参数有误，请检查')
      : '参数有误，请检查';
  }
  if (String(getRuntimeEnv().envVersion || 'release') === 'release') {
    const action = String(fallbackMessage || '操作失败').trim() || '操作失败';
    const retryMessage = action.includes('请稍后重试') ? action : `${action}，请稍后重试`;
    const shortTraceId = String(parsed.traceId || '').trim().slice(-8);
    return `${retryMessage}${shortTraceId ? `（诊断号 ${shortTraceId}）` : ''}`;
  }
  return parsed.userMessage || fallbackMessage;
}

function normalizeWriteFailure(result, fallbackMessage = '操作失败') {
  const normalized = normalizeCloudResult(result);
  const parsed = parseCloudError(normalized, fallbackMessage);
  const err = new Error(parsed.userMessage || fallbackMessage);
  if (parsed.code) err.code = parsed.code;
  if (parsed.state) err.state = parsed.state;
  if (parsed.traceId) err.traceId = parsed.traceId;
  err.rawResult = normalized;
  return err;
}

function assertWriteResult(result, fallbackMessage = '操作失败') {
  const normalized = normalizeCloudResult(result);
  if (normalized && typeof normalized === 'object' && normalized.ok === false) {
    throw normalizeWriteFailure(normalized, fallbackMessage);
  }
  return normalized;
}

function describeWriteError(options = {}) {
  const err = options.err;
  const fallbackMessage = options.fallbackMessage || '操作失败';
  const parsed = parseCloudError(err, fallbackMessage);
  const level = classifyCloudError(parsed);
  const devHint = getDeveloperHint(err);

  if (parsed.isConflict) {
    return {
      ...parsed,
      level,
      devHint,
      ui: {
        type: 'modal',
        title: options.conflictTitle || '写入冲突',
        content: options.conflictContent || '数据已被他人更新，是否刷新后重试？',
        confirmText: options.confirmText || '刷新',
        cancelText: options.cancelText || '保留草稿',
        onConfirm: options.onRefresh,
        onCancel: options.onKeepDraft
      }
    };
  }

  return {
    ...parsed,
    level,
    devHint,
    ui: {
      type: 'toast',
      title: getUnifiedErrorMessage(err, fallbackMessage),
      icon: 'none'
    }
  };
}

function buildDeveloperHint(name, msg) {
  if (String(getRuntimeEnv().envVersion || 'release') === 'release') return null;
  if (msg.includes('FUNCTION_NOT_FOUND') || msg.includes('FunctionName parameter could not be found') || msg.includes('-501000')) {
    return {
      title: '云函数未部署',
      content: `云函数「${name}」在当前云环境中不存在。\n\n解决：微信开发者工具 → 云开发 → 选择正确环境 → 右键 cloudfunctions/${name} → “上传并部署：云端安装依赖”。`
    };
  }
  if (msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection') && msg.includes('not exists') || msg.includes('-502005')) {
    return {
      title: '数据库集合不存在',
      content: '缺少 tournaments 集合。解决：云开发控制台 → 数据库 → 创建集合 tournaments（读权限允许，写入走云函数）。'
    };
  }
  return null;
}

function isReadOnlyCloudCall(name, payload = {}) {
  const functionName = String(name || '').trim();
  if (READ_ONLY_FUNCTIONS.has(functionName)) return true;
  if (functionName === 'scoreLock') {
    return String(payload.action || '').trim().toLowerCase() === 'status';
  }
  return false;
}

function shouldRetryCloudCall(name, payload = {}, options = {}) {
  if (options.retry === false) return false;
  if (options.retry === true) return true;
  if (isReadOnlyCloudCall(name, payload)) return true;
  return !!String(payload.clientRequestId || '').trim();
}

function normalizeRetryDelays(options = {}) {
  if (Array.isArray(options.retryDelaysMs)) {
    return options.retryDelaysMs
      .map((value) => Math.max(0, Number(value) || 0))
      .slice(0, 2);
  }
  const maxRetries = Number.isFinite(Number(options.maxRetries))
    ? Math.max(0, Math.min(2, Math.floor(Number(options.maxRetries))))
    : 2;
  return DEFAULT_RETRY_DELAYS_MS.slice(0, maxRetries);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function isRetryableCallError(err) {
  const parsed = parseCloudError(err, '操作失败');
  return parsed.isNetwork || parsed.isTimeout;
}

function handleCloudCallFailure(name, err) {
  const msg = normalizeErrMsg(err);
  console.error('云函数调用失败', name, err);

  const devHint = buildDeveloperHint(name, msg);
  if (devHint) {
    attachDeveloperHint(err, devHint);
  } else if (isInvalidWriteShapeMessage(msg)) {
    console.warn(
      '云函数写入参数不合法',
      '检测到云函数向数据库根级写入了保留字段 _id，请检查 doc(id).set/update/add 的 data。'
    );
  }
}

function warnCloudCallRetry(name, attempt, err) {
  try {
    console.warn('云函数调用失败，准备重试', name, attempt + 1, err);
  } catch (_) {
    // ignore
  }
}

async function call(name, data = {}, options = {}) {
  const payload = (data && typeof data === 'object') ? { ...data } : {};
  if (!String(payload.__traceId || '').trim()) {
    payload.__traceId = trace.createTraceId(String(name || 'op').trim() || 'op');
  }
  const retryDelays = shouldRetryCloudCall(name, payload, options)
    ? normalizeRetryDelays(options)
    : [];

  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await wx.cloud.callFunction({ name, data: payload });
      return normalizeCloudResult(res && res.result, name);
    } catch (err) {
      if (err && !String(err.traceId || '').trim()) err.traceId = payload.__traceId;
      const canRetry = attempt < retryDelays.length && isRetryableCallError(err);
      if (!canRetry) {
        handleCloudCallFailure(name, err);
        throw err;
      }
      warnCloudCallRetry(name, attempt, err);
      await wait(retryDelays[attempt]);
    }
  }
}

module.exports = {
  call,
  normalizeCloudResult,
  parseCloudError,
  classifyCloudError,
  getRuntimeEnv,
  getUnifiedErrorMessage,
  describeWriteError,
  getDeveloperHint,
  normalizeWriteFailure,
  assertWriteResult
};
