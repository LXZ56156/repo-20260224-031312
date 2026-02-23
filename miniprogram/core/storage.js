const get = (key, fallback = null) => {
  try {
    const v = wx.getStorageSync(key);
    return v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
};

const set = (key, value) => {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    // ignore
  }
};

const del = (key) => {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    // ignore
  }
};

// ===== 用户信息（可选） =====
// 兼容旧版本可能写入的“微信用户”占位昵称：视为无效并自动清理缓存。
function sanitizeUserProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const rawNick = String(profile.nickName || profile.nickname || '').trim();
  const nickName = rawNick === '微信用户' ? '' : rawNick;
  // 兼容旧字段 nickname：统一清理占位昵称
  const nickname = nickName;

  const rawAvatarUrl = String(profile.avatarUrl || profile.avatarURL || '').trim();
  const rawAvatar = String(profile.avatar || '').trim();

  // avatarUrl：微信头像 http(s)；avatar：可能是 cloud fileID 或 http(s)
  let avatarUrl = rawAvatarUrl;
  let avatar = rawAvatar;
  if (!avatarUrl && avatar && /^https?:\/\//i.test(avatar)) avatarUrl = avatar;
  if (!avatar && avatarUrl) avatar = avatarUrl;

  if (!nickName && !avatarUrl && !avatar) return null;
  return { ...profile, nickName, nickname, avatarUrl, avatar };
}

const getUserProfile = () => {
  const raw = get('userProfile', null);
  const sanitized = sanitizeUserProfile(raw);
  if (!sanitized && raw) del('userProfile');
  return sanitized;
};

const setUserProfile = (profile) => {
  set('userProfile', sanitizeUserProfile(profile));
};

// ===== 最近赛事（仅存 ID 列表，最多 20 条） =====
const RECENT_TOURNAMENTS_KEY = 'recentTournaments';
const getRecentTournamentIds = () => {
  const ids = get(RECENT_TOURNAMENTS_KEY, []);
  return Array.isArray(ids) ? ids : [];
};

const addRecentTournamentId = (id) => {
  if (!id) return;
  const ids = getRecentTournamentIds();
  const next = [id, ...ids.filter((x) => x && x !== id)].slice(0, 20);
  set(RECENT_TOURNAMENTS_KEY, next);
};

const removeRecentTournamentId = (id) => {
  const ids = getRecentTournamentIds().filter((x) => x && x !== id);
  set(RECENT_TOURNAMENTS_KEY, ids);
};

const ONBOARDING_V1_KEY = 'onboarding.v1.done';
const isOnboardingDone = () => get(ONBOARDING_V1_KEY, false) === true;
const setOnboardingDone = (done = true) => set(ONBOARDING_V1_KEY, !!done);

module.exports = {
  get,
  set,
  del,

  getUserProfile,
  setUserProfile,

  getRecentTournamentIds,
  addRecentTournamentId,
  removeRecentTournamentId,
  isOnboardingDone,
  setOnboardingDone,
};
