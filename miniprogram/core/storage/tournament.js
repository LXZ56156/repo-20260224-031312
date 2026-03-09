const playerUtils = require('../playerUtils');
const scoreUtils = require('../scoreUtils');
const { get, set, del } = require('./base');

const RECENT_TOURNAMENTS_KEY = 'recentTournaments';
const LOCAL_COMPLETED_TOURNAMENT_IDS_KEY = 'local_completed_tournament_ids_v1';
const LOCAL_COMPLETED_TOURNAMENT_MAP_KEY = 'local_completed_tournament_map_v2';
const LOCAL_TOURNAMENT_SNAPSHOT_PREFIX = 'local_tournament_snapshot_';
const LOCAL_TOURNAMENT_CACHE_PREFIX = 'local_tournament_cache_';
const LOCAL_COMPLETED_MAX = 500;

function getRecentTournamentIds() {
  const ids = get(RECENT_TOURNAMENTS_KEY, []);
  return Array.isArray(ids) ? ids : [];
}

function addRecentTournamentId(id) {
  if (!id) return;
  const ids = getRecentTournamentIds();
  const next = [id, ...ids.filter((item) => item && item !== id)].slice(0, 20);
  set(RECENT_TOURNAMENTS_KEY, next);
}

function removeRecentTournamentId(id) {
  const ids = getRecentTournamentIds().filter((item) => item && item !== id);
  set(RECENT_TOURNAMENTS_KEY, ids);
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

function snapshotUpdatedAtTs(snapshot) {
  return Number(snapshot && snapshot.updatedAtTs) || 0;
}

function choosePreferredSnapshot(mapSnapshot, legacySnapshot) {
  const mapValue = mapSnapshot && typeof mapSnapshot === 'object' ? mapSnapshot : null;
  const legacyValue = legacySnapshot && typeof legacySnapshot === 'object' ? legacySnapshot : null;
  if (!mapValue) return { snapshot: legacyValue, source: legacyValue ? 'legacy' : '' };
  if (!legacyValue) return { snapshot: mapValue, source: 'map' };
  if (snapshotUpdatedAtTs(legacyValue) > snapshotUpdatedAtTs(mapValue)) {
    return { snapshot: legacyValue, source: 'legacy' };
  }
  return { snapshot: mapValue, source: 'map' };
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

function getLocalCompletedTournamentMap() {
  const raw = get(LOCAL_COMPLETED_TOURNAMENT_MAP_KEY, null);
  return raw && typeof raw === 'object' ? raw : {};
}

function setLocalCompletedTournamentMap(map) {
  const value = map && typeof map === 'object' ? map : {};
  set(LOCAL_COMPLETED_TOURNAMENT_MAP_KEY, value);
}

function setLocalCompletedTournamentIds(ids) {
  const next = Array.isArray(ids) ? ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
  set(LOCAL_COMPLETED_TOURNAMENT_IDS_KEY, next);
}

function getLocalTournamentSnapshot(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;
  const snapshotMap = getLocalCompletedTournamentMap();
  const mapSnapshot = snapshotMap[tid];
  const legacySnapshot = get(getLocalTournamentSnapshotKey(tid), null);
  const preferred = choosePreferredSnapshot(mapSnapshot, legacySnapshot);
  if (preferred.source === 'legacy') {
    snapshotMap[tid] = preferred.snapshot;
    setLocalCompletedTournamentMap(snapshotMap);
  }
  return preferred.snapshot;
}

function setLocalTournamentSnapshot(tournamentId, snapshot) {
  const tid = String(tournamentId || '').trim();
  if (!tid || !snapshot || typeof snapshot !== 'object') return;
  set(getLocalTournamentSnapshotKey(tid), snapshot);
  const snapshotMap = getLocalCompletedTournamentMap();
  snapshotMap[tid] = snapshot;
  setLocalCompletedTournamentMap(snapshotMap);
}

function getLocalTournamentCache(tournamentId) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;
  const doc = get(getLocalTournamentCacheKey(tid), null);
  return doc && typeof doc === 'object' ? doc : null;
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
  const snapshotMap = getLocalCompletedTournamentMap();
  if (snapshotMap[tid]) {
    delete snapshotMap[tid];
    setLocalCompletedTournamentMap(snapshotMap);
  }
}

function buildLocalTournamentSnapshot(tournament) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const tid = String(t._id || t.id || '').trim();
  if (!tid) return null;
  const roundsRaw = Array.isArray(t.rounds) ? t.rounds : [];
  const playersRaw = Array.isArray(t.players) ? t.players : [];
  const playerIds = Array.isArray(t.playerIds)
    ? t.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
    : playersRaw.map((player) => playerUtils.extractPlayerId(player)).filter(Boolean);
  const players = playersRaw.map((player) => ({
    id: playerUtils.extractPlayerId(player)
  })).filter((player) => !!player.id);
  const rounds = roundsRaw.map((round) => {
    const matchesRaw = Array.isArray(round && round.matches) ? round.matches : [];
    const matches = matchesRaw.map((match, idx) => {
      const pair = scoreUtils.extractScorePairAny(match);
      const base = {
        matchIndex: Number(match && match.matchIndex),
        status: String(match && match.status || '').trim() || 'pending',
        scoredAt: match && match.scoredAt ? match.scoredAt : null,
        teamA: Array.isArray(match && match.teamA) ? match.teamA.map((player) => playerUtils.extractPlayerId(player)).filter(Boolean) : [],
        teamB: Array.isArray(match && match.teamB) ? match.teamB.map((player) => playerUtils.extractPlayerId(player)).filter(Boolean) : []
      };
      if (!Number.isFinite(base.matchIndex)) base.matchIndex = idx;
      if (Number.isFinite(pair.a) && Number.isFinite(pair.b)) {
        base.score = { teamA: pair.a, teamB: pair.b };
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

function upsertLocalCompletedTournamentSnapshot(tournament, openid = '') {
  const t = tournament && typeof tournament === 'object' ? tournament : null;
  const tid = String(t && (t._id || t.id) || '').trim();
  if (!tid) return false;
  const oid = String(openid || getCurrentOpenid() || '').trim();
  if (!oid) return false;
  const status = String((t && t.status) || '').trim();

  if (status !== 'finished' || !playerUtils.isParticipantInTournament(t, oid)) {
    removeLocalCompletedTournamentSnapshot(tid);
    return false;
  }

  const snapshot = buildLocalTournamentSnapshot(t);
  if (!snapshot) return false;
  setLocalTournamentSnapshot(tid, snapshot);

  const ids = getLocalCompletedTournamentIds();
  const nextIds = [tid, ...ids.filter((id) => id !== tid)];
  const snapshotMap = getLocalCompletedTournamentMap();
  snapshotMap[tid] = snapshot;
  if (nextIds.length > LOCAL_COMPLETED_MAX) {
    const overflowIds = nextIds.slice(LOCAL_COMPLETED_MAX);
    overflowIds.forEach((id) => {
      del(getLocalTournamentSnapshotKey(id));
      delete snapshotMap[id];
    });
  }
  setLocalCompletedTournamentMap(snapshotMap);
  setLocalCompletedTournamentIds(nextIds.slice(0, LOCAL_COMPLETED_MAX));
  return true;
}

function getLocalCompletedTournamentSnapshots() {
  const ids = getLocalCompletedTournamentIds();
  const snapshotMap = getLocalCompletedTournamentMap();
  const out = [];
  let mapChanged = false;
  for (const id of ids) {
    const preferred = choosePreferredSnapshot(
      snapshotMap[id],
      get(getLocalTournamentSnapshotKey(id), null)
    );
    if (preferred.source === 'legacy' && preferred.snapshot) {
      snapshotMap[id] = preferred.snapshot;
      mapChanged = true;
    }
    if (preferred.snapshot) out.push(preferred.snapshot);
  }
  if (mapChanged) setLocalCompletedTournamentMap(snapshotMap);
  out.sort((a, b) => (Number(b.updatedAtTs) || 0) - (Number(a.updatedAtTs) || 0));
  return out;
}

module.exports = {
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
  getLocalTournamentSnapshotKey,
  getLocalTournamentCacheKey,
  setLocalCompletedTournamentIds,
  getLocalCompletedTournamentMap,
  setLocalCompletedTournamentMap,
  buildLocalTournamentSnapshot,
  getCurrentOpenid,
  snapshotUpdatedAtTs,
  choosePreferredSnapshot
};
