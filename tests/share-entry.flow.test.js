const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/pages/share-entry/flow');
const tournamentEntry = require('../miniprogram/core/tournamentEntry');

test('parseTournamentId supports direct options and scene payload', () => {
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ tournamentId: 'tid_1' }), 'tid_1');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ scene: encodeURIComponent('tournamentId=tid_2&intent=join') }), 'tid_2');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ scene: encodeURIComponent('tid=tid_3') }), 'tid_3');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ scene: encodeURIComponent('tid_legacy_4') }), 'tid_legacy_4');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ scene: '%E0%A4%A' }), '%E0%A4%A');
  assert.equal(flow.parseTournamentId({ scene: encodeURIComponent('tournamentId=tid_5') }), 'tid_5');
});

test('parseTournamentId supports tid / id / tournament_id aliases', () => {
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ tid: 'alias_tid' }), 'alias_tid');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ id: 'alias_id' }), 'alias_id');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ tournament_id: 'alias_tournament_id' }), 'alias_tournament_id');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ tournamentId: 'direct' }), 'direct');
});

test('parseTournamentId supports options.query as object', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: { tournamentId: 'q_obj_tid' } }),
    'q_obj_tid'
  );
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: { tid: 'q_obj_tid2' } }),
    'q_obj_tid2'
  );
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: {} }),
    ''
  );
});

test('parseTournamentId supports options.query as string', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: 'tournamentId=q_str_tid&from=timeline' }),
    'q_str_tid'
  );
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: 'tid=q_str_tid2' }),
    'q_str_tid2'
  );
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: 'other=1' }),
    ''
  );
});

test('parseTournamentId supports scene as query string with multiple params', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ scene: encodeURIComponent('tournamentId=scene_tid&from=timeline&foo=bar') }),
    'scene_tid'
  );
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ scene: encodeURIComponent('id=scene_id_param') }),
    'scene_id_param'
  );
});

test('parseTournamentId returns empty for missing / empty options', () => {
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({}), '');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions(), '');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions(null), '');
  assert.equal(tournamentEntry.parseTournamentIdFromOptions({ other: 'x' }), '');
});

test('parseTournamentId preference order: direct props > query object > query string > scene', () => {
  const opts = {
    tournamentId: 'direct_val',
    tid: 'should_not_win',
    query: { tournamentId: 'should_not_win_either' },
    scene: encodeURIComponent('tournamentId=also_should_not')
  };
  assert.equal(tournamentEntry.parseTournamentIdFromOptions(opts), 'direct_val');
});

test('parseTournamentId tolerates malformed encoded query values', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: 'tournamentId=%E0%A4%A' }),
    '%E0%A4%A'
  );
});

test('parseTournamentId supports query string with leading question mark', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromOptions({ query: '?tournamentId=tid_qmark' }),
    'tid_qmark'
  );
});

test('parseTournamentIdFromPageOptions falls back to app lastEnterOptions', () => {
  const origGetApp = global.getApp;
  try {
    global.getApp = () => ({
      globalData: {
        lastEnterOptions: { tournamentId: 'from_last_enter' }
      }
    });
    assert.equal(
      tournamentEntry.parseTournamentIdFromPageOptions({}),
      'from_last_enter'
    );
    assert.equal(
      tournamentEntry.parseTournamentIdFromPageOptions({ tournamentId: 'direct' }),
      'direct'
    );
  } finally {
    if (origGetApp === undefined) {
      delete global.getApp;
    } else {
      global.getApp = origGetApp;
    }
  }
});

test('parseTournamentIdFromPageOptions survives missing getApp', () => {
  assert.equal(
    tournamentEntry.parseTournamentIdFromPageOptions({}),
    ''
  );
});

test('share-entry flow builders keep links compatible with old params', () => {
  assert.equal(flow.normalizeIntent('join'), 'join');
  assert.equal(flow.normalizeIntent('unknown'), 'view');
  assert.match(flow.buildReturnUrl('tid_1', 'join'), /pages\/share-entry\/index\?tournamentId=tid_1&intent=join/);
  assert.match(flow.buildLobbyUrl('tid_1'), /pages\/lobby\/index\?tournamentId=tid_1&fromShare=1/);
  assert.match(flow.buildLobbyUrl('tid_1', 'view_only'), /pages\/lobby\/index\?tournamentId=tid_1&fromShare=1&entry=view_only/);
  assert.match(flow.buildScheduleUrl('tid_1'), /pages\/schedule\/index\?tournamentId=tid_1/);
  assert.match(flow.buildRankingUrl('tid_1'), /pages\/ranking\/index\?tournamentId=tid_1/);
  assert.match(flow.buildAnalyticsUrl('tid_1'), /pages\/ranking\/index\?tournamentId=tid_1/);
});
