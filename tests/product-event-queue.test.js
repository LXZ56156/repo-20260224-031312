const test = require('node:test');
const assert = require('node:assert/strict');

const productEventConfig = require('../miniprogram/config/productEvents');
const productEventQueue = require('../miniprogram/core/productEventQueue');

const { createProductEventQueue } = productEventQueue._private;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, clone(value)]));
  return {
    get(key, fallback = null) {
      return values.has(key) ? clone(values.get(key)) : fallback;
    },
    set(key, value) {
      values.set(key, clone(value));
      return true;
    },
    del(key) {
      values.delete(key);
      return true;
    },
    peek(key) {
      return values.has(key) ? clone(values.get(key)) : undefined;
    }
  };
}

function createDeterministicRandom() {
  let seed = 0x10203040;
  return () => {
    seed = (seed + 0x1020304) >>> 0;
    return seed / 0x100000000;
  };
}

function acceptedResult(batchSize, overrides = {}) {
  return {
    ok: true,
    code: 'PRODUCT_EVENTS_ACCEPTED',
    state: 'accepted',
    data: {
      accepted: batchSize,
      deduped: 0,
      rejected: 0,
      rejections: [],
      ...overrides
    }
  };
}

function validPayload(nowMs, extra = {}) {
  return {
    t: 'deadbeef',
    s: 'running',
    m: 'multi_rotate',
    src: 'share_entry',
    a: 'view',
    r: '',
    ts: nowMs,
    ...extra
  };
}

test('product event client config and queue stay fail-closed by default', async () => {
  assert.equal(productEventConfig.enabled, false);
  assert.equal(productEventConfig.maxBatchSize, 20);

  let storageCalls = 0;
  let transportCalls = 0;
  let timerCalls = 0;
  const queue = createProductEventQueue({
    storage: {
      get() { storageCalls += 1; throw new Error('must stay disabled'); },
      set() { storageCalls += 1; throw new Error('must stay disabled'); }
    },
    transport: async () => {
      transportCalls += 1;
      throw new Error('must stay disabled');
    },
    setTimeout() {
      timerCalls += 1;
      throw new Error('must stay disabled');
    }
  });

  assert.equal(queue.enqueue('share_entry_view', validPayload(1000)), false);
  const result = await queue.flush();

  assert.equal(result.state, 'disabled');
  assert.equal(storageCalls, 0);
  assert.equal(transportCalls, 0);
  assert.equal(timerCalls, 0);
});

test('enabled queues recover persisted backoff work on startup without waiting for a new event', async () => {
  let nowMs = 1700000000000;
  const persistedEvent = {
    eventId: 'event_0123456789abcdef0123456789abcdef',
    name: 'share_entry_view',
    occurredAtMs: nowMs,
    anonymousInstallId: 'install_0123456789abcdef0123456789abcdef',
    properties: {
      t: 'deadbeef',
      s: 'running',
      m: 'multi_rotate',
      src: 'share_entry',
      a: 'view'
    }
  };
  const storage = createMemoryStorage({
    [productEventConfig.queueStorageKey]: {
      version: 1,
      events: [persistedEvent],
      failureCount: 2,
      nextRetryAtMs: nowMs + 250
    }
  });
  const timers = [];
  let transportCalls = 0;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: true,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async (events) => {
      transportCalls += 1;
      return acceptedResult(events.length);
    },
    setTimeout(fn, delay) {
      const id = timers.length;
      timers.push({ fn, delay, cleared: false });
      return id;
    },
    clearTimeout(id) {
      if (timers[id]) timers[id].cleared = true;
    }
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 250);
  assert.equal(transportCalls, 0);

  nowMs += 250;
  timers[0].fn();
  await queue.flush();

  assert.equal(transportCalls, 1);
  assert.equal(storage.peek(productEventConfig.queueStorageKey).events.length, 0);
});

test('queue only persists the allowlisted anonymous protocol and rejects PII or free text', () => {
  const nowMs = 1700000000000;
  const storage = createMemoryStorage();
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async () => acceptedResult(1)
  });

  assert.equal(queue.enqueue('unknown_dynamic_event', validPayload(nowMs)), false);
  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs, {
    tournamentId: 'raw_tournament_secret'
  })), false);
  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs, {
    t: 'raw_tournament_secret'
  })), false);
  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs, {
    a: '球友昵称或任意正文'
  })), false);
  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs, {
    src: 'https://example.com/private'
  })), false);
  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs)), true);

  const state = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(state.events.length, 1);
  assert.match(state.events[0].eventId, /^event_[0-9a-f]{32}$/);
  assert.match(state.events[0].anonymousInstallId, /^install_[0-9a-f]{32}$/);
  assert.equal(state.events[0].occurredAtMs, nowMs);
  assert.deepEqual(state.events[0].properties, {
    t: 'deadbeef',
    s: 'running',
    m: 'multi_rotate',
    src: 'share_entry',
    a: 'view'
  });
  assert.equal(JSON.stringify(state).includes('raw_tournament_secret'), false);
  assert.equal(JSON.stringify(state).includes('球友昵称'), false);
});

