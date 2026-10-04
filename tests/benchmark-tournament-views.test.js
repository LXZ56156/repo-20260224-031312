'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const benchmark = require('../scripts/benchmark-tournament-views');

test('baseline uses real Page chains with deterministic legal anonymous fixtures and byte counts', async () => {
  const fixtures = benchmark.buildFixtures();
  assert.equal(benchmark.hash(fixtures), benchmark.hash(benchmark.buildFixtures()));
  assert.deepEqual(fixtures.map((f) => f.tournament.totalMatches), [6, 84, 660]);
  for (const fixture of fixtures) {
    const tournament = fixture.tournament;
    const ids = new Set(tournament.players.map((p) => p.id));
    assert.equal(ids.size, tournament.players.length);
    assert.ok(tournament.players.every((p) => p.name.startsWith('匿名球员') && !p.avatarUrl));
    for (const round of tournament.rounds) {
      const used = round.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
      assert.equal(new Set(used).size, used.length);
      assert.ok(used.every((id) => ids.has(id)));
      assert.ok(round.matches.length <= tournament.courts);
    }
  }
  const runtime = benchmark.createRuntime();
  try {
    // Wrapping the captured definitions proves the runner calls the actual Page methods.
    for (const [pageName, method] of [['schedule', 'applyTournament'], ['home', 'loadRecents']]) {
      const original = runtime.pages[pageName][method];
      let calls = 0;
      runtime.pages[pageName][method] = function (...args) {
        calls += 1;
        return original.apply(this, args);
      };
      const sample = await runtime.measure(pageName, fixtures[0]);
      assert.equal(calls, 1);
      assert.equal(sample.setDataCalls, sample.patches.length);
      assert.equal(sample.setDataUtf8Bytes,
        sample.patches.reduce((sum, patch) => sum + Buffer.byteLength(JSON.stringify(patch), 'utf8'), 0));
      assert.ok(Number.isFinite(sample.jsMs) && sample.jsMs >= 0);
      assert.equal(sample.jsMs, sample.instrumentedMs - sample.setDataCpuMs - sample.ioStubCpuMs);
      if (pageName === 'schedule') {
        assert.equal(sample.page._latestTournament.totalMatches, 6);
        assert.deepEqual(sample.data.tournament, { name: fixtures[0].tournament.name });
        assert.equal(sample.data.roundsUi.flatMap((r) => r.matchesUi).length, 6);
        assert.equal(sample.data.canEditScore, true);
        assert.equal(sample.setDataCalls, 1);
        assert.equal(sample.fixtureReadCalls, 0);
      } else {
        assert.equal(sample.data.items.length, 1);
        assert.equal(sample.data.items[0].totalMatches, 6);
        assert.equal(sample.data.heroCard.actionTarget, 'batch');
        assert.equal(sample.setDataCalls, 5);
        assert.equal(sample.fixtureReadCalls, 1);
      }
    }
    assert.throws(() => global.wx.request({}), /External request forbidden/);
    assert.throws(() => global.wx.cloud.getTempFileURL({}), /External request forbidden/);
  } finally {
    runtime.restore();
  }
});

test('summary uses nearest-rank percentiles and reports all calls and serialized payload bytes', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ jsMs: i + 1, setDataCalls: 2, setDataUtf8Bytes: 123,
    maxSetDataUtf8Bytes: 100 }));
  const summary = benchmark.summarize(samples);
  assert.deepEqual(summary.jsMs, { p50: 10, p95: 19, min: 1, max: 20 });
  assert.deepEqual(summary.setDataCalls, { p50: 2, p95: 2, min: 2, max: 2 });
  assert.deepEqual(summary.setDataUtf8Bytes, { p50: 123, p95: 123, min: 123, max: 123 });
  assert.deepEqual(summary.maxSetDataUtf8Bytes, { p50: 100, p95: 100, min: 100, max: 100 });
});
