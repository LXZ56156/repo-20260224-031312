'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { run, jsonObjects } = require('../scripts/dev/weapp-ui-iterate');

const doctorChecks = { sessionRecord: true, marker: true, listenerIdentity: true,
  sdkVersion: true, viewport: true, route: true, toolProjectPath: true, sourceSnapshot: true };
const refreshChecks = { sessionRecord: true, runtimeMarkerReadable: true,
  listenerIdentity: true, toolProjectPath: true, sdkVersion: true, viewport: true,
  route: true, git: true, runtimeRecompiledForChangedSource: true,
  sourceStableDuringDoctor: true, marker: true };
const goodDoctor = { kind: 'weapp-ui-doctor-readonly-v1', ok: true, checks: doctorChecks };
const staleDoctor = { ...goodDoctor, ok: false,
  checks: { ...doctorChecks, marker: false, sourceSnapshot: false } };
const challenge = { kind: 'weapp-ui-doctor-result-v3', ok: false, sourceSnapshotChanged: true,
  checks: { ...refreshChecks, marker: false, runtimeRecompiledForChangedSource: false },
  pendingSession: { pendingRefresh: { challengeId: 'a'.repeat(64), targetGitManifestHash: 'b'.repeat(64) } },
  challengeBinding: { ok: true } };
const refreshed = { kind: 'weapp-ui-doctor-result-v3', ok: true,
  checks: refreshChecks, changedSourceCompileProven: true };
const compiled = { ok: true, tool: 'simulator_open_page', result: { success: true } };
function processResult(status, ...objects) {
  return { status, stdout: objects.map(object => JSON.stringify(object, null, 2)).join('\n') + '\n[diagnostic] ready\n', stderr: '' };
}
function captured(...names) {
  return processResult(0, ...names.map(name => ({ kind: 'weapp-ui-capture-receipt-v1', name,
    ok: true, captureOk: true, evidenceOk: true, machineOk: true,
    output: `D:/fake/${name}.png`, receiptPath: `D:/fake/${name}.receipt.json`,
    promotion: { promoted: true }, runtimeExceptions: [], runtimeConsole: [{}],
    systemInfo: { windowWidth: 390, windowHeight: 671 }, png: { width: 484, height: 1042 },
    expectedSDKVersion: '3.17.3', caseData: { ok: true },
    selectorCoverage: { counts: { '.card': 24, '.button': 2 } } })),
  { ok: true, promoted: true, publicationState: 'committed' });
}
function harness(results, overrides = {}) {
  const calls = [];
  const writes = [];
  let time = 0;
  let lockHeld = false;
  const env = { WEAPP_UI_SESSION_FILE: 'tmp/test/session.json', WEAPP_CAPTURE_SURFACE: 'simulator-frame' };
  return { calls, writes, env, deps: {
    env, runId: 'injected-test', now: () => time++,
    save: (filename, content) => writes.push({ filename, content }),
    withCompileLock: action => { lockHeld = true; try { return action(); } finally { lockHeld = false; } },
    execute: (executable, args, options) => {
      calls.push({ executable, script: path.basename(args[0]), args: args.slice(1), options, lockHeld });
      assert.ok(results.length, 'unexpected extra command');
      return results.shift();
    }, ...overrides,
  } };
}

test('ui iterate refuses empty, unknown, duplicate and mode-changing arguments before touching tools', () => {
  for (const argv of [[], ['unknown'], ['launch', 'launch'], ['--prewarm'], ['--help', 'launch']]) {
    const context = harness([]);
    assert.equal(run(argv, context.deps).exitCode, 1);
    assert.equal(context.calls.length, 0);
    assert.equal(context.writes.length, 0);
  }
  const context = harness([], { env: { WEAPP_CAPTURE_MODE: 'focus-probe-no-publish-v1' } });
  assert.equal(run(['launch'], context.deps).exitCode, 1);
  assert.equal(context.calls.length, 0);
  assert.match(run(['--help'], context.deps).help, /不预热/);
});

test('ui iterate parses multiple pretty JSON objects and ignores trailing official diagnostics', () => {
  assert.deepEqual(jsonObjects('noise\n' + JSON.stringify({ text: 'a \\" { }', nested: { ok: true } })
    + '\n{"ok":true}\n[wechatide] client=Codex'),
  [{ text: 'a \\" { }', nested: { ok: true } }, { ok: true }]);
});

