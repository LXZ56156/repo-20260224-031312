const test = require('node:test');
const assert = require('node:assert/strict');

const growthTracker = require('../miniprogram/core/growthTracker');
const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
  global.Page = originalPage;
  return definition;
}

function createShareEntryContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('share-entry view tracking waits for tournament data and reports once', () => {
  const originalTrack = growthTracker.track;
  const calls = [];
  growthTracker.track = (name, payload) => {
    calls.push({ name, payload });
  };

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryContext(definition);
    ctx.setData({
      tournamentId: 't_secret_123456',
      tournament: null
    });

    ctx.trackShareEntryView();

    assert.equal(ctx._trackedShareEntryView, undefined);
    assert.equal(calls.length, 0);

    const tournament = {
      _id: 't_secret_123456',
      status: 'running',
      mode: 'multi_rotate'
    };
    ctx.setData({ tournament });
    ctx.trackShareEntryView(tournament);
    ctx.trackShareEntryView(tournament);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'share_entry_view');
    assert.equal(calls[0].payload.s, 'running');
    assert.equal(calls[0].payload.m, 'multi_rotate');
    assert.equal(calls[0].payload.src, 'share_entry');
    assert.equal(calls[0].payload.a, 'view');
    assert.match(calls[0].payload.t, /^[0-9a-f]{8}$/);
    assert.notEqual(calls[0].payload.t, 't_secret');
  } finally {
    growthTracker.track = originalTrack;
    delete require.cache[shareEntryPagePath];
  }
});
