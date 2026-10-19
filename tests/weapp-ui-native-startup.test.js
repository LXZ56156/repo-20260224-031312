'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStartupTracker, snapshotNativeStartup, waitForNativeStartup } = require('../scripts/dev/weapp-ui-native-startup');
const project = 'C:\\work\\exact-project';
const line = (message, window = 's0') => `[rt:0,win:${window}] ${message}\n`;
const event = (message) => line(`[appservice] ${message}`);
const binding = line(`[CompileCache] {"projectPath":"C:\\\\work\\\\exact-project"}`);
function provisional(tracker, fresh = true) {
  [binding, event('restart appservice compile'), event('appservice init webview'),
    event('restart appservice compile'), event('appservice reload'), event('appservice webview loadstop')]
    .forEach((value) => tracker.feed('one', value.trim(), fresh));
}
test('provisional compile loadstop cannot complete the asynchronous container hook', () => {
  const tracker = createStartupTracker(project);
  provisional(tracker);
  assert.deepEqual(tracker.inspect(), { ready: false, matchedWindows: 1, pendingContainer: true, pendingRestart: false });
  tracker.feed('one', event('appservice reload').trim());
  assert.equal(tracker.inspect().ready, false);
  tracker.feed('one', event('appservice webview loadstop').trim());
  assert.equal(tracker.inspect().ready, true);
  tracker.feed('one', event('appservice init webview').trim());
  assert.equal(tracker.inspect().ready, false);
});
test('historical readiness requires fresh exact-project binding and lifecycle activity', () => {
  const tracker = createStartupTracker(project);
  provisional(tracker, false);
  tracker.feed('one', event('appservice reload').trim(), false);
  tracker.feed('one', event('appservice webview loadstop').trim(), false);
  assert.equal(tracker.inspect().ready, false);
  tracker.feed('one', binding.replace('exact-project', 'exact-project-old').trim());
  tracker.feed('one', event('restart appservice compile').trim());
  tracker.feed('one', event('appservice reload').trim());
  tracker.feed('one', event('appservice webview loadstop').trim());
  assert.equal(tracker.inspect().ready, false);
  tracker.feed('one', binding.trim());
  assert.equal(tracker.inspect().ready, true);
});
test('same project in two native windows is ambiguous; log identity separates processes', () => {
  const tracker = createStartupTracker(project);
  provisional(tracker);
  tracker.feed('two', binding.trim());
  tracker.feed('two', event('appservice init webview').trim());
  assert.throws(() => tracker.inspect(), /ambiguous/);
  tracker.forget('two');
  assert.equal(tracker.inspect().matchedWindows, 1);
});
test('a late-created log must witness provisional load and a later unpaired hook reload', () => {
  const tracker = createStartupTracker(project);
  tracker.feed('late', binding.trim());
  tracker.feed('late', event('appservice webview loadstop').trim());
  assert.equal(tracker.inspect().ready, false);
  // A subsequent ordinary compile still cannot certify container completion.
  for (const message of ['restart appservice compile', 'appservice reload', 'appservice webview loadstop']) {
    tracker.feed('late', event(message).trim());
  }
  assert.equal(tracker.inspect().ready, false);
  tracker.feed('late', event('appservice reload').trim());
  assert.equal(tracker.inspect().ready, false);
  tracker.feed('late', event('appservice webview loadstop').trim());
  assert.equal(tracker.inspect().ready, true);
});
test('incremental UTF8 logs exclude the historical cursor and require final reload', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-native-startup-'));
  try {
    const file = path.join(directory, 'official.log');
    fs.writeFileSync(file, binding + event('appservice init webview') + event('appservice reload') + event('appservice webview loadstop'));
    const observer = snapshotNativeStartup(directory, project);
    assert.equal(observer.poll().ready, false);
    const bytes = Buffer.from(binding + line('中文日志') + event('appservice init webview'));
    const split = bytes.indexOf(Buffer.from('中')) + 1;
    fs.appendFileSync(file, bytes.subarray(0, split));
    assert.equal(observer.poll().ready, false);
    fs.appendFileSync(file, bytes.subarray(split));
    assert.equal(observer.poll().pendingContainer, true);
    fs.appendFileSync(file, event('appservice reload') + event('appservice webview loadstop'));
    assert.equal(observer.poll().ready, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('startup wait uses the existing deadline and propagates observer failures', async () => {
  let clock = 0;
  let polls = 0;
  const options = { now: () => clock, sleep: async (ms) => { clock += ms; } };
  const result = await waitForNativeStartup({ poll: () => ({ ready: ++polls === 3 }) }, 1000, options);
  assert.equal(result.elapsedMs, 400);
  clock = 0;
  await assert.rejects(waitForNativeStartup({ poll: () => ({ ready: false }) }, 250, options), /deadline/);
  assert.equal(clock, 250);
  await assert.rejects(waitForNativeStartup({ poll: () => { throw new Error('read failed'); } }, 250), /read failed/);
  await assert.rejects(waitForNativeStartup({}, 0), /positive and finite/);
});
