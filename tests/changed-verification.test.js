'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const path = require('node:path');
const {
  buildVerificationPlan,
  mergeChangedFiles,
  resolveInvocation
} = require('../scripts/run-changed-verification');

test('changed file discovery includes untracked files and normalizes separators', () => {
  assert.deepEqual(mergeChangedFiles(
    ['docs\\README.md', 'package.json'],
    ['scripts/new-tool.js', 'docs/README.md']
  ), ['docs/README.md', 'package.json', 'scripts/new-tool.js']);
});

test('npm commands use the npm CLI through Node without a shell', () => {
  const [command, args] = resolveInvocation('npm', ['run', 'docs:check']);
  assert.equal(command, process.execPath);
  assert.match(path.normalize(args[0]), /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
  assert.deepEqual(args.slice(1), ['run', 'docs:check']);
});

test('documentation-only changes use the fast governance gate', () => {
  assert.deepEqual(buildVerificationPlan(['docs/README.md', 'AGENTS.md']), [
    ['node', ['--test', 'tests/docs-governance.test.js', 'tests/repo-inventory.test.js']],
    ['npm', ['run', 'docs:check']],
    ['git', ['diff', '--check']]
  ]);
});

test('tooling changes use the maintained light verification set', () => {
  assert.deepEqual(buildVerificationPlan(['scripts/check-docs.js', 'package.json']), [
    ['npm', ['run', 'verify:light']],
    ['npm', ['run', 'docs:check']],
    ['git', ['diff', '--check']]
  ]);
});

test('product and cloud changes fail safe to full verification', () => {
  for (const file of ['miniprogram/pages/home/index.js', 'cloudfunctions/login/index.js']) {
    assert.deepEqual(buildVerificationPlan([file]), [
      ['npm', ['run', 'verify:full']]
    ]);
  }
});
