'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  'scripts',
  'analysis',
  'data-baseline-export-readonly.ps1'
);
const script = fs.readFileSync(SCRIPT_PATH, 'utf8');

test('database exporter allowlists collections and requires an exact worktree session', () => {
  assert.match(script, /ValidateSet\('tournaments', 'client_request_logs'\)/);
  assert.match(script, /Test-WeappSessionRecord/);
  assert.match(script, /-ProjectDir \$repoRoot/);
  assert.match(script, /-Role source/);
  assert.match(script, /OutputPath must be inside data\/we-analysis\//);
});

test('database exporter uses bounded keyset reads and consecutive snapshot hashes', () => {
  assert.match(script, /ValidateRange\(1, 20\)/);
  assert.match(script, /command\.gt\(afterId\)/);
  assert.match(script, /orderBy\('_id', 'asc'\)/);
  assert.match(script, /Duplicate _id detected/);
  assert.match(script, /No two consecutive .* snapshots matched/);
  assert.match(script, /countBefore/);
  assert.match(script, /countAfter/);
});

test('database exporter contains no cloud mutation calls', () => {
  const forbidden = [
    /\.add\s*\(/,
    /\.update\s*\(/,
    /\.set\s*\(/,
    /\.remove\s*\(/,
    /callFunction\s*\(\s*\{[^}]*name\s*:/s
  ];
  forbidden.forEach((pattern) => assert.doesNotMatch(script, pattern));
  assert.match(script, /RemoteWritesExecuted = \$false/);
});
