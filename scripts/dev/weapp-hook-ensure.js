#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { runFileSync } = require('../lib/process-runner');

const ROOT = path.resolve(__dirname, '..', '..');

function main() {
  const action = process.argv[2] || 'mirror';
  if (!['mcp', 'mirror'].includes(action)) {
    console.error(`unsupported mode: ${action}`);
    return 1;
  }

  if (process.platform === 'win32') {
    if (action === 'mirror') {
      console.log('Windows source development does not sync the preview mirror after edits.');
      return 0;
    }
    const script = path.join(ROOT, 'scripts', 'dev', 'start-weapp-main.ps1');
    const result = runFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script
    ], { cwd: ROOT, stdio: 'inherit', timeout: 120000 });
    return result.error || result.status == null ? 1 : result.status;
  }

  if (process.env.WEAPP_CODEX_DEV_MODE !== 'wsl-mirror') {
    console.log('Non-Windows mirror hook skipped. Set WEAPP_CODEX_DEV_MODE=wsl-mirror explicitly to enable it.');
    return 0;
  }
  const result = runFileSync('bash', [path.join(ROOT, 'scripts', 'dev', 'weapp-dev.sh'), action], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120000
  });
  return result.error || result.status == null ? 1 : result.status;
}

if (require.main === module) process.exit(main());

module.exports = { main };
