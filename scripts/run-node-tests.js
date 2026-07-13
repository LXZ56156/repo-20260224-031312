#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runFileSync } = require('./lib/process-runner');

const ROOT = path.resolve(__dirname, '..');

function discoverTests() {
  return fs.readdirSync(path.join(ROOT, 'tests'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join('tests', entry.name))
    .sort();
}

function main() {
  const requested = process.argv.slice(2);
  const filesAndOptions = requested.length ? requested : discoverTests();
  const result = runFileSync(process.execPath, ['--test', '--test-concurrency=1', ...filesAndOptions], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`Unable to start node:test: ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { discoverTests, main };
