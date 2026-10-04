// One wx.reportEvent channel; no storage, cloud receiver, payload logging or retry.
const WRITE_ACTIONS = {
  createTournament: 'tournament_create',
  cloneTournament: 'tournament_clone',
  joinTournament: 'tournament_join',
  startTournament: 'tournament_start',
  finishTournament: 'tournament_finish',
  submitScore: 'score_submit',
  updateSettings: 'settings_update'
};
const WATER_ACTIONS = {
  create: 'water_create', createLedger: 'water_create', join: 'water_join',
  addParticipants: 'water_add_members', recordGame: 'water_record_game',
  recordDirect: 'water_record_direct', correctEntry: 'water_correct',
  reverseEntry: 'water_reverse', undoLast: 'water_undo', createRound: 'water_create_round'
};
const RESULT_CODES = new Set([
  'START_TIMEOUT', 'VERSION_CONFLICT', 'LOCK_EXPIRED', 'LOCK_OCCUPIED', 'LOCK_FORBIDDEN',
  'PERMISSION_DENIED', 'TOURNAMENT_NOT_FOUND', 'TOURNAMENT_ID_REQUIRED', 'MATCH_NOT_FOUND',
  'MATCH_CANCELED', 'MATCH_FINISHED', 'SCORE_INVALID', 'SCORE_OUT_OF_RANGE',
  'PROFILE_MINIMUM_REQUIRED', 'PLAYER_LIMIT_REACHED', 'PLAYER_LIMIT_EXCEEDED',
  'SETTINGS_DRAFT_ONLY', 'SETTINGS_INVALID', 'START_DRAFT_ONLY', 'JOIN_DRAFT_ONLY',
  'TOURNAMENT_FINISHED_MANUALLY', 'TOURNAMENT_FINISH_DEDUPED',
  'FINISH_RUNNING_ONLY', 'FINISH_SCORE_REQUIRED', 'FINISH_REQUEST_EXPIRED',
  'START_VALIDATION_FAILED', 'START_PAIR_TEAMS_INVALID', 'WATER_ENTRY_CREATED',
  'WATER_ENTRY_CORRECTED', 'WATER_ENTRY_REVERSED', 'WATER_WRITE_DEDUPED',
  'WATER_WRITES_DISABLED', 'WATER_FEATURE_NOT_ENABLED', 'WATER_ROOM_NOT_FOUND',
  'WATER_ROOM_FORBIDDEN', 'WATER_ROUND_ARCHIVED', 'WATER_VERSION_CONFLICT',
  'WATER_ENTRY_FORBIDDEN', 'WATER_ENTRY_NOT_ACTIVE', 'WATER_ENTRY_ALREADY_REVERSED',
  'WATER_ENTRY_INVALID', 'WATER_PARTICIPANT_INVALID', 'WATER_REQUEST_PAYLOAD_CONFLICT'
]);
let sessionId = '';
let sequence = 0;
// Raw request IDs stay only in this process, never in a report/hash/storage/log.
// Fixed 30-minute lifetime from first call; at most 100 scoped request pairs.
const INTENT_TTL_MS = 30 * 60 * 1000;
const INTENT_LIMIT = 100;
const requestIntents = new Map();

function forgetIntent(key) {
  const entry = requestIntents.get(key);
  if (entry) clearTimeout(entry.timer);
  requestIntents.delete(key);
}

function correlateIntent(scope, requestId) {
  const now = Date.now();
  for (const [key, entry] of requestIntents) {
    if (entry.expiresAt <= now) forgetIntent(key);
  }
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 256) {
    return { intentId: randomId('intent'), attemptIndex: 1 };
  }
  const key = `${scope}:${requestId}`;
  let entry = requestIntents.get(key);
  if (!entry) {
    if (requestIntents.size >= INTENT_LIMIT) forgetIntent(requestIntents.keys().next().value);
    entry = { intentId: randomId('intent'), attemptIndex: 0, expiresAt: now + INTENT_TTL_MS };
    entry.timer = setTimeout(() => forgetIntent(key), INTENT_TTL_MS);
    if (entry.timer && typeof entry.timer.unref === 'function') entry.timer.unref();
    requestIntents.set(key, entry);
  }
  entry.attemptIndex += 1;
  return { intentId: entry.intentId, attemptIndex: entry.attemptIndex };
}

function randomId(prefix) {
  sequence += 1;
  return `${prefix}_${Date.now()}_${sequence}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`;
}

function accountMetadata() {
  try {
    const miniProgram = wx.getAccountInfoSync().miniProgram || {};
    const version = String(miniProgram.version || '');
    return {
      appVersion: /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(version) ? version.slice(0, 64) : '',
      envVersion: ['develop', 'trial', 'release'].includes(miniProgram.envVersion) ? miniProgram.envVersion : ''
    };
  } catch (_) { return { appVersion: '', envVersion: '' }; }
}

function safeTraceId(value, name) {
  // Caller-supplied free text is not telemetry. Only the existing generated shape.
  const input = String(value || '');
  const prefix = String(name || '');
  if (!Object.prototype.hasOwnProperty.call(WRITE_ACTIONS, prefix) && prefix !== 'waterSession' && prefix !== 'scoreLock') return '';
  return new RegExp(`^${prefix}_[0-9]{10,16}_[a-z0-9]{1,16}$`).test(input) ? input : '';
}

