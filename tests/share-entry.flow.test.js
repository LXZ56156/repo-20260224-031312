const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/pages/share-entry/flow');

test('parseTournamentId supports direct options and scene payload', () => {
  assert.equal(flow.parseTournamentId({ tournamentId: 'tid_1' }), 'tid_1');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tournamentId=tid_2&intent=join') }), 'tid_2');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tid=tid_3') }), 'tid_3');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tid_legacy_4') }), 'tid_legacy_4');
  assert.equal(flow.parseTournamentId({ scene: '%E0%A4%A' }), '%E0%A4%A');
});

test('share-entry flow builders keep links compatible with old params', () => {
  assert.equal(flow.normalizeIntent('join'), 'join');
  assert.equal(flow.normalizeIntent('unknown'), 'view');
  assert.match(flow.buildReturnUrl('tid_1', 'join'), /pages\/share-entry\/index\?tournamentId=tid_1&intent=join/);
  assert.match(flow.buildLobbyUrl('tid_1'), /pages\/lobby\/index\?tournamentId=tid_1&fromShare=1/);
  assert.match(flow.buildScheduleUrl('tid_1'), /pages\/schedule\/index\?tournamentId=tid_1/);
  assert.match(flow.buildRankingUrl('tid_1'), /pages\/ranking\/index\?tournamentId=tid_1/);
  assert.match(flow.buildAnalyticsUrl('tid_1'), /pages\/analytics\/index\?tournamentId=tid_1/);
});
