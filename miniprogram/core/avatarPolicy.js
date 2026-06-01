function normalizeAvatarValue(value) {
  return String(value || '').trim();
}

function isCloudAvatar(value) {
  return normalizeAvatarValue(value).startsWith('cloud://');
}

function isHttpAvatar(value) {
  return /^https?:\/\//i.test(normalizeAvatarValue(value));
}

function isLocalTempAvatar(value) {
  const raw = normalizeAvatarValue(value);
  if (!raw) return false;
  return /^(?:wxfile:\/\/|file:\/\/|blob:|https?:\/\/tmp(?:\/|$)|\/?tmp\/)/i.test(raw);
}

function isPersistableAvatar(value) {
  const raw = normalizeAvatarValue(value);
  if (!raw || isLocalTempAvatar(raw)) return false;
  return isCloudAvatar(raw) || isHttpAvatar(raw);
}

function normalizePersistableAvatar(value) {
  const raw = normalizeAvatarValue(value);
  return isPersistableAvatar(raw) ? raw : '';
}

function classifyAvatar(value) {
  const raw = normalizeAvatarValue(value);
  if (!raw) return 'empty';
  if (isLocalTempAvatar(raw)) return 'temporary';
  if (isCloudAvatar(raw)) return 'cloud';
  if (isHttpAvatar(raw)) return 'http';
  return 'unsupported';
}

module.exports = {
  normalizeAvatarValue,
  isCloudAvatar,
  isHttpAvatar,
  isLocalTempAvatar,
  isPersistableAvatar,
  normalizePersistableAvatar,
  classifyAvatar
};
