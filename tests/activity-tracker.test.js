'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tracker = require('../miniprogram/core/activityTracker');
const cloud = require('../miniprogram/core/cloud');

const FIELDS = ['schemaVersion', 'eventId', 'operationId', 'intentId', 'attemptIndex', 'eventTime', 'phase', 'action', 'anonymousSessionId', 'traceId', 'appVersion', 'envVersion', 'result', 'resultCode', 'durationMs', 'retryCount', 'firstEntry'].sort();
function setup(t, callFunction) {
  const originalWx = global.wx;
  const originalError = console.error;
  const originalWarn = console.warn;
  const events = [];
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { version: '6.1.2-702625a', envVersion: 'trial', appId: 'PRIVATE_APPID' } }),
    reportEvent: (name, payload) => events.push({ name, payload }),
    cloud: { callFunction }
  };
  console.error = () => {};
  console.warn = () => {};
  t.after(() => { global.wx = originalWx; console.error = originalError; console.warn = originalWarn; });
  return events;
}

test('specified synthetic write journey pairs attempts/results with SDK metadata and no PII', async (t) => {
  const events = setup(t, async () => ({ result: { ok: true, code: 'OK', data: { ownerName: 'PRIVATE_NAME', roomId: 'PRIVATE_ROOM' } } }));
  const journey = [
    ['createTournament', {}], ['joinTournament', {}], ['startTournament', {}], ['submitScore', {}], ['updateSettings', {}],
    ...['createLedger', 'addParticipants', 'recordGame', 'recordDirect', 'correctEntry', 'reverseEntry'].map((action) => ['waterSession', { action, apiVersion: 2 }])
  ];
  for (const [name, payload] of journey) {
    const result = await cloud.call(name, { ...payload, clientRequestId: 'PRIVATE_REQUEST', tournamentId: 'PRIVATE_TOURNAMENT', roomId: 'PRIVATE_ROOM', openid: 'PRIVATE_OPENID', avatar: 'PRIVATE_AVATAR', names: ['PRIVATE_NAME'] });
    assert.equal(result.ok, true);
  }
  assert.equal(events.length, journey.length * 2);
  for (let i = 0; i < events.length; i += 2) {
    const [attempt, result] = events.slice(i, i + 2);
    assert.equal(attempt.name, 'activity_attempt');
    assert.equal(result.name, 'activity_result');
    assert.equal(attempt.payload.operationId, result.payload.operationId);
    assert.notEqual(attempt.payload.eventId, result.payload.eventId);
    assert.equal(attempt.payload.traceId, result.payload.traceId);
    assert.ok(attempt.payload.traceId.startsWith(journey[i / 2][0] + '_'));
    assert.equal(result.payload.result, 'success');
    assert.equal(result.payload.appVersion, '6.1.2-702625a');
    assert.equal(result.payload.envVersion, 'trial');
    assert.deepEqual(Object.keys(result.payload).sort(), FIELDS);
  }
  assert.equal(new Set(events.map((event) => event.payload.anonymousSessionId)).size, 1);
  assert.equal(new Set(events.map((event) => event.payload.eventId)).size, events.length);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
  // Offline receiver replays transport copies, deduplicating by eventId.
  const received = new Map([...events, ...events].map((event) => [event.payload.eventId, event]));
  assert.equal(received.size, events.length);
});

test('business false and final SDK exception count failures without leaking error text', async (t) => {
  let calls = 0;
  const events = setup(t, async () => {
    calls += 1;
    if (calls === 1) return { result: { ok: false, code: 'START_TIMEOUT', message: 'PRIVATE_NAME', state: 'timeout' } };
    throw new Error('PRIVATE_OPENID internal failure');
  });
  assert.equal((await cloud.call('startTournament', {}, { retry: false })).ok, false);
  await assert.rejects(cloud.call('submitScore', {}, { retry: false }), /PRIVATE_OPENID/);
  assert.equal(events[1].payload.result, 'failure');
  assert.equal(events[1].payload.resultCode, 'START_TIMEOUT');
  assert.equal(events[3].payload.result, 'exception');
  assert.equal(events[3].payload.resultCode, 'SDK_EXCEPTION');
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});

