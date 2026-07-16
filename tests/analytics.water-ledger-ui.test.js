const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function loadAnalyticsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[analyticsPagePath];
  require(analyticsPagePath);
  global.Page = originalPage;
  return definition;
}

function createAnalyticsContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    openid: 'u1',
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.clearLastFailedAction = () => {};
  ctx.trackAnalyticsView = () => {};
  ctx._preheatShareWhenReady = () => {};
  return ctx;
}

function buildTournament(overrides = {}) {
  return {
    _id: 't_water',
    name: '打水验收赛',
    status: 'finished',
    mode: 'multi_rotate',
    rules: { water: { enabled: true, defaultUnitsPerLoser: 1 } },
    players: [
      { id: 'u1', name: '阿杰' },
      { id: 'u2', name: '小林' },
      { id: 'u3', name: '王敏' },
      { id: 'u4', name: '陈晨' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'finished',
        teamA: [{ id: 'u1', name: '阿杰' }, { id: 'u2', name: '小林' }],
        teamB: [{ id: 'u3', name: '王敏' }, { id: 'u4', name: '陈晨' }],
        score: { teamA: 21, teamB: 18 },
        water: { unitsPerLoser: 2 }
      }]
    }],
    ...overrides
  };
}

test('analytics renders an independent water ledger without changing formal ranking copy', () => {
  const js = read('miniprogram/pages/analytics/index.js');
  const wxml = read('miniprogram/pages/analytics/index.wxml');

  assert.match(js, /core\/waterLedger/);
  assert.match(js, /showWaterLedger/);
  assert.match(js, /waterLedgerRows/);
  assert.match(wxml, /class="card panel water-ledger-card/);
  assert.match(wxml, /打水榜/);
  assert.match(wxml, /赢水/);
  assert.match(wxml, /请水/);
  assert.match(wxml, /净水/);
  assert.match(wxml, /暂无打水记录/);
  assert.match(wxml, /完整排名/);
});

test('analytics applyTournament clears water ledger state across records, empty, disabled and non-multi documents', () => {
  const originalWx = global.wx;
  global.wx = { setNavigationBarTitle() {} };

  try {
    const definition = loadAnalyticsPageDefinition();
    const ctx = createAnalyticsContext(definition);

    ctx.applyTournament(buildTournament());
    assert.equal(ctx.data.showWaterLedger, true);
    assert.equal(ctx.data.waterLedgerHasRecords, true);
    assert.equal(ctx.data.waterLedgerRows.length, 4);
    assert.deepEqual(ctx.data.waterLedgerRows.find((row) => row.playerId === 'u1'), {
      playerId: 'u1',
      name: '阿杰',
      wonUnits: 2,
      treatUnits: 0,
      netUnits: 2,
      netText: '+2',
      rank: 1
    });

    ctx.applyTournament(buildTournament({ rounds: [] }));
    assert.equal(ctx.data.showWaterLedger, true);
    assert.equal(ctx.data.waterLedgerHasRecords, false);
    assert.deepEqual(ctx.data.waterLedgerRows, []);

    ctx.applyTournament(buildTournament({
      rules: { water: { enabled: false, defaultUnitsPerLoser: 1 } }
    }));
    assert.equal(ctx.data.showWaterLedger, false);
    assert.equal(ctx.data.waterLedgerHasRecords, false);
    assert.deepEqual(ctx.data.waterLedgerRows, []);

    ctx.applyTournament(buildTournament({ mode: 'fixed_pair_rr' }));
    assert.equal(ctx.data.showWaterLedger, false);
    assert.equal(ctx.data.waterLedgerHasRecords, false);
    assert.deepEqual(ctx.data.waterLedgerRows, []);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});
