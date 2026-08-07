#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const eslintBin = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const targets = [
  'miniprogram/**/*.js',
  'cloudfunctions/**/*.js',
  'tests/**/*.js',
  'scripts/**/*.js',
];

function main() {
  if (!fs.existsSync(eslintBin)) {
    console.error('Local ESLint is not installed. Run npm install first.');
    return 1;
  }
  const result = spawnSync(process.execPath, [eslintBin, ...targets], {
    cwd: ROOT,
    env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'true' },
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to start ESLint: ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { main };
