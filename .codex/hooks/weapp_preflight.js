#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repoDir = path.resolve(__dirname, '..', '..');
const payload = fs.readFileSync(0, 'utf8');

const keywords = [
  String.fromCharCode(0x5fae, 0x4fe1),
  String.fromCharCode(0x5c0f, 0x7a0b, 0x5e8f),
  'weapp',
  'devtools',
  String.fromCharCode(0x5f00, 0x53d1, 0x8005, 0x5de5, 0x5177),
  String.fromCharCode(0x622a, 0x56fe),
  'ui'
];

function shouldRunPreflight(input) {
  if (process.env.WEAPP_PREFLIGHT_FORCE === '1') return true;
  if (!input || !input.trim()) return false;
  const haystack = input.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd: repoDir,
    input: options.input || '',
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status == null ? 1 : result.status);
}

if (!shouldRunPreflight(payload)) {
  console.log('No weapp-related prompt detected; skip Codex weapp preflight.');
  process.exit(0);
}

if (process.platform === 'win32') {
  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(repoDir, '.codex', 'hooks', 'windows_weapp_preflight.ps1')
  ], { input: payload });
}

if (process.env.WEAPP_CODEX_DEV_MODE === 'wsl-mirror') {
  run('bash', [path.join(repoDir, 'scripts', 'dev', 'weapp-dev.sh'), 'mcp']);
}

console.log('Non-Windows Codex preflight skipped. Set WEAPP_CODEX_DEV_MODE=wsl-mirror to use the legacy preview mirror.');
process.exit(0);