test('queue keeps event identity stable across failure and deletes it after a verified success', async () => {
  let nowMs = 1700000000000;
  const storage = createMemoryStorage();
  const sent = [];
  let attempt = 0;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    retryBaseMs: 100,
    retryMaxMs: 1000,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async (events) => {
      sent.push(clone(events));
      attempt += 1;
      if (attempt === 1) throw new Error('network timeout');
      return acceptedResult(events.length);
    }
  });

  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs)), true);
  const queuedBefore = storage.peek(productEventConfig.queueStorageKey).events[0];

  const failed = await queue.flush();
  const stateAfterFailure = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(failed.state, 'failed');
  assert.equal(stateAfterFailure.events.length, 1);
  assert.equal(stateAfterFailure.events[0].eventId, queuedBefore.eventId);
  assert.equal(stateAfterFailure.events[0].occurredAtMs, queuedBefore.occurredAtMs);
  assert.equal(stateAfterFailure.failureCount, 1);
  assert.equal(stateAfterFailure.nextRetryAtMs, nowMs + 100);

  nowMs += 100;
  const succeeded = await queue.flush();
  const stateAfterSuccess = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(succeeded.state, 'accepted');
  assert.equal(stateAfterSuccess.events.length, 0);
  assert.equal(stateAfterSuccess.failureCount, 0);
  assert.equal(stateAfterSuccess.nextRetryAtMs, 0);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1][0], sent[0][0]);
});

test('queue applies capped exponential backoff and does not send before the retry time', async () => {
  let nowMs = 1000;
  let calls = 0;
  const storage = createMemoryStorage();
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    retryBaseMs: 100,
    retryMaxMs: 150,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async () => {
      calls += 1;
      throw new Error('offline');
    }
  });

  queue.enqueue('share_entry_view', validPayload(nowMs));
  await queue.flush();
  assert.equal(storage.peek(productEventConfig.queueStorageKey).nextRetryAtMs, 1100);

  nowMs = 1099;
  const waiting = await queue.flush();
  assert.equal(waiting.state, 'backoff');
  assert.equal(calls, 1);

  nowMs = 1100;
  await queue.flush();
  const secondFailure = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(secondFailure.failureCount, 2);
  assert.equal(secondFailure.nextRetryAtMs, 1250);
  assert.equal(calls, 2);
});

test('a transport that never settles times out, retains the event, and allows a later retry', async () => {
  let nowMs = 1700000000000;
  const storage = createMemoryStorage();
  const timers = [];
  let transportCalls = 0;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    requestTimeoutMs: 100,
    retryBaseMs: 50,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async (events) => {
      transportCalls += 1;
      if (transportCalls === 1) return new Promise(() => {});
      return acceptedResult(events.length);
    },
    setTimeout(fn, delay) {
      const id = timers.length;
      timers.push({ fn, delay, cleared: false });
      return id;
    },
    clearTimeout(id) {
      if (timers[id]) timers[id].cleared = true;
    }
  });

  queue.enqueue('share_entry_view', validPayload(nowMs));
  const queued = storage.peek(productEventConfig.queueStorageKey).events[0];
  const pending = queue.flush();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 100);
  timers[0].fn();
  const failed = await pending;
  const retained = storage.peek(productEventConfig.queueStorageKey);

  assert.equal(failed.state, 'failed');
  assert.equal(retained.events.length, 1);
  assert.equal(retained.events[0].eventId, queued.eventId);
  assert.equal(retained.failureCount, 1);
  assert.equal(retained.nextRetryAtMs, nowMs + 50);

  nowMs += 50;
  const succeeded = await queue.flush();
  assert.equal(succeeded.state, 'accepted');
  assert.equal(transportCalls, 2);
  assert.equal(storage.peek(productEventConfig.queueStorageKey).events.length, 0);
});

test('queue sends at most 20 events per batch and enforces a drop-oldest capacity', async () => {
  const nowMs = 1700000000000;
  const storage = createMemoryStorage();
  const batches = [];
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    maxBatchSize: 20,
    maxQueueSize: 23,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async (events) => {
      batches.push(clone(events));
      return acceptedResult(events.length);
    }
  });

  for (let i = 0; i < 25; i += 1) {
    assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs + i)), true);
  }

  const capped = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(capped.events.length, 23);
  assert.equal(capped.events[0].occurredAtMs, nowMs + 2);

  await queue.flush();
  const remaining = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 20);
  assert.equal(remaining.events.length, 3);
  assert.deepEqual(
    remaining.events.map((event) => event.occurredAtMs),
    [nowMs + 22, nowMs + 23, nowMs + 24]
  );
});

