#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { runFileSync } = require('../lib/process-runner');

const ROOT = path.resolve(__dirname, '..', '..');

function run(script, args = []) {
  return runFileSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit'
  });
}

function main() {
  run('scripts/dev/weapp-hook-ensure.js', ['mirror']);
  const lint = run('scripts/run-eslint.js', ['--fix']);
  if (lint.error || lint.status !== 0) {
    console.warn('ESLint --fix failed; review the changed files before reporting.');
  }
  const tests = run('scripts/run-node-tests.js');
  if (tests.error || tests.status !== 0) {
    console.warn('Tests failed; review before reporting.');
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { main };
