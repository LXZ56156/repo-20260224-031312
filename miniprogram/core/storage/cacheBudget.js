const { get, set, del } = require('./base');
const PREFIX = 'local_tournament_cache_';
const AT_PREFIX = 'local_tournament_cache_at_';
const INDEX_KEY = 'tournament_cache_lru_v1';
const PENDING_KEY = 'tournament_cache_pending_writes_v1';
const MAX_DOCS = 50;
const MAX_BYTES = 4 * 1024 * 1024;
const pins = new Map();
let tick = 0;

function byteSize(value) {
  const json = JSON.stringify(value);
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < json.length
      && json.charCodeAt(i + 1) >= 0xdc00 && json.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function readIndex() {
  const value = get(INDEX_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function touch(tid) {
  const index = readIndex();
  tick = Math.max(Date.now(), tick + 1);
  for (const value of Object.values(index)) tick = Math.max(tick, Number(value) || 0);
  tick++;
  index[tid] = tick;
  set(INDEX_KEY, index);
}
function forget(tid) {
  const index = readIndex();
  delete index[tid];
  set(INDEX_KEY, index);
}
function pendingWrites() {
  const value = get(PENDING_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function beginWrite(tid, requestId) {
  if (!tid || !requestId) return;
  const pending = pendingWrites();
  pending[requestId] = String(tid);
  set(PENDING_KEY, pending);
}
function confirmWrite(requestId) {
  const pending = pendingWrites();
  delete pending[requestId];
  set(PENDING_KEY, pending);
}
function pin(tid) {
  const id = String(tid || '').trim();
  if (!id) return () => {};
  pins.set(id, (pins.get(id) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (pins.get(id) || 1) - 1;
    if (count) pins.set(id, count); else pins.delete(id);
    prune();
  };
}
function activeId() {
  try {
    if (typeof getCurrentPages !== 'function') return '';
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    return String(page && page.data && (page.data.tournamentId || (page.data.tournament && page.data.tournament._id)) || '').trim();
  } catch (_) { return ''; }
}
function prune() {
  // No trustworthy key enumeration means no deletion. Rebuild from actual keys
  // every maintenance pass, so a lost/partially written index cannot orphan docs.
  let keys;
  try { keys = wx.getStorageInfoSync().keys; } catch (_) { return { skipped: true }; }
  if (!Array.isArray(keys)) return { skipped: true };
  const index = readIndex();
  const next = {};
  const active = activeId();
  const pending = new Set(Object.values(pendingWrites()));
  const entries = [];
  for (const key of keys) {
    if (!key.startsWith(PREFIX) || key.startsWith(AT_PREFIX)) continue;
    const tid = key.slice(PREFIX.length);
    const doc = get(key, null);
    if (!doc || typeof doc !== 'object') continue;
    let bytes;
    try { bytes = byteSize(doc); } catch (_) { continue; }
    const at = Number(index[tid]) || Number(get(AT_PREFIX + tid, 0)) || 0;
    next[tid] = at;
    const hasDraft = keys.some(k => k.startsWith(`score_draft_${tid}_`) && get(k, null));
    entries.push({ tid, bytes, at, protected: tid === active || pins.has(tid) || pending.has(tid) || hasDraft });
  }
  let count = entries.length;
  let bytes = entries.reduce((sum, e) => sum + e.bytes, 0);
  entries.sort((a, b) => a.at - b.at || a.tid.localeCompare(b.tid));
  for (const entry of entries) {
    if (count <= MAX_DOCS && bytes <= MAX_BYTES) break;
    if (entry.protected) continue;
    if (!del(PREFIX + entry.tid)) continue;
    del(AT_PREFIX + entry.tid);
    delete next[entry.tid];
    count--; bytes -= entry.bytes;
  }
  // A prior failed timestamp deletion must not accumulate orphan metadata.
  const surviving = new Set(keys.filter(k => k.startsWith(PREFIX) && !k.startsWith(AT_PREFIX)));
  for (const key of keys) {
    if (key.startsWith(AT_PREFIX) && !surviving.has(PREFIX + key.slice(AT_PREFIX.length))) del(key);
  }
  set(INDEX_KEY, next);
  return { count, bytes, overBudget: count > MAX_DOCS || bytes > MAX_BYTES };
}
module.exports = { MAX_DOCS, MAX_BYTES, INDEX_KEY, PENDING_KEY, beginWrite, confirmWrite, byteSize, touch, forget, pin, prune };
