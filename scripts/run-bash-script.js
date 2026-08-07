#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGitBash, toGitBashPath } = require('./lib/git-bash');

const ROOT = path.resolve(__dirname, '..');

function main() {
  const [scriptName, ...args] = process.argv.slice(2);
  if (!scriptName) {
    console.error('Usage: node scripts/run-bash-script.js <repo-script.sh> [args...]');
    return 1;
  }

  const scriptPath = path.resolve(ROOT, scriptName);
  const relative = path.relative(ROOT, scriptPath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(scriptPath) !== '.sh') {
    console.error(`Refusing to run a shell script outside the repository: ${scriptName}`);
    return 1;
  }
  if (!fs.existsSync(scriptPath)) {
    console.error(`Shell script not found: ${scriptPath}`);
    return 1;
  }

  let command;
  try {
    command = resolveGitBash();
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const scriptArg = process.platform === 'win32' ? toGitBashPath(scriptPath) : scriptPath;
  const result = spawnSync(command, [scriptArg, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to start shell script: ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { main };
