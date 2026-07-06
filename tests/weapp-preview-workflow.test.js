const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const SYNC_SCRIPT = path.join(REPO_DIR, 'scripts/dev/weapp-sync-preview.sh');
const DEV_SCRIPT = path.join(REPO_DIR, 'scripts/dev/weapp-dev.sh');
const WINDOWS_GIT_BASH = process.env.npm_config_script_shell || process.env.NPM_CONFIG_SCRIPT_SHELL || 'D:\\Soft\\Git\\bin\\bash.exe';
const SKIP_LEGACY_RUNTIME = process.platform === 'win32' && process.env.WEAPP_PREVIEW_WORKFLOW_RUNTIME_TESTS !== '1';

function legacyRuntimeTest(name, fn) {
  test(name, { skip: SKIP_LEGACY_RUNTIME ? 'legacy WSL mirror runtime is static-checked on Windows' : false }, fn);
}

function toGitBashPath(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-preview-workflow-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'preview');
  const logDir = path.join(rootDir, 'logs');
  const fakeBinDir = path.join(rootDir, 'bin');
  const fakeRsync = path.join(fakeBinDir, 'rsync');
  const fakeWslpath = path.join(fakeBinDir, 'wslpath');
  const fakePowerShell = path.join(rootDir, 'fake-powershell.sh');
  const fakePowerShellLog = path.join(rootDir, 'fake-powershell.log');
  const fakeDevtoolsState = path.join(rootDir, 'fake-devtools.running');
  const fakeMcpState = path.join(rootDir, 'fake-mcp.ready');

  writeFile(path.join(sourceDir, 'project.config.json'), '{ "appid": "demo" }\n');
  writeFile(path.join(sourceDir, 'project.private.config.json'), '{ "projectname": "demo" }\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.js'), 'App({});\n');
  writeFile(path.join(sourceDir, 'cloudfunctions/login/index.js'), 'exports.main = async () => ({});\n');
  writeFile(
    fakeRsync,
    `#!/usr/bin/env bash
set -euo pipefail

args=("$@")
count="\${#args[@]}"
source_dir="\${args[$((count - 2))]%/}"
preview_dir="\${args[$((count - 1))]%/}"

rm -rf "$preview_dir"
mkdir -p "$preview_dir"
for item in project.config.json project.private.config.json miniprogram cloudfunctions miniprogram_npm; do
  if [[ -e "$source_dir/$item" ]]; then
    cp -a "$source_dir/$item" "$preview_dir/"
  fi
done
`
  );
  writeFile(
    fakeWslpath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "-w" ]]; then
  printf '%s\\n' "\${2:-}"
else
  printf '%s\\n' "\${1:-}"
fi
`
  );
  writeFile(
    fakePowerShell,
    `#!/usr/bin/env bash
set -euo pipefail

log_file="\${FAKE_POWERSHELL_LOG:-}"
if [[ -n "$log_file" ]]; then
  printf '%s\\n' "$*" >> "$log_file"
fi

args="$*"

if [[ "$args" == *"probe-tool-info"* ]]; then
  [[ -f "\${FAKE_MCP_STATE_FILE:-}" ]] && exit 0
  exit 1
fi

if [[ "$args" == *"Get-CimInstance Win32_Process"* ]]; then
  [[ -f "\${FAKE_DEVTOOLS_STATE_FILE:-}" ]] && exit 0
  exit 1
fi

if [[ "$args" == *"${'${WEAPP_MCP_WINDOWS_CMD:-}'}"* ]]; then
  touch "\${FAKE_MCP_STATE_FILE:-/tmp/fake-mcp.ready}"
  exit 0
fi

if [[ "$args" == *"-File"* ]]; then
  touch "\${FAKE_DEVTOOLS_STATE_FILE:-/tmp/fake-devtools.running}"
  exit 0
fi

