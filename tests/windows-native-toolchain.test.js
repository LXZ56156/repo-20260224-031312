const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeComparablePath,
  resolveWeappLocalConfig,
  toGitBashPath,
  validateProjectLayout,
  windowsToWslPath
} = require('../scripts/lib/weapp-local-config');
const { runFileSync } = require('../scripts/lib/process-runner');
const {
  auditPowerShellLauncher,
  validateLauncherAudit
} = require('../scripts/lib/weapp-launcher-audit');
const { hasTrustedProjectPath } = require('../scripts/dev/check-windows-env');

const REPO_DIR = path.resolve(__dirname, '..');

function createProject(rootDir, role = 'source') {
  fs.mkdirSync(path.join(rootDir, 'miniprogram'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'project.config.json'), '{}\n');
  fs.writeFileSync(path.join(rootDir, 'miniprogram', 'app.js'), 'App({});\n');
  if (role === 'source') {
    fs.mkdirSync(path.join(rootDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'package.json'), '{"name":"fixture"}\n');
  }
}

test('local config derives source and preview paths from a repo containing spaces and parentheses', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp workspace (WIN) [literal] '));
  const repoDir = path.join(parent, 'badminton miniapp (source)');
  createProject(repoDir);

  const config = resolveWeappLocalConfig({ repoDir, env: {}, platform: 'win32' });

  assert.equal(config.sourceDir, path.resolve(repoDir));
  assert.equal(config.previewDir, path.join(parent, 'badminton-miniapp-preview'));
  assert.equal(config.wsEndpoint, 'ws://127.0.0.1:39420');
  assert.equal(config.autoPort, 39420);
  assert.equal(validateProjectLayout(config.sourceDir, 'source').ok, true);
});

test('local config keeps path overrides as literal argument values', () => {
  const repoDir = path.join(os.tmpdir(), 'repo (WIN) with spaces');
  const previewDir = path.join(os.tmpdir(), 'preview (WIN) with spaces');
  const config = resolveWeappLocalConfig({
    repoDir,
    platform: 'win32',
    env: {
      WEAPP_PREVIEW_DIR: previewDir,
      WEAPP_MAIN_LAUNCHER: 'E:\\launchers (local)\\main.cmd',
      WEAPP_PREVIEW_LAUNCHER: 'E:\\launchers (local)\\preview.cmd',
      WEAPP_DEVTOOLS_CLI: 'E:\\WeChat Tools (x64)\\cli.bat',
      WEAPP_WS_ENDPOINT: 'ws://127.0.0.1:49555'
    }
  });

  assert.equal(config.previewDir, path.resolve(previewDir));
  assert.equal(config.mainLauncher, 'E:\\launchers (local)\\main.cmd');
  assert.equal(config.previewLauncher, 'E:\\launchers (local)\\preview.cmd');
  assert.equal(config.devtoolsCli, 'E:\\WeChat Tools (x64)\\cli.bat');
  assert.equal(config.autoPort, 49555);
});

test('Windows path conversions preserve spaces and parentheses', () => {
  const value = 'D:\\projects (local)\\(WIN)\\badminton-miniapp';

  assert.equal(toGitBashPath(value), '/d/projects (local)/(WIN)/badminton-miniapp');
  assert.equal(windowsToWslPath(value), '/mnt/d/projects (local)/(WIN)/badminton-miniapp');
  assert.equal(
    normalizeComparablePath('D:\\Projects (Local)\\Demo\\', { platform: 'win32' }),
    normalizeComparablePath('d:\\projects (local)\\demo', { platform: 'win32' })
  );
});

test('Codex trusted path audit distinguishes a parenthesized directory from an extra path segment', () => {
  const configText = [
    '[projects]',
    '"D:\\\\projects(WIN)\\\\badminton-miniapp" = { trust_level = "trusted" }',
    '"/home/lizixuan/projects(WSL)/badminton-miniapp" = { trust_level = "trusted" }'
  ].join('\n');

  assert.equal(hasTrustedProjectPath(configText, 'D:\\projects(WIN)\\badminton-miniapp'), true);
  assert.equal(hasTrustedProjectPath(configText, 'D:\\projects\\(WIN)\\badminton-miniapp'), false);
  assert.equal(hasTrustedProjectPath(configText, '/home/lizixuan/projects(WSL)/badminton-miniapp'), true);
});

