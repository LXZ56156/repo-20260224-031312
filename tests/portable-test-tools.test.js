const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {check} = require('../scripts/check-cloud-common');
const {testArguments} = require('../scripts/run-tests');
test('test runner expands files in Node, supports spaces and explicit concurrency, and rejects an empty suite', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test tools 中文 ')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'tests'));
  assert.throws(() => testArguments(root), /No test files/);
  fs.writeFileSync(path.join(root, 'tests/a file.test.js'), '');
  assert.deepEqual(testArguments(root), ['--test', '--test-concurrency=1', 'tests/a file.test.js']);
  assert.deepEqual(testArguments(root, ['--test-concurrency=2', 'tests/a file.test.js']), ['--test', '--test-concurrency=2', 'tests/a file.test.js']);
});
test('cloud common check fails for missing or mismatched bytes and succeeds only for identical files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud check ')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'scripts')); fs.mkdirSync(path.join(root, 'cloudfunctions/fn/lib'), {recursive: true});
  fs.writeFileSync(path.join(root, 'scripts/cloud-common.template.js'), 'expected\r\n');
  assert.match(check(root)[0], /missing/);
  fs.writeFileSync(path.join(root, 'cloudfunctions/fn/lib/common.js'), 'expected\n'); assert.match(check(root)[0], /mismatch/);
  fs.writeFileSync(path.join(root, 'cloudfunctions/fn/lib/common.js'), 'expected\r\n'); assert.deepEqual(check(root), []);
});
