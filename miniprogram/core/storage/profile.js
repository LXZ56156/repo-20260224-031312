const { get, set, del } = require('./base');

function normalizeGender(gender) {
  const value = String(gender || '').trim().toLowerCase();
  if (value === 'male' || value === 'female') return value;
  return 'unknown';
}

function getProfileNickName(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const preferred = String(profile.nickName || '').trim();
  const legacy = preferred ? '' : String(profile.nickname || '').trim();
  const nickName = preferred || legacy;
  return nickName === '微信用户' ? '' : nickName;
}

function sanitizeUserProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const nickName = getProfileNickName(profile);

  const rawAvatarUrl = String(profile.avatarUrl || profile.avatarURL || '').trim();
  const rawAvatar = String(profile.avatar || '').trim();
  let avatarUrl = rawAvatarUrl;
  let avatar = rawAvatar;
  if (!avatarUrl && avatar && /^https?:\/\//i.test(avatar)) avatarUrl = avatar;
  if (!avatar && avatarUrl) avatar = avatarUrl;
  const gender = normalizeGender(profile.gender);

  if (!nickName && !avatarUrl && !avatar) return null;
  const sanitized = { ...profile, nickName, avatarUrl, avatar, gender };
  if (Object.prototype.hasOwnProperty.call(sanitized, 'nickname')) delete sanitized.nickname;
  return sanitized;
}

function isProfileComplete(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const nickname = getProfileNickName(profile);
  const gender = normalizeGender(profile.gender);
  return !!nickname && gender !== 'unknown';
}

function getUserProfile() {
  const raw = get('userProfile', null);
  const sanitized = sanitizeUserProfile(raw);
  if (!sanitized && raw) del('userProfile');
  return sanitized;
}

function setUserProfile(profile) {
  const sanitized = sanitizeUserProfile(profile);
  set('userProfile', sanitized);
  set('profile_completed', isProfileComplete(sanitized));
  set('profile_updated_at', Date.now());
}

function getProfileCompleted() {
  return get('profile_completed', false) === true;
}

function setProfileCompleted(done = true) {
  set('profile_completed', !!done);
}

function getProfileUpdatedAt() {
  return Number(get('profile_updated_at', 0)) || 0;
}

module.exports = {
  normalizeGender,
  getProfileNickName,
  sanitizeUserProfile,
  isProfileComplete,
  getUserProfile,
  setUserProfile,
  getProfileCompleted,
  setProfileCompleted,
  getProfileUpdatedAt
};