test('Codex trusted path audit requires trust_level trusted on the same assignment', () => {
  const projectPath = 'D:\\projects(WIN)\\badminton-miniapp';
  const untrusted = `${JSON.stringify(projectPath)} = { trust_level = "untrusted" }`;
  const empty = `${JSON.stringify(projectPath)} = {}`;
  const trustedElsewhere = [
    empty,
    '"D:\\\\another-repo" = { trust_level = "trusted" }'
  ].join('\n');

  assert.equal(hasTrustedProjectPath(untrusted, projectPath), false);
  assert.equal(hasTrustedProjectPath(empty, projectPath), false);
  assert.equal(hasTrustedProjectPath(trustedElsewhere, projectPath), false);
});

test('process runner passes parenthesized paths and arguments without a shell', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp child (WIN) [args] '));
  const scriptPath = path.join(rootDir, 'echo args (literal).js');
  fs.writeFileSync(scriptPath, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');

  const result = runFileSync(process.execPath, [scriptPath, 'value with spaces', '(parenthesized)', '[literal]']);

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), ['value with spaces', '(parenthesized)', '[literal]']);
  assert.equal(result.shell, false);
});

test('PowerShell launcher audit works from a literal path with spaces and parentheses', {
  skip: process.platform !== 'win32'
}, () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp launcher (WIN) [audit] '));
  const scriptPath = path.join(rootDir, 'launcher audit (literal).ps1');
  const contentPath = path.join(rootDir, 'project value [literal].txt');
  fs.writeFileSync(contentPath, 'literal-ok\n');
  fs.writeFileSync(scriptPath, [
    'param([switch]$Audit)',
    `$content = Get-Content -Raw -LiteralPath '${contentPath.replace(/'/g, "''")}'`,
    '$payload = [ordered]@{ schemaVersion = 1; role = "source"; projectDir = $PSScriptRoot; sourceDir = $PSScriptRoot; cliPath = "D:\\Tools (x64)\\cli.bat"; wsEndpoint = "ws://127.0.0.1:39420"; cliPort = 39421; autoPort = 39420; marker = $content.Trim() }',
    '$payload | ConvertTo-Json -Compress'
  ].join('\r\n'));

  const audit = auditPowerShellLauncher(scriptPath, { timeoutMs: 10000 });

  assert.equal(audit.projectDir, rootDir);
  assert.equal(audit.marker, 'literal-ok');
});

test('launcher audit validation fails closed on an obsolete project pairing', () => {
  const expected = {
    sourceDir: 'D:\\projects(WIN)\\badminton-miniapp',
    previewDir: 'D:\\projects(WIN)\\badminton-miniapp-preview',
    devtoolsCli: 'D:\\Soft\\微信web开发者工具\\cli.bat',
    wsEndpoint: 'ws://127.0.0.1:39420',
    cliPort: 39421,
    autoPort: 39420
  };
  const obsolete = {
    schemaVersion: 1,
    role: 'source',
    projectDir: 'D:\\projects\\badminton-miniapp',
    sourceDir: 'D:\\projects\\badminton-miniapp',
    cliPath: expected.devtoolsCli,
    wsEndpoint: expected.wsEndpoint,
    cliPort: 39421,
    autoPort: 39420
  };

  assert.throws(
    () => validateLauncherAudit(obsolete, expected, 'source'),
    /project pairing/i
  );
});

test('launcher audit validation fails closed when the CLI control port drifts', () => {
  const expected = {
    sourceDir: 'D:\\projects(WIN)\\badminton-miniapp',
    previewDir: 'D:\\projects(WIN)\\badminton-miniapp-preview',
    devtoolsCli: 'D:\\Soft\\微信web开发者工具\\cli.bat',
    wsEndpoint: 'ws://127.0.0.1:39420',
    cliPort: 39421,
    autoPort: 39420
  };
  const wrongCliPort = {
    schemaVersion: 1,
    role: 'source',
    projectDir: expected.sourceDir,
    sourceDir: expected.sourceDir,
    cliPath: expected.devtoolsCli,
    wsEndpoint: expected.wsEndpoint,
    cliPort: 49999,
    autoPort: expected.autoPort
  };

  assert.throws(
    () => validateLauncherAudit(wrongCliPort, expected, 'source'),
    /CLI port mismatch.*39421.*49999/i
  );
});

