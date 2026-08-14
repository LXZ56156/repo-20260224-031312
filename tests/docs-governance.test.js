'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_DIR = path.resolve(__dirname, '..');
const {
  extractMarkdownLinks,
  findMalformedProjectPaths,
  findVolatileFacts,
  validateRepositoryDocs,
  walkGovernancePathFiles
} = require('../scripts/check-docs');

test('extractMarkdownLinks ignores external and anchor-only links', () => {
  const links = extractMarkdownLinks([
    '[local](../status/project-state.md)',
    '[anchor](#section)',
    '[web](https://example.com)',
    '![image](./image.png)'
  ].join('\n'));
  assert.deepEqual(links, ['../status/project-state.md', './image.png']);
});

test('current governance rejects malformed parenthesized Windows paths', () => {
  assert.equal(findMalformedProjectPaths('D:/projects(WIN)/badminton-miniapp'), false);
  assert.equal(findMalformedProjectPaths('D:\\projects(WIN)\\badminton-miniapp'), false);
  assert.equal(findMalformedProjectPaths('D:/projects/WIN/badminton-miniapp'), true);
  assert.equal(findMalformedProjectPaths('D:/projects/WIN)/badminton-miniapp'), true);
  assert.equal(findMalformedProjectPaths('D:\\projects\\WIN\\badminton-miniapp'), true);
  assert.ok(walkGovernancePathFiles(REPO_DIR).some((file) => file.endsWith('control\\worktrees.json')));
});

test('stable agent entry files reject branch hashes and fixed automation ports', () => {
  assert.deepEqual(findVolatileFacts('Use current state docs only.'), []);
  assert.deepEqual(findVolatileFacts('baseline 5813ffc and ws://127.0.0.1:39420'), [
    'commit hash',
    'fixed automation endpoint'
  ]);
});

test('repository documentation governance passes', () => {
  const result = validateRepositoryDocs(REPO_DIR);
  assert.deepEqual(result.errors, []);
  assert.ok(result.checkedMarkdownFiles >= 50);
  assert.ok(result.checkedLocalLinks >= 1);
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'docs/status/project-state.md')));
});