function send(eventName, payload) {
  try {
    if (typeof wx === 'undefined' || typeof wx.reportEvent !== 'function') return;
    const sent = wx.reportEvent(eventName, payload);
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch (_) { /* Analytics never changes the business outcome. */ }
}

function basePayload(operation, phase) {
  return {
    schemaVersion: 1,
    eventId: `${operation.id}_${phase}`,
    operationId: operation.id,
    intentId: operation.intentId,
    attemptIndex: operation.attemptIndex,
    eventTime: Date.now(),
    phase,
    action: operation.action,
    anonymousSessionId: operation.sessionId,
    traceId: operation.traceId,
    appVersion: operation.metadata.appVersion,
    envVersion: operation.metadata.envVersion
  };
}

function beginOperation(action, name = '', payload = {}, requestScope = action) {
  try {
    if (!sessionId) sessionId = randomId('session');
    const operation = {
      id: randomId('operation'), action, sessionId, startedAt: Date.now(),
      ...correlateIntent(requestScope, payload.clientRequestId),
      traceId: safeTraceId(payload.__traceId, name), metadata: accountMetadata(),
      waterV2Entry: name === 'waterSession' && payload.apiVersion === 2 && ['recordGame', 'recordDirect'].includes(payload.action),
      completed: false
    };
    send('activity_attempt', { ...basePayload(operation, 'attempt'), result: 'pending', resultCode: '', durationMs: 0, retryCount: 0, firstEntry: 'not_applicable' });
    return operation;
  } catch (_) { return null; }
}

function begin(name, payload = {}) {
  let action = WRITE_ACTIONS[name];
  if (name === 'waterSession') action = WATER_ACTIONS[payload.action];
  if (name === 'scoreLock' && payload.action === 'acquire') action = 'score_enter';
  if (typeof action !== 'string') return null;
  const scope = name === 'waterSession' || name === 'scoreLock' ? `${name}:${payload.action}` : name;
  return beginOperation(action, name, payload, scope);
}

function resultPayload(operation, result, resultCode, retryCount = 0, firstEntry = 'not_applicable') {
  return {
    ...basePayload(operation, 'result'), result, resultCode,
    durationMs: Math.max(0, Math.min(86400000, Date.now() - operation.startedAt)),
    retryCount: Math.max(0, Math.min(10, Number(retryCount) || 0)), firstEntry
  };
}

function finish(operation, response, exceptionKind = '', retryCount = 0) {
  try {
    if (!operation || operation.completed) return;
    operation.completed = true;
    const source = response || {};
    const deduped = source.deduped === true || source.state === 'deduped';
    const result = exceptionKind ? 'exception' : source.ok === false ? 'failure' : source.ok === true ? (deduped ? 'deduped' : 'success') : 'unknown';
    const code = String(source.code || '');
    let resultCode = RESULT_CODES.has(code) ? code : result === 'failure' ? 'BUSINESS_REJECTED' : result === 'unknown' ? 'RESULT_UNKNOWN' : deduped ? 'WRITE_DEDUPED' : 'SUCCESS';
    if (exceptionKind) resultCode = ['TIMEOUT', 'NETWORK_ERROR'].includes(exceptionKind) ? exceptionKind : 'SDK_EXCEPTION';
    let firstEntry = 'not_applicable';
    if (operation.waterV2Entry) {
      const entry = source.data && source.data.entry;
      const seq = entry && Number(entry.seq);
      const originalEntry = entry && ['game_recorded', 'transfer_recorded'].includes(entry.eventType);
      firstEntry = result === 'deduped' ? 'replayed' : result === 'success' && originalEntry && Number.isSafeInteger(seq) && seq > 0 ? (seq === 1 ? 'yes' : 'no') : 'unknown';
    }
    send('activity_result', resultPayload(operation, result, resultCode, retryCount, firstEntry));
    // This only observes authoritative finished status, including a replay.
    // The response cannot prove a transition or that this was the first completion.
    if (operation.action === 'score_submit' && source.ok === true &&
      (source.finished === true || (source.data && source.data.finished === true))) {
      const completedPayload = resultPayload(operation, 'finished_confirmed', 'FINISHED_CONFIRMED', retryCount);
      send('activity_result', { ...completedPayload, action: 'tournament_complete', eventId: `${operation.id}_tournament_complete_result` });
    }
  } catch (_) { /* Analytics never changes the business outcome. */ }
}

function waterEnter() {
  try {
    if (!sessionId) sessionId = randomId('session');
    const operation = { id: randomId('view'), action: 'water_enter', sessionId, traceId: '', metadata: accountMetadata(), intentId: randomId('intent'), attemptIndex: 1 };
    send('activity_view', { ...basePayload(operation, 'view'), result: 'view', resultCode: '', durationMs: 0, retryCount: 0, firstEntry: 'not_applicable' });
  } catch (_) {}
}

function shareEnter() {
  return beginOperation('share_enter');
}

function finishShareEnter(operation, outcome) {
  try {
    if (!operation || operation.completed) return;
    const outcomes = {
      confirmed: ['success', 'TARGET_CONFIRMED'], missing: ['missing', 'TARGET_MISSING'],
      invalid: ['failure', 'LINK_INVALID'], failed: ['failure', 'LOAD_FAILED'], left: ['left', 'PAGE_LEFT']
    };
    const [result, code] = outcomes[outcome] || outcomes.failed;
    operation.completed = true;
    send('activity_result', resultPayload(operation, result, code));
  } catch (_) {}
}

function tournamentShare() {
  try {
    const operation = beginOperation('tournament_share');
    if (!operation) return;
    operation.completed = true;
    send('activity_result', resultPayload(operation, 'unknown', 'DELIVERY_UNKNOWN'));
  } catch (_) {}
}

module.exports = { begin, finish, waterEnter, shareEnter, finishShareEnter, tournamentShare };
