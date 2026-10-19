'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const t = require('../scripts/dev/weapp-ui-screenshot');
const { createNativeRecovery } = require('../scripts/dev/weapp-ui-native-recovery');
const originalComputerName = process.env.COMPUTERNAME;
test.before(() => { process.env.COMPUTERNAME = 'VM'; });
test.after(() => { if (originalComputerName === undefined) delete process.env.COMPUTERNAME; else process.env.COMPUTERNAME = originalComputerName; });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-recovery-test-'));
  const runId = '2026-10-19T09-25-11-429Z-14080-fe658052';
  const directory = path.join(root, 'tmp/native-ui-acceptance', runId);
  fs.mkdirSync(directory, { recursive: true });
  const sessionFile = path.join(root, 'session.json'), target = path.join(directory, 'owner-recovery.local.json');
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const original = { kind: 'weapp-ui-session-lock-v1', token: 'a'.repeat(48), purpose: 'native-ui-acceptance', processId: 14080,
    processStartFileTimeUtc: '100', sessionFile, createdAt: '2026-10-19T09:25:11.427Z' };
  const recovery = { kind: 'native-acceptance-owner-recovery-v1', token: 'fe658052' + 'b'.repeat(40), sessionFile, sourceManifestHash: 'source', active: true };
  write(target, recovery); write(sessionFile + '.lock', original);
  write(path.join(directory, 'observations.json'), { runId, startedAt: '2026-10-19T09:25:11.431Z', sourceManifestHash: 'source', sessionFile,
    installation: { verified: true }, beforeChecks: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, true])) });
  const state = { identity: { ok: false, reason: 'not-found' }, calls: [], hook: null };
  const resolver = pid => pid === 14080 ? state.identity : { ok: true, processId: pid, processStartFileTimeUtc: '200' };
  const tool = { ...t, REPOSITORY_ROOT: root, currentGitManifest: () => ({ hash: 'source' }), hashCanonical: obj => obj.hash,
    resolveProcessIdentity: resolver,
    readRuntimeConfig: () => ({ sessionFile, session: { gitManifestHash: 'source' } }),
    validateRuntimeConfig: () => ({ ok: true }), validateSessionRecord: () => ({ ok: true }),
    acquireSessionLock(file, purpose, options) {
      return t.acquireSessionLock(file, purpose, { ...options, resolveProcessIdentity: resolver,
        beforeStaleRecheck(args) { options.beforeStaleRecheck(args); if (state.hook) state.hook(args); },
        afterStaleBarrier() { assert.throws(() => t.acquireSessionLock(file, 'ordinary', { resolveProcessIdentity: resolver }), /recovery is incomplete/); },
      });
    },
    async openMiniProgram() { state.calls.push('connect'); return { miniProgram: {
      async evaluate(_fn, command) {
        state.calls.push(command);
        if (command === 'status') return state.restored ? { ok: false, present: false } : { ok: true, guardsVerified: state.guards !== false };
        if (command === 'quiesce') return { ok: true };
        if (command === 'finish') { state.restored = true; return { ok: true, retained: false, storageRestored: true, globalDataRestored: true, sdkRestored: true, neutralViewRefreshed: true, watchersRemaining: 0, listenersRemaining: 0, nativePending: 0 }; }
        throw Error('Unexpected recovery action');
      }, disconnect() { state.calls.push('disconnect'); },
    } }; },
    async verifySessionBinding() { return { ok: true, checks: { all: true } }; },
    async cleanupCaptureRun() { state.calls.push('neutral'); return { ok: true }; },
  };
  const api = createNativeRecovery(tool, () => {});
  return { root, target, sessionFile, original, recovery, state, tool, api, write,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}

test('dead original owner recovers with a durable barrier, preserves stale evidence, restores and releases normally', async () => {
  const f = fixture(); try {
    const result = await f.api.recover(f.target, path.join(f.root, 'result.json'));
    assert.equal(result.ok, true); assert.equal(result.release.ok, true);
    assert.deepEqual(f.state.calls, ['connect', 'status', 'quiesce', 'neutral', 'finish', 'status', 'disconnect']);
    assert.equal(JSON.parse(fs.readFileSync(f.target)).active, false);
    assert.equal(fs.existsSync(f.sessionFile + '.lock'), false);
    assert.equal(fs.existsSync(t.sessionRecoveryFile(f.sessionFile)), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.sessionFile + '.lock.stale-' + f.original.token)), f.original);
  } finally { f.cleanup(); }
});

