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

function startPolling(tournamentId, onData, onError) {
  const db = wx.cloud.database();
  let closed = false;
  let inflight = false;
  let timer = null;
  let lastVersion = null;
  let delayMs = POLL_BASE_MS;

  const scheduleNext = (immediate = false) => {
    if (closed) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const wait = immediate ? 0 : withJitter(delayMs);
    timer = setTimeout(runOnce, wait);
  };

  const runOnce = async () => {
    if (closed || inflight) return;
    inflight = true;
    try {
      const res = await db.collection('tournaments').doc(tournamentId).get();
      const doc = res && res.data;
      if (doc) {
        const version = doc.version;
        if (lastVersion === null || version !== lastVersion) {
          lastVersion = version;
          onData(doc);
        }
      }
      delayMs = POLL_BASE_MS;
    } catch (err) {
      delayMs = Math.min(POLL_MAX_MS, Math.floor(delayMs * 1.8));
      if (onError) onError(err);
    } finally {
      inflight = false;
      scheduleNext(false);
    }
  };

  // 首次订阅立即主动拉取一次，降低首屏等待。
  scheduleNext(true);

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

function closeSource(channel) {
  const src = channel && channel.source;
  if (src && src.close) {
    try { src.close(); } catch (e) {}
  }
  if (channel) channel.source = null;
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
        if (isRealtimeNotSupported(err)) {
          if (!fallback) {
            fallback = true;
            closeSource(channel);
            channel.source = startPolling(
              tournamentId,
              (doc) => { if (!channel.disposed) emitData(channel, doc); },
              (e) => {
                if (channel.disposed) return;
                const pType = classifyWatchError(e);
                console.warn(`[watch:poll:${pType}]`, e);
                emitError(channel, e);
              }
            );
          }
          return;
        }
        emitError(channel, err);
      }
    });

    channel.source = w;
  } catch (err) {
    const type = classifyWatchError(err);
    console.warn(`[watch:attach:${type}]`, err);
    channel.source = startPolling(
      tournamentId,
      (doc) => { if (!channel.disposed) emitData(channel, doc); },
      (e) => {
        if (channel.disposed) return;
        const pType = classifyWatchError(e);
        console.warn(`[watch:poll:${pType}]`, e);
        emitError(channel, e);
      }
    );
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

  return {
    close() {
      const c = channels[tournamentId];
      if (!c || c.disposed) return;
      delete c.listeners[listenerId];
      if (Object.keys(c.listeners).length === 0) {
        disposeChannel(c);
      }
    }
  };
}

function closeWatch(tournamentId) {
  const c = channels[tournamentId];
  disposeChannel(c);
}

module.exports = { watchTournament, closeWatch };