test('healthy hot session goes directly to selected cases and emits concise paths/timings', () => {
  const context = harness([processResult(0, goodDoctor), captured('launch', 'settings')]);
  const result = run(['launch', 'settings'], context.deps);
  assert.equal(result.ok, true);
  assert.deepEqual(context.calls.map(call => call.args), [['--doctor'], ['launch', 'settings']]);
  assert.deepEqual(result.screenshots.map(item => item.png), ['D:/fake/launch.png', 'D:/fake/settings.png']);
  assert.equal(result.reviewStatus, 'pending');
  assert.equal(result.screenshots[0].runtimeConsoleEvents, 1);
  assert.deepEqual(result.screenshots[0].viewport, { width: 390, height: 671 });
  assert.deepEqual(result.screenshots[0].pixels, { width: 484, height: 1042 });
  assert.equal(result.screenshots[0].dataVerified, true);
  assert.equal(result.screenshots[0].matchedElements, 26);
  assert.equal(result.stages.length, 2);
  assert.ok(result.totalMs > 0);
  assert.ok(context.writes.some(write => write.filename.endsWith('summary.json')));
  for (const call of context.calls) {
    assert.equal(call.executable, process.execPath);
    assert.equal(call.options.env, context.env);
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.shell, undefined);
    assert.equal(call.options.timeout, undefined, 'do not force-kill a child holding the session lock');
  }
});

test('source drift runs challenge, one lock-protected official compile, refresh proof and capture', () => {
  const context = harness([processResult(2, staleDoctor), processResult(2, challenge),
    processResult(0, compiled), processResult(0, refreshed), captured('launch')]);
  const result = run(['launch'], context.deps);
  assert.equal(result.ok, true);
  assert.deepEqual(result.stages.map(stage => stage.name),
    ['doctor', 'refresh-challenge', 'compile', 'refresh-after-compile', 'capture']);
  assert.equal(context.calls[2].script, 'wechatide-local.js');
  assert.equal(context.calls[2].args[0], 'simulator_open_page');
  assert.equal(context.calls[2].lockHeld, true);
  assert.equal(context.calls[2].args[1], path.resolve(__dirname, '..'));
  assert.equal(context.calls[2].args[2], 'pages/launch/index');
  assert.equal(context.calls[3].lockHeld, false);
});

test('existing still-live source challenge is compiled once without overwriting the challenge', () => {
  const pending = { ...challenge, pendingSession: null, challengeBinding: null,
    runtimeMarkerMatchesPendingChallenge: true, pendingMatchesCurrentSource: true };
  const context = harness([processResult(2, staleDoctor), processResult(2, pending),
    processResult(0, compiled), processResult(0, refreshed), captured('launch')]);
  assert.equal(run(['launch'], context.deps).ok, true);
  assert.equal(context.calls.filter(call => call.script === 'wechatide-local.js').length, 1);
});

test('already compiled pending source can finish refresh without a redundant compile', () => {
  const context = harness([processResult(2, staleDoctor), processResult(0, refreshed), captured('launch')]);
  assert.equal(run(['launch'], context.deps).ok, true);
  assert.equal(context.calls.length, 3);
});

test('session identity, viewport, marker-only, lock and malformed doctor failures stop before refresh', () => {
  for (const result of [processResult(2, { ...staleDoctor, checks: { ...staleDoctor.checks, listenerIdentity: false } }),
    processResult(2, { ...staleDoctor, checks: { ...staleDoctor.checks, viewport: false } }),
    processResult(2, { ...goodDoctor, ok: false, checks: { ...doctorChecks, marker: false } }),
    { status: 1, stdout: '', stderr: 'session lock held' }, processResult(0, { ok: true })]) {
    const context = harness([result]);
    const summary = run(['launch'], context.deps);
    assert.equal(summary.ok, false);
    assert.equal(summary.failedStage, 'doctor');
    assert.equal(context.calls.length, 1);
  }
});

test('invalid challenge cannot trigger compile and a held compile lock is never bypassed', () => {
  for (const invalid of [{ ...challenge, challengeBinding: { ok: false } },
    { ...challenge, sourceSnapshotChanged: false },
    { ...challenge, checks: { ...challenge.checks, git: false } }]) {
    const context = harness([processResult(2, staleDoctor), processResult(2, invalid)]);
    assert.equal(run(['launch'], context.deps).failedStage, 'refresh-challenge');
    assert.equal(context.calls.length, 2);
  }
  const context = harness([processResult(2, staleDoctor), processResult(2, challenge)],
    { withCompileLock() { throw new Error('session lock held'); } });
  const summary = run(['launch'], context.deps);
  assert.equal(summary.failedStage, 'compile');
  assert.equal(summary.ok, false);
  assert.equal(context.calls.length, 2);
});

