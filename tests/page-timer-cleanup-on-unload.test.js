const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const lobbyPagePath = require.resolve('../miniprogram/pages/lobby/index.js');

function loadLobbyPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[lobbyPagePath];
  require(lobbyPagePath);
  global.Page = originalPage;
  return definition;
}

function createLobbyPageContext(definition) {
  const updates = [];
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      updates.push(update);
      this.data = { ...this.data, ...(update || {}) };
    },
    _updates: updates
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx._fetchSeq = 0;
  ctx._watchGen = 0;
  return ctx;
}

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

test('lobby clears share pulse timer on hide', async () => {
  const originalCloseWatcher = tournamentSync.closeWatcher;
  const timers = installFakeTimers();
  tournamentSync.closeWatcher = () => {};

  try {
    const definition = loadLobbyPageDefinition();
    const ctx = createLobbyPageContext(definition);

    ctx.pulseShareHint(20);
    assert.equal(ctx.data.sharePulse, true);

    ctx.onHide();
    assert.equal(ctx.data.sharePulse, false);

    await timers.flushAll();
    assert.equal(ctx.data.sharePulse, false);
  } finally {
    tournamentSync.closeWatcher = originalCloseWatcher;
    timers.restore();
    delete require.cache[lobbyPagePath];
  }
});
