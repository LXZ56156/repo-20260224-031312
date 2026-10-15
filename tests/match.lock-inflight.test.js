const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatchLockController } = require('../miniprogram/pages/match/matchLockController');

function setup(t, state = 'locked_by_other') {
  const oldWx = global.wx;
  const calls = [], toasts = [], timers = new Map();
  let timerId = 0;
  const ctx = {
    active: true,
    data: { tournamentId: 'efficiency-test', roundIndex: 0, matchIndex: 0, match: { status: 'pending' },
      userCanScore: true, lockBusy: false, lockState: state },
    isPageActive() { return this.active; },
    setData(patch) { Object.assign(this.data, patch); }
  };
  global.wx = { showToast: (payload) => toasts.push(payload) };
  const controller = createMatchLockController(ctx, {
    cloud: {
      call(_name, payload) {
        let resolve, reject;
        const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
        calls.push({ payload, resolve, reject });
        return promise;
      },
      getUnifiedErrorMessage: () => '同步状态失败'
    },
    setIntervalFn(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearIntervalFn(id) { timers.delete(id); }
  });
  controller.setLockState(state, { lockSessionId: state === 'locked_by_me' ? 'first-session' : '', expireAt: Date.now() + 45_000 });
  t.after(() => {
    ctx.active = false;
    controller.teardown();
    calls.forEach((call) => call.resolve({ ok: true, state: 'released' }));
    global.wx = oldWx;
  });
  return { ctx, controller, calls, toasts, timers };
}

for (const [action, state, interval] of [['status', 'locked_by_other', 5000], ['heartbeat', 'locked_by_me', 15000]]) {
  test(action + ' timer coalesces unresolved ticks and sends the next settled tick', async (t) => {
    const { controller, calls, timers } = setup(t, state);
    const tick = [...timers.values()].find((timer) => timer.delay === interval).fn;
    tick(); tick(); tick();
    assert.equal(calls.length, 1);
    const waiting = action === 'status' ? controller.syncLockStatus(true) : controller.heartbeatLock();
    assert.equal(calls.length, 1);
    calls[0].resolve({ ok: true, state: 'acquired', lockSessionId: 'first-session', expireAt: Date.now() + 45_000 });
    await waiting;
    const next = action === 'status' ? controller.syncLockStatus(true) : controller.heartbeatLock();
    assert.equal(calls.length, 2);
    calls[1].resolve({ ok: true, state: 'acquired', expireAt: Date.now() + 45_000 });
    await next;
  });
}

test('manual status joined to silent polling still receives one occupied notification', async (t) => {
  const { controller, calls, toasts } = setup(t);
  const poll = controller.syncLockStatus(true);
  const manual = controller.syncLockStatus(false);
  assert.equal(calls.length, 1);
  calls[0].resolve({ ok: false, code: 'LOCK_OCCUPIED', ownerName: '裁判B', expireAt: Date.now() + 45_000 });
  await Promise.all([poll, manual]);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].title, /裁判B/);
});

test('hidden page starts no status or heartbeat request', async (t) => {
  const { ctx, controller, calls } = setup(t, 'locked_by_me');
  ctx.active = false;
  const status = controller.syncLockStatus(false);
  const heartbeat = controller.heartbeatLock();
  assert.equal(calls.length, 0);
  await Promise.all([status, heartbeat]);
});

test('late failed status after teardown cannot notify or revive timers', async (t) => {
  const { ctx, controller, calls, toasts, timers } = setup(t);
  const request = controller.syncLockStatus(false);
  ctx.active = false;
  controller.teardown({ resetState: true });
  calls[0].reject(new Error('late failure'));
  await request;
  assert.deepEqual(toasts, []);
  assert.equal(timers.size, 0);
  assert.equal(ctx.data.lockState, 'idle');
});

test('a new lock session is not joined to an older heartbeat or cleared by its finalizer', async (t) => {
  const { ctx, controller, calls } = setup(t, 'locked_by_me');
  const old = controller.heartbeatLock();
  const payload = controller.buildScoreLockPayload('acquire');
  controller.setLockState('locked_by_me', { lockSessionId: payload.lockSessionId, expireAt: Date.now() + 45_000 });
  const current = controller.heartbeatLock();
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].payload.lockSessionId, calls[1].payload.lockSessionId);
  calls[0].resolve({ ok: false, code: 'LOCK_EXPIRED' });
  await old;
  assert.equal(ctx.data.lockState, 'locked_by_me');
  const joined = controller.heartbeatLock();
  assert.equal(calls.length, 2);
  calls[1].resolve({ ok: true, state: 'acquired', lockSessionId: payload.lockSessionId, expireAt: Date.now() + 45_000 });
  await Promise.all([current, joined]);
});

test('status and heartbeat remain separate actions and failed requests release the slot', async (t) => {
  const { controller, calls } = setup(t, 'locked_by_me');
  const status = controller.syncLockStatus(true);
  const heartbeat = controller.heartbeatLock();
  assert.deepEqual(calls.map((call) => call.payload.action), ['status', 'heartbeat']);
  calls.forEach((call) => call.reject(new Error('network failure')));
  await Promise.all([status, heartbeat]);
  const next = controller.heartbeatLock();
  assert.equal(calls.length, 3);
  calls[2].resolve({ ok: true, state: 'acquired', expireAt: Date.now() + 45_000 });
  await next;
});

test('teardown permits a fresh status while an old request is unresolved', async (t) => {
  const { ctx, controller, calls } = setup(t);
  const old = controller.syncLockStatus(true);
  controller.teardown();
  const current = controller.syncLockStatus(true);
  assert.equal(calls.length, 2);
  calls[0].resolve({ ok: false, code: 'LOCK_FORBIDDEN' });
  await old;
  assert.equal(ctx.data.lockState, 'locked_by_other');
  const joined = controller.syncLockStatus(true);
  assert.equal(calls.length, 2);
  calls[1].resolve({ ok: false, code: 'LOCK_OCCUPIED', expireAt: Date.now() + 45_000 });
  await Promise.all([current, joined]);
});
