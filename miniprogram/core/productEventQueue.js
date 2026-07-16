const productEventConfig = require('../config/productEvents');
const storageBase = require('./storage/base');
const cloud = require('./cloud');

const STATE_VERSION = 1;
const EVENT_ID_RE = /^event_[0-9a-f]{32}$/;
const INSTALL_ID_RE = /^install_[0-9a-f]{32}$/;
const SHORT_TOURNAMENT_ID_RE = /^[0-9a-f]{8}$/;
const VALID_STATUSES = new Set(['draft', 'running', 'finished']);
const VALID_MODES = new Set(['multi_rotate', 'squad_doubles', 'fixed_pair_rr']);
const BUILT_PAYLOAD_KEYS = new Set(productEventConfig.propertyKeys.concat(['ts']));
const STORED_EVENT_KEYS = new Set([
  'eventId',
  'name',
  'occurredAtMs',
  'anonymousInstallId',
  'properties'
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasOnlyKeys(value, allowlist) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowlist.has(key));
}

function normalizeProperties(name, payload) {
  const definition = productEventConfig.eventDefinitions[name];
  if (!definition || !hasOnlyKeys(payload, BUILT_PAYLOAD_KEYS)) return null;

  const properties = {};
  const tournamentKey = normalizeString(payload.t);
  if (tournamentKey) {
    if (!SHORT_TOURNAMENT_ID_RE.test(tournamentKey)) return null;
    properties.t = tournamentKey;
  }

  const status = normalizeString(payload.s);
  if (status) {
    if (!VALID_STATUSES.has(status)) return null;
    properties.s = status;
  }

  const mode = normalizeString(payload.m);
  if (mode) {
    if (!VALID_MODES.has(mode)) return null;
    properties.m = mode;
  }

  for (const key of ['src', 'a', 'r']) {
    const value = normalizeString(payload[key]);
    const allowedValues = Array.isArray(definition[key]) ? definition[key] : [];
    if (!value) {
      if (allowedValues.length > 0) return null;
      continue;
    }
    if (!allowedValues.includes(value)) return null;
    properties[key] = value;
  }

  return properties;
}

function buildProtocolEvent(name, payload, options) {
  const normalizedName = normalizeString(name);
  const occurredAtMs = Number(payload && payload.ts);
  const properties = normalizeProperties(normalizedName, payload);
  if (!properties || !Number.isSafeInteger(occurredAtMs) || occurredAtMs <= 0) return null;

  return {
    eventId: options.eventId,
    name: normalizedName,
    occurredAtMs,
    anonymousInstallId: options.anonymousInstallId,
    properties
  };
}

function normalizeStoredEvent(value) {
  if (!hasOnlyKeys(value, STORED_EVENT_KEYS)) return null;
  const eventId = normalizeString(value.eventId);
  const name = normalizeString(value.name);
  const anonymousInstallId = normalizeString(value.anonymousInstallId);
  const occurredAtMs = Number(value.occurredAtMs);
  if (!EVENT_ID_RE.test(eventId)) return null;
  if (!productEventConfig.eventDefinitions[name]) return null;
  if (!INSTALL_ID_RE.test(anonymousInstallId)) return null;
  if (!Number.isSafeInteger(occurredAtMs) || occurredAtMs <= 0) return null;
  if (!isPlainObject(value.properties)) return null;

  const properties = normalizeProperties(name, {
    ...value.properties,
    ts: occurredAtMs
  });
  if (!properties) return null;
  return {
    eventId,
    name,
    occurredAtMs,
    anonymousInstallId,
    properties
  };
}

function createEmptyState() {
  return {
    version: STATE_VERSION,
    events: [],
    failureCount: 0,
    nextRetryAtMs: 0
  };
}

function clampPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function randomHex32(random) {
  let output = '';
  for (let index = 0; index < 4; index += 1) {
    let value;
    try {
      value = Number(random());
    } catch (_) {
      value = Math.random();
    }
    if (!Number.isFinite(value) || value < 0 || value >= 1) value = Math.random();
    const chunk = Math.floor(value * 0x100000000) >>> 0;
    output += chunk.toString(16).padStart(8, '0');
  }
  return output;
}

function createOpaqueId(prefix, random) {
  return `${prefix}_${randomHex32(random)}`;
}

