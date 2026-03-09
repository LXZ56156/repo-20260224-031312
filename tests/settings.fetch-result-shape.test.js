const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

const settingsPagePath = require.resolve('../miniprogram/pages/settings/index.js');

function loadSettingsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[settingsPagePath];
  require(settingsPagePath);
  global.Page = originalPage;
  return definition;
}

function createSettingsPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    applied: [],
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.applyTournament = (doc) => {
    ctx.applied.push(doc);
  };
  return ctx;
}

test('settings page handles structured fetchTournament results and clears stale hint on watch', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;
  const originalStartWatch = tournamentSync.startWatch;

  try {
    const definition = loadSettingsPageDefinition();
    const ctx = createSettingsPageContext(definition);
    const remoteDoc = { _id: 't_remote', name: 'Remote Tournament' };
    const cachedDoc = { _id: 't_cached', name: 'Cached Tournament' };

    tournamentSync.fetchTournament = async () => ({ ok: true, doc: remoteDoc, source: 'remote' });
    let doc = await ctx.fetchTournament('t_remote');
    assert.equal(doc, remoteDoc);
    assert.equal(ctx.data.showStaleSyncHint, false);
    assert.equal(ctx.data.loadError, false);
    assert.deepEqual(ctx.applied.pop(), remoteDoc);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      errorMessage: 'timeout',
      cachedDoc
    });
    doc = await ctx.fetchTournament('t_cached');
    assert.equal(doc, cachedDoc);
    assert.equal(ctx.data.showStaleSyncHint, true);
    assert.equal(ctx.data.loadError, false);
    assert.deepEqual(ctx.applied.pop(), cachedDoc);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      errorMessage: 'timeout',
      cachedDoc: null
    });
    doc = await ctx.fetchTournament('t_missing');
    assert.equal(doc, null);
    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.data.showStaleSyncHint, false);

    ctx.data.showStaleSyncHint = true;
    tournamentSync.startWatch = (_page, tid, onDoc) => {
      assert.equal(tid, 't_watch');
      onDoc(remoteDoc);
    };
    ctx.startWatch('t_watch');
    assert.equal(ctx.data.showStaleSyncHint, false);
    assert.deepEqual(ctx.applied.pop(), remoteDoc);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    tournamentSync.startWatch = originalStartWatch;
    delete require.cache[settingsPagePath];
  }
});
