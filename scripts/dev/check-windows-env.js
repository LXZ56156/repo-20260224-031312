#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repoDir = path.resolve(__dirname, '..', '..');
const expectedProject = 'D:\\projects\\badminton-miniapp';
const expectedEndpoint = 'ws://127.0.0.1:39420';
const expectedLauncher = 'D:\\weapp-mcp-launcher\\weapp-main-dev.cmd';
const expectedPreviewLauncher = 'D:\\weapp-mcp-launcher\\weapp-mcp.cmd';
const expectedPreviewProject = 'D:\\projects\\badminton-miniapp-preview';
const expectedCli = 'D:\\Soft\\微信web开发者工具\\cli.bat';

const rows = [];

function run(command, args) {
  const result = cp.spawnSync(command, args, {
    cwd: repoDir,
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

function add(status, name, detail) {
  rows.push({ status, name, detail: detail || '' });
}

function ok(name, detail) {
  add('ok', name, detail);
}

function warn(name, detail) {
  add('warn', name, detail);
}

function fail(name, detail) {
  add('fail', name, detail);
}

function exists(label, filePath, required) {
  if (fs.existsSync(filePath)) {
    ok(label, filePath);
    return true;
  }
  (required ? fail : warn)(label, `missing: ${filePath}`);
  return false;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitConfig(key) {
  const result = run('git', ['config', '--global', '--get', key]);
  return result.ok ? result.stdout : '';
}

function npmConfig(key) {
  const envKey = `npm_config_${key.replace(/-/g, '_')}`;
  const envValue = process.env[envKey] || process.env[envKey.toUpperCase()];
  if (envValue) return envValue;

  const result = process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', `npm config get ${key}`])
    : run('npm', ['config', 'get', key]);
  return result.ok ? result.stdout : '';
}

function readEnvKeys(filePath) {
  const keys = new Set();
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*)=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function readEnvValue(filePath, key) {
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match && match[1] === key) return match[2].trim().replace(/^"|"$/g, '');
  }
  return '';
}

if (process.platform !== 'win32') {
  warn('platform', `expected win32 for this local check, got ${process.platform}`);
} else {
  ok('platform', process.platform);
}

if (repoDir.toLowerCase() === expectedProject.toLowerCase()) {
  ok('project path', repoDir);
} else {
  warn('project path', `current=${repoDir}; expected=${expectedProject}`);
}

const autocrlf = gitConfig('core.autocrlf');
const longpaths = gitConfig('core.longpaths');
autocrlf === 'false' ? ok('git core.autocrlf', autocrlf) : fail('git core.autocrlf', `expected false, got ${autocrlf || '<unset>'}`);
longpaths === 'true' ? ok('git core.longpaths', longpaths) : fail('git core.longpaths', `expected true, got ${longpaths || '<unset>'}`);

const scriptShell = npmConfig('script-shell');
if (/Git[\\/]bin[\\/]bash\.exe$/i.test(scriptShell)) {
  ok('npm script-shell', scriptShell);
} else {
  fail('npm script-shell', `expected Git Bash, got ${scriptShell || '<unset>'}`);
}

exists('DevTools main launcher', expectedLauncher, process.platform === 'win32');
exists('DevTools preview launcher', expectedPreviewLauncher, false);
exists('DevTools CLI', expectedCli, process.platform === 'win32');
exists('legacy preview project', expectedPreviewProject, false);

const envLocal = path.join(repoDir, '.env.local');
if (exists('.env.local', envLocal, false)) {
  const keys = readEnvKeys(envLocal);
  for (const key of ['WX_APPID', 'WX_APPSECRET', 'WX_PRIVATE_KEY_PATH', 'MP_ROBOT']) {
    keys.has(key) ? ok(`.env.local ${key}`, '<redacted>') : warn(`.env.local ${key}`, 'missing');
  }
  const privateKeyPath = readEnvValue(envLocal, 'WX_PRIVATE_KEY_PATH');
  if (privateKeyPath) {
    exists('WX_PRIVATE_KEY_PATH target', privateKeyPath, false);
  }
}

const mcpPath = path.join(repoDir, '.mcp.json');
if (exists('.mcp.json', mcpPath, false)) {
  const mcp = readJson(mcpPath);
  const servers = mcp.mcpServers || {};
  for (const name of ['context7', 'playwright', 'cloudbase', 'weapp_dev']) {
    servers[name] ? ok(`mcp server ${name}`, 'present') : warn(`mcp server ${name}`, 'missing');
  }
  const endpoint = servers.weapp_dev && servers.weapp_dev.env && servers.weapp_dev.env.WEAPP_WS_ENDPOINT;
  endpoint === expectedEndpoint ? ok('weapp_dev endpoint', endpoint) : warn('weapp_dev endpoint', `expected ${expectedEndpoint}, got ${endpoint || '<unset>'}`);
}

exists('.claude/settings.json', path.join(repoDir, '.claude', 'settings.json'), false);
exists('.claude/settings.local.json', path.join(repoDir, '.claude', 'settings.local.json'), false);
exists('.claude/agents/weapp-analyst.md', path.join(repoDir, '.claude', 'agents', 'weapp-analyst.md'), false);
exists('project.private.config.json', path.join(repoDir, 'project.private.config.json'), false);
exists('.vscode/settings.json', path.join(repoDir, '.vscode', 'settings.json'), false);

const postCommit = path.join(repoDir, '.git', 'hooks', 'post-commit');
if (exists('.git/hooks/post-commit', postCommit, false)) {
  const hookText = fs.readFileSync(postCommit, 'utf8');
  if (/badminton-miniapp cloud post-commit deploy hook/.test(hookText) && /post-commit-cloud-deploy\.sh/.test(hookText)) {
    ok('post-commit hook content', 'badminton-miniapp cloud post-commit deploy hook');
  } else {
    warn('post-commit hook content', 'unexpected local hook content');
  }
}

exists('Codex config', path.join(repoDir, '.codex', 'config.toml'), true);
exists('Codex hooks config', path.join(repoDir, '.codex', 'hooks.json'), true);
exists('Codex cross-platform preflight', path.join(repoDir, '.codex', 'hooks', 'weapp_preflight.js'), true);
exists('Codex cross-platform stop', path.join(repoDir, '.codex', 'hooks', 'weapp_stop.js'), true);
exists('Codex Windows preflight', path.join(repoDir, '.codex', 'hooks', 'windows_weapp_preflight.ps1'), true);
exists('Codex Windows stop', path.join(repoDir, '.codex', 'hooks', 'windows_weapp_stop.ps1'), true);

for (const row of rows) {
  const prefix = row.status === 'ok' ? '[OK]' : row.status === 'warn' ? '[WARN]' : '[FAIL]';
  console.log(`${prefix} ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
}

const failures = rows.filter((row) => row.status === 'fail');
if (failures.length) {
  console.error(`Windows environment check failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log('Windows environment check completed.');