for (const scenario of ['active', 'unknown', 'source', 'other-owner']) test(`recovery refuses ${scenario} without touching lock or SDK`, () => {
  const f = fixture(); try {
    if (scenario === 'active') f.state.identity = { ok: true, processStartFileTimeUtc: '100' };
    if (scenario === 'unknown') f.state.identity = { ok: false, reason: 'query-failed' };
    if (scenario === 'source') f.write(f.target, { ...f.recovery, sourceManifestHash: 'wrong' });
    if (scenario === 'other-owner') f.write(f.sessionFile + '.lock', { ...f.original, processId: 9999 });
    const before = fs.readFileSync(f.sessionFile + '.lock', 'utf8');
    assert.throws(() => f.api.inspectOwner(f.target), /active|unknown|mismatch/);
    assert.equal(fs.readFileSync(f.sessionFile + '.lock', 'utf8'), before);
    assert.deepEqual(f.state.calls, []);
  } finally { f.cleanup(); }
});

test('concurrent recovery claim and ordinary operations cannot enter recovery', () => {
  const f = fixture(); try {
    assert.throws(() => t.acquireSessionLock(f.sessionFile, 'prewarm', { allowStaleRecovery: true,
      resolveProcessIdentity: pid => pid === 14080 ? { ok: false, reason: 'not-found' } : { ok: true, processStartFileTimeUtc: '200' },
    }), /verified owner recovery entry/);
    const context = f.api.inspectOwner(f.target); let raced = false;
    f.state.hook = () => { raced = true; assert.throws(() => f.api.acquireRecovery(context), /already claimed/); };
    const claim = f.api.acquireRecovery(context);
    assert.equal(raced, true); claim.assertOwned();
    assert.throws(() => f.api.acquireRecovery(context), /lock changed/);
    t.releaseSessionLockOrThrow(claim.lock);
  } finally { f.cleanup(); }
});

test('lost guards fail closed before quiesce, retain recovery evidence and release only the owned lock', async () => {
  const f = fixture(); try {
    f.state.guards = false;
    await assert.rejects(f.api.recover(f.target, path.join(f.root, 'result.json')), /guards.*unknown/);
    assert.deepEqual(f.state.calls, ['connect', 'status', 'disconnect']);
    assert.equal(JSON.parse(fs.readFileSync(f.target)).active, true);
    assert.equal(fs.existsSync(t.sessionRecoveryFile(f.sessionFile)), true);
    assert.equal(fs.existsSync(f.sessionFile + '.lock'), false);
  } finally { f.cleanup(); }
});

test('PID reuse proves the original owner dead, but a changed source after claim retains the barrier', () => {
  const f = fixture(); try {
    f.state.identity = { ok: true, processStartFileTimeUtc: '101' };
    const context = f.api.inspectOwner(f.target);
    f.state.hook = () => { f.tool.currentGitManifest = () => ({ hash: 'changed' }); };
    assert.throws(() => f.api.acquireRecovery(context), /source changed/);
    assert.equal(fs.existsSync(f.sessionFile + '.lock'), false);
    assert.equal(fs.existsSync(t.sessionRecoveryFile(f.sessionFile)), true);
    assert.equal(JSON.parse(fs.readFileSync(f.target)).active, true);
    assert.deepEqual(f.state.calls, []);
  } finally { f.cleanup(); }
});

test('lock release failure never reports success or replaces an earlier restoration failure', async () => {
  for (const guards of [true, false]) {
    const f = fixture(); try {
      f.state.guards = guards;
      f.tool.releaseSessionLock = () => ({ ok: false, reason: 'owner changed' });
      const resultFile = path.join(f.root, 'result.json');
      await assert.rejects(f.api.recover(f.target, resultFile), guards ? /lock release/ : /guards.*unknown/);
      const result = JSON.parse(fs.readFileSync(resultFile));
      assert.equal(result.ok === true, false); assert.equal(result.release.ok, false);
      assert.equal(fs.existsSync(f.sessionFile + '.lock'), true);
    } finally { f.cleanup(); }
  }
});
