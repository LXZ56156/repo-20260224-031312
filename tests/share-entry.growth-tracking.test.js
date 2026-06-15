const test = require('node:test');
const assert = require('node:assert/strict');

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

function withTracking(fn) {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const reports = [];
  const warnings = [];
  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    }
  };
  console.info = () => {};
  console.warn = (...args) => {
    warnings.push(args);
  };
  try {
    fn({ reports, warnings });
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
    console.warn = originalWarn;
    delete require.cache[shareEntryPagePath];
  }
}

function buildContext() {
  const definition = loadShareEntryPageDefinition();
  const ctx = createShareEntryContext(definition);
  ctx.setData({
    tournamentId: 't_secret_123456',
    tournament: null
  });
  return ctx;
}

test('share-entry view tracking ignores missing tournament data', () => {
  withTracking(({ reports }) => {
    const ctx = buildContext();

    ctx.trackShareEntryView();

    assert.equal(ctx._trackedShareEntryView, undefined);
    assert.equal(reports.length, 0);
  });
});

test('share-entry view tracking waits when status or mode is missing or invalid', () => {
  withTracking(({ reports, warnings }) => {
    const cases = [
      { _id: 't_secret_123456', mode: 'multi_rotate' },
      { _id: 't_secret_123456', status: 'running' },
      { _id: 't_secret_123456', status: 'paused', mode: 'multi_rotate' },
      { _id: 't_secret_123456', status: 'running', mode: 'single' }
    ];

    for (const tournament of cases) {
      const ctx = buildContext();
      ctx.trackShareEntryView(tournament);
      assert.equal(ctx._trackedShareEntryView, undefined);
    }

    assert.equal(reports.length, 0);
    assert.equal(warnings.length, 4);
  });
});

test('share-entry view tracking warns only once while waiting for complete fields', () => {
  withTracking(({ reports, warnings }) => {
    const ctx = buildContext();
    const missingMode = {
      _id: 't_secret_123456',
      status: 'running'
    };
    const invalidMode = {
      _id: 't_secret_123456',
      status: 'running',
      mode: 'single'
    };

    ctx.trackShareEntryView(missingMode);
    ctx.trackShareEntryView(missingMode);
    ctx.trackShareEntryView(invalidMode);

    assert.equal(ctx._trackedShareEntryView, undefined);
    assert.equal(reports.length, 0);
    assert.equal(warnings.length, 1);
  });
});

test('share-entry view tracking recovers after incomplete tournament becomes complete', () => {
  withTracking(({ reports }) => {
    const ctx = buildContext();
    const incomplete = {
      _id: 't_secret_123456',
      status: 'running'
    };
    const complete = {
      _id: 't_secret_123456',
      status: 'running',
      mode: 'multi_rotate'
    };

    ctx.setData({ tournament: incomplete });
    ctx.trackShareEntryView(incomplete);
    assert.equal(ctx._trackedShareEntryView, undefined);
    assert.equal(reports.length, 0);

    ctx.setData({ tournament: complete });
    ctx.trackShareEntryView(complete);
    ctx.trackShareEntryView(complete);

    assert.equal(reports.length, 1);
    assert.equal(reports[0].name, 'share_entry_view');
    assert.equal(reports[0].payload.s, 'running');
    assert.equal(reports[0].payload.m, 'multi_rotate');
    assert.equal(reports[0].payload.src, 'share_entry');
    assert.equal(reports[0].payload.a, 'view');
    assert.match(reports[0].payload.t, /^[0-9a-f]{8}$/);
    assert.notEqual(reports[0].payload.t, 't_secret');
  });
});

test('share-entry view tracking reports complete tournament only once', () => {
  withTracking(({ reports }) => {
    const ctx = buildContext();
    const tournament = {
      _id: 't_secret_123456',
      status: 'finished',
      mode: 'fixed_pair_rr'
    };

    ctx.setData({ tournament });
    ctx.trackShareEntryView(tournament);
    ctx.trackShareEntryView();
    ctx.trackShareEntryView(tournament);

    assert.equal(reports.length, 1);
    assert.equal(reports[0].payload.s, 'finished');
    assert.equal(reports[0].payload.m, 'fixed_pair_rr');
  });
});
