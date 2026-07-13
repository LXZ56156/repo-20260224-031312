#!/usr/bin/env node
'use strict';

const path = require('path');
const cp = require('child_process');

const repoDir = path.resolve(__dirname, '..', '..');

if (process.platform === 'win32') {
  const result = cp.spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(repoDir, '.codex', 'hooks', 'windows_weapp_stop.ps1')
  ], {
    cwd: repoDir,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status == null ? 1 : result.status);
}

process.exit(0);
