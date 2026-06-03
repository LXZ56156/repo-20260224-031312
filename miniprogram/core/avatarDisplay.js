const playerUtils = require('./playerUtils');
const avatarPolicy = require('./avatarPolicy');
const envConfig = require('../config/env');

const TEMP_URL_TTL_MS = 50 * 60 * 1000;
const TEMP_URL_BATCH_SIZE = 50;
const FAILED_RETRY_DELAY_MS = 60 * 1000;
const STORAGE_KEY = 'avatar_temp_url_cache_v1';
const PERSIST_THROTTLE_MS = 2000;

let _persistTimer = null;
let _persistDirty = false;

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function nowMs(options = {}) {
  const value = Number(options.now);
  return Number.isFinite(value) ? value : Date.now();
}

function isCloudAvatar(value) {
  return avatarPolicy.isCloudAvatar(value);
}

function logAvatarDiagnostic(level, message, context) {
  try {
    if (level === 'info' && envConfig.getRuntimeEnvVersion() === 'release') return;
    if (typeof console === 'undefined' || typeof console[level] !== 'function') return;
    console[level](message, context);
  } catch (_) {
    // diagnostics must not break avatar fallback
  }
}

function loadPersistentCache() {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return {};
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return {};
    const now = nowMs();
    const result = {};
    for (const key of Object.keys(raw)) {
      if (!String(key || '').trim().startsWith('cloud://')) continue;
      const entry = raw[key];
      if (!entry || typeof entry !== 'object') continue;
      const expiresAt = Number(entry.expiresAt) || 0;
      const url = String(entry.url || '').trim();
      if (url && expiresAt > now) {
        result[key] = { url, expiresAt, updatedAt: Number(entry.updatedAt) || 0 };
      }
    }
    return result;
  } catch (_) {
    return {};
  }
}

function persistCache(avatarCache) {
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return;
    const now = nowMs();
    const payload = {};
    const keys = Object.keys(avatarCache || {});
    for (const key of keys) {
      if (!String(key || '').trim().startsWith('cloud://')) continue;
      const entry = avatarCache[key];
      if (!entry || typeof entry !== 'object') continue;
      const url = String(entry.url || '').trim();
      const expiresAt = Number(entry.expiresAt) || 0;
      if (url && expiresAt > now && entry.failureType !== 'image' && entry.localPreview !== true) {
        payload[key] = { url, expiresAt, updatedAt: now };
      }
    }
    wx.setStorageSync(STORAGE_KEY, payload);
  } catch (_) {
    // storage write failure is non-critical
  }
}

function schedulePersist(avatarCache) {
  _persistDirty = true;
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    if (!_persistDirty) return;
    _persistDirty = false;
    persistCache(avatarCache);
  }, PERSIST_THROTTLE_MS);
}

function getSharedAvatarCache(fallback = {}) {
  const local = fallback && typeof fallback === 'object' ? fallback : {};
  try {
    if (typeof getApp !== 'function') return local;
    const app = getApp();
    if (!app || typeof app !== 'object') return local;
    if (!app.globalData || typeof app.globalData !== 'object') app.globalData = {};
    if (!app.globalData._avatarCache || typeof app.globalData._avatarCache !== 'object') {
      const persisted = loadPersistentCache();
      app.globalData._avatarCache = { ...persisted, ...local };
    }
    return app.globalData._avatarCache;
  } catch (_) {
    return local;
  }
}

function getCachedAvatarUrl(avatarCache = {}, fileId = '', options = {}) {
  const key = String(fileId || '').trim();
  if (!key || !hasOwn(avatarCache, key)) return '';
  const entry = avatarCache[key];
  if (typeof entry === 'string') return entry.trim();
  if (!entry || typeof entry !== 'object') return '';

  const now = nowMs(options);
  const retryAt = Number(entry.retryAt) || 0;
  const url = String(entry.url || entry.tempFileURL || '').trim();
  const expiresAt = Number(entry.expiresAt) || 0;

  if (retryAt > now) {
    if (url && expiresAt > now) return url;
    return '';
  }

  if (url && (!expiresAt || expiresAt > now)) {
    const clearRetryState = options.clearRetryState !== false;
    if (clearRetryState && retryAt && retryAt <= now && entry.failureType !== 'resolve') {
      delete entry.failedAt;
      delete entry.retryAt;
      delete entry.failureType;
    }
    return url;
  }
  if (url && expiresAt && expiresAt <= now) {
    delete avatarCache[key];
  }
  return '';
}

