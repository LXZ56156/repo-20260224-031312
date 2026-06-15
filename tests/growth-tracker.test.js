const test = require('node:test');
const assert = require('node:assert/strict');

const growthTracker = require('../miniprogram/core/growthTracker');

test('growthTracker hashes tournament ids without exposing raw prefixes', () => {
  const { shortTournamentId } = growthTracker._private;
  const id = 'abcdef1234567890';

  const first = shortTournamentId(id);
  const second = shortTournamentId(id);

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}$/);
  assert.notEqual(first, id.slice(0, 8));
  assert.notEqual(shortTournamentId('abcdef1234567891'), first);
  assert.equal(shortTournamentId(''), '');
  assert.equal(shortTournamentId(null), '');
});

test('growthTracker buildPayload keeps only the analytics allowlist', () => {
  const payload = growthTracker._private.buildPayload({
    tournamentId: 'abcdef1234567890',
    status: 'running',
    mode: 'multi_rotate',
    src: 'share_entry',
    action: 'view',
    result: 'success',
    ts: 123,
    openid: 'openid_1',
    nickname: '球友',
    avatar: 'cloud://avatar',
    location: '深圳'
  });

  assert.deepEqual(Object.keys(payload).sort(), ['a', 'm', 'r', 's', 'src', 't', 'ts']);
  assert.equal(payload.s, 'running');
  assert.equal(payload.m, 'multi_rotate');
  assert.equal(payload.src, 'share_entry');
  assert.equal(payload.a, 'view');
  assert.equal(payload.r, 'success');
  assert.equal(payload.ts, 123);
  assert.equal(payload.openid, undefined);
  assert.equal(payload.nickname, undefined);
  assert.equal(payload.avatar, undefined);
  assert.equal(payload.location, undefined);
});

test('growthTracker track is guarded when wx.reportEvent is unavailable', () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  global.wx = {};
  console.info = () => {};

  try {
    assert.doesNotThrow(() => {
      growthTracker.track('share_entry_view', {
        tournamentId: 'tournament_secret_1',
        status: 'draft',
        mode: 'multi_rotate',
        src: 'share_entry',
        a: 'view'
      });
    });
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
  }
});

test('growthTracker track reports hashed tournament id for direct t payloads', () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const reports = [];
  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    }
  };
  console.info = () => {};

  try {
    growthTracker.track('home_finished_review_click', {
      t: 'finished_123456789',
      s: 'finished',
      src: 'home',
      a: 'review_card',
      openid: 'openid_1'
    });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].name, 'home_finished_review_click');
    assert.match(reports[0].payload.t, /^[0-9a-f]{8}$/);
    assert.notEqual(reports[0].payload.t, 'finished');
    assert.equal(reports[0].payload.openid, undefined);
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
  }
});

test('growthTracker track keeps fromTournament hash stable without hashing twice', () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const reports = [];
  const payload = growthTracker.fromTournament({
    _id: 'tournament_secret_2',
    status: 'finished',
    mode: 'multi_rotate'
  }, {
    src: 'share_entry',
    a: 'view'
  });

  global.wx = {
    reportEvent(name, data) {
      reports.push({ name, data });
    }
  };
  console.info = () => {};

  try {
    growthTracker.track('share_entry_view', payload);

    assert.equal(reports.length, 1);
    assert.equal(reports[0].data.t, payload.t);
    assert.match(reports[0].data.t, /^[0-9a-f]{8}$/);
    assert.notEqual(reports[0].data.t, 'tourname');
    assert.deepEqual(Object.keys(reports[0].data).sort(), ['a', 'm', 'r', 's', 'src', 't', 'ts']);
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
  }
});