function createProductEventQueue(options = {}) {
  const enabled = options.enabled === undefined
    ? productEventConfig.enabled === true
    : options.enabled === true;
  const storage = options.storage || storageBase;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const maxBatchSize = clampPositiveInteger(
    options.maxBatchSize,
    productEventConfig.maxBatchSize,
    productEventConfig.maxBatchSize
  );
  const maxQueueSize = clampPositiveInteger(
    options.maxQueueSize,
    productEventConfig.maxQueueSize,
    1000
  );
  const requestTimeoutMs = clampPositiveInteger(
    options.requestTimeoutMs,
    productEventConfig.requestTimeoutMs
  );
  const retryBaseMs = clampPositiveInteger(options.retryBaseMs, productEventConfig.retryBaseMs);
  const retryMaxMs = Math.max(
    retryBaseMs,
    clampPositiveInteger(options.retryMaxMs, productEventConfig.retryMaxMs)
  );
  const autoFlush = options.autoFlush !== false;
  const setTimeoutFn = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const transport = typeof options.transport === 'function'
    ? options.transport
    : async (events) => cloud.call(
      productEventConfig.cloudFunctionName,
      { events },
      { retry: false }
    );

  let timer = null;
  let inFlight = null;
  let activeBatchIds = new Set();
  let disposed = false;

  function safeGet(key, fallback) {
    try {
      return storage && typeof storage.get === 'function' ? storage.get(key, fallback) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      if (!storage || typeof storage.set !== 'function') return false;
      return storage.set(key, value) !== false;
    } catch (_) {
      return false;
    }
  }

  function loadState() {
    const raw = safeGet(productEventConfig.queueStorageKey, null);
    if (!isPlainObject(raw)) return createEmptyState();
    const rawEvents = Array.isArray(raw.events) ? raw.events : [];
    const normalizedEvents = rawEvents
      .map(normalizeStoredEvent)
      .filter(Boolean)
      .slice(-maxQueueSize);
    const state = {
      version: STATE_VERSION,
      events: normalizedEvents,
      failureCount: Math.max(0, Math.floor(Number(raw.failureCount) || 0)),
      nextRetryAtMs: Math.max(0, Math.floor(Number(raw.nextRetryAtMs) || 0))
    };
    let needsRepair = raw.version !== STATE_VERSION || normalizedEvents.length !== rawEvents.length;
    if (!needsRepair) {
      for (let index = 0; index < normalizedEvents.length; index += 1) {
        if (JSON.stringify(normalizedEvents[index]) !== JSON.stringify(rawEvents[index])) {
          needsRepair = true;
          break;
        }
      }
    }
    if (needsRepair) safeSet(productEventConfig.queueStorageKey, state);
    return state;
  }

  function loadInstallId() {
    const existing = normalizeString(safeGet(productEventConfig.installIdStorageKey, ''));
    if (INSTALL_ID_RE.test(existing)) return existing;
    const created = createOpaqueId('install', random);
    return safeSet(productEventConfig.installIdStorageKey, created) ? created : '';
  }

  function scheduleFlush(delayMs) {
    if (!enabled || !autoFlush || disposed || timer !== null) return;
    try {
      timer = setTimeoutFn(() => {
        timer = null;
        const pending = flush();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      }, Math.max(0, Number(delayMs) || 0));
    } catch (_) {
      timer = null;
    }
  }

  function enqueue(name, payload) {
    if (!enabled || disposed) return false;
    try {
      const normalizedName = normalizeString(name);
      if (!productEventConfig.eventDefinitions[normalizedName]) return false;
      const anonymousInstallId = loadInstallId();
      if (!anonymousInstallId) return false;
      const state = loadState();
      const existingIds = new Set(state.events.map((event) => event.eventId));
      let eventId = '';
      for (let attempt = 0; attempt < 5 && !eventId; attempt += 1) {
        const candidate = createOpaqueId('event', random);
        if (!existingIds.has(candidate)) eventId = candidate;
      }
      if (!eventId) return false;
      const event = buildProtocolEvent(normalizedName, payload, {
        eventId,
        anonymousInstallId
      });
      if (!event) return false;
      state.events.push(event);
      while (state.events.length > maxQueueSize) {
        const removableIndex = state.events.findIndex(
          (queuedEvent) => !activeBatchIds.has(queuedEvent.eventId)
        );
        if (removableIndex < 0 || state.events[removableIndex].eventId === event.eventId) {
          return false;
        }
        state.events.splice(removableIndex, 1);
      }
      if (!safeSet(productEventConfig.queueStorageKey, state)) return false;
      scheduleFlush(0);
      return true;
    } catch (_) {
      return false;
    }
  }

  function acknowledge(eventIds) {
    const ids = new Set(eventIds);
    const state = loadState();
    state.events = state.events.filter((event) => !ids.has(event.eventId));
    state.failureCount = 0;
    state.nextRetryAtMs = 0;
    safeSet(productEventConfig.queueStorageKey, state);
    if (state.events.length > 0) scheduleFlush(0);
    return state;
  }

  function markFailure() {
    const state = loadState();
    state.failureCount += 1;
    const multiplier = Math.pow(2, Math.min(30, state.failureCount - 1));
    const delayMs = Math.min(retryMaxMs, retryBaseMs * multiplier);
    state.nextRetryAtMs = Math.max(0, Math.floor(Number(now()) || 0)) + delayMs;
    safeSet(productEventConfig.queueStorageKey, state);
    scheduleFlush(delayMs);
    return {
      state: 'failed',
      failureCount: state.failureCount,
      nextRetryAtMs: state.nextRetryAtMs
    };
  }

  function acceptedCountMatches(result, batchSize) {
    if (!result || result.ok !== true || result.code !== 'PRODUCT_EVENTS_ACCEPTED') return false;
    const data = isPlainObject(result.data) ? result.data : {};
    const counts = ['accepted', 'deduped', 'rejected'].map((key) => Number(data[key]));
    return counts.every((value) => Number.isSafeInteger(value) && value >= 0) &&
      counts.reduce((sum, value) => sum + value, 0) === batchSize;
  }

  function runTransportWithTimeout(events) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      function settle(callback, value) {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) {
          try {
            clearTimeoutFn(timeoutId);
          } catch (_) {}
        }
        callback(value);
      }

      try {
        timeoutId = setTimeoutFn(() => {
          settle(reject, new Error('PRODUCT_EVENT_TRANSPORT_TIMEOUT'));
        }, requestTimeoutMs);
      } catch (error) {
        settle(reject, error);
        return;
      }

      if (settled) return;
      let pending;
      try {
        pending = transport(events);
      } catch (error) {
        settle(reject, error);
        return;
      }
      Promise.resolve(pending).then(
        (result) => settle(resolve, result),
        (error) => settle(reject, error)
      );
    });
  }

  async function runFlush() {
    const state = loadState();
    if (state.events.length === 0) {
      if (state.failureCount || state.nextRetryAtMs) {
        state.failureCount = 0;
        state.nextRetryAtMs = 0;
        safeSet(productEventConfig.queueStorageKey, state);
      }
      return { state: 'empty' };
    }

    const currentTime = Math.max(0, Math.floor(Number(now()) || 0));
    if (state.nextRetryAtMs > currentTime) {
      scheduleFlush(state.nextRetryAtMs - currentTime);
      return {
        state: 'backoff',
        nextRetryAtMs: state.nextRetryAtMs
      };
    }

    const batch = state.events.slice(0, maxBatchSize);
    const sentIds = batch.map((event) => event.eventId);
    activeBatchIds = new Set(sentIds);
    try {
      let result;
      try {
        result = await runTransportWithTimeout(
          batch.map((event) => ({ ...event, properties: { ...event.properties } }))
        );
      } catch (_) {
        return markFailure();
      }

      if (result && result.ok === true && result.code === 'EVENT_PIPELINE_DISABLED') {
        acknowledge(sentIds);
        return { state: 'disabled' };
      }
      if (!acceptedCountMatches(result, batch.length)) return markFailure();
      acknowledge(sentIds);
      return {
        state: 'accepted',
        accepted: Number(result.data.accepted),
        deduped: Number(result.data.deduped),
        rejected: Number(result.data.rejected)
      };
    } finally {
      activeBatchIds = new Set();
    }
  }

  function flush() {
    if (!enabled || disposed) return Promise.resolve({ state: 'disabled' });
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(runFlush)
      .catch(() => markFailure())
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function dispose() {
    disposed = true;
    if (timer !== null) {
      try {
        clearTimeoutFn(timer);
      } catch (_) {}
      timer = null;
    }
  }

  if (enabled && autoFlush) {
    const state = loadState();
    if (state.events.length > 0) {
      const currentTime = Math.max(0, Math.floor(Number(now()) || 0));
      scheduleFlush(Math.max(0, state.nextRetryAtMs - currentTime));
    }
  }

  return {
    enqueue,
    flush,
    dispose
  };
}

const defaultQueue = createProductEventQueue();

module.exports = {
  enqueue: defaultQueue.enqueue,
  flush: defaultQueue.flush,
  dispose: defaultQueue.dispose,
  _private: {
    createProductEventQueue,
    buildProtocolEvent,
    normalizeProperties,
    normalizeStoredEvent,
    createOpaqueId
  }
};