test('internal network retry produces one stable event pair and manual retry stays a distinct call', async (t) => {
  let calls = 0;
  const events = setup(t, async () => {
    calls += 1;
    if (calls === 1) throw new Error('network unavailable');
    return { result: { ok: true, code: 'SCORE_SUBMIT_DEDUPED', state: 'deduped' } };
  });
  const payload = { clientRequestId: 'PRIVATE_ID' };
  await cloud.call('submitScore', payload, { retryDelaysMs: [0] });
  assert.equal(calls, 2);
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.retryCount, 1);
  assert.equal(events[1].payload.result, 'deduped');
  await cloud.call('submitScore', payload, { retry: false });
  assert.equal(events.length, 4);
  assert.notEqual(events[0].payload.traceId, events[2].payload.traceId);
  assert.notEqual(events[0].payload.operationId, events[2].payload.operationId);
  assert.equal(events[0].payload.intentId, events[2].payload.intentId);
  assert.deepEqual([events[0].payload.attemptIndex, events[2].payload.attemptIndex], [1, 2]);
  assert.equal(events[0].payload.intentId, events[1].payload.intentId);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_ID'));
});

test('request correlation expires after 30 minutes and evicts beyond 100 entries', (t) => {
  const events = setup(t);
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  const first = tracker.begin('submitScore', { clientRequestId: 'PRIVATE_EXPIRING' });
  now += 30 * 60 * 1000;
  const expired = tracker.begin('submitScore', { clientRequestId: 'PRIVATE_EXPIRING' });
  assert.notEqual(expired.intentId, first.intentId);
  assert.equal(expired.attemptIndex, 1);
  const oldest = tracker.begin('submitScore', { clientRequestId: 'PRIVATE_OLDEST' });
  for (let i = 0; i < 100; i += 1) tracker.begin('submitScore', { clientRequestId: `PRIVATE_BOUNDED_${i}` });
  const evicted = tracker.begin('submitScore', { clientRequestId: 'PRIVATE_OLDEST' });
  assert.notEqual(evicted.intentId, oldest.intentId);
  const otherAction = tracker.begin('startTournament', { clientRequestId: 'PRIVATE_OLDEST' });
  assert.notEqual(otherAction.intentId, evicted.intentId);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});

test('water create aliases keep distinct intents while each original action retries correlate', (t) => {
  const events = setup(t);
  const request = { clientRequestId: 'PRIVATE_ALIAS_REQUEST' };
  const create = tracker.begin('waterSession', { ...request, action: 'create' });
  const createLedger = tracker.begin('waterSession', { ...request, action: 'createLedger' });
  assert.equal(create.action, 'water_create');
  assert.equal(createLedger.action, 'water_create');
  assert.notEqual(create.intentId, createLedger.intentId);
  assert.equal(create.attemptIndex, 1);
  assert.equal(createLedger.attemptIndex, 1);
  const retriedCreate = tracker.begin('waterSession', { ...request, action: 'create' });
  const retriedLedger = tracker.begin('waterSession', { ...request, action: 'createLedger' });
  assert.equal(retriedCreate.intentId, create.intentId);
  assert.equal(retriedLedger.intentId, createLedger.intentId);
  assert.equal(retriedCreate.attemptIndex, 2);
  assert.equal(retriedLedger.attemptIndex, 2);
  for (const event of events) assert.deepEqual(Object.keys(event.payload).sort(), FIELDS);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});

test('idle expiry removes request association without waiting for another operation', (t) => {
  setup(t);
  const modulePath = require.resolve('../miniprogram/core/activityTracker');
  const originalModule = require.cache[modulePath];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let expire;
  global.setTimeout = (callback, delay) => { assert.equal(delay, 30 * 60 * 1000); expire = callback; return 1; };
  global.clearTimeout = () => {};
  t.after(() => { global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout; require.cache[modulePath] = originalModule; });
  delete require.cache[modulePath];
  const isolatedTracker = require(modulePath);
  const first = isolatedTracker.begin('submitScore', { clientRequestId: 'PRIVATE_IDLE' });
  expire();
  const afterExpiry = isolatedTracker.begin('submitScore', { clientRequestId: 'PRIVATE_IDLE' });
  assert.notEqual(first.intentId, afterExpiry.intentId);
  assert.equal(afterExpiry.attemptIndex, 1);
  expire();
});

