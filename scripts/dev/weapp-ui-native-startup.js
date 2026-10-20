'use strict';

const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

function canonical(value) {
  return String(value).replace(/\\+/g, '/').replace(/\/+$/g, '').toLowerCase();
}

// DevTools can expose getApp/pages while onContainerInited still awaits its
// debugger connection. Its later reload destroys that provisional AppService.
// This is an additional readiness barrier, never a substitute for runtime proof.
function createStartupTracker(projectPath) {
  const root = canonical(projectPath);
  const states = new Map();
  function feed(file, line, fresh = true) {
    const header = line.match(/\[rt:(\d+),win:(s\d+)\]/);
    if (!header) return;
    const key = `${file}:${header[1]}:${header[2]}`;
    if (!states.has(key)) states.set(key, { key, known: false, pendingContainer: false,
      pendingRestart: false, awaitingLoad: false, ready: false, provisionalLoadObserved: false,
      freshBinding: false, freshActivity: false, generation: 0, processId: null });
    const state = states.get(key);
    const normalized = canonical(line);
    let index = normalized.indexOf(root);
    while (index >= 0) {
      const next = normalized[index + root.length] || '';
      if (!/[a-z0-9_.-]/i.test(next) && fresh) state.freshBinding = true;
      index = normalized.indexOf(root, index + root.length);
    }
    const event = line.match(/\[appservice\] (.*)$/);
    if (!event) return;
    const message = event[1].trim();
    const process = message.match(/^appservice webview process id (\d+)$/);
    if (process) state.processId = Number(process[1]);
    if (!/^(appservice init webview|restart appservice .+|appservice reload|appservice webview loadstop)$/.test(message)) return;
    if (fresh) state.freshActivity = true;
    if (message === 'appservice init webview') {
      state.generation++; state.processId = null;
      Object.assign(state, { known: true, pendingContainer: true, pendingRestart: false,
        awaitingLoad: false, ready: false, provisionalLoadObserved: false });
    } else if (message.startsWith('restart appservice ')) {
      state.pendingRestart = true;
      state.ready = false;
      state.awaitingLoad = false;
    } else if (message === 'appservice reload') {
      // A compile restart can load a provisional page during the async hook.
      // The unpaired reload is the hook's actual completion.
      if (state.pendingRestart) state.pendingRestart = false;
      else if (state.pendingContainer) state.pendingContainer = false;
      else if (state.provisionalLoadObserved) state.known = true;
      state.awaitingLoad = true;
      state.ready = false;
    } else {
      // The vendor logger can start after init/first reload. Never merge files
      // or accept its first loadstop: witness that provisional load, then the
      // later unpaired hook reload AND its loadstop in this same log/window.
      if (!state.known) state.provisionalLoadObserved = true;
      // Duplicate completion notifications are idempotent. Lifecycle starts
      // and reloads above already invalidate readiness for the next load.
      state.ready = (state.ready || state.awaitingLoad) && state.known && !state.pendingContainer && !state.pendingRestart;
      state.awaitingLoad = false;
    }
  }
  function inspect() {
    const candidates = [...states.values()].filter((state) => state.freshBinding && state.freshActivity);
    if (candidates.length > 1) throw new Error('Native startup project/window correlation is ambiguous.');
    const state = candidates[0];
    return { ready: !!state && state.ready, matchedWindows: candidates.length,
      pendingContainer: !!state && state.pendingContainer, pendingRestart: !!state && state.pendingRestart };
  }
  function incarnation() {
    inspect(); // Preserve the same exact-project/window ambiguity rejection.
    const state = [...states.values()].find(value => value.freshBinding && value.freshActivity);
    return state ? { key: state.key, generation: state.generation, processId: state.processId, ready: state.ready } : null;
  }
  return { feed, inspect, incarnation, forget: (file) => {
    for (const [key] of states) if (key.startsWith(`${file}:`)) states.delete(key);
  } };
}

function snapshotNativeStartup(logDirectory, projectPath) {
  const tracker = createStartupTracker(projectPath);
  const cursors = new Map();
  function poll(initial = false) {
    for (const entry of fs.readdirSync(logDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.log')) continue;
      const file = path.join(logDirectory, entry.name);
      const stat = fs.statSync(file);
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      let cursor = cursors.get(file);
      if (!cursor || cursor.identity !== identity || cursor.offset > stat.size) {
        tracker.forget(file);
        cursor = { identity, offset: 0, decoder: new StringDecoder('utf8'), partial: '', partialFresh: !initial };
        cursors.set(file, cursor);
      }
      const length = stat.size - cursor.offset;
      if (!length) continue;
      if (length > 20 * 1024 * 1024) throw new Error('Native startup log increment exceeds the read limit.');
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(file, 'r');
      let bytes;
      try { bytes = fs.readSync(fd, buffer, 0, length, cursor.offset); }
      finally { fs.closeSync(fd); }
      cursor.offset += bytes;
      const hadPartial = cursor.partial.length > 0;
      const lines = (cursor.partial + cursor.decoder.write(buffer.subarray(0, bytes))).split('\n');
      cursor.partial = lines.pop();
      lines.forEach((line, index) => tracker.feed(file, line, !initial && (index > 0 || !hadPartial || cursor.partialFresh)));
      cursor.partialFresh = !initial;
    }
    return tracker.inspect();
  }
  poll(true);
  return { poll: () => poll(false), incarnation: tracker.incarnation };
}

async function waitForNativeStartup(observer, timeoutMs, options = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Native startup timeout must be positive and finite.');
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const start = now();
  const deadline = start + timeoutMs;
  let result;
  while (now() < deadline) {
    result = observer.poll();
    if (result.ready) return { ...result, elapsedMs: now() - start };
    await sleep(Math.min(200, deadline - now()));
  }
  throw new Error(`Native AppService container did not complete within the startup deadline: ${JSON.stringify(result || {})}`);
}

module.exports = { createStartupTracker, snapshotNativeStartup, waitForNativeStartup };
