const storage = require('./storage');

const MOTION_LEVEL_KEY = 'motion_level';
const LIST_DENSITY_KEY = 'list_density';

function normalizeMotionLevel(level) {
  const value = String(level || '').trim();
  if (value === 'light' || value === 'off' || value === 'standard') return value;
  return 'standard';
}

function normalizeListDensity(density) {
  const value = String(density || '').trim();
  if (value === 'compact' || value === 'comfortable') return value;
  return 'comfortable';
}

function canUseStorage() {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';
}

function readPreference(key, fallback) {
  if (!canUseStorage()) return fallback;
  return storage.get(key, fallback);
}

function readUiPreferences() {
  return {
    motionLevel: normalizeMotionLevel(readPreference(MOTION_LEVEL_KEY, 'standard')),
    listDensity: normalizeListDensity(readPreference(LIST_DENSITY_KEY, 'comfortable'))
  };
}

function buildPreferenceClass(preferences = {}) {
  const motionLevel = normalizeMotionLevel(preferences.motionLevel);
  const listDensity = normalizeListDensity(preferences.listDensity);
  return {
    motionLevel,
    listDensity,
    uiMotionClass: `motion-${motionLevel}`,
    uiDensityClass: `density-${listDensity}`,
    uiPreferenceClass: `motion-${motionLevel} density-${listDensity}`
  };
}

function readUiPreferencePatch() {
  return buildPreferenceClass(readUiPreferences());
}

function saveMotionLevel(level) {
  const motionLevel = normalizeMotionLevel(level);
  storage.set(MOTION_LEVEL_KEY, motionLevel);
  return motionLevel;
}

function saveListDensity(density) {
  const listDensity = normalizeListDensity(density);
  storage.set(LIST_DENSITY_KEY, listDensity);
  return listDensity;
}

module.exports = {
  MOTION_LEVEL_KEY,
  LIST_DENSITY_KEY,
  normalizeMotionLevel,
  normalizeListDensity,
  readUiPreferences,
  buildPreferenceClass,
  readUiPreferencePatch,
  saveMotionLevel,
  saveListDensity
};
