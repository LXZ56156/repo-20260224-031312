#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { runFileSync } = require('./lib/process-runner');

const ROOT = path.resolve(__dirname, '..');
const defaultPatterns = [
  'miniprogram/**/*.js',
  'cloudfunctions/**/*.js',
  'tests/**/*.js',
  'scripts/**/*.js'
];

function resolveEslintArgs(args) {
  const supplied = Array.isArray(args) ? [...args] : [];
  const optionsWithValues = new Set([
    '-c', '-f', '-o',
    '--cache-location', '--cache-strategy', '--config', '--env', '--ext', '--fix-type',
    '--format', '--global', '--ignore-path', '--ignore-pattern', '--max-warnings',
    '--output-file', '--parser', '--parser-options', '--plugin',
    '--report-unused-disable-directives-severity', '--resolve-plugins-relative-to',
    '--rule', '--rulesdir', '--stdin-filename'
  ]);
  let hasExplicitTarget = false;
  for (let index = 0; index < supplied.length; index += 1) {
    const value = String(supplied[index]);
    if (optionsWithValues.has(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith('-')) continue;
    hasExplicitTarget = true;
    break;
  }
  return supplied.length === 0 || !hasExplicitTarget
    ? [...supplied, ...defaultPatterns]
    : supplied;
}

function main() {
  const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');
  const args = resolveEslintArgs(process.argv.slice(2));
  const result = runFileSync(process.execPath, [eslintBin, ...args], {
    cwd: ROOT,
    env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'true' },
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`Unable to start ESLint: ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { defaultPatterns, main, resolveEslintArgs };