test('finished score response confirms status with independent eventId, never first completion', async (t) => {
  const responses = [{ ok: true, finished: true }, { ok: true, state: 'deduped', data: { finished: true } }, { ok: false, finished: true }, { ok: true, state: 'finished' }, { ok: true, finished: false }];
  const events = setup(t, async () => ({ result: responses.shift() }));
  for (let i = 0; i < 5; i += 1) await cloud.call('submitScore', {}, { retry: false });
  const completions = events.filter((event) => event.payload.action === 'tournament_complete');
  assert.equal(completions.length, 2);
  for (const completion of completions) {
    assert.equal(completion.payload.phase, 'result');
    assert.equal(completion.payload.result, 'finished_confirmed');
    assert.equal(completion.payload.resultCode, 'FINISHED_CONFIRMED');
    const score = events.find((event) => event.payload.operationId === completion.payload.operationId && event.payload.action === 'score_submit' && event.payload.phase === 'result');
    assert.ok(score);
    assert.notEqual(completion.payload.eventId, score.payload.eventId);
    assert.equal(completion.payload.intentId, score.payload.intentId);
  }
});

test('explicit share callback records invocation and unknown delivery only; failures do not block', (t) => {
  const events = setup(t);
  tracker.tournamentShare();
  assert.deepEqual(events.map((event) => event.payload.result), ['pending', 'unknown']);
  assert.ok(events.every((event) => event.payload.action === 'tournament_share'));
  assert.equal(events[1].payload.resultCode, 'DELIVERY_UNKNOWN');
  global.wx.reportEvent = () => { throw new Error('report failed'); };
  assert.doesNotThrow(() => tracker.tournamentShare());
});

test('first entry uses authoritative V2 original seq, never empty lists or replayed writes', async (t) => {
  const responses = [
    { ok: true, data: { entry: { seq: 1, eventType: 'game_recorded', actorNameSnapshot: 'PRIVATE_NAME' } } },
    { ok: true, data: { entry: { seq: 2, eventType: 'transfer_recorded' } } },
    { ok: true, state: 'deduped', data: { entry: { seq: 1, eventType: 'game_recorded' } } },
    { ok: true, data: { entries: [] } },
    { ok: true, data: { entry: { seq: 1, eventType: 'entry_corrected' } } }
  ];
  const events = setup(t, async () => ({ result: responses.shift() }));
  for (let i = 0; i < 5; i += 1) await cloud.call('waterSession', { action: 'recordGame', apiVersion: 2 });
  assert.deepEqual(events.filter((event) => event.name === 'activity_result').map((event) => event.payload.firstEntry), ['yes', 'no', 'replayed', 'unknown', 'unknown']);
  assert.ok(!JSON.stringify(events).includes('PRIVATE_NAME'));
});

test('analytics failure and missing SDK are nonblocking; reads/heartbeats are excluded', async (t) => {
  const events = setup(t, async () => ({ result: { ok: true } }));
  await cloud.call('login');
  await cloud.call('waterSession', { action: 'listEntries' });
  await cloud.call('scoreLock', { action: 'heartbeat' });
  assert.equal(events.length, 0);
  global.wx.reportEvent = () => { throw new Error('analytics failed'); };
  assert.equal((await cloud.call('startTournament')).ok, true);
  global.wx.reportEvent = () => Promise.reject(new Error('async analytics failed'));
  assert.equal((await cloud.call('joinTournament')).ok, true);
  delete global.wx.reportEvent;
  assert.equal((await cloud.call('updateSettings')).ok, true);
  global.wx.reportEvent = (name, payload) => events.push({ name, payload });
  global.wx.getAccountInfoSync = () => { throw new Error('SDK unavailable'); };
  await cloud.call('createTournament', { __traceId: 'PRIVATE_OPENID', name: 'PRIVATE_NAME' });
  assert.equal(events[0].payload.traceId, '');
  assert.equal(events[0].payload.appVersion, '');
  assert.equal(events[0].payload.envVersion, '');
  assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});

test('water page emits one view on load and duplicate completion does not resubmit', async (t) => {
  const events = setup(t, async () => ({ result: { ok: true } }));
  const originalPage = global.Page;
  let page;
  global.Page = (value) => { page = value; };
  t.after(() => { global.Page = originalPage; });
  const pagePath = require.resolve('../miniprogram/pages/water/index');
  delete require.cache[pagePath];
  require(pagePath);
  const context = { syncShareMenu() {}, createIndependentLedger: async () => {} };
  await page.onLoad.call(context, { new: '1', roomId: 'PRIVATE_ROOM' });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.action, 'water_enter');
  assert.ok(!JSON.stringify(events).includes('PRIVATE_ROOM'));
  const operation = tracker.begin('startTournament');
  tracker.finish(operation, { ok: true });
  tracker.finish(operation, { ok: false });
  assert.equal(events.length, 3);
});
