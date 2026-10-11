'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tool = require('../scripts/dev/weapp-ui-screenshot');

const endpoint = 'ws://127.0.0.1:29558';
const cliPath = path.resolve('tmp/mock-listener-devtools/cli.bat');
const guiPath = path.join(path.dirname(cliPath), '微信开发者工具.exe');
const startTime = '2026-10-11T04:00:00Z';
const windowsOnly = { skip: process.platform !== 'win32' };

function fixtureProcess(processId, parentProcessId, overrides = {}) {
  return { processId, parentProcessId, startTime, executablePath: guiPath, commandLine: 'fixture.exe', ...overrides };
}

// Execute the actual generated PowerShell with process/listener cmdlets replaced
// by fixtures. This makes no OS process query, network connection or SDK call.
function queryFixture(processes) {
  const encoded = Buffer.from(JSON.stringify(processes), 'utf8').toString('base64');
  const fixture = [
    `$fixtureProcesses = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json`,
    'function Get-NetTCPConnection {',
    '  param($State, $LocalPort, $ErrorAction)',
    "  [pscustomobject]@{ OwningProcess = 100; LocalAddress = '127.0.0.1' }",
    '}',
    'function Get-CimInstance {',
    '  param($ClassName, $Filter)',
    "  $fixtureProcessId = [int]($Filter -replace '^ProcessId = ', '')",
    '  $entry = @($fixtureProcesses | Where-Object { $_.processId -eq $fixtureProcessId })[0]',
    '  if ($null -eq $entry -or $entry.cimUnavailable) { return }',
    "  if ($entry.cimThrows) { throw 'fixture-cim-read-failed' }",
    '  [pscustomobject]@{ ProcessId = $entry.processId; ParentProcessId = $entry.parentProcessId;',
    '    ExecutablePath = $entry.executablePath; CommandLine = $entry.commandLine }',
    '}',
    'function Get-Process {',
    '  param($Id, $ErrorAction)',
    '  $entry = @($fixtureProcesses | Where-Object { $_.processId -eq $Id })[0]',
    "  if ($null -eq $entry -or $entry.liveThrows) { throw 'fixture-process-read-failed' }",
    '  $fixtureStartTime = $null',
    '  if ($entry.startTime) { $fixtureStartTime = [datetime]::Parse($entry.startTime).ToUniversalTime() }',
    '  [pscustomobject]@{ Id = $entry.processId; StartTime = $fixtureStartTime; SessionId = 1 }',
    '}',
  ].join('\n');
  return tool.resolveListenerIdentity(endpoint, {
    platform: 'win32',
    spawnSync(executable, args, options) {
      assert.equal(executable, 'powershell.exe');
      return spawnSync(executable, [...args.slice(0, -1), `${fixture}\n${args.at(-1)}`], {
        ...options, timeout: 10000,
      });
    },
  });
}

test('unreadable ancestor StartTime stops the chain without trusting its flags', windowsOnly, () => {
  const result = queryFixture([
    fixtureProcess(100, 200),
    fixtureProcess(200, 300, { startTime: null, commandLine: 'fixture.exe --disable-backgrounding-occluded-windows' }),
    fixtureProcess(300, 0, { commandLine: 'fixture.exe --disable-backgrounding-occluded-windows' }),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.processChain.map(item => item.processId), [100]);
  assert.equal(result.owningProcessId, 100);
  assert.match(result.processStartFileTimeUtc, /^\d+$/);
  assert.equal(result.executablePath, guiPath);
  assert.equal(tool.validateDevToolsOwnership(result, cliPath).ok, true);
  assert.equal(tool.validateBackgroundCaptureProcessFlags(result).ok, false);
});

test('unreadable ancestor path cannot supply installation ownership or background flags', windowsOnly, () => {
  const result = queryFixture([
    fixtureProcess(100, 200, { executablePath: path.resolve('tmp/unrelated-listener.exe') }),
    fixtureProcess(200, 300, { executablePath: null, commandLine: 'fixture.exe --disable-backgrounding-occluded-windows' }),
    fixtureProcess(300, 0, { commandLine: 'fixture.exe --disable-backgrounding-occluded-windows' }),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.processChain.map(item => item.processId), [100]);
  assert.equal(tool.validateDevToolsOwnership(result, cliPath).ok, false);
  assert.equal(tool.validateBackgroundCaptureProcessFlags(result).ok, false);
});

test('non-owner process read errors stop at the complete owner identity', windowsOnly, () => {
  for (const unavailable of [{ cimThrows: true }, { liveThrows: true }]) {
    const result = queryFixture([fixtureProcess(100, 200), fixtureProcess(200, 0, unavailable)]);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.processChain.map(item => item.processId), [100]);
  }
});

test('missing owner identity fails without adopting a readable ancestor', windowsOnly, () => {
  for (const unavailable of [{ cimUnavailable: true }, { startTime: null }, { executablePath: null }]) {
    const result = queryFixture([fixtureProcess(100, 200, unavailable), fixtureProcess(200, 0)]);
    assert.deepEqual(result, { ok: false, reason: 'owner-process-unavailable', port: 29558 });
    assert.equal(tool.validateBackgroundCaptureProcessFlags(result).ok, false);
  }
});

test('owner process query errors remain failures with bounded diagnostics', windowsOnly, () => {
  for (const unavailable of [{ cimThrows: true }, { liveThrows: true }]) {
    const result = queryFixture([fixtureProcess(100, 200, unavailable), fixtureProcess(200, 0)]);
    assert.deepEqual(result, { ok: false, reason: 'listener-query-failed', endpoint,
      queryDiagnostics: { status: 1, signal: null, errorCode: null } });
    assert.doesNotMatch(JSON.stringify(result), /fixture-(?:cim|process)-read-failed/);
  }
});

test('complete ancestors retain ownership and flags while owner PID and start time stay pinned', windowsOnly, () => {
  const result = queryFixture([
    fixtureProcess(100, 200, { executablePath: path.resolve('tmp/unrelated-listener.exe') }),
    fixtureProcess(200, 0, { commandLine: 'fixture.exe --disable-backgrounding-occluded-windows' }),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.processChain.map(item => item.processId), [100, 200]);
  assert.equal(tool.validateDevToolsOwnership(result, cliPath).ok, true);
  assert.equal(tool.validateBackgroundCaptureProcessFlags(result).ok, true);
  assert.equal(tool.validateListenerIdentity(result, result).ok, true);
  assert.equal(tool.validateListenerIdentity({ ...result, owningProcessId: 200 }, result).ok, false);
  assert.equal(tool.validateListenerIdentity({ ...result, processStartFileTimeUtc: '1' }, result).ok, false);
});
