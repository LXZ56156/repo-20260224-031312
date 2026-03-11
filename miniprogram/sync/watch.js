const channels = {};

const POLL_BASE_MS = 1500;
const POLL_MAX_MS = 8000;
const RECOVER_DELAYS_MS = [5000, 15000, 30000, 60000];

function msgOf(err) {
  return String((err && (err.message || err.errMsg)) || err || '');
}

function isRealtimeNotSupported(err) {
  const m = msgOf(err).toLowerCase();
  return m.includes('not support') || m.includes('realtime') || m.includes('reportrealtimeaction');
}

function classifyWatchError(err) {
  if (isRealtimeNotSupported(err)) return 'realtime_not_supported';
  const m = msgOf(err).toLowerCase();
  if (m.includes('timeout') || m.includes('network') || m.includes('connect')) return 'network';
  return 'unknown';
}

function shouldAttemptRealtimeRecovery(type) {
  return type === 'network' || type === 'unknown';
}

function getRecoveryDelayMs(attemptCount) {
  const idx = Math.max(0, Math.min(RECOVER_DELAYS_MS.length - 1, Number(attemptCount) || 0));
  return RECOVER_DELAYS_MS[idx];
}

function withJitter(ms) {
  const n = Number(ms) || 0;
  const span = Math.max(80, Math.floor(n * 0.15));
  const delta = Math.floor((Math.random() * (span * 2 + 1)) - span);
  return Math.max(280, n + delta);
}

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch (e) {
    console.error('watch callback error', e);
  }
}

function decorateWatchError(err, meta = {}) {
  const base = (err && typeof err === 'object') ? err : new Error(msgOf(err) || 'watch failed');
  base.__watchType = String(meta.type || classifyWatchError(base) || 'unknown');
  base.__watchSource = String(meta.source || '').trim();
  base.__watchFallback = !!meta.pollingFallback;
  return base;
}

function emitData(channel, doc, meta = {}) {
  const listeners = channel && channel.listeners ? Object.values(channel.listeners) : [];
  for (const it of listeners) safeCall(it.onData, doc, meta);
}

function emitError(channel, err, meta = {}) {
  const listeners = channel && channel.listeners ? Object.values(channel.listeners) : [];
  const decorated = decorateWatchError(err, meta);
  for (const it of listeners) safeCall(it.onError, decorated, meta);
}

async function fetchOnce(tournamentId, onData, onError) {
  try {
    const db = wx.cloud.database();
    const res = await db.collection('tournaments').doc(tournamentId).get();
    const doc = res && res.data;
    if (doc) onData(doc);
  } catch (err) {
    if (onError) onError(err);
  }
}

function createPollingController(options = {}) {
  const fetchDoc = typeof options.fetchDoc === 'function' ? options.fetchDoc : null;
  const onData = typeof options.onData === 'function' ? options.onData : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const baseMs = Math.max(1, Number(options.baseMs) || POLL_BASE_MS);
  const maxMs = Math.max(baseMs, Number(options.maxMs) || POLL_MAX_MS);
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  const jitterFn = options.jitterFn || withJitter;
  const autoStart = options.autoStart !== false;
  let closed = false;
  let inflight = false;
  let timer = null;
  let lastVersion = null;
  let delayMs = baseMs;

  const scheduleNext = (immediate = false) => {
    if (closed) return;
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
    const wait = immediate ? 0 : jitterFn(delayMs);
    timer = setTimeoutFn(runOnce, wait);
  };

  const runOnce = async () => {
    if (closed || inflight || !fetchDoc) return;
    inflight = true;
    try {
      const doc = await fetchDoc();
      if (doc) {
        const version = doc.version;
        if (lastVersion === null || version !== lastVersion) {
          lastVersion = version;
          if (onData) onData(doc);
        }
      }
      delayMs = baseMs;
    } catch (err) {
      delayMs = Math.min(maxMs, Math.floor(delayMs * 1.8));
      if (onError) onError(err);
    } finally {
      inflight = false;
      scheduleNext(false);
    }
  };

  if (autoStart) {
    // 首次订阅立即主动拉取一次，降低首屏等待。
    scheduleNext(true);
  }

  return {
    runOnce,
    getDelayMs() {
      return delayMs;
    },
    isInflight() {
      return inflight;
    },
    close() {
      closed = true;
      if (timer) clearTimeoutFn(timer);
      timer = null;
    }
  };
}

function startPolling(tournamentId, onData, onError) {
  const db = wx.cloud.database();
  return createPollingController({
    fetchDoc: async () => {
      const res = await db.collection('tournaments').doc(tournamentId).get();
      return res && res.data;
    },
    onData,
    onError
  });
}

function createPollingSource(channel, tournamentId) {
  return startPolling(
    tournamentId,
    (doc) => {
      if (!channel || channel.disposed) return;
      emitData(channel, doc, { source: 'polling' });
    },
    (err) => {
      if (!channel || channel.disposed) return;
      const type = classifyWatchError(err);
      console.warn(`[watch:poll:${type}]`, err);
      emitError(channel, err, { type, source: 'polling', pollingFallback: true });
      if (shouldAttemptRealtimeRecovery(channel.fallbackReason)) scheduleRealtimeRecovery(channel, tournamentId);
    }
  );
}

function closeSource(channel) {
  const src = channel && channel.source;
  if (src && src.close) {
    try { src.close(); } catch (e) {}
  }
  if (channel) channel.source = null;
}