test('Windows environment checker exits nonzero when a launcher audits the obsolete shell project', {
  skip: process.platform !== 'win32'
}, () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp bad launcher (WIN) '));
  const cmdPath = path.join(fixtureDir, 'weapp-main-dev.cmd');
  const ps1Path = path.join(fixtureDir, 'weapp-main-dev.ps1');
  fs.writeFileSync(cmdPath, '@echo off\r\npowershell.exe -File "%~dp0weapp-main-dev.ps1" %*\r\n');
  fs.writeFileSync(ps1Path, [
    'param([switch]$Audit)',
    '$payload = [ordered]@{ schemaVersion = 1; role = "source"; projectDir = "D:\\projects\\badminton-miniapp"; sourceDir = "D:\\projects\\badminton-miniapp"; cliPath = $env:WEAPP_DEVTOOLS_CLI; wsEndpoint = "ws://127.0.0.1:39420"; cliPort = 39421; autoPort = 39420 }',
    '$payload | ConvertTo-Json -Compress'
  ].join('\r\n'));

  const result = runFileSync(process.execPath, ['scripts/dev/check-windows-env.js'], {
    cwd: REPO_DIR,
    timeout: 30000,
    env: {
      ...process.env,
      WEAPP_MAIN_LAUNCHER: cmdPath,
      WEAPP_MAIN_LAUNCHER_SCRIPT: ps1Path,
      WEAPP_DEVTOOLS_CLI: 'D:\\Soft\\微信web开发者工具\\cli.bat'
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /\[FAIL\] source launcher project pairing/);
  assert.match(result.stdout, /Launcher project pairing mismatch/);
});

test('PowerShell session provenance binds warm reuse to one DevTools process identity', {
  skip: process.platform !== 'win32'
}, () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp provenance (WIN) '));
  const projectDir = path.join(fixtureDir, 'source project (literal)');
  const recordPath = path.join(fixtureDir, 'session record.json');
  createProject(projectDir);

  const result = runFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(REPO_DIR, 'tests', 'weapp-session-provenance.ps1'),
    '-CommonScriptPath',
    path.join(REPO_DIR, 'scripts', 'dev', 'weapp-powershell-common.ps1'),
    '-RecordPath',
    recordPath,
    '-ProjectDir',
    projectDir
  ], { cwd: REPO_DIR, timeout: 30000 });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(evidence, {
    schemaVersion: 3,
    recordMatches: true,
    creationTimestampNormalized: true,
    runtimeBindingRecorded: true,
    runtimeBindingMatches: true,
    runtimeBindingMismatchRejected: true,
    pidMismatchRejected: true,
    creationMismatchRejected: true,
    cliPortMismatchRejected: true,
    staleRecordRejected: true,
    exactCliPort: 39421,
    exactMainPid: 100,
    noExactRejected: true,
    ambiguousRejected: true,
    wrongDeclaredPortRejected: true,
    targetSnapshotPids: [100, 101],
    otherInstanceExcluded: true,
    otherInstanceDoesNotBlockExit: true,
    targetStillRunningRejected: true,
    pidReuseDoesNotBlockExit: true
  });
});

test('PowerShell process-tree exit check accepts an empty current process list', {
  skip: process.platform !== 'win32'
}, () => {
  const commonScriptPath = path.join(REPO_DIR, 'scripts', 'dev', 'weapp-powershell-common.ps1');
  const quotedCommonScriptPath = commonScriptPath.replace(/'/g, "''");
  const script = [
    `. '${quotedCommonScriptPath}'`,
    "$snapshot = @([pscustomobject]@{ ProcessId = [uint32]123; CreationDate = '2026-07-13T00:00:00.0000000Z' })",
    '$exited = Test-WeappProcessTreeExited -Snapshot $snapshot -CurrentProcesses @()',
    "if (-not $exited) { throw 'Expected an empty current process list to mean the target tree exited.' }",
    "Write-Output 'empty-current-processes-ok'"
  ].join('; ');

  const result = runFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], { cwd: REPO_DIR, timeout: 30000 });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /empty-current-processes-ok/);
});