function setCachedAvatarUrl(avatarCache = {}, fileId = '', url = '', options = {}) {
  const key = String(fileId || '').trim();
  const value = String(url || '').trim();
  if (!key || !value) return false;
  avatarCache[key] = {
    url: value,
    expiresAt: nowMs(options) + (Number(options.ttlMs) || TEMP_URL_TTL_MS),
    ...(options.localPreview === true ? { localPreview: true } : {})
  };
  if (options.persist !== false && options.localPreview !== true) schedulePersist(avatarCache);
  return true;
}

function markAvatarUrlFailed(avatarCache = {}, fileId = '', options = {}) {
  const key = String(fileId || '').trim();
  if (!key) return false;
  const preserveUrl = options.preserveUrl === true;
  const prev = avatarCache[key];
  const prevUrl = (prev && typeof prev === 'object')
    ? String(prev.url || prev.tempFileURL || '').trim()
    : (typeof prev === 'string' ? prev : '');
  const prevExpiresAt = (prev && typeof prev === 'object')
    ? Number(prev.expiresAt) || 0
    : 0;
  const now = nowMs(options);
  const retryAt = now + (Number(options.retryDelayMs) || FAILED_RETRY_DELAY_MS);
  if (preserveUrl && prevUrl && prevExpiresAt > now) {
    avatarCache[key] = { url: prevUrl, expiresAt: prevExpiresAt, failedAt: now, retryAt, failureType: 'resolve' };
  } else if (preserveUrl) {
    avatarCache[key] = { failedAt: now, retryAt, failureType: 'resolve' };
  } else {
    avatarCache[key] = {
      failedAt: now,
      retryAt,
      failureType: 'image',
      ...(prevUrl ? { badUrl: prevUrl } : {})
    };
    schedulePersist(avatarCache);
  }
  return true;
}

function markAvatarResolveFailed(avatarCache = {}, failed = [], fileId = '') {
  const key = String(fileId || '').trim();
  if (!key) return false;
  markAvatarUrlFailed(avatarCache, key, { preserveUrl: true });
  if (Array.isArray(failed) && !failed.includes(key)) failed.push(key);
  return true;
}

function shouldResolveCloudAvatarFileId(fileId = '', avatarCache = {}, options = {}) {
  const key = String(fileId || '').trim();
  if (!isCloudAvatar(key)) return false;
  const entry = avatarCache && typeof avatarCache === 'object' ? avatarCache[key] : null;
  const now = nowMs(options);
  const retryAt = entry && typeof entry === 'object' ? Number(entry.retryAt) || 0 : 0;
  const cached = getCachedAvatarUrl(avatarCache, key, { ...options, clearRetryState: false });
  if (cached && entry && typeof entry === 'object' && entry.localPreview === true) return true;
  if (cached) {
    return !!(entry && typeof entry === 'object' && entry.failureType === 'resolve' && retryAt && retryAt <= now);
  }
  if (!hasOwn(avatarCache, key)) return true;
  if (entry && typeof entry === 'object') {
    if (entry.failureType === 'image') return true;
    if (retryAt > now) return false;
  }
  return true;
}

function chunkList(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

function getInitial(name) {
  const value = String(name || '').trim();
  if (!value) return '?';
  return value.slice(0, 1).toUpperCase();
}

function hashString(value) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getColorClass(seed) {
  return `pcolor-${hashString(seed) % 6}`;
}

function getAvatarRaw(player) {
  return String((player && (player.avatar || player.avatarUrl)) || '').trim();
}

function buildAvatarDisplay(player, avatarCache = {}) {
  const id = playerUtils.extractPlayerId(player);
  const name = playerUtils.safePlayerName(player) || '球员';
  const avatarRaw = getAvatarRaw(player);
  let avatarDisplay = '';
  if (avatarRaw) {
    if (isCloudAvatar(avatarRaw)) {
      avatarDisplay = getCachedAvatarUrl(avatarCache, avatarRaw);
    } else if (avatarPolicy.isPersistableAvatar(avatarRaw)) {
      avatarDisplay = avatarRaw;
    }
  }
  return {
    id: id || name,
    name,
    avatarRaw,
    avatarDisplay,
    initial: getInitial(name),
    colorClass: getColorClass(name || id || avatarRaw)
  };
}

function buildAvatarDisplays(list, avatarCache = {}) {
  return (Array.isArray(list) ? list : []).map((item) => buildAvatarDisplay(item, avatarCache));
}

function collectCloudAvatarFileIds(value, avatarCache = {}, output = [], seen = new Set()) {
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;

    const avatarRaw = String(node.avatarRaw || '').trim();
    if (shouldResolveCloudAvatarFileId(avatarRaw, avatarCache) && !seen.has(avatarRaw)) {
      seen.add(avatarRaw);
      output.push(avatarRaw);
    }

    Object.keys(node).forEach((key) => {
      visit(node[key]);
    });
  };

  visit(value);
  return output;
}