function clearRecoverTimer(channel) {
  if (!channel || !channel.recoverTimer) return;
  try { clearTimeout(channel.recoverTimer); } catch (_) {}
  channel.recoverTimer = null;
}

function scheduleRealtimeRecovery(channel, tournamentId) {
  if (!channel || channel.disposed) return;
  if (channel.mode !== 'polling') return;
  if (!shouldAttemptRealtimeRecovery(channel.fallbackReason)) return;
  if (channel.recoverTimer) return;
  const delayMs = getRecoveryDelayMs(channel.recoverAttempts);
  channel.recoverTimer = setTimeout(() => {
    channel.recoverTimer = null;
    if (!channel || channel.disposed) return;
    if (channel.mode !== 'polling') return;
    if (!shouldAttemptRealtimeRecovery(channel.fallbackReason)) return;
    channel.recoverAttempts = Number(channel.recoverAttempts || 0) + 1;
    attachSource(channel, tournamentId, { recoveryAttempt: true });
  }, delayMs);
}

function fallbackToPolling(channel, tournamentId, reason = 'unknown') {
  if (!channel || channel.disposed) return;
  closeSource(channel);
  channel.mode = 'polling';
  channel.recovering = false;
  channel.fallbackReason = String(reason || '').trim() || 'unknown';
  channel.source = createPollingSource(channel, tournamentId);
  if (shouldAttemptRealtimeRecovery(channel.fallbackReason)) {
    scheduleRealtimeRecovery(channel, tournamentId);
  } else {
    clearRecoverTimer(channel);
  }
}

function disposeChannel(channel) {
  if (!channel || channel.disposed) return;
  channel.disposed = true;
  clearRecoverTimer(channel);
  channel.listeners = {};
  closeSource(channel);
  if (channels[channel.tournamentId] === channel) {
    delete channels[channel.tournamentId];
  }
}

function extractDoc(snapshot) {
  if (!snapshot) return null;
  if (snapshot.docs && snapshot.docs.length > 0) return snapshot.docs[0];
  if (snapshot.docChanges && snapshot.docChanges.length > 0) {
    return snapshot.docChanges[0].doc;
  }
  if (snapshot.doc) return snapshot.doc;
  return null;
}

function attachSource(channel, tournamentId, options = {}) {
  if (!channel || channel.disposed) return;
  const db = wx.cloud.database();
  const recoveryAttempt = options.recoveryAttempt === true;

  fetchOnce(
    tournamentId,
    (doc) => { if (!channel.disposed) emitData(channel, doc, { source: 'init_fetch' }); },
    (err) => {
      if (channel.disposed) return;
      const type = classifyWatchError(err);
      console.warn(`[watch:init:${type}]`, err);
      emitError(channel, err, { type, source: 'init_fetch', pollingFallback: false });
    }
  );

  // Prefer realtime watch; if runtime does not support it, fallback to polling.
  try {
    let fallback = false;
    closeSource(channel);
    const w = db.collection('tournaments').doc(tournamentId).watch({
      onChange: (snapshot) => {
        if (channel.disposed) return;
        const doc = extractDoc(snapshot);
        if (!doc) return;
        const source = channel.recovering ? 'realtime_recovered' : 'realtime';
        channel.recovering = false;
        channel.mode = 'realtime';
        channel.fallbackReason = '';
        channel.recoverAttempts = 0;
        clearRecoverTimer(channel);
        emitData(channel, doc, { source });
      },
      onError: (err) => {
        if (channel.disposed) return;
        const type = classifyWatchError(err);
        console.warn(`[watch:realtime:${type}]`, err);
        const shouldFallback = (type === 'realtime_not_supported' || type === 'network' || type === 'unknown') && !fallback;
        emitError(channel, err, { type, source: 'realtime', pollingFallback: shouldFallback });
        if ((type === 'realtime_not_supported' || type === 'network' || type === 'unknown') && !fallback) {
          fallback = true;
          fallbackToPolling(channel, tournamentId, type);
        }
      }
    });

    channel.source = w;
    channel.mode = 'realtime';
    channel.recovering = recoveryAttempt;
    clearRecoverTimer(channel);
  } catch (err) {
    const type = classifyWatchError(err);
    console.warn(`[watch:attach:${type}]`, err);
    emitError(channel, err, { type, source: 'attach', pollingFallback: true });
    fallbackToPolling(channel, tournamentId, type);
  }
}

function ensureChannel(tournamentId) {
  if (channels[tournamentId]) return channels[tournamentId];
  const c = {
    tournamentId,
    listeners: {},
    nextListenerId: 1,
    source: null,
    disposed: false,
    mode: 'realtime',
    fallbackReason: '',
    recoverTimer: null,
    recoverAttempts: 0,
    recovering: false
  };
  channels[tournamentId] = c;
  attachSource(c, tournamentId);
  return c;
}

function watchTournament(tournamentId, onData, onError) {
  if (!tournamentId) return null;
  const channel = ensureChannel(tournamentId);
  const listenerId = `l_${Date.now()}_${channel.nextListenerId++}`;
  channel.listeners[listenerId] = { onData, onError };
  let closed = false;

  return {
    close() {
      if (closed) return;
      closed = true;
      if (!channel || channel.disposed) return;
      delete channel.listeners[listenerId];
      if (Object.keys(channel.listeners).length === 0) {
        disposeChannel(channel);
      }
    }
  };
}

function closeWatch(tournamentId) {
  const c = channels[tournamentId];
  disposeChannel(c);
}

module.exports = {
  watchTournament,
  closeWatch,
  createPollingController,
  classifyWatchError
};
