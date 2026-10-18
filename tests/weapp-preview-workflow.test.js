const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const mirror = require('../scripts/dev/preview-mirror');
const {startMirror, stopMirror, running, orchestrate, createNativeAdapter} = require('../scripts/dev/weapp-dev');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp preview 中文 '));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const c = mirror.config({SOURCE_DIR: path.join(root, 'source'), PREVIEW_DIR: path.join(root, 'preview'), POLL_INTERVAL_SECONDS: '0.05', DEBOUNCE_MILLISECONDS: '20'});
  fs.mkdirSync(path.join(c.sourceDir, 'miniprogram'), {recursive: true});
  fs.writeFileSync(path.join(c.sourceDir, 'project.config.json'), '{}');
  fs.writeFileSync(path.join(c.sourceDir, 'miniprogram/app.js'), 'App({});\n');
  return c;
}
test('sync-once writes a manifest and status reports synced-but-stopped mirror without shell tools', (t) => {
  const c = fixture(t);
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/dev/weapp-sync-preview.js'), 'sync-once'], {env: {...process.env, PATH: '', SOURCE_DIR: c.sourceDir, PREVIEW_DIR: c.previewDir}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const manifest = mirror.readJSON(c.manifestPath);
  assert.equal(manifest.signature, mirror.signature(c.sourceDir));
  assert.equal(mirror.status(c).state, 'current');
  assert.equal(running(c), false);
  assert.equal(fs.readFileSync(path.join(c.previewDir, 'miniprogram/app.js'), 'utf8'), 'App({});\n');
});
test('status detects stale source and destination independently', (t) => {
  const c = fixture(t); mirror.syncOnce(c);
  fs.writeFileSync(path.join(c.sourceDir, 'miniprogram/app.js'), 'new');
  assert.equal(mirror.status(c).state, 'stale'); mirror.syncOnce(c);
  fs.writeFileSync(path.join(c.previewDir, 'miniprogram/app.js'), 'tamper');
  assert.equal(mirror.status(c).state, 'stale');
});
test('empty directories and excluded content do not stale or leak into mirror; removed files disappear', (t) => {
  const c = fixture(t);
  fs.mkdirSync(path.join(c.sourceDir, 'miniprogram/empty'), {recursive: true});
  fs.mkdirSync(path.join(c.sourceDir, 'miniprogram/node_modules'), {recursive: true});
  fs.writeFileSync(path.join(c.sourceDir, 'miniprogram/node_modules/secret.js'), 'excluded');
  mirror.syncOnce(c);
  assert.equal(mirror.status(c).state, 'current');
  assert.equal(fs.existsSync(path.join(c.previewDir, 'miniprogram/empty')), false);
  assert.equal(fs.existsSync(path.join(c.previewDir, 'miniprogram/node_modules')), false);
  fs.unlinkSync(path.join(c.sourceDir, 'miniprogram/app.js')); mirror.syncOnce(c);
  assert.equal(fs.existsSync(path.join(c.previewDir, 'miniprogram/app.js')), false);
});
test('mirror starts real Node background worker, syncs same-length edits and stops cooperatively', async (t) => {
  const c = fixture(t);
  try {
    await startMirror(c, {...process.env, PATH: ''});
    const pid = running(c).pid;
    fs.writeFileSync(path.join(c.sourceDir, 'miniprogram/app.js'), 'App({x:1});\n');
    await startMirror(c);
    assert.equal(running(c).pid, pid);
    assert.equal(mirror.status(c).state, 'current');
    fs.writeFileSync(path.join(c.sourceDir, 'miniprogram/app.js'), 'App({x:2});\n');
    await startMirror(c);
    assert.equal(fs.readFileSync(path.join(c.previewDir, 'miniprogram/app.js'), 'utf8'), 'App({x:2});\n');
  } finally { await stopMirror(c); }
  assert.equal(running(c), false);
});
function adapter(alreadyRunning) {
  const calls = []; let ready = false;
  return {calls, assertSupported() {}, isDevtoolsRunning: async () => alreadyRunning,
    startDevtools: async () => { calls.push('devtools'); }, isMcpReady: async () => ready,
    startMcp: async () => { calls.push('mcp'); ready = true; }};
}
test('mcp orchestrator starts DevTools before MCP when absent (adapter contract, not native acceptance)', async () => {
  const a = adapter(false); await orchestrate('mcp', a, () => {}); assert.deepEqual(a.calls, ['devtools', 'mcp']);
});
test('mcp orchestrator skips DevTools startup when present and reuses ready MCP', async () => {
  const a = adapter(true); await orchestrate('mcp', a, () => {}); await orchestrate('mcp', a, () => {}); assert.deepEqual(a.calls, ['mcp']);
});
test('native launcher is explicitly unsupported on Linux without WSL; launch failure propagates', async () => {
  assert.throws(() => createNativeAdapter({}, 'linux').assertSupported(), /requires Windows or WSL/);
  const a = adapter(false); a.startDevtools = () => { throw new Error('launch failed'); };
  await assert.rejects(orchestrate('mcp', a, () => {}), /launch failed/); assert.deepEqual(a.calls, []);
});
test('safety rejects overlap, non-owned destination, and Git checkout without deleting contents', (t) => {
  const c = fixture(t);
  assert.throws(() => mirror.syncOnce({...c, previewDir: c.sourceDir}), /non-overlapping/);
  assert.throws(() => mirror.syncOnce({...c, previewDir: path.join(c.sourceDir, 'child')}), /non-overlapping/);
  fs.mkdirSync(c.previewDir); fs.writeFileSync(path.join(c.previewDir, 'keep.txt'), 'keep');
  assert.throws(() => mirror.syncOnce(c), /not owned/);
  assert.equal(fs.readFileSync(path.join(c.previewDir, 'keep.txt'), 'utf8'), 'keep');
  fs.mkdirSync(path.join(c.previewDir, '.git'));
  assert.throws(() => mirror.syncOnce(c), /Git checkout/);
});
test('corrupt manifest reports unknown and numeric legacy PID is never killed', async (t) => {
  const c = fixture(t); mirror.syncOnce(c); fs.writeFileSync(c.manifestPath, 'broken');
  assert.equal(mirror.status(c).state, 'unknown');
  fs.mkdirSync(path.dirname(c.pidFile), {recursive: true}); fs.writeFileSync(c.pidFile, String(process.pid));
  await assert.rejects(stopMirror(c), /legacy mirror lock/);
});
test('shell compatibility entries delegate to the same tested Node implementation', () => {
  for (const name of ['weapp-dev', 'weapp-sync-preview']) {
    const source = fs.readFileSync(path.join(__dirname, '../scripts/dev', name + '.sh'), 'utf8');
    assert.ok(source.includes(`exec node "$SCRIPT_DIR/${name}.js"`));
    assert.doesNotMatch(source, /rsync|wslpath|nohup/);
  }
});
test('symlink source is rejected before mirror mutation (junction works without Windows elevation)', (t) => {
  const c = fixture(t); mirror.syncOnce(c);
  const external = path.join(path.dirname(c.sourceDir), 'external'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'keep'), 'private');
  fs.symlinkSync(external, path.join(c.sourceDir, 'miniprogram/link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => mirror.syncOnce(c), /links/);
  assert.equal(fs.readFileSync(path.join(external, 'keep'), 'utf8'), 'private');
  assert.equal(fs.existsSync(path.join(c.previewDir, 'miniprogram/link')), false);
});
test('destination link is removed without following it into another directory', (t) => {
  const c = fixture(t); mirror.syncOnce(c);
  const external = path.join(path.dirname(c.sourceDir), 'external'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'keep'), 'private');
  fs.symlinkSync(external, path.join(c.previewDir, 'miniprogram/link'), process.platform === 'win32' ? 'junction' : 'dir');
  mirror.syncOnce(c);
  assert.equal(fs.readFileSync(path.join(external, 'keep'), 'utf8'), 'private');
  assert.equal(fs.existsSync(path.join(c.previewDir, 'miniprogram/link')), false);
});
test('mirror handles file-directory transitions and rejects malformed timing config', (t) => {
  const c = fixture(t); mirror.syncOnce(c);
  const target = path.join(c.sourceDir, 'miniprogram/app.js'); fs.unlinkSync(target); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'nested.js'), 'nested');
  mirror.syncOnce(c); assert.equal(mirror.status(c).state, 'current');
  fs.rmSync(target, {recursive: true}); fs.writeFileSync(target, 'file'); mirror.syncOnce(c);
  assert.equal(mirror.status(c).state, 'current'); assert.throws(() => mirror.syncOnce({...c, interval: NaN}), /Invalid polling/);
});
test('mirror owner metadata links cannot redirect writes outside the target', (t) => {
  const c = fixture(t); mirror.syncOnce(c);
  const external = path.join(path.dirname(c.sourceDir), 'external'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'keep'), 'private');
  const owner = path.join(c.previewDir, '.weapp-preview-owner.json'); fs.unlinkSync(owner);
  fs.symlinkSync(external, owner, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => mirror.syncOnce(c), /links/i);
  assert.equal(fs.readFileSync(path.join(external, 'keep'), 'utf8'), 'private');
});
