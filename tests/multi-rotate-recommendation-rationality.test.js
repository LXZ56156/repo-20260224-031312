const test = require('node:test');
const assert = require('node:assert/strict');

const matchOptions = require('../miniprogram/core/ux/multiRotateMatchOptions');
const { buildMatchCountRecommendations } = require('../miniprogram/core/ux/capacity');
const {
  buildRecommendationAuditRows,
  buildRecommendationAuditIssues
} = require('../scripts/rotation-match-options-common');
const report = require('../scripts/generate-scheduler-full-audit');

test('multi_rotate recommendation audit has no rationality issues', () => {
  const rows = buildRecommendationAuditRows(matchOptions.cases);
  const issues = buildRecommendationAuditIssues(rows);
  assert.deepEqual(issues, []);
});

test('multi_rotate recommendation metrics are monotonic across more courts', () => {
  const rows = buildRecommendationAuditRows(matchOptions.cases);
  const byPlayers = new Map();
  rows.forEach((row) => {
    if (!byPlayers.has(row.players)) byPlayers.set(row.players, []);
    byPlayers.get(row.players).push(row);
  });

  for (const group of byPlayers.values()) {
    const sorted = group.slice().sort((left, right) => left.courts - right.courts);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.players < 17 || current.overrideReason) continue;
      assert.ok(
        current.horizonMatches >= previous.horizonMatches,
        `${previous.key}:${previous.horizonMatches} -> ${current.key}:${current.horizonMatches}`
      );
      assert.ok(
        current.highestPreset >= previous.highestPreset,
        `${previous.key}:${previous.highestPreset} -> ${current.key}:${current.highestPreset}`
      );
      assert.ok(
        current.balancedMatch >= previous.balancedMatch,
        `${previous.key}:${previous.balancedMatch} -> ${current.key}:${current.balancedMatch}`
      );
    }
  }
});

test('multi_rotate large-roster presets stay close to capacity suggested matches', () => {
  for (const row of buildRecommendationAuditRows(matchOptions.cases)) {
    const players = Number(row && row.players) || 0;
    const courts = Number(row && row.courts) || 0;
    if (players < 20 || courts < 2 || row.overrideReason) continue;
    const recommendation = buildMatchCountRecommendations({
      mode: 'multi_rotate',
      playersCount: players,
      maleCount: players,
      femaleCount: 0,
      unknownCount: 0,
      courts
    });
    assert.ok(
      Number(row.balancedMatch) >= (Number(recommendation.suggestedMatches) - 3),
      `${players}p-${courts}c balanced=${row.balancedMatch} suggested=${recommendation.suggestedMatches}`
    );
  }
});

test('multi_rotate default presets keep audited coverage and fairness guardrails', () => {
  const rows = report.buildMultiRotatePresetQualityRows();
  const smallRows = rows.filter((row) => row.players >= 4 && row.players <= 10);

  assert.equal(rows.length, Object.keys(matchOptions.cases).length);
  assert.equal(smallRows.length, 10);
  assert.deepEqual(
    rows.filter((row) => row.defaultExactRepeatExcess > 0).map((row) => row.key),
    []
  );
  assert.deepEqual(
    rows.filter((row) => row.defaultPlaySpreadExcess > 0).map((row) => row.key),
    []
  );
  assert.deepEqual(
    smallRows.filter((row) => row.defaultAllPartnerPairsCovered !== true).map((row) => row.key),
    []
  );
});