test('tracked source and preview launchers gate warm reuse on the session process identity', () => {
  const common = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'weapp-powershell-common.ps1'), 'utf8');
  const main = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'start-weapp-main.ps1'), 'utf8');
  const preview = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'start-weapp-preview.ps1'), 'utf8');
  const probe = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'probe-weapp-automation.ps1'), 'utf8');
  const screenshot = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'weapp-ui-screenshot.js'), 'utf8');
  const windowHelper = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'dev', 'show-weapp-devtools-window.ps1'), 'utf8');
  const mainWarmBlock = main.slice(main.indexOf('$toolInfo = $null'), main.indexOf("Write-LauncherLog 'MODE: cold-start'"));
  const previewWarmBlock = preview.slice(preview.indexOf('$toolInfo = $null'), preview.indexOf("Write-LauncherLog 'MODE: explicit-preview-mirror'"));

  assert.match(common, /schemaVersion = 3/);
  assert.match(common, /MainProcessCreationDate/);
  assert.match(common, /CliServerPort/);
  assert.match(common, /automationOwners\.Count -ne 1/);
  assert.match(common, /function Get-WeappCurrentPage/);
  assert.match(common, /function Get-WeappProcessTreeSnapshot/);
  assert.match(common, /function Test-WeappProcessTreeExited/);
  assert.doesNotMatch(common, /function Show-WeappDevToolsWindow[\s\S]*Get-Process -Name 'wechatdevtools'[\s\S]*Select-Object -First 1/);
  assert.match(common, /Stop-WeappDevToolsCli[\s\S]*Get-WeappProcessTreeSnapshot[\s\S]*Test-WeappProcessTreeExited/);
  assert.match(common, /function Wait-WeappCurrentPage/);
  assert.match(common, /function Get-WeappRuntimeBinding/);
  assert.match(common, /function Set-WeappRuntimeBinding/);
  assert.match(common, /function Test-WeappRuntimeBinding/);
  assert.match(main, /Test-WeappSessionRecord[\s\S]*-CliPort \$CliPort/);
  assert.doesNotMatch(mainWarmBlock, /Invoke-WeappCli/);
  assert.match(mainWarmBlock, /Test-WeappRuntimeBinding[\s\S]*runtimeBinding/);
  assert.match(mainWarmBlock, /Wait-WeappSessionProcessIdentity[\s\S]*Write-WeappSessionRecord[\s\S]*-RuntimeBinding/);
  assert.match(main, /'auto', '--project', \$ProjectDir[\s\S]*Set-WeappRuntimeBinding/);
  assert.match(main, /Show-WeappDevToolsWindow -ProcessId/);
  assert.match(main, /Wait-WeappSessionProcessIdentity/);
  assert.match(main, /Wait-WeappCurrentPage -WsEndpoint \$WsEndpoint -TimeoutSeconds 75/);
  assert.doesNotMatch(main, /retrying the exact auto command once/);
  assert.equal((main.match(/'auto', '--project', \$ProjectDir/g) || []).length, 1);
  assert.match(preview, /MODE: warm-reuse-preview/);
  assert.doesNotMatch(previewWarmBlock, /Invoke-WeappCli/);
  assert.match(previewWarmBlock, /Test-WeappRuntimeBinding[\s\S]*runtimeBinding/);
  assert.match(previewWarmBlock, /Wait-WeappSessionProcessIdentity[\s\S]*Write-WeappSessionRecord[\s\S]*-RuntimeBinding/);
  assert.match(preview, /'auto', '--project', \$PreviewDir[\s\S]*Set-WeappRuntimeBinding/);
  assert.match(preview, /Show-WeappDevToolsWindow -ProcessId/);
  assert.match(preview, /Wait-WeappSessionProcessIdentity/);
  assert.match(preview, /Wait-WeappCurrentPage -WsEndpoint \$WsEndpoint -TimeoutSeconds 75/);
  assert.doesNotMatch(preview, /retrying the exact auto command once/);
  assert.equal((preview.match(/'auto', '--project', \$PreviewDir/g) || []).length, 1);
  assert.match(probe, /Get-WeappCurrentPage/);
  assert.match(screenshot, /show-weapp-devtools-window\.ps1/);
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts', 'dev', 'show-weapp-devtools-window.ps1')));
  assert.match(windowHelper, /weapp-automation-session\.json/);
  assert.match(windowHelper, /mainProcessId/);
  assert.match(windowHelper, /mainProcessCreationDate/);
  assert.doesNotMatch(windowHelper, /Get-Process -Name 'wechatdevtools'[\s\S]*Select-Object -First 1/);
  assert.match(windowHelper, /Test-WeappSessionRecord/);
  assert.match(windowHelper, /FindMainWindow/);
  assert.match(windowHelper, /GetWindowProcessId/);
  assert.match(windowHelper, /\$mainHandle = \[IntPtr\]::new\(\$WindowHandle\)/);
  assert.doesNotMatch(windowHelper, /\[long\]\$process\.MainWindowHandle -ne \$ExpectedWindowHandle/);
  assert.match(windowHelper, /ShowWindowAsync\(\$mainHandle, 3\)/);
  assert.match(windowHelper, /SetForegroundWindow/);
  assert.match(windowHelper, /if \(\$Mode -eq 'Prepare'\)[\s\S]*ForceForegroundWindow\(\$mainHandle\)/);
  assert.match(windowHelper, /windowStateRestored/);
  assert.match(windowHelper, /foregroundRestoreAction/);
  assert.match(windowHelper, /\$restoreForegroundHandle = \$foregroundBefore[\s\S]*preserve-user-focus/);
  assert.match(windowHelper, /ForceForegroundWindow\(\[IntPtr\]::new\(\$restoreForegroundHandle\)\)/);
  assert.match(windowHelper, /\$foregroundRestored[\s\S]*\$restoreForegroundHandle/);
  assert.match(windowHelper, /\$foregroundSafe = if \(\$foregroundTargetIsValid\)[\s\S]*\$foregroundRestored/);
  assert.match(windowHelper, /\$mainHandleValue = \[long\]\$mainHandle\.ToInt64\(\)[\s\S]*\$latestForeground[\s\S]*-eq \$mainHandleValue[\s\S]*ForceForegroundWindow/);
  assert.match(windowHelper, /OriginalShowCmd/);
  assert.match(windowHelper, /ForegroundWindowHandle/);
  assert.match(screenshot, /prepareDevToolsWindow[\s\S]*restoreDevToolsWindow/);
  assert.match(screenshot, /foregroundRestoreAction[\s\S]*foregroundRestored/);
  assert.match(screenshot, /windowRestore[\s\S]*writeWorkflowRecord/);
  assert.doesNotMatch(screenshot, /restoreDevToolsWindow\(managedWindowState\);[\s\S]{0,120}console\.warn/);
});

