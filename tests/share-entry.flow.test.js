const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/pages/share-entry/flow');

test('parseTournamentId supports direct options and scene payload', () => {
  assert.equal(flow.parseTournamentId({ tournamentId: 'tid_1' }), 'tid_1');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tournamentId=tid_2&intent=join') }), 'tid_2');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tid=tid_3') }), 'tid_3');
});

test('resolveShareEntryFlow returns invalid state without tournamentId', () => {
  const out = flow.resolveShareEntryFlow({ tournamentId: '', intent: 'join', gate: null });
  assert.equal(out.action, 'invalid');
  assert.equal(out.state.showRetry, true);
});

test('resolveShareEntryFlow returns gate-specific states', () => {
  const loginFailed = flow.resolveShareEntryFlow({
    tournamentId: 'tid_1',
    intent: 'join',
    gate: { ok: false, reason: 'login_failed' }
  });
  assert.equal(loginFailed.action, 'login_failed');
  assert.equal(loginFailed.state.showRetry, true);

  const needProfile = flow.resolveShareEntryFlow({
    tournamentId: 'tid_1',
    intent: 'join',
    gate: { ok: false, reason: 'need_profile' }
  });
  assert.equal(needProfile.action, 'need_profile');
  assert.equal(needProfile.state.showRetry, false);
});

test('resolveShareEntryFlow returns redirect urls when gate passes', () => {
  const out = flow.resolveShareEntryFlow({
    tournamentId: 'tid_1',
    intent: 'join',
    gate: { ok: true, reason: 'ok' }
  });
  assert.equal(out.action, 'redirect');
  assert.match(out.returnUrl, /pages\/share-entry\/index\?tournamentId=tid_1&intent=join/);
  assert.match(out.lobbyUrl, /pages\/lobby\/index\?tournamentId=tid_1&intent=join&fromShare=1/);
});
