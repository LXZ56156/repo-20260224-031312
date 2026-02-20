const channels = {};

function msgOf(err) {
  return String((err && (err.message || err.errMsg)) || err || '');
}

function isRealtimeNotSupported(err) {
  const m = msgOf(err).toLowerCase();
  return m.includes('not support') || m.includes('realtime') || m.includes('reportrealtimeaction');
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

function startPolling(tournamentId, onData, onError) {
  const db = wx.cloud.database();
  let closed = false;
  let lastVersion = null;

  const timer = setInterval(async () => {
    if (closed) return;
    try {
      const res = await db.collection('tournaments').doc(tournamentId).get();
      const doc = res && res.data;
      if (!doc) return;
      // Reduce unnecessary setData: only notify when version changes.
      const v = doc.version;
      if (lastVersion === null || v !== lastVersion) {
        lastVersion = v;
        onData(doc);
      }
    } catch (e) {
      if (onError) onError(e);
    }
  }, 1500);

  return {
    close() {
      closed = true;
      clearInterval(timer);
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

  // Prefer realtime watch; if the runtime does not support it (common in some devtools),
  // fall back to short polling.
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
        console.warn('watch error', err);
        if (isRealtimeNotSupported(err)) {
          if (!fallback) {
            fallback = true;
            closeSource(channel);
            channel.source = startPolling(
              tournamentId,
              (doc) => { if (!channel.disposed) emitData(channel, doc); },
              (e) => { if (!channel.disposed) emitError(channel, e); }
            );
          }
          return;
        }
        emitError(channel, err);
      }
    });

    channel.source = w;
  } catch (e) {
    channel.source = startPolling(
      tournamentId,
      (doc) => { if (!channel.disposed) emitData(channel, doc); },
      (err) => { if (!channel.disposed) emitError(channel, err); }
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
