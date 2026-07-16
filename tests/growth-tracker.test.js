const test = require('node:test');
const assert = require('node:assert/strict');

const productEventConfig = require('../miniprogram/config/productEvents');
const productEventQueue = require('../miniprogram/core/productEventQueue');
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

test('growthTracker buildPayload hashes raw id aliases and keeps the analytics allowlist', () => {
  const { buildPayload } = growthTracker._private;
  const byTournamentId = buildPayload({
    tournamentId: 'abcdef1234567890',
    status: 'running',
    mode: 'multi_rotate',
    src: 'share_entry',
    action: 'view',
    result: 'success',
    ts: 123,
    openid: 'openid_1',
    nickname: '球友',
    nickName: '球友',
    avatar: 'cloud://avatar',
    avatarUrl: 'cloud://avatar',
    location: '深圳',
    phone: '13800000000',
    gender: 1
  });
  const byT = buildPayload({ t: 'abcdef1234567890', status: 'running', mode: 'multi_rotate', ts: 123 });
  const byId = buildPayload({ id: 'abcdef1234567890', status: 'running', mode: 'multi_rotate', ts: 123 });
  const byUnderscoreId = buildPayload({ _id: 'abcdef1234567890', status: 'running', mode: 'multi_rotate', ts: 123 });

  assert.deepEqual(Object.keys(byTournamentId).sort(), ['a', 'm', 'r', 's', 'src', 't', 'ts']);
  assert.match(byTournamentId.t, /^[0-9a-f]{8}$/);
  assert.equal(byTournamentId.t, byT.t);
  assert.equal(byTournamentId.t, byId.t);
  assert.equal(byTournamentId.t, byUnderscoreId.t);
  assert.notEqual(byTournamentId.t, 'abcdef12');
  assert.equal(byTournamentId.s, 'running');
  assert.equal(byTournamentId.m, 'multi_rotate');
  assert.equal(byTournamentId.src, 'share_entry');
  assert.equal(byTournamentId.a, 'view');
  assert.equal(byTournamentId.r, 'success');
  assert.equal(byTournamentId.ts, 123);
  assert.equal(byTournamentId.openid, undefined);
  assert.equal(byTournamentId.nickname, undefined);
  assert.equal(byTournamentId.nickName, undefined);
  assert.equal(byTournamentId.avatar, undefined);
  assert.equal(byTournamentId.avatarUrl, undefined);
  assert.equal(byTournamentId.location, undefined);
  assert.equal(byTournamentId.phone, undefined);
  assert.equal(byTournamentId.gender, undefined);
});

test('growthTracker fromTournament returns raw tracking context', () => {
  const raw = growthTracker.fromTournament({
    _id: 'tournament_secret_1',
    status: 'finished',
    mode: 'fixed_pair_rr'
  }, {
    src: 'analytics',
    a: 'view',
    r: 'success'
  });

  assert.deepEqual(raw, {
    tournamentId: 'tournament_secret_1',
    status: 'finished',
    mode: 'fixed_pair_rr',
    src: 'analytics',
    a: 'view',
    r: 'success'
  });
  assert.equal(raw.t, undefined);
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

test('growthTracker track builds fromTournament context exactly once', () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const reports = [];
  const raw = growthTracker.fromTournament({
    _id: 'tournament_secret_2',
    status: 'finished',
    mode: 'multi_rotate'
  }, {
    src: 'share_entry',
    a: 'view'
  });
  const built = growthTracker._private.buildPayload(raw);

  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    }
  };
  console.info = () => {};

  try {
    growthTracker.track('share_entry_view', raw);

    assert.equal(reports.length, 1);
    assert.equal(reports[0].payload.t, built.t);
    assert.match(reports[0].payload.t, /^[0-9a-f]{8}$/);
    assert.notEqual(reports[0].payload.t, 'tourname');
    assert.deepEqual(Object.keys(reports[0].payload).sort(), ['a', 'm', 'r', 's', 'src', 't', 'ts']);
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
  }
});

test('growthTracker keeps console and wx.reportEvent behavior while the product event pipeline is disabled', async () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const logs = [];
  const reports = [];
  let cloudCalls = 0;
  let storageCalls = 0;

  assert.equal(productEventConfig.enabled, false);
  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    },
    getStorageSync() {
      storageCalls += 1;
      throw new Error('disabled pipeline must not read storage');
    },
    setStorageSync() {
      storageCalls += 1;
      throw new Error('disabled pipeline must not write storage');
    },
    cloud: {
      async callFunction() {
        cloudCalls += 1;
        throw new Error('disabled pipeline must not call cloud');
      }
    }
  };
  console.info = (...args) => logs.push(args);

  try {
    const returned = growthTracker.track('share_entry_view', {
      tournamentId: 'tournament_secret_default_disabled',
      status: 'running',
      mode: 'multi_rotate',
      src: 'share_entry',
      a: 'view'
    });
    await Promise.resolve();

    assert.equal(returned, undefined);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[growth]');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].name, 'share_entry_view');
    assert.match(reports[0].payload.t, /^[0-9a-f]{8}$/);
    assert.equal(storageCalls, 0);
    assert.equal(cloudCalls, 0);
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
  }
});

test('growthTracker passes the already-sanitized payload to the isolated queue exactly once', () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const originalEnqueue = productEventQueue.enqueue;
  const reports = [];
  const queued = [];

  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    }
  };
  console.info = () => {};
  productEventQueue.enqueue = (name, payload) => {
    queued.push({ name, payload });
    return true;
  };

  try {
    growthTracker.track('share_entry_view', {
      tournamentId: 'tournament_secret_queue_once',
      status: 'running',
      mode: 'multi_rotate',
      src: 'share_entry',
      a: 'view',
      nickname: '不得进入队列'
    });

    assert.equal(queued.length, 1);
    assert.equal(queued[0].name, 'share_entry_view');
    assert.deepEqual(queued[0].payload, reports[0].payload);
    assert.match(queued[0].payload.t, /^[0-9a-f]{8}$/);
    assert.notEqual(queued[0].payload.t, 'tournamen');
    assert.equal(queued[0].payload.nickname, undefined);
  } finally {
    productEventQueue.enqueue = originalEnqueue;
    global.wx = originalWx;
    console.info = originalInfo;
  }
});

test('growthTracker consumes synchronous queue failures and Promise rejections', async () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const originalEnqueue = productEventQueue.enqueue;
  const reports = [];

  global.wx = {
    reportEvent(name, payload) {
      reports.push({ name, payload });
    }
  };
  console.info = () => {};

  try {
    productEventQueue.enqueue = () => {
      throw new Error('queue sync failure');
    };
    assert.doesNotThrow(() => growthTracker.track('share_entry_view', {
      tournamentId: 'tournament_secret_sync_failure',
      src: 'share_entry',
      a: 'view'
    }));

    productEventQueue.enqueue = () => Promise.reject(new Error('queue async failure'));
    assert.doesNotThrow(() => growthTracker.track('share_entry_view', {
      tournamentId: 'tournament_secret_async_failure',
      src: 'share_entry',
      a: 'view'
    }));
    await Promise.resolve();

    assert.equal(reports.length, 2);
  } finally {
    productEventQueue.enqueue = originalEnqueue;
    global.wx = originalWx;
    console.info = originalInfo;
  }
});
