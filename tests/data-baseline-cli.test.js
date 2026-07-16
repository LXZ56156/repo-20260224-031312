const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const audit = require('../scripts/audit-product-data');

test('data baseline CLI requires an explicit local export and cutoff date', () => {
  assert.throws(() => audit.parseArgs([]), /--tournaments/);
  assert.throws(() => audit.parseArgs(['--tournaments', 'data/input.json']), /--cutoff/);
  assert.throws(() => audit.parseArgs([
    '--tournaments', 'data/input.json',
    '--cutoff', '2026-07-15',
    '--window-days', '0'
  ]), /1-3660/);

  assert.deepEqual(audit.parseArgs([
    '--tournaments', 'data/input.json',
    '--cutoff', '2026-07-15',
    '--window-days', '90'
  ]), {
    help: false,
    tournaments: 'data/input.json',
    cutoffDate: '2026-07-15',
    windowDays: 90,
    outputDir: 'data/we-analysis/data-baseline'
  });
});

test('data baseline CLI accepts common JSON export wrappers and JSON Lines', () => {
  assert.deepEqual(audit.parseTournamentPayload('[{"_id":"a"}]'), [{ _id: 'a' }]);
  assert.deepEqual(audit.parseTournamentPayload('{"documents":[{"_id":"b"}]}'), [{ _id: 'b' }]);
  assert.deepEqual(audit.parseTournamentPayload('{"_id":"c"}\n{"_id":"d"}\n'), [
    { _id: 'c' },
    { _id: 'd' }
  ]);
  assert.throws(() => audit.parseTournamentPayload('{"items":[]}'), /data\[\]/);
});

test('data baseline CLI refuses paths outside the active worktree', () => {
  const outside = path.resolve(audit.REPO_ROOT, '..', 'outside.json');
  assert.throws(() => audit.resolveInsideRepo(outside, '--tournaments'), /当前 worktree/);
  assert.equal(
    audit.resolveInsideRepo('data/we-analysis/export.json', '--tournaments'),
    path.join(audit.REPO_ROOT, 'data', 'we-analysis', 'export.json')
  );
});

test('Pareto CSV has a stable schema and escapes fields', () => {
  const csv = audit.paretoToCsv({
    rows: [{
      mode: 'multi_rotate',
      playersCount: 6,
      courts: 1,
      totalMatches: 9,
      presetKey: 'custom',
      templateKey: '6p-1c',
      engine: 'template',
      classifiable: true,
      count: 2,
      effectiveCompletedCount: 1,
      effectiveCompletionRate: 0.5,
      firstScoreToCompletionSamples: 1,
      medianFirstScoreToCompletionHours: 2,
      share: 1,
      cumulativeCount: 2,
      cumulativeCoverage: 1
    }]
  });

  assert.match(csv, /^mode,playersCount,courts,totalMatches,/);
  assert.match(csv, /multi_rotate,6,1,9,custom,6p-1c,template,true,2,1,0\.5,1,2,1,2,1\n$/);
});

test('sensitive source values are rejected from public output', () => {
  const source = [{
    _id: 'private_tournament_id',
    creatorId: 'private_openid_value',
    name: '周三私密赛事名',
    players: [{
      id: 'private_player_id',
      name: '不公开昵称',
      avatar: 'https://private.example/avatar.png'
    }]
  }];
  const tokens = audit.collectSensitiveTokens(source);

  assert.doesNotThrow(() => audit.assertNoSensitiveTokens('{"count":1}', tokens));
  assert.throws(
    () => audit.assertNoSensitiveTokens('{"value":"private_openid_value"}', tokens),
    /拒绝写出/
  );
});

test('sensitive token scan covers string rosters, _id fields and nested ranking actors', () => {
  const tokens = audit.collectSensitiveTokens([{
    _id: 'tournament_private_value',
    players: ['string_player_private'],
    pairTeams: [{ playerIds: ['pair_player_private_a', 'pair_player_private_b'] }],
    rankings: [{ _id: 'ranking_actor_private' }]
  }]);

  assert.equal(tokens.has('string_player_private'), true);
  assert.equal(tokens.has('pair_player_private_a'), true);
  assert.equal(tokens.has('ranking_actor_private'), true);
});
