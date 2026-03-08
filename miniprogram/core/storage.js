const modeHelper = require('./mode');

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

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

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
  const gender = normalizeGender(profile.gender);

  if (!nickName && !avatarUrl && !avatar) return null;
  return { ...profile, nickName, nickname, avatarUrl, avatar, gender };
}

const getUserProfile = () => {
  const raw = get('userProfile', null);
  const sanitized = sanitizeUserProfile(raw);
  if (!sanitized && raw) del('userProfile');
  return sanitized;
};

const setUserProfile = (profile) => {
  const sanitized = sanitizeUserProfile(profile);
  set('userProfile', sanitized);
  set('profile_completed', isProfileComplete(sanitized));
  set('profile_updated_at', Date.now());
};

function isProfileComplete(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const nickname = String(profile.nickName || profile.nickname || '').trim();
  const gender = normalizeGender(profile.gender);
  return !!nickname && gender !== 'unknown';
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

// ===== 本地已完成战绩账本 =====
const LOCAL_COMPLETED_TOURNAMENT_IDS_KEY = 'local_completed_tournament_ids_v1';
const LOCAL_TOURNAMENT_SNAPSHOT_PREFIX = 'local_tournament_snapshot_';
const LOCAL_TOURNAMENT_CACHE_PREFIX = 'local_tournament_cache_';
const LOCAL_COMPLETED_MAX = 500;

function extractEntityId(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return String(raw).trim();
  return String(raw.id || raw.playerId || raw._id || '').trim();
}

function parseScorePair(match) {
  const m = match || {};
  const scoreObj = m.score || {};
  const a = Number(m.teamAScore ?? m.scoreA ?? m.a ?? m.left ?? scoreObj.teamA);
  const b = Number(m.teamBScore ?? m.scoreB ?? m.b ?? m.right ?? scoreObj.teamB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a: Math.floor(a), b: Math.floor(b) };
}

function toTs(value) {
  if (!value) return 0;
  try {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  } catch (_) {
    return 0;
  }
}

function getCurrentOpenid() {
  const cached = String(get('openid', '') || '').trim();
  if (cached) return cached;
  try {
    if (typeof getApp !== 'function') return '';
    const app = getApp();
    return String((app && app.globalData && app.globalData.openid) || '').trim();
  } catch (_) {
    return '';
  }
}

function getLocalTournamentSnapshotKey(tournamentId) {
  return `${LOCAL_TOURNAMENT_SNAPSHOT_PREFIX}${String(tournamentId || '').trim()}`;
}

function getLocalTournamentCacheKey(tournamentId) {
  return `${LOCAL_TOURNAMENT_CACHE_PREFIX}${String(tournamentId || '').trim()}`;
}

function getLocalCompletedTournamentIds() {
  const ids = get(LOCAL_COMPLETED_TOURNAMENT_IDS_KEY, []);
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '').trim()).filter(Boolean);
}

function setLocalCompletedTournamentIds(ids) {
  const next = Array.isArray(ids) ? ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
  set(LOCAL_COMPLETED_TOURNAMENT_IDS_KEY, next);
}

function getLocalTournamentSnapshot(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;
  const snapshot = get(getLocalTournamentSnapshotKey(tid), null);
  return (snapshot && typeof snapshot === 'object') ? snapshot : null;
}

function setLocalTournamentSnapshot(tournamentId, snapshot) {
  const tid = String(tournamentId || '').trim();
  if (!tid || !snapshot || typeof snapshot !== 'object') return;
  set(getLocalTournamentSnapshotKey(tid), snapshot);
}

function getLocalTournamentCache(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;
  const doc = get(getLocalTournamentCacheKey(tid), null);
  return (doc && typeof doc === 'object') ? doc : null;
}

function setLocalTournamentCache(tournamentId, tournamentDoc) {
  const tid = String(tournamentId || '').trim();
  if (!tid || !tournamentDoc || typeof tournamentDoc !== 'object') return;
  set(getLocalTournamentCacheKey(tid), tournamentDoc);
}

function removeLocalTournamentCache(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return;
  del(getLocalTournamentCacheKey(tid));
}

function removeLocalCompletedTournamentSnapshot(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return;
  const nextIds = getLocalCompletedTournamentIds().filter((id) => id !== tid);
  setLocalCompletedTournamentIds(nextIds);
  del(getLocalTournamentSnapshotKey(tid));
}

