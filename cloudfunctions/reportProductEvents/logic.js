const crypto = require('node:crypto');

const COLLECTION_NAME = 'product_events';
const MAX_BATCH_SIZE = 20;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const EVENT_ID_RE = /^event_[0-9a-f]{32}$/;
const INSTALL_ID_RE = /^install_[0-9a-f]{32}$/;
const SHORT_TOURNAMENT_ID_RE = /^[0-9a-f]{8}$/;
const PROPERTY_KEYS = Object.freeze(['t', 's', 'm', 'src', 'a', 'r']);
const EVENT_KEYS = new Set([
  'eventId',
  'name',
  'occurredAtMs',
  'anonymousInstallId',
  'properties'
]);
const PROPERTY_KEY_SET = new Set(PROPERTY_KEYS);
const VALID_STATUSES = new Set(['draft', 'running', 'finished']);
const VALID_MODES = new Set(['multi_rotate', 'squad_doubles', 'fixed_pair_rr']);

const EVENT_DEFINITIONS = Object.freeze({
  analytics_view: Object.freeze({
    src: Object.freeze(['analytics']),
    a: Object.freeze(['view'])
  }),
  clone_tournament_success: Object.freeze({
    src: Object.freeze(['home']),
    a: Object.freeze(['clone']),
    r: Object.freeze(['success'])
  }),
  home_clone_tournament_click: Object.freeze({
    src: Object.freeze(['home']),
    a: Object.freeze(['clone'])
  }),
  home_finished_review_click: Object.freeze({
    src: Object.freeze(['home']),
    a: Object.freeze(['review_card', 'review'])
  }),
  lobby_first_guide_close: Object.freeze({
    src: Object.freeze(['lobby']),
    a: Object.freeze(['close'])
  }),
  lobby_first_guide_show: Object.freeze({
    src: Object.freeze(['lobby']),
    a: Object.freeze(['show'])
  }),
  match_open: Object.freeze({
    src: Object.freeze(['match']),
    a: Object.freeze(['open'])
  }),
  ranking_copy_share_text: Object.freeze({
    src: Object.freeze(['ranking']),
    a: Object.freeze(['copy'])
  }),
  ranking_generate_poster_click: Object.freeze({
    src: Object.freeze(['ranking']),
    a: Object.freeze(['generate_poster', 'top_rank'])
  }),
  ranking_generate_poster_success: Object.freeze({
    src: Object.freeze(['ranking']),
    a: Object.freeze(['generate_poster']),
    r: Object.freeze(['success'])
  }),
  ranking_save_poster_success: Object.freeze({
    src: Object.freeze(['ranking']),
    a: Object.freeze(['save_poster']),
    r: Object.freeze(['success'])
  }),
  ranking_view: Object.freeze({
    src: Object.freeze(['ranking']),
    a: Object.freeze(['view'])
  }),
  schedule_finished_share_click: Object.freeze({
    src: Object.freeze(['schedule']),
    a: Object.freeze(['click'])
  }),
  score_submit_success: Object.freeze({
    src: Object.freeze(['match']),
    a: Object.freeze(['submit_score']),
    r: Object.freeze(['success'])
  }),
  share_entry_go_ranking: Object.freeze({
    src: Object.freeze(['share_entry']),
    a: Object.freeze(['click'])
  }),
  share_entry_go_schedule: Object.freeze({
    src: Object.freeze(['share_entry']),
    a: Object.freeze(['click'])
  }),
  share_entry_join_success: Object.freeze({
    src: Object.freeze(['share_entry']),
    a: Object.freeze(['join']),
    r: Object.freeze(['success'])
  }),
  share_entry_primary_click: Object.freeze({
    src: Object.freeze(['share_entry']),
    a: Object.freeze([
      'analytics',
      'click',
      'enter',
      'identity_pending',
      'join',
      'lobby_view',
      'ranking',
      'retry',
      'schedule',
      'view'
    ])
  }),
  share_entry_view: Object.freeze({
    src: Object.freeze(['share_entry']),
    a: Object.freeze(['view'])
  })
});

