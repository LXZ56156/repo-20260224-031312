const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {collectPreflight} = require('../scripts/environment-preflight');

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-preflight-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: 'badminton-miniapp'}));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({lockfileVersion: 3}));
    fs.mkdirSync(path.join(root, 'tmp'));
    const options = {root, cacheDir: root, resolveBash: () => process.execPath, resolveDependency: () => process.execPath, loadCanvas: () => {}};
    run(root, options);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
test('preflight reports read-only readiness and leaves the checkout unchanged', () => fixture((root, options) => {
  const before = fs.readdirSync(root);
  const result = collectPreflight(options);
  assert.equal(result.ready, true);
  assert.equal(result.readOnly, true);
  assert.deepEqual(fs.readdirSync(root), before);
  assert.ok(result.checks.some((item) => item.id === 'platform-runtime' && item.status === 'unverified'));
}));
test('preflight identifies missing tmp and dependencies without creating them', () => fixture((root, options) => {
  fs.rmdirSync(path.join(root, 'tmp'));
  options.resolveDependency = () => { throw new Error('MODULE_NOT_FOUND'); };
  const result = collectPreflight(options);
  assert.equal(result.ready, false);
  assert.equal(fs.existsSync(path.join(root, 'tmp')), false);
  assert.ok(result.checks.some((item) => item.id === 'dependencies' && item.status === 'fail'));
}));
test('preflight catches canvas ABI and shell failures without exposing exception text', () => fixture((_root, options) => {
  options.loadCanvas = () => { throw new Error('private-token-in-error'); };
  options.resolveBash = () => { throw new Error('private-token-in-error'); };
  const result = collectPreflight(options);
  assert.equal(result.ready, false);
  assert.ok(result.checks.some((item) => item.id === 'canvas-native' && item.status === 'fail'));
  assert.equal(JSON.stringify(result).includes('private-token'), false);
}));
test('preflight does not assume the default npm cache is the configured cache', () => fixture((_root, options) => {
  options.cacheDir = '';
  const result = collectPreflight(options);
  assert.ok(result.checks.some((item) => item.id === 'npm-cache-access' && item.status === 'unverified'));
}));
test('preflight rejects the registered project parent as the actual checkout', () => fixture((root, options) => {
  fs.unlinkSync(path.join(root, 'package.json'));
  assert.equal(collectPreflight(options).ready, false);
}));