function buildLocalTournamentSnapshot(tournament) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const tid = String(t._id || t.id || '').trim();
  if (!tid) return null;
  const roundsRaw = Array.isArray(t.rounds) ? t.rounds : [];
  const playersRaw = Array.isArray(t.players) ? t.players : [];
  const playerIds = Array.isArray(t.playerIds)
    ? t.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
    : playersRaw.map((item) => extractEntityId(item)).filter(Boolean);
  const players = playersRaw.map((item) => ({
    id: extractEntityId(item)
  })).filter((item) => !!item.id);
  const rounds = roundsRaw.map((round) => {
    const matchesRaw = Array.isArray(round && round.matches) ? round.matches : [];
    const matches = matchesRaw.map((match, idx) => {
      const scorePair = parseScorePair(match);
      const base = {
        matchIndex: Number(match && match.matchIndex),
        status: String(match && match.status || '').trim() || 'pending',
        scoredAt: match && match.scoredAt ? match.scoredAt : null,
        teamA: Array.isArray(match && match.teamA) ? match.teamA.map((p) => extractEntityId(p)).filter(Boolean) : [],
        teamB: Array.isArray(match && match.teamB) ? match.teamB.map((p) => extractEntityId(p)).filter(Boolean) : []
      };
      if (!Number.isFinite(base.matchIndex)) base.matchIndex = idx;
      if (scorePair) {
        base.score = { teamA: scorePair.a, teamB: scorePair.b };
      }
      return base;
    });
    return {
      roundIndex: Number(round && round.roundIndex) || 0,
      matches
    };
  });

  return {
    _id: tid,
    status: String(t.status || '').trim(),
    mode: String(t.mode || '').trim(),
    updatedAt: t.updatedAt || null,
    createdAt: t.createdAt || null,
    updatedAtTs: toTs(t.updatedAt) || toTs(t.createdAt) || Date.now(),
    playerIds,
    players,
    rounds
  };
}

function isParticipantInTournament(tournament, openid) {
  const oid = String(openid || '').trim();
  if (!oid || !tournament || typeof tournament !== 'object') return false;
  const playerIds = Array.isArray(tournament.playerIds)
    ? tournament.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (playerIds.includes(oid)) return true;
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  return players.some((item) => extractEntityId(item) === oid);
}

function upsertLocalCompletedTournamentSnapshot(tournament, openid = '') {
  const t = tournament && typeof tournament === 'object' ? tournament : null;
  const tid = String(t && (t._id || t.id) || '').trim();
  if (!tid) return false;
  const oid = String(openid || getCurrentOpenid() || '').trim();
  if (!oid) return false;
  const status = String((t && t.status) || '').trim();

  if (status !== 'finished' || !isParticipantInTournament(t, oid)) {
    removeLocalCompletedTournamentSnapshot(tid);
    return false;
  }

  const snapshot = buildLocalTournamentSnapshot(t);
  if (!snapshot) return false;
  setLocalTournamentSnapshot(tid, snapshot);

  const ids = getLocalCompletedTournamentIds();
  const nextIds = [tid, ...ids.filter((id) => id !== tid)];
  if (nextIds.length > LOCAL_COMPLETED_MAX) {
    const overflowIds = nextIds.slice(LOCAL_COMPLETED_MAX);
    overflowIds.forEach((id) => del(getLocalTournamentSnapshotKey(id)));
  }
  setLocalCompletedTournamentIds(nextIds.slice(0, LOCAL_COMPLETED_MAX));
  return true;
}

function getLocalCompletedTournamentSnapshots() {
  const ids = getLocalCompletedTournamentIds();
  const out = [];
  for (const id of ids) {
    const snapshot = getLocalTournamentSnapshot(id);
    if (snapshot) out.push(snapshot);
  }
  out.sort((a, b) => (Number(b.updatedAtTs) || 0) - (Number(a.updatedAtTs) || 0));
  return out;
}

const ONBOARDING_V1_KEY = 'onboarding.v1.done';
const isOnboardingDone = () => get(ONBOARDING_V1_KEY, false) === true;
const setOnboardingDone = (done = true) => set(ONBOARDING_V1_KEY, !!done);

const PROFILE_NUDGE_DISMISSED_KEY = 'profile_nudge_dismissed_v1';
const ENTRY_PRUNE_VERSION_KEY = 'entry_prune_version';
const isProfileNudgeDismissed = () => get(PROFILE_NUDGE_DISMISSED_KEY, false) === true;
const setProfileNudgeDismissed = (done = true) => set(PROFILE_NUDGE_DISMISSED_KEY, !!done);
function getEntryPruneVersion() {
  return Number(get(ENTRY_PRUNE_VERSION_KEY, 0)) || 0;
}
function setEntryPruneVersion(version = 1) {
  const v = Number(version);
  if (!Number.isFinite(v) || v < 0) return;
  set(ENTRY_PRUNE_VERSION_KEY, Math.floor(v));
}

// ===== 首页排序偏好 =====
const HOME_SORT_MODE_KEY = 'home_sort_mode';
const HOME_FILTER_STATUS_KEY = 'home_filter_status';
function getHomeSortMode() {
  const mode = String(get(HOME_SORT_MODE_KEY, 'updated') || '').trim();
  if (mode === 'players' || mode === 'status' || mode === 'updated') return mode;
  return 'updated';
}
function setHomeSortMode(mode) {
  const v = String(mode || '').trim();
  if (!v) return;
  set(HOME_SORT_MODE_KEY, v);
}
function getHomeFilterStatus() {
  const status = String(get(HOME_FILTER_STATUS_KEY, 'all') || '').trim();
  if (status === 'all' || status === 'running' || status === 'draft' || status === 'finished') return status;
  return 'all';
}
function setHomeFilterStatus(status) {
  const v = String(status || '').trim();
  if (!v) return;
  set(HOME_FILTER_STATUS_KEY, v);
}