test('capacity pressure never evicts an in-flight event that must be retained after failure', async () => {
  const nowMs = 1700000000000;
  const storage = createMemoryStorage();
  let rejectTransport;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    maxBatchSize: 1,
    maxQueueSize: 2,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: () => new Promise((resolve, reject) => {
      rejectTransport = reject;
    })
  });

  queue.enqueue('share_entry_view', validPayload(nowMs));
  queue.enqueue('share_entry_view', validPayload(nowMs + 1));
  const firstEvent = storage.peek(productEventConfig.queueStorageKey).events[0];
  const pending = queue.flush();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(queue.enqueue('share_entry_view', validPayload(nowMs + 2)), true);
  const duringFlight = storage.peek(productEventConfig.queueStorageKey);
  assert.deepEqual(
    duringFlight.events.map((event) => event.occurredAtMs),
    [nowMs, nowMs + 2]
  );

  rejectTransport(new Error('offline after capacity pressure'));
  const failed = await pending;
  const retained = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(failed.state, 'failed');
  assert.equal(retained.events.some((event) => event.eventId === firstEvent.eventId), true);
  assert.deepEqual(
    retained.events.map((event) => event.occurredAtMs),
    [nowMs, nowMs + 2]
  );
});

test('queue acknowledges by eventId so an enqueue during flush is preserved and flush stays single-flight', async () => {
  const nowMs = 1700000000000;
  const storage = createMemoryStorage();
  let transportCalls = 0;
  let resolveTransport;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: (events) => {
      transportCalls += 1;
      return new Promise((resolve) => {
        resolveTransport = () => resolve(acceptedResult(events.length));
      });
    }
  });

  queue.enqueue('share_entry_view', validPayload(nowMs));
  queue.enqueue('share_entry_view', validPayload(nowMs + 1));
  const firstFlush = queue.flush();
  const sameFlush = queue.flush();
  await Promise.resolve();
  queue.enqueue('share_entry_view', validPayload(nowMs + 2));
  resolveTransport();
  await Promise.all([firstFlush, sameFlush]);

  const remaining = storage.peek(productEventConfig.queueStorageKey);
  assert.equal(transportCalls, 1);
  assert.equal(remaining.events.length, 1);
  assert.equal(remaining.events[0].occurredAtMs, nowMs + 2);
});

test('disabled server responses drop the attempted batch without retrying or accumulating data', async () => {
  const nowMs = 1700000000000;
  const storage = createMemoryStorage();
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async () => ({
      ok: true,
      code: 'EVENT_PIPELINE_DISABLED',
      state: 'disabled',
      data: { accepted: 0, deduped: 0, rejected: 0 }
    })
  });

  queue.enqueue('share_entry_view', validPayload(nowMs));
  const result = await queue.flush();
  const state = storage.peek(productEventConfig.queueStorageKey);

  assert.equal(result.state, 'disabled');
  assert.equal(state.events.length, 0);
  assert.equal(state.failureCount, 0);
  assert.equal(state.nextRetryAtMs, 0);
});

test('corrupt persisted payloads and transport or storage failures remain non-blocking', async () => {
  const nowMs = 1700000000000;
  const maliciousState = {
    version: 1,
    failureCount: 0,
    nextRetryAtMs: 0,
    events: [{
      eventId: 'event_0123456789abcdef0123456789abcdef',
      name: 'share_entry_view',
      occurredAtMs: nowMs,
      anonymousInstallId: 'install_0123456789abcdef0123456789abcdef',
      properties: {
        t: 'deadbeef',
        src: 'share_entry',
        a: 'view',
        openid: 'openid_secret'
      },
      avatarUrl: 'https://example.com/private-avatar'
    }]
  };
  const storage = createMemoryStorage({
    [productEventConfig.queueStorageKey]: maliciousState
  });
  let sent = null;
  const queue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage,
    transport: async (events) => {
      sent = events;
      return acceptedResult(events.length);
    }
  });

  const empty = await queue.flush();
  assert.equal(empty.state, 'empty');
  assert.equal(sent, null);
  assert.equal(JSON.stringify(storage.peek(productEventConfig.queueStorageKey)).includes('openid_secret'), false);

  const brokenQueue = createProductEventQueue({
    enabled: true,
    autoFlush: false,
    now: () => nowMs,
    random: createDeterministicRandom(),
    storage: {
      get() { throw new Error('storage read failed'); },
      set() { throw new Error('storage write failed'); }
    },
    transport: async () => Promise.reject(new Error('cloud unavailable'))
  });

  assert.doesNotThrow(() => brokenQueue.enqueue('share_entry_view', validPayload(nowMs)));
  assert.equal(brokenQueue.enqueue('share_entry_view', validPayload(nowMs)), false);
  await assert.doesNotReject(() => brokenQueue.flush());
});
