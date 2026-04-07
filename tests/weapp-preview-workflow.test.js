const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const SYNC_SCRIPT = path.join(REPO_DIR, 'scripts/dev/weapp-sync-preview.sh');
const DEV_SCRIPT = path.join(REPO_DIR, 'scripts/dev/weapp-dev.sh');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-preview-workflow-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'preview');
  const logDir = path.join(rootDir, 'logs');
  const fakePowerShell = path.join(rootDir, 'fake-powershell.sh');

  writeFile(path.join(sourceDir, 'project.config.json'), '{ "appid": "demo" }\n');
  writeFile(path.join(sourceDir, 'project.private.config.json'), '{ "projectname": "demo" }\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.js'), 'App({});\n');
  writeFile(path.join(sourceDir, 'cloudfunctions/login/index.js'), 'exports.main = async () => ({});\n');
  writeFile(fakePowerShell, '#!/usr/bin/env bash\nexit 0\n');
  fs.chmodSync(fakePowerShell, 0o755);

  const env = {
    ...process.env,
    SOURCE_DIR: sourceDir,
    PREVIEW_DIR: previewDir,
    LOG_DIR: logDir,
    PID_FILE: path.join(logDir, 'weapp-sync-preview.pid'),
    EVENT_STAMP_FILE: path.join(logDir, 'weapp-sync-preview.event'),
    SYNC_LOG: path.join(logDir, 'weapp-sync-preview.log'),
    SYNC_MANIFEST_PATH: path.join(previewDir, '.weapp-preview-sync.json'),
    ALLOW_UNSAFE_PREVIEW_DIR: '1',
    POWERSHELL_EXE: fakePowerShell,
    PROJECT_DIR: sourceDir,
    SYNC_SCRIPT,
    POWERSHELL_SCRIPT: path.join(REPO_DIR, 'scripts/dev/start-weapp-preview.ps1'),
    WEAPP_MCP_WSL_CMD: path.join(rootDir, 'weapp-mcp.cmd'),
    WEAPP_MCP_WINDOWS_CMD: 'D:\\weapp-mcp-launcher\\weapp-mcp.cmd',
    WEAPP_MCP_WINDOWS_DIR: 'D:\\weapp-mcp-launcher',
  };

  writeFile(env.WEAPP_MCP_WSL_CMD, '@echo off\r\n');

  return {
    rootDir,
    sourceDir,
    previewDir,
    env,
  };
}

function runScript(scriptPath, args, env) {
  return execFileSync(scriptPath, args, {
    cwd: REPO_DIR,
    env,
    encoding: 'utf8',
  });
}

test('sync-once writes a manifest and status reports synced-but-stopped mirror', () => {
  const fixture = createFixture();

  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);

  const manifestPath = fixture.env.SYNC_MANIFEST_PATH;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sourceSignature = runScript(SYNC_SCRIPT, ['signature'], fixture.env).trim();
  const previewAppJs = fs.readFileSync(path.join(fixture.previewDir, 'miniprogram/app.js'), 'utf8');
  const statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);

  assert.equal(previewAppJs, 'App({});\n');
  assert.equal(manifest.signature, sourceSignature);
  assert.match(statusOutput, /开发链路：degraded/);
  assert.match(statusOutput, /镜像状态：已同步/);
  assert.match(statusOutput, /自动同步未运行/);
});

test('status reports stale mirror after source changes beyond the last synced manifest', () => {
  const fixture = createFixture();

  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);
  writeFile(path.join(fixture.sourceDir, 'miniprogram/app.js'), 'App({ stale: false });\n');

  const statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);

  assert.match(statusOutput, /开发链路：degraded/);
  assert.match(statusOutput, /镜像状态：已过期/);
  assert.match(statusOutput, /源码已变化/);
});

test('status keeps mirror synced when source only has empty directories pruned by rsync', () => {
  const fixture = createFixture();

  fs.mkdirSync(path.join(fixture.sourceDir, 'miniprogram/styles'), { recursive: true });
  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);

  const statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);

  assert.match(statusOutput, /镜像状态：已同步/);
  assert.doesNotMatch(statusOutput, /镜像状态：已过期/);
});

test('mirror starts background sync and waits until updated source reaches preview', () => {
  const fixture = createFixture();

  try {
    runScript(DEV_SCRIPT, ['mirror'], fixture.env);

    let statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);
    assert.match(statusOutput, /同步状态：running/);
    assert.match(statusOutput, /镜像状态：已同步/);

    writeFile(path.join(fixture.sourceDir, 'miniprogram/app.js'), 'App({ synced: true });\n');

    runScript(DEV_SCRIPT, ['mirror'], fixture.env);

    statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);
    const previewAppJs = fs.readFileSync(path.join(fixture.previewDir, 'miniprogram/app.js'), 'utf8');

    assert.equal(previewAppJs, 'App({ synced: true });\n');
    assert.match(statusOutput, /同步状态：running/);
    assert.match(statusOutput, /镜像状态：已同步/);
  } finally {
    try {
      runScript(DEV_SCRIPT, ['stop'], fixture.env);
    } catch {}
  }
});
