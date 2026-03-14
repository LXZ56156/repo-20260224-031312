const auth = require('./auth');
const cloud = require('./cloud');
const nav = require('./nav');
const storage = require('./storage');

const DEFAULT_AVATAR = '/assets/avatar-default.png';

function readLocalProfile() {
  return storage.getUserProfile() || null;
}

function mergeProfile(base, incoming) {
  const b = base && typeof base === 'object' ? base : {};
  const i = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = {
    ...b,
    ...i,
    nickName: storage.getProfileNickName(i) || storage.getProfileNickName(b),
    avatar: String(i.avatar || i.avatarUrl || b.avatar || b.avatarUrl || '').trim(),
    avatarUrl: String(i.avatarUrl || i.avatar || b.avatarUrl || b.avatar || '').trim(),
    gender: storage.normalizeGender(i.gender || b.gender || 'unknown')
  };
  if (Object.prototype.hasOwnProperty.call(merged, 'nickname')) delete merged.nickname;
  return merged;
}

async function syncCloudProfile() {
  const local = readLocalProfile();
  try {
    const res = await cloud.call('getUserProfile', {});
    const serverProfile = res && res.profile ? res.profile : null;
    if (!serverProfile) return local;
    const merged = mergeProfile(local, serverProfile);
    storage.setUserProfile(merged);
    return merged;
  } catch (_) {
    return local;
  }
}

async function saveCloudProfile(profile) {
  const merged = mergeProfile(readLocalProfile(), profile);
  storage.setUserProfile(merged);
  cloud.assertWriteResult(await cloud.call('saveUserProfile', {
    nickname: merged.nickName,
    avatar: merged.avatar,
    gender: merged.gender
  }), '保存失败');
  return merged;
}

function normalizeQuickFillInput(options = {}, profile = null) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const avatarTempPath = String(options.avatarTempPath || '').trim();
  const nickName = storage.getProfileNickName(options) || storage.getProfileNickName(p);
  return {
    avatarTempPath,
    nickName,
    nickname: nickName,
    nicknameFilled: !!nickName,
    cancelled: !avatarTempPath
  };
}

async function ensureAuthThenQuickFill(options = {}) {
  await auth.login();
  const merged = mergeProfile(readLocalProfile(), options.profile || {});
  return normalizeQuickFillInput(options, merged);
}

async function uploadAvatarFromTemp(tempPath, options = {}) {
  const localPath = String(tempPath || '').trim();
  if (!localPath) {
    const err = new Error('请选择头像');
    err.code = 'EMPTY_AVATAR';
    throw err;
  }
  const openidHint = String(options.openid || '').trim();
  const appOpenid = (() => {
    try {
      if (typeof getApp !== 'function') return '';
      const app = getApp();
      return String((app && app.globalData && app.globalData.openid) || '').trim();
    } catch (_) {
      return '';
    }
  })();
  const cachedOpenid = String(storage.get('openid', '') || '').trim();
  const openid = openidHint || appOpenid || cachedOpenid || await auth.login();
  const up = await wx.cloud.uploadFile({
    cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
    filePath: localPath
  });
  const fileID = up && up.fileID ? String(up.fileID).trim() : '';
  if (!fileID) {
    const err = new Error('头像上传失败');
    err.code = 'AVATAR_UPLOAD_EMPTY';
    throw err;
  }
  return fileID;
}

function buildProfileUrl(returnUrl = '') {
  const back = String(returnUrl || '').trim();
  if (!back) return '/pages/profile/index';
  return nav.buildUrl('/pages/profile/index', { returnUrl: back });
}

async function ensureProfileReady(options = {}) {
  const gate = await ensureProfileForAction('generic', options.redirect, { silent: options.silent === true });
  return { ok: gate.ok, profile: gate.profile || null };
}

function actionDefaultRedirect(action) {
  const key = String(action || '').trim().toLowerCase();
  if (key === 'create') return '/pages/create/index';
  if (key === 'join') return '/pages/lobby/index';
  if (key === 'feedback') return '/pages/feedback/index';
  if (key === 'share_join') return '/pages/share-entry/index';
  return '';
}

async function ensureProfileForAction(action = 'generic', redirect = '', options = {}) {
  const redirectByOptions = String(options.redirect || '').trim();
  const silent = options.silent === true;
  const explicitRedirect = String(redirect || redirectByOptions || '').trim();
  const fallbackRedirect = actionDefaultRedirect(action);
  const targetRedirect = explicitRedirect || fallbackRedirect;

  try {
    await auth.login();
  } catch (_) {
    return { ok: false, profile: readLocalProfile(), reason: 'login_failed' };
  }

  let profile = readLocalProfile();
  if (!storage.isProfileComplete(profile)) {
    profile = await syncCloudProfile();
  }
  const ok = storage.isProfileComplete(profile);
  if (!ok && !silent && targetRedirect) {
    wx.navigateTo({ url: buildProfileUrl(targetRedirect) });
  }
  if (!ok) {
    return { ok: false, profile: profile || null, reason: 'need_profile' };
  }
  return { ok: true, profile: profile || null, reason: 'ok' };
}

module.exports = {
  DEFAULT_AVATAR,
  readLocalProfile,
  mergeProfile,
  syncCloudProfile,
  saveCloudProfile,
  normalizeQuickFillInput,
  ensureAuthThenQuickFill,
  uploadAvatarFromTemp,
  ensureProfileForAction,
  ensureProfileReady,
  buildProfileUrl
};
