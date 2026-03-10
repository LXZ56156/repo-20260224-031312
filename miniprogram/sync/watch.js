const channels = {};

const POLL_BASE_MS = 1500;
const POLL_MAX_MS = 8000;

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

function withJitter(ms) {
  const n = Number(ms) || 0;
  const span = Math.max(80, Math.floor(n * 0.15));
  const delta = Math.floor((Math.random() * (span * 2 + 1)) - span);
  return Math.max(280, n + delta);
}

function safeCall(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (e) {
    console.error('watch callback error', e);
  }
}

function emitData(channel, doc) {
  const listeners = channel && channel.listeners ? Object.values(channel.listeners) : [];
  for (const it of listeners) safeCall(it.onData, doc);
}

function emitError(channel, err) {
  const listeners = channel && channel.listeners ? Object.values(channel.listeners) : [];
  for (const it of listeners) safeCall(it.onError, err);
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
      emitData(channel, doc);
    },
    (err) => {
      if (!channel || channel.disposed) return;
      const type = classifyWatchError(err);
      console.warn(`[watch:poll:${type}]`, err);
      emitError(channel, err);
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

function fallbackToPolling(channel, tournamentId) {
  if (!channel || channel.disposed) return;
  closeSource(channel);
  channel.source = createPollingSource(channel, tournamentId);
}

function disposeChannel(channel) {
  if (!channel || channel.disposed) return;
  channel.disposed = true;
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

function attachSource(channel, tournamentId) {
  if (!channel || channel.disposed) return;
  const db = wx.cloud.database();

  fetchOnce(
    tournamentId,
    (doc) => { if (!channel.disposed) emitData(channel, doc); },
    (err) => {
      if (channel.disposed) return;
      const type = classifyWatchError(err);
      console.warn(`[watch:init:${type}]`, err);
      emitError(channel, err);
    }
  );

  // Prefer realtime watch; if runtime does not support it, fallback to polling.
  try {
    let fallback = false;
    const w = db.collection('tournaments').doc(tournamentId).watch({
      onChange: (snapshot) => {
        if (channel.disposed) return;
        const doc = extractDoc(snapshot);
        if (doc) emitData(channel, doc);
      },
      onError: (err) => {
        if (channel.disposed) return;
        const type = classifyWatchError(err);
        console.warn(`[watch:realtime:${type}]`, err);
        emitError(channel, err);
        if ((type === 'realtime_not_supported' || type === 'network' || type === 'unknown') && !fallback) {
          fallback = true;
          fallbackToPolling(channel, tournamentId);
        }
      }
    });

    channel.source = w;
  } catch (err) {
    const type = classifyWatchError(err);
    console.warn(`[watch:attach:${type}]`, err);
    channel.source = createPollingSource(channel, tournamentId);
  }
}

function ensureChannel(tournamentId) {
  if (channels[tournamentId]) return channels[tournamentId];
  const c = {
    tournamentId,
    listeners: {},
    nextListenerId: 1,
    source: null,
    disposed: false
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
