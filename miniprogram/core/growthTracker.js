function shortTournamentId(value) {
  var input = String(value || '').trim();
  if (!input) return '';
  var hash = 0x811c9dc5;
  for (var i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ('00000000' + hash.toString(16)).slice(-8);
}

function pickStatus(value) {
  var status = String(value || '').trim();
  if (status === 'draft' || status === 'running' || status === 'finished') return status;
  return '';
}

function pickMode(value) {
  var mode = String(value || '').trim();
  if (mode === 'multi_rotate' || mode === 'squad_doubles' || mode === 'fixed_pair_rr') return mode;
  return '';
}

function buildPayload(payload) {
  payload = payload || {};
  var rawId = payload.tournamentId || payload.rawTournamentId || payload.id || payload._id || payload.t;
  var data = {
    t: shortTournamentId(rawId),
    s: pickStatus(payload.s || payload.status),
    m: pickMode(payload.m || payload.mode),
    src: String(payload.src || '').trim().slice(0, 40),
    a: String(payload.a || payload.action || '').trim().slice(0, 40),
    r: String(payload.r || payload.result || '').trim().slice(0, 40),
    ts: Number(payload.ts) || Date.now()
  };
  return data;
}

function track(eventName, payload) {
  try {
    var name = String(eventName || '').trim();
    if (!name) return;
    var data = buildPayload(payload);
    if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
      console.info('[growth]', name, data);
    }
    if (typeof wx !== 'undefined' && wx && typeof wx.reportEvent === 'function') {
      wx.reportEvent(name, data);
    }
  } catch (_) {}
}

function fromTournament(tournament, extra) {
  tournament = tournament || {};
  return Object.assign({
    tournamentId: tournament._id || tournament.id,
    status: tournament.status,
    mode: tournament.mode
  }, extra || {});
}

module.exports = {
  track,
  fromTournament,
  _private: {
    shortTournamentId,
    buildPayload
  }
};