test('ordinary Windows npm scripts do not require bare bash or POSIX shell syntax', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));
  const ordinary = [
    'lint',
    'test',
    'check:cloud-common',
    'check:deprecated-wx-api',
    'check',
    'verify:windows-env',
    'verify:light',
    'verify:full',
    'ui:screenshot',
    'screenshot:smoke',
    'screenshot:diagnose'
  ];

  for (const name of ordinary) {
    assert.equal(typeof pkg.scripts[name], 'string', `missing npm script: ${name}`);
    assert.doesNotMatch(pkg.scripts[name], /(^|\s)bash(\s|$)/, `${name} uses bare bash`);
    assert.doesNotMatch(pkg.scripts[name], /(^|\s)[A-Z][A-Z0-9_]*=[^\s]+\s/, `${name} uses POSIX env assignment`);
  }
  assert.equal(pkg.devDependencies['miniprogram-automator'], '0.12.1');
});

test('full node:test discovery serializes files with wall-clock search budgets', () => {
  const runner = fs.readFileSync(path.join(REPO_DIR, 'scripts', 'run-node-tests.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));

  assert.match(runner, /\['--test', '--test-concurrency=1', \.\.\.filesAndOptions\]/);
  assert.match(pkg.scripts['verify:light'], /^node scripts\/run-node-tests\.js /);
  assert.doesNotMatch(pkg.scripts['verify:light'], /node --test/);
});
