const playerUtils = require('./playerUtils');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
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
    if (avatarRaw.startsWith('cloud://')) {
      avatarDisplay = hasOwn(avatarCache, avatarRaw) ? (avatarCache[avatarRaw] || '') : '';
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
    const cached = hasOwn(avatarCache, avatarRaw) ? String(avatarCache[avatarRaw] || '').trim() : '';
    if (avatarRaw.startsWith('cloud://') && (!cached || !hasOwn(avatarCache, avatarRaw)) && !seen.has(avatarRaw)) {
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
    .filter((fileId) => fileId.startsWith('cloud://') && !hasOwn(avatarCache, fileId));
  if (!need.length) {
    return { updated: false, requested: [] };
  }
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.getTempFileURL !== 'function') {
    return { updated: false, requested: need };
  }

  let updated = false;
  const resolved = new Set();
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: need });
    const fileList = (res && res.fileList) || [];
    for (const item of fileList) {
      const fileID = String(item && item.fileID || '').trim();
      if (!fileID) continue;
      resolved.add(fileID);
      const url = String(item && item.tempFileURL || '').trim();
      if (url) {
        avatarCache[fileID] = url;
        updated = true;
      } else if (hasOwn(avatarCache, fileID) && !avatarCache[fileID]) {
        delete avatarCache[fileID];
      }
    }
    return { updated, requested: need };
  } catch (_) {
    return { updated: false, requested: need };
  }
}

module.exports = {
  getInitial,
  hashString,
  getColorClass,
  getAvatarRaw,
  buildAvatarDisplay,
  buildAvatarDisplays,
  collectCloudAvatarFileIds,
  resolveCloudAvatarFileIds
};
