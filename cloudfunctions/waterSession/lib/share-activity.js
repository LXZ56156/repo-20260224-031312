const START_TEMPLATE_ID = '21B034D08C5615B9889CE362BB957B1EE69A584B';
const EXPIRY_SAFETY_MS = 60 * 1000;
const DEFAULT_ACTIVITY_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 1800;

function normalizeVersionType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'develop' || raw === 'trial' || raw === 'release') return raw;
  return 'release';
}

function normalizeActivityId(tournament) {
  return String(tournament && (tournament.shareActivityId || tournament.activityId) || '').trim();
}

function normalizeExpireAtMs(value, now = Date.now()) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return normalizeExpireAtMs(numeric, now);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric < 1000000000000 ? numeric * 1000 : numeric;
}

function normalizeCreatedExpireAtMs(openapiResult, now = Date.now()) {
  const source = openapiResult && typeof openapiResult === 'object' ? openapiResult : {};
  const raw = source.expirationTime || source.expiration_time || source.expireTime || source.expire_time;
  return normalizeExpireAtMs(raw, now) || (now + DEFAULT_ACTIVITY_TTL_MS);
}

function extractCreatedActivityId(openapiResult) {
  const source = openapiResult && typeof openapiResult === 'object' ? openapiResult : {};
  return String(source.activityId || source.activity_id || '').trim();
}

function resolveRoomLimit(tournament, modeHelper = null) {
  const direct = Number(tournament && tournament.playerLimit);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  if (modeHelper && typeof modeHelper.getRotationPlayerLimit === 'function') {
    const fromMode = Number(modeHelper.getRotationPlayerLimit(tournament || {}));
    if (Number.isFinite(fromMode) && fromMode > 0) return Math.floor(fromMode);
  }
  return 0;
}

function countPlayers(tournament) {
  if (Array.isArray(tournament && tournament.players)) return tournament.players.length;
  if (Array.isArray(tournament && tournament.playerIds)) return tournament.playerIds.length;
  return 0;
}

function isActivityUsable(tournament, options = {}) {
  const now = Number(options.now) || Date.now();
  const allowedStates = Array.isArray(options.allowedStates) && options.allowedStates.length
    ? options.allowedStates.map((item) => Number(item))
    : [0];
  const activityId = normalizeActivityId(tournament);
  if (!activityId) return false;
  const state = Number(tournament && tournament.shareActivityState);
  if (!allowedStates.includes(Number.isFinite(state) ? state : 0)) return false;
  const expireAtMs = normalizeExpireAtMs(tournament && tournament.shareActivityExpireAtMs, now);
  return expireAtMs > now + EXPIRY_SAFETY_MS;
}

function getActivity(tournament, options = {}) {
  if (!isActivityUsable(tournament, options)) return null;
  const now = Number(options.now) || Date.now();
  return {
    activityId: normalizeActivityId(tournament),
    expireAtMs: normalizeExpireAtMs(tournament && tournament.shareActivityExpireAtMs, now),
    state: Number(tournament && tournament.shareActivityState) || 0,
    versionType: normalizeVersionType(tournament && tournament.shareActivityVersionType)
  };
}

function isDraftDynamicShareEligible(tournament, modeHelper = null, now = Date.now()) {
  if (String(tournament && tournament.status || '').trim() !== 'draft') return false;
  if (resolveRoomLimit(tournament, modeHelper) <= 0) return false;
  const activityId = normalizeActivityId(tournament);
  if (!activityId) return true;
  return !isActivityUsable(tournament, { now, allowedStates: [0] });
}

function buildCreatedPatch(activityId, expireAtMs, versionType, serverDateValue) {
  return {
    shareActivityId: String(activityId || '').trim(),
    shareActivityExpireAtMs: normalizeExpireAtMs(expireAtMs),
    shareActivityState: 0,
    shareActivityVersionType: normalizeVersionType(versionType),
    shareActivityUpdatedAt: serverDateValue
  };
}

function buildStatePatch(targetState, serverDateValue) {
  return {
    shareActivityState: Number(targetState) || 0,
    shareActivityUpdatedAt: serverDateValue
  };
}

function buildClearPatch(removeToken) {
  return {
    shareActivityId: removeToken,
    shareActivityExpireAtMs: removeToken,
    shareActivityState: removeToken,
    shareActivityVersionType: removeToken,
    shareActivityUpdatedAt: removeToken
  };
}

function shouldClearOnReset(tournament, now = Date.now()) {
  const state = Number(tournament && tournament.shareActivityState) || 0;
  if (state === 1 || state === 2) return true;
  const activityId = normalizeActivityId(tournament);
  if (!activityId) return false;
  return !isActivityUsable(tournament, { now, allowedStates: [0] });
}

function buildDraftTemplateInfo(tournament, modeHelper = null) {
  return {
    parameterList: [
      { name: 'member_count', value: String(countPlayers(tournament)) },
      { name: 'room_limit', value: String(resolveRoomLimit(tournament, modeHelper)) }
    ]
  };
}

function buildDraftShareMenuTemplateInfo(tournament, modeHelper = null) {
  return {
    templateId: START_TEMPLATE_ID,
    ...buildDraftTemplateInfo(tournament, modeHelper)
  };
}

function buildStartedTemplateInfo(tournamentId, versionType) {
  return {
    parameterList: [
      { name: 'path', value: `pages/schedule/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}` },
      { name: 'version_type', value: normalizeVersionType(versionType) }
    ]
  };
}

function buildSetPayload(activityId, targetState, templateInfo = null) {
  const payload = {
    activityId: String(activityId || '').trim(),
    targetState: Number(targetState) || 0
  };
  if (templateInfo) payload.templateInfo = templateInfo;
  return payload;
}