exit 0
`
  );
  fs.chmodSync(fakeRsync, 0o755);
  fs.chmodSync(fakeWslpath, 0o755);
  fs.chmodSync(fakePowerShell, 0o755);
  fs.writeFileSync(fakePowerShellLog, '', 'utf8');
  fs.writeFileSync(fakeMcpState, '', 'utf8');

  const manifestPath = path.join(previewDir, '.weapp-preview-sync.json');
  const mcpWslCmd = path.join(rootDir, 'weapp-mcp.cmd');
  const env = {
    ...process.env,
    SOURCE_DIR: toGitBashPath(sourceDir),
    PREVIEW_DIR: toGitBashPath(previewDir),
    LOG_DIR: toGitBashPath(logDir),
    PID_FILE: toGitBashPath(path.join(logDir, 'weapp-sync-preview.pid')),
    EVENT_STAMP_FILE: toGitBashPath(path.join(logDir, 'weapp-sync-preview.event')),
    SYNC_LOG: toGitBashPath(path.join(logDir, 'weapp-sync-preview.log')),
    SYNC_MANIFEST_PATH: toGitBashPath(manifestPath),
    SYNC_WATCH_MODE: 'test-once',
    WEAPP_SYNC_PREVIEW_FAST_SIGNATURE: '1',
    POLL_INTERVAL_SECONDS: '0.1',
    DEBOUNCE_MILLISECONDS: '100',
    MIRROR_WAIT_SECONDS: '30',
    SYNC_START_WAIT_SECONDS: '15',
    ALLOW_UNSAFE_PREVIEW_DIR: '1',
    POWERSHELL_EXE: toGitBashPath(fakePowerShell),
    PROJECT_DIR: toGitBashPath(sourceDir),
    SYNC_SCRIPT: toGitBashPath(SYNC_SCRIPT),
    POWERSHELL_SCRIPT: toGitBashPath(path.join(REPO_DIR, 'scripts/dev/start-weapp-preview.ps1')),
    WEAPP_MCP_WSL_CMD: toGitBashPath(mcpWslCmd),
    WEAPP_MCP_WINDOWS_CMD: 'D:\\weapp-mcp-launcher\\weapp-mcp.cmd',
    WEAPP_MCP_WINDOWS_DIR: 'D:\\weapp-mcp-launcher',
    FAKE_POWERSHELL_LOG: toGitBashPath(fakePowerShellLog),
    FAKE_DEVTOOLS_STATE_FILE: toGitBashPath(fakeDevtoolsState),
    FAKE_MCP_STATE_FILE: toGitBashPath(fakeMcpState),
    PATH: `${toGitBashPath(fakeBinDir)}${path.delimiter}${process.env.PATH || ''}`,
  };

  writeFile(mcpWslCmd, '@echo off\r\n');

  return {
    rootDir,
    sourceDir,
    previewDir,
    manifestPath,
    fakePowerShellLog,
    fakeDevtoolsState,
    fakeMcpState,
    env,
  };
}

function runScript(scriptPath, args, env) {
  const command = process.platform === 'win32' && scriptPath.endsWith('.sh') ? WINDOWS_GIT_BASH : scriptPath;
  const commandArgs = command === scriptPath ? args : [toGitBashPath(scriptPath), ...args];

  return execFileSync(command, commandArgs, {
    cwd: REPO_DIR,
    env,
    encoding: 'utf8',
  });
}

test('legacy preview/upload mirror scripts are retained but not required for Windows daily development', () => {
  const syncScript = fs.readFileSync(SYNC_SCRIPT, 'utf8');
  const devScript = fs.readFileSync(DEV_SCRIPT, 'utf8');

  assert.match(syncScript, /ACTION="\$\{1:-run\}"/);
  assert.match(syncScript, /sync-once\)/);
  assert.match(syncScript, /ensure_safe_preview_dir/);
  assert.match(syncScript, /rsync "\$\{RSYNC_ARGS\[@\]\}"/);
  assert.match(syncScript, /test-once\)/);
  assert.match(devScript, /ACTION="\$\{1:-mcp\}"/);
  assert.match(devScript, /mcp\|start\)/);
  assert.match(devScript, /mirror\)/);
  assert.match(devScript, /preview\)/);
  assert.match(devScript, /status\)/);
  assert.match(devScript, /stop\)/);
  assert.match(devScript, /SYNC_START_WAIT_SECONDS/);
  assert.match(devScript, /normalize_compare_path/);
  assert.match(devScript, /D:\\\\weapp-mcp-launcher\\\\weapp-mcp\.cmd/);
});

legacyRuntimeTest('sync-once writes a manifest and status reports synced-but-stopped mirror', () => {
  const fixture = createFixture();

  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);

  const manifestPath = fixture.manifestPath;
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

legacyRuntimeTest('status reports stale mirror after source changes beyond the last synced manifest', () => {
  const fixture = createFixture();

  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);
  writeFile(path.join(fixture.sourceDir, 'miniprogram/app.js'), 'App({ stale: false });\n');

  const statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);

  assert.match(statusOutput, /开发链路：degraded/);
  assert.match(statusOutput, /镜像状态：已过期/);
  assert.match(statusOutput, /源码已变化/);
});

legacyRuntimeTest('status keeps mirror synced when source only has empty directories pruned by rsync', () => {
  const fixture = createFixture();

  fs.mkdirSync(path.join(fixture.sourceDir, 'miniprogram/styles'), { recursive: true });
  runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);

  const statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);

  assert.match(statusOutput, /镜像状态：已同步/);
  assert.doesNotMatch(statusOutput, /镜像状态：已过期/);
});

legacyRuntimeTest('mirror starts background sync and waits until updated source reaches preview', () => {
  const fixture = createFixture();

  try {
    runScript(DEV_SCRIPT, ['mirror'], fixture.env);

    let statusOutput = runScript(DEV_SCRIPT, ['status'], fixture.env);
    assert.match(statusOutput, /同步状态：running/);
    assert.match(statusOutput, /镜像状态：已同步/);

    writeFile(path.join(fixture.sourceDir, 'miniprogram/app.js'), 'App({ synced: true });\n');
    runScript(SYNC_SCRIPT, ['sync-once'], fixture.env);

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

legacyRuntimeTest('mcp starts wechat preview script first when devtools is not running', () => {
  const fixture = createFixture();

  try {
    fs.rmSync(fixture.fakeMcpState, { force: true });
    fs.rmSync(fixture.fakeDevtoolsState, { force: true });

    const output = runScript(DEV_SCRIPT, ['mcp'], fixture.env);
    const logLines = fs.readFileSync(fixture.fakePowerShellLog, 'utf8').trim().split('\n').filter(Boolean);

    assert.match(output, /启动微信开发者工具预览/);
    assert.ok(fs.existsSync(fixture.fakeDevtoolsState));
    assert.ok(fs.existsSync(fixture.fakeMcpState));
    assert.ok(logLines.some((line) => line.includes('-File') && line.includes('start-weapp-preview.ps1')));
    assert.ok(logLines.some((line) => line.includes(fixture.env.WEAPP_MCP_WINDOWS_CMD)));
  } finally {
    try {
      runScript(DEV_SCRIPT, ['stop'], fixture.env);
    } catch {}
  }
});

legacyRuntimeTest('mcp skips wechat preview startup when devtools is already running', () => {
  const fixture = createFixture();

  try {
    fs.writeFileSync(fixture.fakeDevtoolsState, '', 'utf8');
    fs.rmSync(fixture.fakeMcpState, { force: true });

    const output = runScript(DEV_SCRIPT, ['mcp'], fixture.env);
    const logLines = fs.readFileSync(fixture.fakePowerShellLog, 'utf8').trim().split('\n').filter(Boolean);

    assert.doesNotMatch(output, /启动微信开发者工具预览/);
    assert.ok(logLines.some((line) => line.includes(fixture.env.WEAPP_MCP_WINDOWS_CMD)));
    assert.ok(!logLines.some((line) => line.includes('-File') && line.includes('start-weapp-preview.ps1')));
  } finally {
    try {
      runScript(DEV_SCRIPT, ['stop'], fixture.env);
    } catch {}
  }
});
