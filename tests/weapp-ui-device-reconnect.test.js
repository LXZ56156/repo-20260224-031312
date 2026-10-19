'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { reconnectViewportAfterReplacement, waitForViewportReady } = require('../scripts/dev/weapp-ui-prewarm');
const { createStartupTracker } = require('../scripts/dev/weapp-ui-native-startup');

function setup(change = {}) {
  let clock = 0, connects = 0, disconnected = 0, attached = 0;
  const listener = { ok: true, endpoint: 'ws://127.0.0.1:12345', owningProcessId: 42, processStartFileTimeUtc: '123',
    executablePath: path.resolve('vendor/devtools.exe'), backgroundCaptureFlags: { disableBackgroundingOccludedWindows: true },
    processChain: [{ executablePath: path.resolve('vendor/devtools.exe') }] };
  const baseline = { key: 'official.log:0:s0', generation: 1, processId: 100, ready: true };
  const replacement = { ...baseline, generation: 3, processId: 200 };
  const fresh = { send: async () => ({ SDKVersion: '3.17.4' }), disconnect: () => { disconnected++; },
    evaluate: async () => ({ functions: { getApp: 'function', getCurrentPages: 'function', App: 'function', Page: 'function' },
      appAvailable: true, pagesAvailable: true, pageCount: 1, pageReady: true }),
    systemInfo: async () => ({ windowWidth: 430, windowHeight: 752, pixelRatio: 3 }) };
  const context = { miniProgram: { disconnect() { disconnected++; } }, observer: { poll: () => ({ ready: true }), incarnation: () => replacement },
    baseline, endpoint: listener.endpoint, listener, cliPath: path.resolve('vendor/cli.bat'), gitManifestHash: 'source', expectedSDKVersion: '3.17.4',
    projectPath: path.resolve('project'), automator: { connect: async () => { connects++; return fresh; } }, onConnected: () => { attached++; } };
  const options = { now: () => clock, sleep: async ms => { clock += ms; }, manifestHash: () => 'source', resolveListener: () => listener };
  Object.assign(context, change.context); Object.assign(options, change.options);
  return { context, options, fresh, replacement, setClock: value => { clock = value; }, counts: () => ({ connects, disconnected, attached }) };
}

test('official same-window AppService replacement reconnects once and requires two new geometry samples', async () => {
  const s = setup(); let oldReads = 0, freshReads = 0;
  s.context.miniProgram.systemInfo = async () => { oldReads++; throw Error('prewarm:real-viewport timed out after 5000ms'); };
  s.fresh.systemInfo = async () => { freshReads++; return { windowWidth: 430, windowHeight: 752, pixelRatio: 3 }; };
  const result = await waitForViewportReady(s.context.miniProgram, 430, 30000, { ...s.options, height: 752,
    reconnectAfterReplacement: (mini, deadline) => reconnectViewportAfterReplacement({ ...s.context, miniProgram: mini }, deadline, s.options) });
  assert.equal(result.ready, true); assert.equal(oldReads, 1); assert.equal(freshReads, 2);
  assert.deepEqual(s.counts(), { connects: 1, disconnected: 1, attached: 1 });
});

test('replacement recovery refuses missing evidence, different window, source, listener, SDK and deadline', async () => {
  for (const kind of ['absent', 'same', 'window', 'samepid', 'source', 'listener', 'sdk', 'expired']) {
    const s = setup();
    if (kind === 'absent') s.context.observer.incarnation = () => null;
    if (kind === 'same') s.replacement.generation = 1;
    if (kind === 'window') s.replacement.key = 'other.log:0:s1';
    if (kind === 'samepid') s.replacement.processId = 100;
    if (kind === 'source') s.options.manifestHash = () => 'changed';
    if (kind === 'listener') s.options.resolveListener = () => ({ ...s.context.listener, owningProcessId: 999 });
    if (kind === 'sdk') s.fresh.send = async () => ({ SDKVersion: 'wrong' });
    if (kind === 'expired') s.setClock(26000);
    await assert.rejects(reconnectViewportAfterReplacement(s.context, 30000, s.options), /replacement|Replacement|Source/);
    assert.equal(s.counts().connects, kind === 'sdk' ? 1 : 0, kind);
    if (kind === 'sdk') assert.equal(s.counts().disconnected, 2, 'fresh transport is closed on proof failure');
  }
});

test('empty pages or another replacement after connection cannot become signed readiness', async () => {
  for (const kind of ['empty', 'changed']) {
    const s = setup();
    if (kind === 'empty') s.fresh.evaluate = async () => { s.setClock(30000); return { functions: { getApp: 'function', getCurrentPages: 'function', App: 'function', Page: 'function' }, appAvailable: true, pagesAvailable: true, pageCount: 0, pageReady: false }; };
    else s.fresh.evaluate = async () => { s.replacement.processId++; return { functions: { getApp: 'function', getCurrentPages: 'function', App: 'function', Page: 'function' }, appAvailable: true, pagesAvailable: true, pageCount: 1, pageReady: true }; };
    // Return immutable snapshots, as the real native tracker does.
    s.context.observer.incarnation = () => ({ ...s.replacement });
    await assert.rejects(reconnectViewportAfterReplacement(s.context, 30000, s.options), /did not become ready|changed again/);
    assert.equal(s.counts().connects, 1); assert.equal(s.counts().disconnected, 2);
  }
});

test('official lifecycle evidence tracks two actual device-switch incarnations in the bound window', () => {
  const tracker = createStartupTracker('C:/exact');
  const feed = msg => tracker.feed('official.log', `[rt:0,win:s0] ${msg}`);
  feed('projectPath C:/exact'); feed('[appservice] appservice init webview');
  feed('[appservice] appservice reload'); feed('[appservice] appservice webview loadstop');
  const baseline = tracker.incarnation();
  feed('[appservice] appservice init webview'); feed('[appservice] appservice webview process id 14092');
  feed('[appservice] restart appservice compile'); feed('[appservice] appservice init webview');
  feed('[appservice] appservice webview process id 11188'); feed('[appservice] appservice reload'); feed('[appservice] appservice webview loadstop');
  assert.equal(tracker.incarnation().generation, baseline.generation + 2);
  assert.equal(tracker.incarnation().processId, 11188); assert.equal(tracker.incarnation().ready, true);
});