async function resolveCloudAvatarFileIds(fileIds, avatarCache = {}) {
  const need = Array.from(new Set((Array.isArray(fileIds) ? fileIds : []).map((item) => String(item || '').trim()).filter(Boolean)))
    .filter((fileId) => shouldResolveCloudAvatarFileId(fileId, avatarCache));
  if (!need.length) {
    return { updated: false, requested: [] };
  }
  logAvatarDiagnostic('info', '[avatar] getTempFileURL request', { fileIDs: need });
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.getTempFileURL !== 'function') {
    logAvatarDiagnostic('warn', '[avatar] getTempFileURL unavailable', { fileIDs: need });
    need.forEach((fileID) => markAvatarResolveFailed(avatarCache, [], fileID));
    return { updated: false, requested: need, failed: need };
  }

  let updated = false;
  const failed = [];
  const unresolved = new Set(need);
  try {
    for (const batch of chunkList(need, TEMP_URL_BATCH_SIZE)) {
      const res = await wx.cloud.getTempFileURL({ fileList: batch });
      const fileList = (res && res.fileList) || [];
      logAvatarDiagnostic('info', '[avatar] getTempFileURL response', { fileList });
      const returned = new Set();
      for (const item of fileList) {
        const fileID = String(item && item.fileID || '').trim();
        if (!fileID) continue;
        returned.add(fileID);
        const url = String(item && item.tempFileURL || '').trim();
        const status = item && item.status;
        const statusOk = status === undefined || status === null || Number(status) === 0;
        if (url && statusOk) {
          updated = setCachedAvatarUrl(avatarCache, fileID, url) || updated;
          unresolved.delete(fileID);
        } else {
          logAvatarDiagnostic('warn', '[avatar] getTempFileURL failed', {
            fileID,
            status,
            errMsg: String(item && item.errMsg || '').trim(),
            tempFileURL: url
          });
          markAvatarResolveFailed(avatarCache, failed, fileID);
          unresolved.delete(fileID);
        }
      }
      batch.forEach((fileID) => {
        if (!returned.has(fileID)) {
          logAvatarDiagnostic('warn', '[avatar] getTempFileURL failed', {
            fileID,
            status: 'missing',
            errMsg: 'fileID missing from getTempFileURL response',
            tempFileURL: ''
          });
          markAvatarResolveFailed(avatarCache, failed, fileID);
          unresolved.delete(fileID);
        }
      });
    }
    return { updated, requested: need, failed };
  } catch (err) {
    logAvatarDiagnostic('warn', '[avatar] resolveCloudAvatarFileIds error', err);
    unresolved.forEach((fileID) => markAvatarResolveFailed(avatarCache, failed, fileID));
    return { updated, requested: need, failed };
  }
}

module.exports = {
  getInitial,
  hashString,
  getColorClass,
  getAvatarRaw,
  isCloudAvatar,
  isHttpAvatar: avatarPolicy.isHttpAvatar,
  isLocalTempAvatar: avatarPolicy.isLocalTempAvatar,
  isPersistableAvatar: avatarPolicy.isPersistableAvatar,
  normalizePersistableAvatar: avatarPolicy.normalizePersistableAvatar,
  classifyAvatar: avatarPolicy.classifyAvatar,
  getSharedAvatarCache,
  getCachedAvatarUrl,
  setCachedAvatarUrl,
  markAvatarUrlFailed,
  shouldResolveCloudAvatarFileId,
  buildAvatarDisplay,
  buildAvatarDisplays,
  collectCloudAvatarFileIds,
  resolveCloudAvatarFileIds
};