const EVENT_NAMES = Object.freeze(Object.keys(EVENT_DEFINITIONS).sort());

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateProperties(name, properties) {
  if (!isPlainObject(properties)) return { ok: false, code: 'PROPERTIES_INVALID' };
  const keys = Object.keys(properties);
  if (keys.some((key) => !PROPERTY_KEY_SET.has(key))) {
    return { ok: false, code: 'PROPERTY_KEY_NOT_ALLOWED' };
  }

  const definition = EVENT_DEFINITIONS[name];
  const normalized = {};
  const tournamentKey = normalizeString(properties.t);
  if (tournamentKey) {
    if (!SHORT_TOURNAMENT_ID_RE.test(tournamentKey)) {
      return { ok: false, code: 'PROPERTY_VALUE_INVALID' };
    }
    normalized.t = tournamentKey;
  }

  const status = normalizeString(properties.s);
  if (status) {
    if (!VALID_STATUSES.has(status)) return { ok: false, code: 'PROPERTY_VALUE_INVALID' };
    normalized.s = status;
  }

  const mode = normalizeString(properties.m);
  if (mode) {
    if (!VALID_MODES.has(mode)) return { ok: false, code: 'PROPERTY_VALUE_INVALID' };
    normalized.m = mode;
  }

  for (const key of ['src', 'a', 'r']) {
    const value = normalizeString(properties[key]);
    const allowedValues = Array.isArray(definition[key]) ? definition[key] : [];
    if (!value) {
      if (allowedValues.length > 0) return { ok: false, code: 'PROPERTY_VALUE_INVALID' };
      continue;
    }
    if (!allowedValues.includes(value)) return { ok: false, code: 'PROPERTY_VALUE_INVALID' };
    normalized[key] = value;
  }

  return { ok: true, properties: normalized };
}

function validateEvent(value, nowMs = Date.now()) {
  if (!isPlainObject(value)) return { ok: false, code: 'EVENT_NOT_OBJECT' };
  if (Object.keys(value).some((key) => !EVENT_KEYS.has(key))) {
    return { ok: false, code: 'EVENT_FIELD_NOT_ALLOWED' };
  }

  const eventId = normalizeString(value.eventId);
  if (!EVENT_ID_RE.test(eventId)) return { ok: false, code: 'EVENT_ID_INVALID' };
  const name = normalizeString(value.name);
  if (!EVENT_DEFINITIONS[name]) return { ok: false, code: 'EVENT_NAME_NOT_ALLOWED' };
  const anonymousInstallId = normalizeString(value.anonymousInstallId);
  if (!INSTALL_ID_RE.test(anonymousInstallId)) {
    return { ok: false, code: 'ANONYMOUS_INSTALL_ID_INVALID' };
  }

  const occurredAtMs = Number(value.occurredAtMs);
  const serverNowMs = Math.floor(Number(nowMs));
  if (
    !Number.isSafeInteger(occurredAtMs) ||
    !Number.isSafeInteger(serverNowMs) ||
    occurredAtMs < serverNowMs - MAX_EVENT_AGE_MS ||
    occurredAtMs > serverNowMs + MAX_FUTURE_SKEW_MS
  ) {
    return { ok: false, code: 'EVENT_TIME_INVALID' };
  }

  const propertyResult = validateProperties(name, value.properties);
  if (!propertyResult.ok) return propertyResult;
  return {
    ok: true,
    event: {
      eventId,
      name,
      occurredAtMs,
      anonymousInstallId,
      properties: propertyResult.properties
    }
  };
}

