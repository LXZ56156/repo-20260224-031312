const playerUtils = require('./playerUtils');

const TEMP_URL_TTL_MS = 9 * 60 * 1000;
const TEMP_URL_BATCH_SIZE = 50;
const FAILED_RETRY_DELAY_MS = 60 * 1000;

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function nowMs(options = {}) {
  const value = Number(options.now);
  return Number.isFinite(value) ? value : Date.now();
}

function isCloudAvatar(value) {
  return String(value || '').trim().startsWith('cloud://');
}

function getCachedAvatarUrl(avatarCache = {}, fileId = '', options = {}) {
  const key = String(fileId || '').trim();
  if (!key || !hasOwn(avatarCache, key)) return '';
  const entry = avatarCache[key];
  if (typeof entry === 'string') return entry.trim();
  if (!entry || typeof entry !== 'object') return '';

  const now = nowMs(options);
  const retryAt = Number(entry.retryAt) || 0;
  if (retryAt > now) return '';

  const url = String(entry.url || entry.tempFileURL || '').trim();
  const expiresAt = Number(entry.expiresAt) || 0;
  if (url && (!expiresAt || expiresAt > now)) return url;
  if ((url && expiresAt && expiresAt <= now) || (retryAt && retryAt <= now)) {
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
    expiresAt: nowMs(options) + (Number(options.ttlMs) || TEMP_URL_TTL_MS)
  };
  return true;
}

function markAvatarUrlFailed(avatarCache = {}, fileId = '', options = {}) {
  const key = String(fileId || '').trim();
  if (!key) return false;
  avatarCache[key] = {
    failedAt: nowMs(options),
    retryAt: nowMs(options) + (Number(options.retryDelayMs) || FAILED_RETRY_DELAY_MS)
  };
  return true;
}

function shouldResolveCloudAvatarFileId(fileId = '', avatarCache = {}, options = {}) {
  const key = String(fileId || '').trim();
  if (!isCloudAvatar(key)) return false;
  if (getCachedAvatarUrl(avatarCache, key, options)) return false;
  if (!hasOwn(avatarCache, key)) return true;
  const entry = avatarCache[key];
  if (entry && typeof entry === 'object') {
    const retryAt = Number(entry.retryAt) || 0;
    if (retryAt > nowMs(options)) return false;
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
    } else {
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
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.getTempFileURL !== 'function') {
    return { updated: false, requested: need };
  }

  let updated = false;
  const failed = [];
  try {
    for (const batch of chunkList(need, TEMP_URL_BATCH_SIZE)) {
      const res = await wx.cloud.getTempFileURL({ fileList: batch });
      const fileList = (res && res.fileList) || [];
      for (const item of fileList) {
        const fileID = String(item && item.fileID || '').trim();
        if (!fileID) continue;
        const url = String(item && item.tempFileURL || '').trim();
        const status = item && item.status;
        const statusOk = status === undefined || status === null || Number(status) === 0;
        if (url && statusOk) {
          updated = setCachedAvatarUrl(avatarCache, fileID, url) || updated;
        } else {
          failed.push(fileID);
          if (hasOwn(avatarCache, fileID) && !getCachedAvatarUrl(avatarCache, fileID)) {
            delete avatarCache[fileID];
          }
        }
      }
    }
    return { updated, requested: need, failed };
  } catch (_) {
    return { updated: false, requested: need };
  }
}

module.exports = {
  getInitial,
  hashString,
  getColorClass,
  getAvatarRaw,
  isCloudAvatar,
  getCachedAvatarUrl,
  setCachedAvatarUrl,
  markAvatarUrlFailed,
  shouldResolveCloudAvatarFileId,
  buildAvatarDisplay,
  buildAvatarDisplays,
  collectCloudAvatarFileIds,
  resolveCloudAvatarFileIds
};
