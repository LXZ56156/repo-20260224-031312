const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/pages/share-entry/flow');

test('smoke: share-entry handles invalid link, profile gate and lobby redirect', () => {
  assert.equal(flow.parseTournamentId({ tournamentId: 't_1' }), 't_1');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tournamentId=t_2&intent=join') }), 't_2');

  const invalid = flow.resolveShareEntryFlow({
    tournamentId: '',
    intent: 'join',
    gate: { ok: true }
  });
  assert.equal(invalid.action, 'invalid');

  const needProfile = flow.resolveShareEntryFlow({
    tournamentId: 't_1',
    intent: 'join',
    gate: { ok: false, reason: 'need_profile' }
  });
  assert.equal(needProfile.action, 'need_profile');

  const redirect = flow.resolveShareEntryFlow({
    tournamentId: 't_1',
    intent: 'join',
    gate: { ok: true }
  });
  assert.equal(redirect.action, 'redirect');
  assert.match(redirect.lobbyUrl, /\/pages\/lobby\/index\?tournamentId=t_1/);
  assert.match(redirect.returnUrl, /\/pages\/share-entry\/index\?tournamentId=t_1/);
});