function validateBatch(events, nowMs = Date.now()) {
  if (!Array.isArray(events)) {
    return { ok: false, code: 'BATCH_NOT_ARRAY', rejected: 0, rejections: [] };
  }
  if (events.length === 0) {
    return { ok: false, code: 'BATCH_EMPTY', rejected: 0, rejections: [] };
  }
  if (events.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      code: 'BATCH_TOO_LARGE',
      rejected: events.length,
      rejections: []
    };
  }

  const validEvents = [];
  const rejections = [];
  events.forEach((event, index) => {
    const result = validateEvent(event, nowMs);
    if (result.ok) validEvents.push(result.event);
    else rejections.push({ index, code: result.code });
  });
  return {
    ok: true,
    validEvents,
    rejected: rejections.length,
    rejections
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildDocumentId(event) {
  return `pe_${sha256(`product-events/document/v1\n${event.anonymousInstallId}\n${event.eventId}`)}`;
}

function buildStoredEvent(db, event, receivedAtMs) {
  return {
    schemaVersion: 1,
    eventIdHash: sha256(`product-events/event/v1\n${event.eventId}`),
    name: event.name,
    occurredAtMs: event.occurredAtMs,
    anonymousInstallHash: sha256(`product-events/install/v1\n${event.anonymousInstallId}`),
    properties: { ...event.properties },
    receivedAt: db.serverDate(),
    receivedAtMs
  };
}

function isMissingDocumentError(error) {
  const message = String((error && (error.message || error.errMsg)) || error || '').toLowerCase();
  if (
    message.includes('database_collection_not_exist') ||
    message.includes('collection not exist') ||
    message.includes('collection does not exist')
  ) return false;
  return (
    message.includes('document.get:fail') ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

function dedupeBatch(validEvents) {
  const seen = new Set();
  const uniqueEvents = [];
  let deduped = 0;
  for (const event of validEvents) {
    const documentId = buildDocumentId(event);
    if (seen.has(documentId)) {
      deduped += 1;
      continue;
    }
    seen.add(documentId);
    uniqueEvents.push({ documentId, event });
  }
  return { uniqueEvents, deduped };
}

async function persistEvents(db, validEvents, receivedAtMs) {
  if (!db || typeof db.runTransaction !== 'function') {
    throw new Error('database transaction support is required');
  }
  if (!db || typeof db.serverDate !== 'function') {
    throw new Error('database serverDate support is required');
  }

  const prepared = dedupeBatch(validEvents);
  if (prepared.uniqueEvents.length === 0) {
    return { accepted: 0, deduped: prepared.deduped };
  }

  const transactionResult = await db.runTransaction(async (transaction) => {
    let accepted = 0;
    let deduped = 0;
    for (const item of prepared.uniqueEvents) {
      const document = transaction.collection(COLLECTION_NAME).doc(item.documentId);
      let existing = null;
      try {
        const result = await document.get();
        existing = result && result.data ? result.data : null;
      } catch (error) {
        if (!isMissingDocumentError(error)) throw error;
      }

      if (existing) {
        deduped += 1;
        continue;
      }
      const data = buildStoredEvent(db, item.event, receivedAtMs);
      await document.set({ data });
      accepted += 1;
    }
    return { accepted, deduped };
  });

  if (!transactionResult || !Number.isSafeInteger(transactionResult.accepted) || !Number.isSafeInteger(transactionResult.deduped)) {
    throw new Error('database transaction returned an invalid result');
  }
  return {
    accepted: transactionResult.accepted,
    deduped: transactionResult.deduped + prepared.deduped
  };
}

async function processBatch(db, events, nowMs = Date.now()) {
  const validation = validateBatch(events, nowMs);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      accepted: 0,
      deduped: 0,
      rejected: validation.rejected,
      rejections: validation.rejections
    };
  }

  if (validation.validEvents.length === 0) {
    return {
      ok: true,
      accepted: 0,
      deduped: 0,
      rejected: validation.rejected,
      rejections: validation.rejections
    };
  }

  const persisted = await persistEvents(db, validation.validEvents, Math.floor(Number(nowMs)));
  return {
    ok: true,
    accepted: persisted.accepted,
    deduped: persisted.deduped,
    rejected: validation.rejected,
    rejections: validation.rejections
  };
}

function isServerEnabled(env = process.env) {
  return !!env && env.PRODUCT_EVENTS_ENABLED === 'true';
}

module.exports = {
  COLLECTION_NAME,
  MAX_BATCH_SIZE,
  MAX_EVENT_AGE_MS,
  MAX_FUTURE_SKEW_MS,
  EVENT_NAMES,
  EVENT_DEFINITIONS,
  PROPERTY_KEYS,
  isServerEnabled,
  validateProperties,
  validateEvent,
  validateBatch,
  buildDocumentId,
  buildStoredEvent,
  persistEvents,
  processBatch
};
