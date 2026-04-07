const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');
const startReadiness = require('../miniprogram/core/draftStartReadiness');

function buildPlayers(count, extra = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `u_${index}`,
    name: `球友${index}`,
    gender: index % 2 === 0 ? 'male' : 'female',
    ...extra[index]
  }));
}

test('draft start readiness marks multi rotate ready after 4 players and saved settings', () => {
  const out = startReadiness.buildDraftStartReadiness({
    mode: flow.MODE_MULTI_ROTATE,
    settingsConfigured: true,
    players: buildPlayers(4)
  });

  assert.equal(out.checkPlayersOk, true);
  assert.equal(out.checkSettingsOk, true);
  assert.equal(out.checkStartReady, true);
  assert.equal(out.playersChecklistHint, '人数已达标');
});

test('draft start readiness requires both squads to have at least two players', () => {
  const out = startReadiness.buildDraftStartReadiness({
    mode: flow.MODE_SQUAD_DOUBLES,
    settingsConfigured: true,
    players: [
      { id: 'u_1', name: 'A1', squad: 'A' },
      { id: 'u_2', name: 'A2', squad: 'A' },
      { id: 'u_3', name: 'B1', squad: 'B' },
      { id: 'u_4', name: '待分队', squad: '' }
    ]
  });

  assert.equal(out.checkPlayersOk, false);
  assert.equal(out.checkStartReady, false);
  assert.equal(out.aCount, 2);
  assert.equal(out.bCount, 1);
  assert.equal(out.playersChecklistHint, 'A队 2 / B队 1（至少各2人）');
});

test('draft start readiness blocks fixed pair start when existing teams contain invalid entries', () => {
  const out = startReadiness.buildDraftStartReadiness({
    mode: flow.MODE_FIXED_PAIR_RR,
    settingsConfigured: true,
    players: buildPlayers(4),
    pairTeams: [
      { id: 'team_1', playerIds: ['u_0', 'u_1'] },
      { id: 'team_2', playerIds: ['u_2'] },
      { id: 'team_3', playerIds: ['u_2', 'u_3'] }
    ]
  });

  assert.equal(out.validPairTeamsCount, 2);
  assert.equal(out.invalidPairTeamsCount, 1);
  assert.equal(out.checkPlayersOk, false);
  assert.equal(out.checkStartReady, false);
  assert.match(out.playersChecklistHint, /每队 2 人/);
});

test('draft start readiness keeps fixed pair not ready when fewer than two valid teams exist', () => {
  const out = startReadiness.buildDraftStartReadiness({
    mode: flow.MODE_FIXED_PAIR_RR,
    settingsConfigured: true,
    players: buildPlayers(4),
    pairTeams: [
      { id: 'team_1', playerIds: ['u_0', 'u_1'] },
      { id: 'team_2', playerIds: ['u_2'] }
    ]
  });

  assert.equal(out.validPairTeamsCount, 1);
  assert.equal(out.invalidPairTeamsCount, 1);
  assert.equal(out.checkPlayersOk, false);
  assert.equal(out.checkStartReady, false);
  assert.match(out.playersChecklistHint, /当前合法队伍 1/);
});

test('draft start readiness blocks fixed pair start when teams overlap on players', () => {
  const out = startReadiness.buildDraftStartReadiness({
    mode: flow.MODE_FIXED_PAIR_RR,
    settingsConfigured: true,
    players: buildPlayers(4),
    pairTeams: [
      { id: 'team_1', playerIds: ['u_0', 'u_1'] },
      { id: 'team_2', playerIds: ['u_1', 'u_2'] },
      { id: 'team_3', playerIds: ['u_2', 'u_3'] }
    ]
  });

  assert.equal(out.validPairTeamsCount, 2);
  assert.equal(out.invalidPairTeamsCount, 1);
  assert.equal(out.checkPlayersOk, false);
  assert.equal(out.checkStartReady, false);
  assert.match(out.playersChecklistHint, /重复成员/);
});
