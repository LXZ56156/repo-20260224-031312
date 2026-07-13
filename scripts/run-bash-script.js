#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveWeappLocalConfig, toGitBashPath } = require('./lib/weapp-local-config');
const { runFileSync } = require('./lib/process-runner');

const ROOT = path.resolve(__dirname, '..');

function main() {
  const [scriptName, ...args] = process.argv.slice(2);
  if (!scriptName) {
    console.error('Usage: node scripts/run-bash-script.js <repo-script.sh> [args...]');
    return 1;
  }
  const scriptPath = path.resolve(ROOT, scriptName);
  const relative = path.relative(ROOT, scriptPath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !scriptPath.endsWith('.sh')) {
    console.error(`Refusing to run a shell script outside the repository: ${scriptName}`);
    return 1;
  }
  if (!fs.existsSync(scriptPath)) {
    console.error(`Shell script not found: ${scriptPath}`);
    return 1;
  }

  const config = resolveWeappLocalConfig({ repoDir: ROOT });
  const command = process.platform === 'win32' ? config.gitBash : (process.env.WEAPP_BASH || 'bash');
  const scriptArg = process.platform === 'win32' ? toGitBashPath(scriptPath) : scriptPath;
  if (process.platform === 'win32' && !fs.existsSync(command)) {
    console.error(`Git Bash is required only for this legacy/guarded action and was not found: ${command}`);
    return 1;
  }
  const result = runFileSync(command, [scriptArg, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`Unable to start shell script: ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { main };
