const trace = require('./trace');
const envConfig = require('../config/env');

const CONFLICT_CODES = new Set(['VERSION_CONFLICT']);
const NETWORK_CODES = new Set(['NETWORK_ERROR']);
const PERMISSION_CODES = new Set(['PERMISSION_DENIED', 'LOCK_FORBIDDEN', 'JOIN_DRAFT_ONLY', 'START_DRAFT_ONLY', 'SETTINGS_DRAFT_ONLY']);
const PARAM_CODES = new Set([
  'ACTION_REQUIRED',
  'TOURNAMENT_ID_REQUIRED',
  'TOURNAMENT_NOT_FOUND',
  'PROFILE_MINIMUM_REQUIRED',
  'SCORE_OUT_OF_RANGE',
  'SETTINGS_REQUIRED',
  'SETTINGS_INVALID',
  'START_VALIDATION_FAILED'
]);

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

function normalizeResultCode(err) {
  return String(err && err.code || '').trim().toUpperCase();
}

function normalizeResultState(err) {
  return String(err && err.state || '').trim().toLowerCase();
}

function normalizeTraceId(err) {
  return String(err && (err.traceId || err.__traceId) || '').trim();
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
  const code = normalizeResultCode(err);
  const state = normalizeResultState(err);
  const traceId = normalizeTraceId(err);
  const rawMessage = normalizeErrMsg(err);
  const cleaned = stripCloudPrefix(rawMessage);
  const low = cleaned.toLowerCase();
  const hasStructuredContext = !!(code || state);
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
    low.includes('network') ||
    low.includes('timeout') ||
    low.includes('fail to connect') ||
    cleaned.includes('网络')
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

  return {
    code,
    state,
    traceId,
    hasStructuredContext,
    isConflict,
    isNetwork,
    isPermission,
    isParam,
    isInvalidWriteShape,
    rawMessage,
    userMessage: cleaned || fallbackMessage
  };
}

function classifyCloudError(parsed) {
  const p = parsed || {};
  if (p.isConflict) return 'conflict';
  if (p.isNetwork) return 'network';
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
  if (level === 'network') return '网络异常，请重试';
  if (level === 'conflict') {
    return parsed.hasStructuredContext
      ? (parsed.userMessage || '数据已被其他人更新，请刷新后重试')
      : '数据已被其他人更新，请刷新后重试';
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
    return '操作失败，请稍后重试';
  }
  return parsed.userMessage || fallbackMessage;
}

function normalizeWriteFailure(result, fallbackMessage = '操作失败') {
  const parsed = parseCloudError(result, fallbackMessage);
  const err = new Error(parsed.userMessage || fallbackMessage);
  if (parsed.code) err.code = parsed.code;
  if (parsed.state) err.state = parsed.state;
  if (parsed.traceId) err.traceId = parsed.traceId;
  err.rawResult = result;
  return err;
}

function assertWriteResult(result, fallbackMessage = '操作失败') {
  if (result && typeof result === 'object' && result.ok === false) {
    throw normalizeWriteFailure(result, fallbackMessage);
  }
  return result;
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

function call(name, data = {}) {
  const payload = (data && typeof data === 'object') ? { ...data } : {};
  if (!String(payload.__traceId || '').trim()) {
    payload.__traceId = trace.createTraceId(String(name || 'op').trim() || 'op');
  }
  return wx.cloud.callFunction({ name, data: payload })
    .then(res => res.result)
    .catch(err => {
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

      throw err;
    });
}

module.exports = {
  call,
  parseCloudError,
  classifyCloudError,
  getRuntimeEnv,
  getUnifiedErrorMessage,
  describeWriteError,
  getDeveloperHint,
  normalizeWriteFailure,
  assertWriteResult
};