function warn(logger, message, context, err) {
  if (!logger || typeof logger.warn !== 'function') return;
  try {
    logger.warn(message, context || {}, err || '');
  } catch (_) {
    // ignore logger failure
  }
}

function withTimeout(promise, timeoutMs = UPDATE_TIMEOUT_MS) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('setUpdatableMsg timeout')), timeoutMs);
    })
  ]);
}

function pickErrorMessage(err) {
  const message = String((err && (err.errMsg || err.message)) || err || '').trim();
  return message.slice(0, 300);
}

function pickErrorCode(err) {
  const direct = err && (err.errCode || err.errcode || err.errorCode || err.code);
  const normalized = String(direct || '').trim();
  if (normalized) return normalized;
  const message = pickErrorMessage(err);
  const matched = message.match(/\b[0-9]{4,}\b/);
  return matched ? matched[0] : 'UNKNOWN';
}

function getRemoveToken(db) {
  const command = db && db.command;
  if (command && typeof command.remove === 'function') return command.remove();
  return undefined;
}

async function writeDiagnosticPatchBestEffort(db, tournamentId, patch, logger = console, context = {}) {
  const tid = String(tournamentId || '').trim();
  if (!db || !tid || !patch || typeof patch !== 'object') return false;
  try {
    const docRef = db.collection('tournaments').doc(tid);
    if (!docRef || typeof docRef.update !== 'function') return false;
    await docRef.update({ data: patch });
    return true;
  } catch (err) {
    warn(logger, '[shareActivity] diagnostic write failed', {
      tournamentId: tid,
      ...context
    }, err);
    return false;
  }
}

async function recordShareActivityErrorBestEffort(db, tournamentId, err, logger = console, context = {}) {
  const message = pickErrorMessage(err) || 'setUpdatableMsg failed';
  const patch = {
    shareActivityLastError: message,
    shareActivityLastErrorCode: pickErrorCode(err),
    shareActivityLastErrorMsg: message,
    shareActivityLastErrorAt: db && typeof db.serverDate === 'function' ? db.serverDate() : Date.now()
  };
  return writeDiagnosticPatchBestEffort(db, tournamentId, patch, logger, context);
}

async function clearShareActivityErrorBestEffort(db, tournamentId, logger = console, context = {}) {
  const removeToken = getRemoveToken(db);
  if (removeToken === undefined) return false;
  return writeDiagnosticPatchBestEffort(db, tournamentId, {
    shareActivityLastError: removeToken,
    shareActivityLastErrorCode: removeToken,
    shareActivityLastErrorMsg: removeToken,
    shareActivityLastErrorAt: removeToken
  }, logger, context);
}

async function setUpdatableMessageBestEffort(cloud, payload, logger = console, context = {}) {
  if (!payload || !payload.activityId) return false;
  const api = cloud && cloud.openapi && cloud.openapi.updatableMessage;
  if (!api || typeof api.setUpdatableMsg !== 'function') return false;
  const db = context && context.db;
  const tournamentId = context && context.tournamentId;
  try {
    await withTimeout(api.setUpdatableMsg(payload));
    await clearShareActivityErrorBestEffort(db, tournamentId, logger, context);
    return true;
  } catch (err) {
    warn(logger, '[shareActivity] setUpdatableMsg failed', {
      activityId: payload.activityId,
      targetState: payload.targetState,
      ...context
    }, err);
    await recordShareActivityErrorBestEffort(db, tournamentId, err, logger, context);
    return false;
  }
}

async function updateDraftMessageBestEffort(cloud, tournament, modeHelper = null, logger = console, context = {}) {
  const activity = getActivity(tournament, { allowedStates: [0] });
  if (!activity) return false;
  if (resolveRoomLimit(tournament, modeHelper) <= 0) return false;
  return setUpdatableMessageBestEffort(
    cloud,
    buildSetPayload(activity.activityId, 0, buildDraftTemplateInfo(tournament, modeHelper)),
    logger,
    context
  );
}

async function updateStartedMessageBestEffort(cloud, tournamentId, tournament, logger = console, context = {}) {
  const activity = getActivity(tournament, { allowedStates: [0] });
  if (!activity) return false;
  return setUpdatableMessageBestEffort(
    cloud,
    buildSetPayload(activity.activityId, 1, buildStartedTemplateInfo(tournamentId, activity.versionType)),
    logger,
    context
  );
}

async function updateFinishedMessageBestEffort(cloud, tournament, logger = console, context = {}) {
  const activity = getActivity(tournament, { allowedStates: [0, 1] });
  if (!activity) return false;
  return setUpdatableMessageBestEffort(
    cloud,
    buildSetPayload(activity.activityId, 2),
    logger,
    context
  );
}

module.exports = {
  START_TEMPLATE_ID,
  normalizeVersionType,
  normalizeExpireAtMs,
  normalizeCreatedExpireAtMs,
  extractCreatedActivityId,
  resolveRoomLimit,
  countPlayers,
  isActivityUsable,
  getActivity,
  isDraftDynamicShareEligible,
  buildCreatedPatch,
  buildStatePatch,
  buildClearPatch,
  shouldClearOnReset,
  buildDraftTemplateInfo,
  buildDraftShareMenuTemplateInfo,
  buildStartedTemplateInfo,
  buildSetPayload,
  pickErrorMessage,
  pickErrorCode,
  setUpdatableMessageBestEffort,
  updateDraftMessageBestEffort,
  updateStartedMessageBestEffort,
  updateFinishedMessageBestEffort
};