// ===== 赛前参数偏好 =====
const SESSION_MINUTES_PREF_KEY = 'session_minutes_pref';
const SLOT_MINUTES_PREF_KEY = 'slot_minutes_pref';
const DEFAULT_MODE_KEY = 'default_mode';
const ALLOW_OPEN_TEAM_KEY = 'allow_open_team';
const SCHEDULER_PROFILE_KEY = 'scheduler_profile';
function getSessionMinutesPref() {
  const v = Number(get(SESSION_MINUTES_PREF_KEY, 120));
  return Number.isFinite(v) && v > 0 ? v : 120;
}
function setSessionMinutesPref(minutes) {
  const v = Number(minutes);
  if (!Number.isFinite(v) || v <= 0) return;
  set(SESSION_MINUTES_PREF_KEY, Math.floor(v));
}
function getSlotMinutesPref() {
  const v = Number(get(SLOT_MINUTES_PREF_KEY, 15));
  return Number.isFinite(v) && v > 0 ? v : 15;
}
function setSlotMinutesPref(minutes) {
  const v = Number(minutes);
  if (!Number.isFinite(v) || v <= 0) return;
  set(SLOT_MINUTES_PREF_KEY, Math.floor(v));
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
  const v = String(profile || '').trim().toLowerCase();
  if (v === 'rest' || v === 'balanced' || v === 'repeat') return v;
  return 'rest';
}

function getSchedulerProfile() {
  return normalizeSchedulerProfile(get(SCHEDULER_PROFILE_KEY, 'rest'));
}

function setSchedulerProfile(profile) {
  set(SCHEDULER_PROFILE_KEY, normalizeSchedulerProfile(profile));
}

// ===== 录分草稿 =====
const SCORE_DRAFT_PREFIX = 'score_draft_';
function buildScoreDraftKey(tournamentId, roundIndex, matchIndex) {
  const tid = String(tournamentId || '').trim();
  const r = Number(roundIndex);
  const m = Number(matchIndex);
  return `${SCORE_DRAFT_PREFIX}${tid}_${Number.isFinite(r) ? r : 0}_${Number.isFinite(m) ? m : 0}`;
}
function getScoreDraft(tournamentId, roundIndex, matchIndex) {
  const key = buildScoreDraftKey(tournamentId, roundIndex, matchIndex);
  return get(key, null);
}
function setScoreDraft(tournamentId, roundIndex, matchIndex, draft) {
  const key = buildScoreDraftKey(tournamentId, roundIndex, matchIndex);
  set(key, draft || null);
}
function removeScoreDraft(tournamentId, roundIndex, matchIndex) {
  const key = buildScoreDraftKey(tournamentId, roundIndex, matchIndex);
  del(key);
}

// ===== 广告曝光守卫 =====
const AD_GUARD_EXPOSURE_PREFIX = 'ad_guard_last_exposure_';
const AD_GUARD_SPLASH_KEY = 'ad_guard_last_splash_at';
function getAdLastExposure(page) {
  const p = String(page || '').trim();
  if (!p) return 0;
  return Number(get(`${AD_GUARD_EXPOSURE_PREFIX}${p}`, 0)) || 0;
}
function setAdLastExposure(page, ts = Date.now()) {
  const p = String(page || '').trim();
  if (!p) return;
  set(`${AD_GUARD_EXPOSURE_PREFIX}${p}`, Number(ts) || Date.now());
}
function getAdLastSplashAt() {
  return Number(get(AD_GUARD_SPLASH_KEY, 0)) || 0;
}
function setAdLastSplashAt(ts = Date.now()) {
  set(AD_GUARD_SPLASH_KEY, Number(ts) || Date.now());
}

module.exports = {
  get,
  set,
  del,

  getUserProfile,
  setUserProfile,
  isProfileComplete,
  getProfileCompleted,
  setProfileCompleted,
  getProfileUpdatedAt,
  normalizeGender,

  getRecentTournamentIds,
  addRecentTournamentId,
  removeRecentTournamentId,
  getLocalCompletedTournamentIds,
  getLocalCompletedTournamentSnapshots,
  getLocalTournamentSnapshot,
  setLocalTournamentSnapshot,
  removeLocalCompletedTournamentSnapshot,
  getLocalTournamentCache,
  setLocalTournamentCache,
  removeLocalTournamentCache,
  upsertLocalCompletedTournamentSnapshot,
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
  getSchedulerProfile,
  setSchedulerProfile,

  buildScoreDraftKey,
  getScoreDraft,
  setScoreDraft,
  removeScoreDraft,

  getAdLastExposure,
  setAdLastExposure,
  getAdLastSplashAt,
  setAdLastSplashAt
};
