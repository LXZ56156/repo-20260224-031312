const test = require('node:test');
const assert = require('node:assert/strict');

const normalize = require('../miniprogram/core/normalize');

test('normalizeTournament backfills legacy json metadata when object fields are missing', () => {
  const tournament = normalize.normalizeTournament({
    _id: 't_1',
    players: [],
    rounds: [],
    fairnessJson: '{"balanceScore":0.91}',
    playerStatsJson: '{"u_1":{"wins":3}}',
    schedulerMetaJson: '{"seed":"v2"}'
  });

  assert.deepEqual(tournament.fairness, { balanceScore: 0.91 });
  assert.deepEqual(tournament.playerStats, { u_1: { wins: 3 } });
  assert.deepEqual(tournament.schedulerMeta, { seed: 'v2' });
});

test('normalizeTournament keeps existing object metadata instead of legacy json strings', () => {
  const tournament = normalize.normalizeTournament({
    _id: 't_2',
    players: [],
    rounds: [],
    fairness: { balanceScore: 0.5 },
    fairnessJson: '{"balanceScore":0.99}',
    playerStats: { u_1: { wins: 1 } },
    playerStatsJson: '{"u_1":{"wins":4}}',
    schedulerMeta: { seed: 'new' },
    schedulerMetaJson: '{"seed":"old"}'
  });

  assert.deepEqual(tournament.fairness, { balanceScore: 0.5 });
  assert.deepEqual(tournament.playerStats, { u_1: { wins: 1 } });
  assert.deepEqual(tournament.schedulerMeta, { seed: 'new' });
});

test('normalizeTournament ignores invalid legacy json metadata without throwing', () => {
  assert.doesNotThrow(() => {
    const tournament = normalize.normalizeTournament({
      _id: 't_3',
      players: [],
      rounds: [],
      fairnessJson: '{oops',
      playerStatsJson: '[]',
      schedulerMetaJson: '"bad"'
    });

    assert.equal('fairness' in tournament, false);
    assert.equal('playerStats' in tournament, false);
    assert.equal('schedulerMeta' in tournament, false);
  });
});