test('compile must report both official ok and result.success; no failure is retried', () => {
  for (const result of [processResult(0, { ...compiled, ok: false }),
    processResult(0, { ...compiled, result: { success: false } }),
    processResult(1, compiled), processResult(0, { ok: true, result: { success: true } }),
    processResult(0, { ...compiled, tool: 'simulator_refresh' })]) {
    const context = harness([processResult(2, staleDoctor), processResult(2, challenge), result]);
    assert.equal(run(['launch'], context.deps).failedStage, 'compile');
    assert.equal(context.calls.length, 3);
  }
});

test('failed post-compile checks or missing compile proof stop before capture', () => {
  for (const result of [processResult(2, refreshed),
    processResult(0, { ...refreshed, changedSourceCompileProven: false }),
    processResult(0, { ...refreshed, checks: { ...refreshChecks, marker: false } })]) {
    const context = harness([processResult(2, staleDoctor), processResult(2, challenge),
      processResult(0, compiled), result]);
    assert.equal(run(['launch'], context.deps).failedStage, 'refresh-after-compile');
    assert.equal(context.calls.length, 4);
  }
});

test('capture failure or publication uncertainty emits no success screenshot paths', () => {
  for (const capture of [processResult(2, { ok: false, publicationState: 'not-attempted' }),
    processResult(0, { ok: true, promoted: true, publicationState: 'indeterminate' }),
    captured('settings')]) {
    const context = harness([processResult(0, goodDoctor), capture]);
    const summary = run(['launch'], context.deps);
    assert.equal(summary.ok, false);
    assert.equal(summary.failedStage, 'capture');
    assert.equal(summary.screenshots, undefined);
    assert.equal(context.calls.length, 2);
  }
});

test('transport failures preserve logs and do not launch recovery or prewarm', () => {
  const context = harness([{ status: null, error: new Error('spawn failed'), stderr: 'transport failure' }]);
  const result = run(['launch'], context.deps);
  assert.equal(result.ok, false);
  assert.equal(context.calls.length, 1);
  assert.ok(context.writes.some(write => write.content === 'transport failure'));
});

test('observed batch cleanup failure reports valid candidate separately from failed native routing', () => {
  const cleanup = { ok: false, error: 'Uncaught [object Object]' };
  const launch = { kind: 'weapp-ui-capture-receipt-v1', name: 'launch',
    ok: false, captureOk: true, evidenceOk: false, machineOk: false,
    receiptValidation: { ok: true, checks: { png: true, sourceSnapshot: true, route: true } },
    fixtureCleanup: cleanup, cleanupError: cleanup.error,
    runtimeExceptions: [], runtimeConsole: [{ type: 'warn' }],
    candidateOutput: 'D:/fake/candidate/launch.png',
    candidateReceiptPath: 'D:/fake/candidate/launch.receipt.json' };
  const water = { kind: 'weapp-ui-capture-receipt-v1', name: 'waterV2Member24',
    ok: false, captureOk: false, evidenceOk: false, machineOk: false,
    error: 'Error: Uncaught [object Object]\n    at Connection.onMessage',
    fixtureCleanup: cleanup, cleanupError: cleanup.error,
    runtimeExceptions: [], runtimeConsole: [],
    candidateOutput: 'D:/fake/candidate/waterV2Member24.png',
    candidateReceiptPath: 'D:/fake/candidate/waterV2Member24.receipt.json' };
  const context = harness([processResult(0, goodDoctor), processResult(2, launch, water,
    { ok: false, promoted: false, finalsTouched: false, publicationState: 'not-attempted',
      reason: 'one-or-more-cases-failed' })]);
  const summary = run(['launch', 'waterV2Member24'], context.deps);
  assert.equal(summary.ok, false);
  assert.equal(summary.publication.publicationState, 'not-attempted');
  assert.equal(summary.caseDiagnostics[0].candidatePng, launch.candidateOutput);
  assert.deepEqual(summary.caseDiagnostics[0].failedChecks, []);
  assert.deepEqual(summary.caseDiagnostics[0].fixtureCleanup, cleanup);
  assert.equal(summary.caseDiagnostics[0].runtimeExceptionCount, 0);
  assert.equal(summary.caseDiagnostics[1].candidatePng, null, 'do not claim an uncaptured candidate exists');
  assert.equal(summary.caseDiagnostics[1].error, 'Error: Uncaught [object Object]');
  assert.equal(summary.caseDiagnostics[1].candidateReceipt, water.candidateReceiptPath);
  assert.equal(summary.screenshots, undefined);
});
