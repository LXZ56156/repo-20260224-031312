const modeHelper = require('../mode');
const { get, set } = require('./base');

const ONBOARDING_V1_KEY = 'onboarding.v1.done';
const PROFILE_NUDGE_DISMISSED_KEY = 'profile_nudge_dismissed_v1';
const ENTRY_PRUNE_VERSION_KEY = 'entry_prune_version';
const HOME_SORT_MODE_KEY = 'home_sort_mode';
const HOME_FILTER_STATUS_KEY = 'home_filter_status';
const SESSION_MINUTES_PREF_KEY = 'session_minutes_pref';
const SLOT_MINUTES_PREF_KEY = 'slot_minutes_pref';
const DEFAULT_MODE_KEY = 'default_mode';
const ALLOW_OPEN_TEAM_KEY = 'allow_open_team';
const SCHEDULER_PROFILE_KEY = 'scheduler_profile';

function isOnboardingDone() {
  return get(ONBOARDING_V1_KEY, false) === true;
}

function setOnboardingDone(done = true) {
  set(ONBOARDING_V1_KEY, !!done);
}

function isProfileNudgeDismissed() {
  return get(PROFILE_NUDGE_DISMISSED_KEY, false) === true;
}

function setProfileNudgeDismissed(done = true) {
  set(PROFILE_NUDGE_DISMISSED_KEY, !!done);
}

function getEntryPruneVersion() {
  return Number(get(ENTRY_PRUNE_VERSION_KEY, 0)) || 0;
}

function setEntryPruneVersion(version = 1) {
  const value = Number(version);
  if (!Number.isFinite(value) || value < 0) return;
  set(ENTRY_PRUNE_VERSION_KEY, Math.floor(value));
}

function getHomeSortMode() {
  const mode = String(get(HOME_SORT_MODE_KEY, 'updated') || '').trim();
  if (mode === 'players' || mode === 'status' || mode === 'updated') return mode;
  return 'updated';
}

function setHomeSortMode(mode) {
  const value = String(mode || '').trim();
  if (!value) return;
  set(HOME_SORT_MODE_KEY, value);
}

function getHomeFilterStatus() {
  const status = String(get(HOME_FILTER_STATUS_KEY, 'all') || '').trim();
  if (status === 'all' || status === 'running' || status === 'draft' || status === 'finished') return status;
  return 'all';
}

function setHomeFilterStatus(status) {
  const value = String(status || '').trim();
  if (!value) return;
  set(HOME_FILTER_STATUS_KEY, value);
}

function getSessionMinutesPref() {
  const value = Number(get(SESSION_MINUTES_PREF_KEY, 120));
  return Number.isFinite(value) && value > 0 ? value : 120;
}

function setSessionMinutesPref(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return;
  set(SESSION_MINUTES_PREF_KEY, Math.floor(value));
}

function getSlotMinutesPref() {
  const value = Number(get(SLOT_MINUTES_PREF_KEY, 15));
  return Number.isFinite(value) && value > 0 ? value : 15;
}

function setSlotMinutesPref(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return;
  set(SLOT_MINUTES_PREF_KEY, Math.floor(value));
}

function normalizeMode(mode) {
  return modeHelper.normalizeMode(mode);
}

function getDefaultMode() {
  return normalizeMode(get(DEFAULT_MODE_KEY, 'multi_rotate'));
}

function setDefaultMode(mode) {
  set(DEFAULT_MODE_KEY, normalizeMode(mode));
}

function getAllowOpenTeam() {
  return get(ALLOW_OPEN_TEAM_KEY, false) === true;
}

function setAllowOpenTeam(enabled) {
  set(ALLOW_OPEN_TEAM_KEY, !!enabled);
}

function normalizeSchedulerProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();
  if (value === 'rest' || value === 'balanced' || value === 'repeat') return value;
  return 'rest';
}

function getSchedulerProfile() {
  return normalizeSchedulerProfile(get(SCHEDULER_PROFILE_KEY, 'rest'));
}

function setSchedulerProfile(profile) {
  set(SCHEDULER_PROFILE_KEY, normalizeSchedulerProfile(profile));
}

module.exports = {
  isOnboardingDone,
  setOnboardingDone,
  isProfileNudgeDismissed,
  setProfileNudgeDismissed,
  getEntryPruneVersion,
  setEntryPruneVersion,
  getHomeSortMode,
  setHomeSortMode,
  getHomeFilterStatus,
  setHomeFilterStatus,
  getSessionMinutesPref,
  setSessionMinutesPref,
  getSlotMinutesPref,
  setSlotMinutesPref,
  getDefaultMode,
  setDefaultMode,
  getAllowOpenTeam,
  setAllowOpenTeam,
  normalizeSchedulerProfile,
  getSchedulerProfile,
  setSchedulerProfile
};
