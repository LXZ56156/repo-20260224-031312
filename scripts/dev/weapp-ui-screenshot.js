#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { URL, URLSearchParams } = require('url');
const { validateHorizontalAlignment } = require('./weapp-screenshot-layout');
const { cases, manualActions } = require('./weapp-ui-screenshot-cases');

const SESSION_KIND = 'weapp-ui-launch-session-v2';
const SESSION_LOCK_KIND = 'weapp-ui-session-lock-v1';
const PROJECT_BINDING_METHOD = 'miniprogram-automator.launch+new-listener+reconnect-marker';
const DEFAULT_SESSION_FILE = 'tmp/weapp-ui-background-session.json';
const DEFAULT_OUTPUT_DIR = 'tmp/ui-screenshots-actual';
const DEFAULT_RUN_ROOT = 'tmp/ui-runs';
const BACKGROUND_CAPTURE_CHROMIUM_FLAG = '--disable-backgrounding-occluded-windows';
const REPOSITORY_ROOT = fs.realpathSync.native(path.resolve(__dirname, '..', '..'));

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (err) {
    throw new Error(`miniprogram-automator is not installed from this repository lockfile. Run npm ci. ${String(err && err.message || err)}`);
  }
}

function resolveLaunchCommand(requestedCliPath) {
  if (process.platform !== 'win32'
      || path.extname(requestedCliPath).toLowerCase() !== '.bat') {
    return { executable: requestedCliPath, args: [] };
  }
  // Node 24 rejects spawning .bat files directly. Keep the vendor wrapper so it
  // can select the bundled Node runtime expected by the installed DevTools CLI.
  return {
    executable: 'cmd',
    args: ['/d', '/s', '/c', 'call', requestedCliPath],
  };
}

function ensureBackgroundCaptureNwPreArgs(value) {
  const current = String(value || '').trim();
  const escaped = BACKGROUND_CAPTURE_CHROMIUM_FLAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(current)) return current;
  return [current, BACKGROUND_CAPTURE_CHROMIUM_FLAG].filter(Boolean).join(' ');
}

function timeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function parseScreenshotArgs(argv) {
  const requested = Array.isArray(argv) ? argv.slice() : [];
  if (requested.includes('--rebind-viewport')) {
    const width = Number(requested[1]);
    if (requested.length !== 2 || requested[0] !== '--rebind-viewport' || !Number.isInteger(width) || width <= 0) {
      throw new Error('--rebind-viewport requires one explicit positive viewport width.');
    }
    return { mode: 'refresh-session', value: '', rebindViewport: width };
  }
  if (requested.includes('--prepare') || requested.includes('--capture-win32')) {
    throw new Error('Win32/two-stage screenshot modes were removed. Use the restored-but-background App.captureScreenshot path.');
  }
  if (requested.includes('--list')) return { mode: 'list', value: '' };
  if (requested.includes('--doctor')) return { mode: 'doctor', value: '' };
  if (requested.includes('--refresh-session')) return { mode: 'refresh-session', value: '' };
  if (requested.some((item) => item.startsWith('--'))) {
    throw new Error(`Unknown screenshot option: ${requested.find((item) => item.startsWith('--'))}`);
  }
  return { mode: 'capture', value: requested };
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  if (seen.has(value)) throw new Error('Cannot hash cyclic screenshot evidence.');
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((item) => {
      const entry = canonicalize(item, seen);
      return typeof entry === 'undefined' ? null : entry;
    });
  } else {
    normalized = {};
    Object.keys(value).sort().forEach((key) => {
      const entry = canonicalize(value[key], seen);
      if (typeof entry !== 'undefined') normalized[key] = entry;
    });
  }
  seen.delete(value);
  return normalized;
}

function hashCanonical(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function normalizeRoute(value) {
  const source = typeof value === 'string'
    ? value
    : (value && (value.path || value.route || value.pagePath)) || '';
  return String(source).split('?')[0].replace(/^\//, '');
}

function normalizeQuery(value) {
  let source = value;
  if (typeof value === 'string') {
    const queryIndex = value.indexOf('?');
    source = queryIndex >= 0 ? value.slice(queryIndex + 1) : '';
  } else if (value && typeof value === 'object') {
    source = Object.prototype.hasOwnProperty.call(value, 'query') ? value.query : '';
  }
  const entries = [];
  if (typeof source === 'string') {
    const params = new URLSearchParams(source);
    params.forEach((entryValue, key) => entries.push([key, entryValue]));
  } else if (source && typeof source === 'object') {
    Object.keys(source).forEach((key) => {
      const entryValue = source[key];
      if (Array.isArray(entryValue)) {
        entryValue.forEach((item) => entries.push([key, String(item)]));
      } else if (entryValue !== null && typeof entryValue !== 'undefined') {
        entries.push([key, String(entryValue)]);
      }
    });
  }
  return entries
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
}

function normalizeLocation(value) {
  return {
    path: normalizeRoute(value),
    query: normalizeQuery(value),
  };
}

function locationsMatch(actual, expected) {
  return hashCanonical(normalizeLocation(actual)) === hashCanonical(normalizeLocation(expected));
}

function normalizeProjectPath(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const normalized = path.resolve(source).replace(/\\/g, '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function realpathOrResolved(value) {
  const resolved = path.resolve(String(value || ''));
  try {
    return fs.realpathSync.native(resolved);
  } catch (err) {
    return resolved;
  }
}

function isRunnerProjectPath(value) {
  return normalizeProjectPath(realpathOrResolved(value)) === normalizeProjectPath(REPOSITORY_ROOT);
}

function endpointPort(endpoint) {
  try {
    const parsed = new URL(String(endpoint || ''));
    return parsed.port ? Number(parsed.port) : 0;
  } catch (err) {
    return 0;
  }
}

function isLocalWebSocketEndpoint(endpoint) {
  try {
    const parsed = new URL(String(endpoint || ''));
    return parsed.protocol === 'ws:'
      && parsed.hostname === '127.0.0.1'
      && !!parsed.port
      && endpointPort(endpoint) > 0;
  } catch (err) {
    return false;
  }
}

function listenerIdentityCore(identity) {
  const source = identity && typeof identity === 'object' ? identity : {};
  const processChain = Array.isArray(source.processChain) ? source.processChain : [];
  const disableBackgroundingOccludedWindows = !!(
    source.backgroundCaptureFlags
    && source.backgroundCaptureFlags.disableBackgroundingOccludedWindows === true
  ) || processChain.some((item) => !!(
    item
    && item.backgroundCaptureFlags
    && item.backgroundCaptureFlags.disableBackgroundingOccludedWindows === true
  ));
  return {
    endpoint: String(source.endpoint || ''),
    port: Number(source.port || 0),
    localAddresses: Array.isArray(source.localAddresses)
      ? source.localAddresses.map(String).sort()
      : [],
    owningProcessId: Number(source.owningProcessId || 0),
    processStartFileTimeUtc: String(source.processStartFileTimeUtc || ''),
    sessionId: Number(source.sessionId || 0),
    executablePath: normalizeProjectPath(source.executablePath),
    backgroundCaptureFlags: {
      disableBackgroundingOccludedWindows,
    },
  };
}

function listenerIdentityHash(identity) {
  return hashCanonical(listenerIdentityCore(identity));
}

function resolveListenerIdentity(endpoint, options = {}) {
  if (!isLocalWebSocketEndpoint(endpoint)) {
    return { ok: false, reason: 'invalid-loopback-endpoint', endpoint: String(endpoint || '') };
  }
  const platform = options.platform || process.platform;
  if (platform !== 'win32') {
    return { ok: false, reason: 'listener-identity-is-currently-windows-only', endpoint };
  }
  const port = endpointPort(endpoint);
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    `$listenerPort = ${port}`,
    "$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $listenerPort -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '::1' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' })",
    "if ($listeners.Count -eq 0) { [pscustomobject]@{ ok = $false; reason = 'not-found'; port = $listenerPort } | ConvertTo-Json -Compress; exit 0 }",
    "$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)",
    "if ($owners.Count -ne 1) { [pscustomobject]@{ ok = $false; reason = 'ambiguous-owner'; port = $listenerPort } | ConvertTo-Json -Compress; exit 0 }",
    '$ownerProcessId = [int]$owners[0]',
    '$chain = @()',
    '$cursorProcessId = $ownerProcessId',
    'for ($index = 0; $index -lt 12 -and $cursorProcessId -gt 0; $index += 1) {',
    '  $cimProcess = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $cursorProcessId)',
    '  if (-not $cimProcess) { break }',
    '  $liveProcess = Get-Process -Id $cursorProcessId -ErrorAction Stop',
    '  $chain += [pscustomobject]@{',
    '    processId = [int]$cursorProcessId',
    '    parentProcessId = [int]$cimProcess.ParentProcessId',
    '    processStartFileTimeUtc = [string]$liveProcess.StartTime.ToFileTimeUtc()',
    '    sessionId = [int]$liveProcess.SessionId',
    '    executablePath = [string]$cimProcess.ExecutablePath',
    '    backgroundCaptureFlags = [pscustomobject]@{',
    "      disableBackgroundingOccludedWindows = ([string]$cimProcess.CommandLine -match '(?i)(?:^|\\s)--disable-backgrounding-occluded-windows(?:\\s|$)')",
    '    }',
    '  }',
    '  $cursorProcessId = [int]$cimProcess.ParentProcessId',
    '}',
    "if ($chain.Count -eq 0) { [pscustomobject]@{ ok = $false; reason = 'owner-process-unavailable'; port = $listenerPort } | ConvertTo-Json -Compress; exit 0 }",
    '$owner = $chain[0]',
    '[pscustomobject]@{',
    '  ok = $true',
    `  endpoint = '${endpoint}'`,
    '  port = $listenerPort',
    '  localAddresses = @($listeners | Select-Object -ExpandProperty LocalAddress -Unique | Sort-Object)',
    '  owningProcessId = [int]$owner.processId',
    '  processStartFileTimeUtc = [string]$owner.processStartFileTimeUtc',
    '  sessionId = [int]$owner.sessionId',
    '  executablePath = [string]$owner.executablePath',
    '  backgroundCaptureFlags = [pscustomobject]@{',
    '    disableBackgroundingOccludedWindows = [bool](@($chain | Where-Object { $_.backgroundCaptureFlags.disableBackgroundingOccludedWindows }).Count -gt 0)',
    '  }',
    '  processChain = $chain',
    '} | ConvertTo-Json -Compress -Depth 6',
  ].join('\n');
  const runner = options.spawnSync || spawnSync;
  const result = runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!result || result.status !== 0) {
    return {
      ok: false,
      reason: 'listener-query-failed',
      endpoint,
      error: String(result && (result.stderr || result.error) || '').trim(),
    };
  }
  try {
    return JSON.parse(String(result.stdout || '').trim());
  } catch (err) {
    return { ok: false, reason: 'listener-query-returned-invalid-json', endpoint, error: String(err.message || err) };
  }
}

function validateListenerIdentity(actual, expected) {
  const actualCore = listenerIdentityCore(actual);
  const expectedCore = listenerIdentityCore(expected);
  const checks = {
    actual: !!actual && actual.ok === true,
    expected: !!expected && expected.ok === true,
    endpoint: actualCore.endpoint === expectedCore.endpoint && isLocalWebSocketEndpoint(actualCore.endpoint),
    identity: listenerIdentityHash(actualCore) === listenerIdentityHash(expectedCore),
  };
  return { ok: Object.values(checks).every(Boolean), checks, actual: actualCore, expected: expectedCore };
}

function validateDevToolsOwnership(identity, cliPath) {
  const cliRoot = normalizeProjectPath(path.dirname(path.resolve(cliPath || '')));
  const chain = Array.isArray(identity && identity.processChain) ? identity.processChain : [];
  const owned = !!cliRoot && chain.some((item) => {
    const executable = normalizeProjectPath(item && item.executablePath);
    return executable === cliRoot || executable.startsWith(`${cliRoot}/`);
  });
  return { ok: owned, cliRoot, processIds: chain.map((item) => Number(item.processId || 0)).filter(Boolean) };
}

function validateBackgroundCaptureProcessFlags(identity) {
  const core = listenerIdentityCore(identity);
  const checks = {
    listenerIdentity: !!identity && identity.ok === true,
    disableBackgroundingOccludedWindows:
      core.backgroundCaptureFlags.disableBackgroundingOccludedWindows === true,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function sessionPoisonFile(sessionFile) {
  return `${path.resolve(sessionFile)}.poisoned.json`;
}

function sessionRecoveryFile(sessionFile) {
  return `${path.resolve(sessionFile)}.recovering.json`;
}

function clearSessionPoison(sessionFile) {
  const poisonFile = sessionPoisonFile(sessionFile);
  safeUnlink(poisonFile);
  return { ok: !fs.existsSync(poisonFile), poisonFile };
}

function clearSessionRecovery(sessionFile) {
  const recoveryFile = sessionRecoveryFile(sessionFile);
  safeUnlink(recoveryFile);
  return { ok: !fs.existsSync(recoveryFile), recoveryFile };
}

function ensureSessionRecoveryBarrier(sessionFile, staleLock, claimant) {
  const recoveryFile = sessionRecoveryFile(sessionFile);
  if (fs.existsSync(recoveryFile)) {
    return { ok: true, created: false, recoveryFile, barrier: readJsonFile(recoveryFile) };
  }
  const barrier = {
    kind: 'weapp-ui-session-recovery-v1',
    reason: 'stale-lock-recovery',
    createdAt: new Date().toISOString(),
    sessionFile: path.resolve(sessionFile),
    staleToken: String(staleLock.token || ''),
    staleProcessId: Number(staleLock.processId || 0),
    staleProcessStartFileTimeUtc: String(staleLock.processStartFileTimeUtc || ''),
    claimantToken: String(claimant.token || ''),
    claimantProcessId: Number(claimant.processId || 0),
    claimantProcessStartFileTimeUtc: String(claimant.processStartFileTimeUtc || ''),
  };
  let handle = null;
  try {
    handle = fs.openSync(recoveryFile, 'wx');
    fs.writeFileSync(handle, `${JSON.stringify(barrier, null, 2)}\n`, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
  } catch (err) {
    if (handle !== null) {
      try { fs.closeSync(handle); } catch (closeError) { /* Preserve the barrier write error. */ }
    }
    if (!err || err.code !== 'EEXIST') throw err;
    return { ok: true, created: false, recoveryFile, barrier: readJsonFile(recoveryFile) };
  }
  const written = readJsonFile(recoveryFile);
  if (!written
      || written.kind !== barrier.kind
      || written.staleToken !== barrier.staleToken
      || written.claimantToken !== barrier.claimantToken) {
    throw new Error(`Screenshot recovery barrier failed post-write verification: ${recoveryFile}`);
  }
  return { ok: true, created: true, recoveryFile, barrier: written };
}

function resolveProcessIdentity(processId, options = {}) {
  const pid = Number(processId || 0);
  if (!Number.isInteger(pid) || pid <= 0) return { ok: false, reason: 'invalid-pid', processId: pid };
  const platform = options.platform || process.platform;
  if (platform !== 'win32') {
    try {
      process.kill(pid, 0);
      return { ok: true, processId: pid, processStartFileTimeUtc: `non-windows-pid-${pid}` };
    } catch (err) {
      return { ok: false, reason: err && err.code === 'ESRCH' ? 'not-found' : 'query-failed', processId: pid };
    }
  }
  const runner = options.spawnSync || spawnSync;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$targetProcessId = ${pid}`,
    '$target = Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue',
    "if (-not $target) { [pscustomobject]@{ ok = $false; reason = 'not-found'; processId = $targetProcessId } | ConvertTo-Json -Compress; exit 0 }",
    '[pscustomobject]@{',
    '  ok = $true',
    '  processId = [int]$target.Id',
    '  processStartFileTimeUtc = [string]$target.StartTime.ToFileTimeUtc()',
    '} | ConvertTo-Json -Compress',
  ].join('\n');
  const result = runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!result || result.status !== 0) {
    return { ok: false, reason: 'query-failed', processId: pid, error: String(result && result.stderr || '') };
  }
  try {
    return JSON.parse(String(result.stdout || '').trim());
  } catch (err) {
    return { ok: false, reason: 'invalid-response', processId: pid, error: String(err && err.message || err) };
  }
}

function acquireSessionLock(sessionFile, purpose, options = {}) {
  const targetSessionFile = path.resolve(sessionFile);
  const lockFile = `${targetSessionFile}.lock`;
  const recoveryFile = sessionRecoveryFile(targetSessionFile);
  const resolver = options.resolveProcessIdentity || resolveProcessIdentity;
  const currentIdentity = resolver(process.pid);
  if (!currentIdentity || currentIdentity.ok !== true || !currentIdentity.processStartFileTimeUtc) {
    throw new Error(`Cannot establish screenshot lock owner identity: ${JSON.stringify(currentIdentity || {})}`);
  }
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const token = crypto.randomBytes(24).toString('hex');
  const record = {
    kind: SESSION_LOCK_KIND,
    token,
    purpose: String(purpose || 'unknown'),
    processId: process.pid,
    processStartFileTimeUtc: String(currentIdentity.processStartFileTimeUtc),
    sessionFile: targetSessionFile,
    createdAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (options.allowStaleRecovery !== true && fs.existsSync(recoveryFile)) {
      throw new Error(
        `Screenshot session recovery is incomplete and requires a new ui:prewarm: ${recoveryFile}`
      );
    }
    let handle = null;
    let createdThisAttempt = false;
    try {
      handle = fs.openSync(lockFile, 'wx');
      createdThisAttempt = true;
      fs.writeFileSync(handle, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      if (options.allowStaleRecovery !== true && fs.existsSync(recoveryFile)) {
        const current = readJsonFile(lockFile);
        if (current && current.token === token) safeUnlink(lockFile);
        throw new Error(
          `Screenshot session recovery started while acquiring the lock; retry only after a new ui:prewarm: ${recoveryFile}`
        );
      }
      return { ...record, lockFile };
    } catch (err) {
      if (handle !== null) {
        try { fs.closeSync(handle); } catch (closeError) { /* Best effort. */ }
      }
      if (!err || err.code !== 'EEXIST') {
        try {
          if (createdThisAttempt) {
            safeUnlink(lockFile);
          } else {
            const existing = readJsonFile(lockFile);
            if (existing && existing.token === token) safeUnlink(lockFile);
          }
        } catch (cleanupError) { /* Preserve the primary lock error. */ }
        throw err;
      }
      const existing = readJsonFile(lockFile);
      if (!existing
          || existing.kind !== SESSION_LOCK_KIND
          || !/^[a-f0-9]{48}$/i.test(String(existing.token || ''))
          || !Number(existing.processId)
          || !String(existing.processStartFileTimeUtc || '')) {
        throw new Error(`Screenshot session lock exists but is not safely recoverable: ${lockFile}`);
      }
      const owner = resolver(existing.processId);
      const sameOwner = owner && owner.ok === true
        && String(owner.processStartFileTimeUtc) === String(existing.processStartFileTimeUtc);
      if (sameOwner) {
        throw new Error(
          `Screenshot session is busy (${existing.purpose || 'unknown'}) in PID ${existing.processId}: ${lockFile}`
        );
      }
      if (owner && owner.ok !== true && owner.reason !== 'not-found') {
        throw new Error(`Screenshot session lock owner cannot be verified: ${JSON.stringify(owner)}`);
      }
      if (options.allowStaleRecovery !== true) {
        throw new Error(
          `Screenshot session has a stale owner and must be recovered by a new ui:prewarm: ${lockFile}`
        );
      }
      const staleToken = String(existing.token);
      const claimFile = `${lockFile}.stale-claim-${staleToken}`;
      const staleFile = `${lockFile}.stale-${staleToken}`;
      let claimHandle = null;
      let claimCreated = false;
      try {
        claimHandle = fs.openSync(claimFile, 'wx');
        claimCreated = true;
        fs.writeFileSync(claimHandle, `${JSON.stringify({
          kind: 'weapp-ui-stale-lock-claim-v1',
          staleToken,
          claimantToken: token,
          processId: process.pid,
          processStartFileTimeUtc: record.processStartFileTimeUtc,
          createdAt: new Date().toISOString(),
        }, null, 2)}\n`, 'utf8');
        fs.fsyncSync(claimHandle);
        fs.closeSync(claimHandle);
        claimHandle = null;
      } catch (claimError) {
        if (claimHandle !== null) {
          try { fs.closeSync(claimHandle); } catch (closeError) { /* Best effort. */ }
        }
        if (claimCreated) {
          try { safeUnlink(claimFile); } catch (cleanupError) { /* Preserve the claim error. */ }
        }
        if (claimError && claimError.code === 'EEXIST') {
          throw new Error(`Screenshot stale-lock recovery is already claimed: ${claimFile}`);
        }
        throw claimError;
      }
      try {
        if (typeof options.beforeStaleRecheck === 'function') {
          options.beforeStaleRecheck({ lockFile, staleFile, claimFile, existing });
        }
        const current = readJsonFile(lockFile);
        if (!current || current.token !== staleToken) continue;
        const recovery = ensureSessionRecoveryBarrier(targetSessionFile, current, record);
        if (!recovery.ok || !fs.existsSync(recovery.recoveryFile)) {
          throw new Error(`Screenshot stale-lock recovery barrier is not durable: ${recovery.recoveryFile}`);
        }
        if (typeof options.afterStaleBarrier === 'function') {
          options.afterStaleBarrier({ lockFile, staleFile, claimFile, recoveryFile, existing: current });
        }
        if (fs.existsSync(staleFile)) {
          throw new Error(`Screenshot stale-lock evidence already exists: ${staleFile}`);
        }
        fs.renameSync(lockFile, staleFile);
        const moved = readJsonFile(staleFile);
        if (!moved || moved.token !== staleToken) {
          throw new Error(`Screenshot stale-lock token changed during recovery: ${staleFile}`);
        }
        if (typeof options.afterStaleRename === 'function') {
          options.afterStaleRename({ lockFile, staleFile, claimFile, recoveryFile, existing: moved });
        }
      } catch (renameError) {
        if (renameError && renameError.code === 'ENOENT') continue;
        throw renameError;
      } finally {
        try { safeUnlink(claimFile); } catch (claimCleanupError) { /* Preserve stale-recovery evidence. */ }
      }
    }
  }
  throw new Error(`Unable to acquire screenshot session lock: ${lockFile}`);
}

function releaseSessionLock(lock) {
  if (!lock || !lock.lockFile || !lock.token) return { ok: true, released: false };
  if (!fs.existsSync(lock.lockFile)) {
    return { ok: false, released: false, reason: 'lock missing before release' };
  }
  const existing = readJsonFile(lock.lockFile);
  if (!existing) {
    return { ok: false, released: false, reason: 'lock exists but is unreadable' };
  }
  if (existing.token !== lock.token
      || Number(existing.processId) !== Number(lock.processId)
      || String(existing.processStartFileTimeUtc) !== String(lock.processStartFileTimeUtc)) {
    return { ok: false, released: false, reason: 'lock ownership changed' };
  }
  try {
    safeUnlink(lock.lockFile);
  } catch (err) {
    return {
      ok: false,
      released: false,
      reason: 'lock removal failed',
      error: String(err && err.message || err),
    };
  }
  if (fs.existsSync(lock.lockFile)) {
    return { ok: false, released: false, reason: 'lock still exists after release' };
  }
  return { ok: true, released: true };
}

function releaseSessionLockOrThrow(lock) {
  const release = releaseSessionLock(lock);
  if (!release.ok) {
    throw new Error(`Screenshot session lock release failed: ${JSON.stringify(release)}`);
  }
  return release;
}

function resolveSessionFile(env = process.env, cwd = process.cwd()) {
  return path.resolve(cwd, String(env.WEAPP_UI_SESSION_FILE || DEFAULT_SESSION_FILE));
}

function readRuntimeConfig(env = process.env, cwd = process.cwd(), options = {}) {
  const captureSurface = String(env.WEAPP_CAPTURE_SURFACE || 'page').trim();
  if (!['page', 'simulator-frame'].includes(captureSurface)) {
    throw new Error(`Unsupported capture surface: ${captureSurface}`);
  }
  const surfaceDirectory = captureSurface === 'simulator-frame' ? 'simulator-frame' : '';
  const allowSessionFallback = options.allowSessionFallback !== false;
  const sessionFile = resolveSessionFile(env, cwd);
  const session = allowSessionFallback ? readJsonFile(sessionFile) : null;
  const sourceProjectPath = String(env.WEAPP_PROJECT_PATH || session && session.sourceProjectPath || '').trim();
  const expectedWindowWidth = Number(
    env.WEAPP_EXPECTED_WINDOW_WIDTH
      || session && session.expectedWindowWidth
      || 0
  );
  const poisonFile = sessionPoisonFile(sessionFile);
  const recoveryFile = sessionRecoveryFile(sessionFile);
  const sessionPoisonExists = fs.existsSync(poisonFile);
  const sessionRecoveryExists = fs.existsSync(recoveryFile);
  return {
    wsEndpoint: String(env.WEAPP_WS_ENDPOINT || session && session.endpoint || '').trim(),
    sourceProjectPath: sourceProjectPath ? realpathOrResolved(path.resolve(cwd, sourceProjectPath)) : '',
    runnerProjectPath: REPOSITORY_ROOT,
    expectedWindowWidth,
    expectedSDKVersion: String(
      env.WEAPP_EXPECTED_SDK_VERSION
        || session && session.expectedSDKVersion
        || ''
    ).trim(),
    sessionFile,
    session,
    poisonFile,
    sessionPoisonExists,
    sessionPoison: readJsonFile(poisonFile),
    recoveryFile,
    sessionRecoveryExists,
    sessionRecovery: readJsonFile(recoveryFile),
    captureSurface,
    outDir: path.resolve(cwd, String(env.WEAPP_SCREENSHOT_DIR || DEFAULT_OUTPUT_DIR), surfaceDirectory),
    runRoot: path.resolve(cwd, String(env.WEAPP_UI_RUN_ROOT || DEFAULT_RUN_ROOT), surfaceDirectory),
    screenshotTimeoutMs: Number(env.WEAPP_SCREENSHOT_TIMEOUT_MS || 45000),
    routeTimeoutMs: Number(env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000),
    readinessTimeoutMs: Number(env.WEAPP_READY_TIMEOUT_MS || 10000),
    connectTimeoutMs: Number(env.WEAPP_CONNECT_TIMEOUT_MS || 15000),
  };
}

function validateRuntimeConfig(config, options = {}) {
  const requireSession = options.requireSession === true;
  const projectConfigPath = config.sourceProjectPath
    ? path.join(config.sourceProjectPath, 'project.config.json')
    : '';
  const checks = {
    endpoint: isLocalWebSocketEndpoint(config.wsEndpoint),
    projectPath: !!config.sourceProjectPath
      && fs.existsSync(config.sourceProjectPath)
      && fs.existsSync(projectConfigPath),
    runnerProjectPath: isRunnerProjectPath(config.sourceProjectPath),
    expectedWindowWidth: Number.isFinite(config.expectedWindowWidth)
      && config.expectedWindowWidth > 0,
    session: !requireSession || !!config.session,
    sessionNotPoisoned: config.sessionPoisonExists !== true,
    sessionNotRecovering: config.sessionRecoveryExists !== true,
  };
  return { ok: Object.values(checks).every(Boolean), checks, projectConfigPath };
}

let pngCrcTable = null;

function crc32(buffer) {
  if (!pngCrcTable) {
    pngCrcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function expectedInflatedPngBytes(width, height, bitDepth, colorType, interlace) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) return 0;
  const bitsPerPixel = channels * bitDepth;
  const passBytes = (passWidth, passHeight) => (
    passWidth > 0 && passHeight > 0
      ? (Math.ceil((passWidth * bitsPerPixel) / 8) + 1) * passHeight
      : 0
  );
  if (interlace === 0) return passBytes(width, height);
  if (interlace !== 1) return 0;
  const passes = [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ];
  return passes.reduce((total, [startX, startY, stepX, stepY]) => {
    const passWidth = width > startX ? Math.ceil((width - startX) / stepX) : 0;
    const passHeight = height > startY ? Math.ceil((height - startY) / stepY) : 0;
    return total + passBytes(passWidth, passHeight);
  }, 0);
}

function inspectPngBuffer(source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source || '');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    return { valid: false, byteLength: buffer.length, width: 0, height: 0, sha256, error: 'invalid PNG signature or truncated IHDR' };
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let sawIhdr = false;
  let sawIend = false;
  const idatChunks = [];
  let error = '';
  try {
    while (offset < buffer.length) {
      if (offset + 12 > buffer.length) throw new Error('truncated PNG chunk header');
      const length = buffer.readUInt32BE(offset);
      const chunkEnd = offset + 12 + length;
      if (chunkEnd > buffer.length) throw new Error('truncated PNG chunk data');
      const typeBuffer = buffer.subarray(offset + 4, offset + 8);
      const type = typeBuffer.toString('ascii');
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
      const actualCrc = crc32(Buffer.concat([typeBuffer, data]));
      if (expectedCrc !== actualCrc) throw new Error(`PNG ${type} CRC mismatch`);
      if (!sawIhdr && type !== 'IHDR') throw new Error('PNG IHDR must be the first chunk');
      if (type === 'IHDR') {
        if (sawIhdr || length !== 13) throw new Error('invalid PNG IHDR');
        sawIhdr = true;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        if (data[10] !== 0 || data[11] !== 0) throw new Error('unsupported PNG compression or filter method');
        interlace = data[12];
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') {
        if (length !== 0) throw new Error('invalid PNG IEND');
        sawIend = true;
        offset = chunkEnd;
        break;
      }
      offset = chunkEnd;
    }
    if (!sawIhdr || !sawIend || offset !== buffer.length || width <= 0 || height <= 0 || idatChunks.length === 0) {
      throw new Error('incomplete PNG structure');
    }
    const expectedBytes = expectedInflatedPngBytes(width, height, bitDepth, colorType, interlace);
    if (expectedBytes <= 0) throw new Error('unsupported PNG pixel format');
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    if (inflated.length !== expectedBytes) {
      throw new Error(`PNG decoded byte length mismatch (${inflated.length} != ${expectedBytes})`);
    }
  } catch (err) {
    error = String(err && err.message || err);
  }
  return {
    valid: !error,
    byteLength: buffer.length,
    width,
    height,
    sha256,
    error,
  };
}

function inspectPngFile(filePath) {
  return inspectPngBuffer(fs.readFileSync(filePath));
}

function selectSystemInfo(source) {
  const info = source && typeof source === 'object' ? source : {};
  return {
    brand: info.brand || '',
    model: info.model || '',
    platform: info.platform || '',
    screenWidth: Number(info.screenWidth || 0),
    screenHeight: Number(info.screenHeight || 0),
    windowWidth: Number(info.windowWidth || 0),
    windowHeight: Number(info.windowHeight || 0),
    pixelRatio: Number(info.pixelRatio || 0),
    fontSizeSetting: Number(info.fontSizeSetting || 0),
    statusBarHeight: Number(info.statusBarHeight || 0),
    safeArea: info.safeArea || null,
  };
}

function selectToolInfo(source) {
  const info = source && typeof source === 'object' ? source : {};
  return {
    version: info.version || '',
    SDKVersion: info.SDKVersion || '',
    platform: info.platform || '',
    compileType: info.compileType || '',
    projectPath: info.projectPath || info.projectpath || info.projectRoot || '',
  };
}

async function collectDom(page, selectors) {
  const rows = [];
  for (const selector of selectors) {
    const elements = await page.$$(selector).catch(() => []);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const [text, size, offset] = await Promise.all([
        element.text().catch(() => ''),
        element.size().catch(() => null),
        element.offset().catch(() => null),
      ]);
      rows.push({ selector, index, text, size, offset });
    }
  }
  return rows;
}

async function captureDeclaredCaseData(page, data) {
  const source = data && typeof data === 'object' ? data : {};
  const keys = Object.keys(source).sort();
  const actual = {};
  for (const key of keys) actual[key] = await page.data(key);
  const expected = {};
  keys.forEach((key) => { expected[key] = source[key]; });
  const expectedHash = hashCanonical(expected);
  const actualHash = hashCanonical(actual);
  return { ok: expectedHash === actualHash, keys, expectedHash, actualHash };
}

function validateSelectorCoverage(dom, selectors, selectorExpectations = {}) {
  const sourceRows = Array.isArray(dom) ? dom : [];
  const counts = {};
  const visibleCounts = {};
  const contracts = {};
  const failures = [];
  (Array.isArray(selectors) ? selectors : []).forEach((selector) => {
    const rows = sourceRows.filter((row) => row.selector === selector);
    const declared = selectorExpectations && selectorExpectations[selector];
    const declaredIsObject = declared
      && typeof declared === 'object'
      && !Array.isArray(declared);
    const contract = typeof declared === 'number'
      ? { expectedCount: declared, visible: true }
      : { minCount: 1, visible: true, ...(declaredIsObject ? declared : {}) };
    counts[selector] = rows.length;
    visibleCounts[selector] = rows.filter((row) => (
      Number(row && row.size && row.size.width || 0) > 0
      && Number(row && row.size && row.size.height || 0) > 0
    )).length;
    contracts[selector] = contract;
    if (typeof declared !== 'undefined' && typeof declared !== 'number' && !declaredIsObject) {
      failures.push({ selector, reason: 'invalid-contract-type', actual: typeof declared });
    }
    for (const field of ['expectedCount', 'minCount', 'maxCount']) {
      if (Object.prototype.hasOwnProperty.call(contract, field)
          && (!Number.isInteger(contract[field]) || contract[field] <= 0)) {
        failures.push({ selector, reason: `invalid-${field}`, actual: contract[field] });
      }
    }
    if (Object.prototype.hasOwnProperty.call(contract, 'visible') && typeof contract.visible !== 'boolean') {
      failures.push({ selector, reason: 'invalid-visible', actual: contract.visible });
    }
    if (Number.isInteger(contract.minCount)
        && Number.isInteger(contract.maxCount)
        && contract.maxCount < contract.minCount) {
      failures.push({ selector, reason: 'invalid-count-range', minCount: contract.minCount, maxCount: contract.maxCount });
    }
    if (Number.isInteger(contract.expectedCount) && rows.length !== contract.expectedCount) {
      failures.push({ selector, reason: 'expected-count', expected: contract.expectedCount, actual: rows.length });
    }
    if (Number.isInteger(contract.minCount) && rows.length < contract.minCount) {
      failures.push({ selector, reason: 'min-count', expected: contract.minCount, actual: rows.length });
    }
    if (Number.isInteger(contract.maxCount) && rows.length > contract.maxCount) {
      failures.push({ selector, reason: 'max-count', expected: contract.maxCount, actual: rows.length });
    }
    if (contract.visible !== false && rows.length > 0 && visibleCounts[selector] !== rows.length) {
      failures.push({
        selector,
        reason: 'non-zero-size',
        expected: rows.length,
        actual: visibleCounts[selector],
      });
    }
  });
  Object.keys(selectorExpectations || {}).forEach((selector) => {
    if (!Object.prototype.hasOwnProperty.call(counts, selector)) {
      failures.push({ selector, reason: 'expectation-without-selector' });
    }
  });
  const missing = Object.keys(counts).filter((selector) => counts[selector] === 0);
  return {
    ok: missing.length === 0 && failures.length === 0,
    missing,
    counts,
    visibleCounts,
    contracts,
    failures,
  };
}

function validateHorizontalOverflow(pageSize, systemInfo, tolerance = 1) {
  const contentWidth = Number(pageSize && pageSize.width || 0);
  const viewportWidth = Number(systemInfo && systemInfo.windowWidth || 0);
  const overflow = contentWidth && viewportWidth
    ? Math.max(0, contentWidth - viewportWidth)
    : Number.POSITIVE_INFINITY;
  return {
    ok: Number.isFinite(overflow)
      && contentWidth > 0
      && viewportWidth > 0
      && overflow <= tolerance,
    contentWidth,
    viewportWidth,
    overflow,
    tolerance,
  };
}

function currentGitManifest(repoRoot = path.resolve(__dirname, '..', '..')) {
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  const statusResult = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  const changedResult = spawnSync('git', ['diff', 'HEAD', '--name-only', '-z', '--diff-filter=ACMRTUXBD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const head = String(headResult.stdout || '').trim();
  const status = String(statusResult.stdout || '').split(/\r?\n/).filter(Boolean);
  const dirtyPaths = Array.from(new Set(
    `${String(changedResult.stdout || '')}\0${String(untrackedResult.stdout || '')}`
      .split('\0')
      .map((item) => item.trim())
      .filter(Boolean)
  )).sort();
  const files = dirtyPaths.map((relativePath) => {
    const absolutePath = path.resolve(repoRoot, relativePath);
    const relative = path.relative(repoRoot, absolutePath);
    const insideRepo = !relative.startsWith('..') && !path.isAbsolute(relative);
    const exists = insideRepo
      && fs.existsSync(absolutePath)
      && fs.statSync(absolutePath).isFile();
    return {
      path: relativePath.replace(/\\/g, '/'),
      exists,
      sha256: exists
        ? crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')
        : '',
    };
  });
  return {
    ok: headResult.status === 0
      && statusResult.status === 0
      && changedResult.status === 0
      && untrackedResult.status === 0
      && /^[a-f0-9]{40}$/i.test(head),
    head,
    dirty: status.length > 0,
    status,
    files,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

function publishFilesAtomically(entries, transactionId = crypto.randomBytes(8).toString('hex'), options = {}) {
  const renameSync = options.renameSync || fs.renameSync;
  const removeFile = options.removeFile || safeUnlink;
  const targets = new Set();
  const normalized = entries.map((entry, index) => {
    const source = path.resolve(entry.source);
    const target = path.resolve(entry.target);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Atomic publication source is missing: ${source}`);
    }
    if (source === target) throw new Error(`Atomic publication source and target must differ: ${target}`);
    if (targets.has(target)) throw new Error(`Atomic publication target is duplicated: ${target}`);
    targets.add(target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const hadTarget = fs.existsSync(target);
    const normalizedEntry = {
      source,
      target,
      sourceSha256: sha256File(source),
      stage: path.join(path.dirname(target), `.${path.basename(target)}.${transactionId}.${index}.stage`),
      backup: path.join(path.dirname(target), `.${path.basename(target)}.${transactionId}.${index}.backup`),
      hadTarget,
      originalTargetSha256: hadTarget ? sha256File(target) : null,
      backupCreated: false,
      published: false,
    };
    if (fs.existsSync(normalizedEntry.stage) || fs.existsSync(normalizedEntry.backup)) {
      throw new Error(
        `Atomic publication transaction collision; preserving existing recovery evidence: ${normalizedEntry.target}`
      );
    }
    return normalizedEntry;
  });

  let committed = false;
  try {
    normalized.forEach((entry) => {
      fs.copyFileSync(entry.source, entry.stage);
      if (sha256File(entry.stage) !== entry.sourceSha256) {
        throw new Error(`Atomic publication stage hash mismatch: ${entry.target}`);
      }
    });
    normalized.forEach((entry) => {
      if (entry.hadTarget) {
        renameSync(entry.target, entry.backup);
        entry.backupCreated = true;
      }
      renameSync(entry.stage, entry.target);
      entry.published = true;
    });
    normalized.forEach((entry) => {
      if (!entry.published || sha256File(entry.target) !== entry.sourceSha256) {
        throw new Error(`Atomic publication target hash mismatch: ${entry.target}`);
      }
    });
    committed = true;
  } catch (err) {
    if (!committed) {
      const rollbackErrors = [];
      normalized.slice().reverse().forEach((entry) => {
        const recordRollbackError = (phase, rollbackError) => {
          rollbackErrors.push({
            target: entry.target,
            backup: entry.backup,
            phase,
            error: String(rollbackError && rollbackError.message || rollbackError),
          });
        };
        let targetExists = false;
        let targetSha256 = null;
        try {
          targetExists = fs.existsSync(entry.target);
          targetSha256 = targetExists ? sha256File(entry.target) : null;
        } catch (rollbackError) {
          recordRollbackError('inspect-target', rollbackError);
        }
        if (entry.hadTarget) {
          const targetIsOriginal = targetExists && targetSha256 === entry.originalTargetSha256;
          if (!targetIsOriginal) {
            let backupIsOriginal = false;
            try {
              backupIsOriginal = fs.existsSync(entry.backup)
                && sha256File(entry.backup) === entry.originalTargetSha256;
            } catch (rollbackError) {
              recordRollbackError('inspect-backup', rollbackError);
            }
            if (!backupIsOriginal) {
              recordRollbackError(
                'verify-backup',
                new Error(`Atomic publication backup cannot prove the original target: ${entry.target}`)
              );
            } else {
              if (targetExists) {
                try {
                  removeFile(entry.target);
                } catch (rollbackError) {
                  recordRollbackError('remove-new-target', rollbackError);
                }
              }
              if (!fs.existsSync(entry.target)) {
                try {
                  renameSync(entry.backup, entry.target);
                } catch (rollbackError) {
                  recordRollbackError('restore-backup', rollbackError);
                }
              }
            }
          }
        } else if (targetExists) {
          if (targetSha256 !== entry.sourceSha256) {
            recordRollbackError(
              'verify-new-target',
              new Error(`Atomic publication found an unexpected concurrent target: ${entry.target}`)
            );
          } else {
            try {
              removeFile(entry.target);
            } catch (rollbackError) {
              recordRollbackError('remove-new-target', rollbackError);
            }
          }
        }
        try { removeFile(entry.stage); } catch (cleanupError) { /* Best effort. */ }
      });
      const rollbackVerification = normalized.map((entry) => {
        try {
          const exists = fs.existsSync(entry.target);
          const sha256 = exists ? sha256File(entry.target) : null;
          const ok = entry.hadTarget
            ? exists && sha256 === entry.originalTargetSha256
            : !exists;
          return {
            target: entry.target,
            expectedExists: entry.hadTarget,
            actualExists: exists,
            expectedSha256: entry.originalTargetSha256,
            actualSha256: sha256,
            ok,
          };
        } catch (verificationError) {
          return {
            target: entry.target,
            expectedExists: entry.hadTarget,
            ok: false,
            error: String(verificationError && verificationError.message || verificationError),
          };
        }
      });
      const rollbackVerified = rollbackVerification.every((entry) => entry.ok === true);
      if (!rollbackVerified) {
        const indeterminate = new Error(
          `Atomic publication failed and rollback could not be verified: ${String(err && err.message || err)}`
        );
        indeterminate.code = 'ATOMIC_PUBLICATION_INDETERMINATE';
        indeterminate.cause = err;
        indeterminate.rollbackErrors = rollbackErrors;
        indeterminate.rollbackVerification = rollbackVerification;
        throw indeterminate;
      }
      err.rollbackErrors = rollbackErrors;
      err.rollbackVerification = rollbackVerification;
    }
    throw err;
  } finally {
    normalized.forEach((entry) => {
      try { removeFile(entry.stage); } catch (err) { /* Best effort. */ }
    });
  }

  const backupCleanupErrors = [];
  normalized.forEach((entry) => {
    try {
      removeFile(entry.backup);
    } catch (err) {
      backupCleanupErrors.push({
        path: entry.backup,
        error: String(err && err.message || err),
      });
    }
  });
  return {
    artifacts: normalized.map((entry) => ({
      target: entry.target,
      sha256: entry.sourceSha256,
    })),
    backupCleanupErrors,
  };
}

function writeJsonAtomically(filePath, value) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const candidate = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.candidate`
  );
  fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    publishFilesAtomically([{ source: candidate, target }]);
  } finally {
    safeUnlink(candidate);
  }
}

function buildProfileGateStorageFixture(now = Date.now()) {
  return {
    openid: 'ui-screenshot-user',
    openid_cached_at: Number(now),
    userProfile: {
      nickName: '截图球友',
      gender: 'male',
      avatar: 'cloud://ui-screenshot/avatar.png',
      avatarUrl: 'cloud://ui-screenshot/avatar.png',
    },
    profile_completed: true,
    profile_updated_at: Number(now),
  };
}

async function restoreCaseStorageFixture(miniProgram, state) {
  if (!state || state.applied !== true) return { ok: true, restored: false };
  const errors = [];
  for (const entry of state.storage) {
    try {
      if (entry.existed) {
        await miniProgram.callWxMethod('setStorageSync', entry.key, entry.value);
      } else {
        await miniProgram.callWxMethod('removeStorageSync', entry.key);
      }
    } catch (err) {
      errors.push(`${entry.key}: ${String(err && err.message || err)}`);
    }
  }
  try {
    const appResult = await miniProgram.evaluate(function restoreScreenshotOpenid(snapshot) {
      const app = typeof getApp === 'function' ? getApp() : null;
      if (!app || !app.globalData) return { ok: false, reason: 'getApp.globalData unavailable' };
      if (snapshot.existed) app.globalData.openid = snapshot.value;
      else delete app.globalData.openid;
      return {
        ok: true,
        existed: Object.prototype.hasOwnProperty.call(app.globalData, 'openid'),
        value: app.globalData.openid,
      };
    }, state.appOpenid);
    const appMatches = !!appResult
      && appResult.ok === true
      && appResult.existed === state.appOpenid.existed
      && (!state.appOpenid.existed
        || hashCanonical(appResult.value) === hashCanonical(state.appOpenid.value));
    if (!appMatches) errors.push('app.globalData.openid: post-restore verification failed');
  } catch (err) {
    errors.push(`app.globalData.openid: ${String(err && err.message || err)}`);
  }
  try {
    const info = await miniProgram.callWxMethod('getStorageInfoSync');
    if (!info || !Array.isArray(info.keys)) {
      errors.push('storage: getStorageInfoSync returned an invalid shape after restore');
    } else {
      const keys = new Set(info.keys);
      for (const entry of state.storage) {
        if (entry.existed !== keys.has(entry.key)) {
          errors.push(`${entry.key}: restored key presence does not match`);
          continue;
        }
        if (entry.existed) {
          const actual = await miniProgram.callWxMethod('getStorageSync', entry.key);
          if (hashCanonical(actual) !== hashCanonical(entry.value)) {
            errors.push(`${entry.key}: restored value does not match`);
          }
        }
      }
    }
  } catch (err) {
    errors.push(`storage post-restore verification: ${String(err && err.message || err)}`);
  }
  return { ok: errors.length === 0, restored: true, errors };
}

async function applyCaseStorageFixture(miniProgram, fixture, options = {}) {
  if (!fixture || fixture.profileGate !== true) {
    return { state: null, evidence: { ok: true, applied: false } };
  }
  if (!miniProgram
      || typeof miniProgram.callWxMethod !== 'function'
      || typeof miniProgram.evaluate !== 'function') {
    throw new Error('Profile-gated screenshot fixtures require callWxMethod and evaluate support.');
  }
  const values = buildProfileGateStorageFixture(options.now || Date.now());
  const info = await miniProgram.callWxMethod('getStorageInfoSync');
  if (!info || !Array.isArray(info.keys)) {
    throw new Error('Profile-gated screenshot fixture requires getStorageInfoSync().keys.');
  }
  const existingKeys = new Set(info.keys);
  const storage = [];
  for (const key of Object.keys(values)) {
    const existed = existingKeys.has(key);
    storage.push({
      key,
      existed,
      value: existed ? await miniProgram.callWxMethod('getStorageSync', key) : undefined,
    });
  }
  const appOpenid = await miniProgram.evaluate(function snapshotScreenshotOpenid() {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (!app || !app.globalData) return { available: false, existed: false, value: undefined };
    return {
      available: true,
      existed: Object.prototype.hasOwnProperty.call(app.globalData, 'openid'),
      value: app.globalData.openid,
    };
  });
  if (!appOpenid || appOpenid.available !== true) {
    throw new Error('Profile-gated screenshot fixture cannot snapshot getApp().globalData.openid.');
  }
  const state = { applied: true, storage, appOpenid };
  try {
    for (const [key, value] of Object.entries(values)) {
      await miniProgram.callWxMethod('setStorageSync', key, value);
    }
    const appResult = await miniProgram.evaluate(function applyScreenshotOpenid(value) {
      const app = typeof getApp === 'function' ? getApp() : null;
      if (!app || !app.globalData) return { ok: false };
      app.globalData.openid = value;
      return { ok: app.globalData.openid === value };
    }, values.openid);
    if (!appResult || appResult.ok !== true) {
      throw new Error('Unable to apply screenshot fixture openid to getApp().globalData.');
    }
    const actual = {};
    for (const key of Object.keys(values)) {
      actual[key] = await miniProgram.callWxMethod('getStorageSync', key);
    }
    const expectedHash = hashCanonical(values);
    const actualHash = hashCanonical(actual);
    if (expectedHash !== actualHash) throw new Error('Profile-gated screenshot storage fixture verification failed.');
    return {
      state,
      evidence: {
        ok: true,
        applied: true,
        kind: 'profile-gate',
        keys: Object.keys(values).sort(),
        valueHash: expectedHash,
      },
    };
  } catch (err) {
    const rollback = await restoreCaseStorageFixture(miniProgram, state);
    const rollbackMessage = rollback.ok ? '' : ` Rollback failed: ${rollback.errors.join('; ')}`;
    const wrapped = new Error(`${String(err && err.message || err)}${rollbackMessage}`);
    wrapped.cause = err;
    wrapped.storageFixtureCleanup = rollback;
    throw wrapped;
  }
}

async function isolateFixtureRuntime(miniProgram, phase) {
  if (!miniProgram || typeof miniProgram.evaluate !== 'function') {
    throw new Error('Fixture injection requires miniProgram.evaluate for stale-request isolation.');
  }
  const result = await miniProgram.evaluate(function isolateWaterFixture(phaseValue) {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    if (!current) return { ok: false, phase: phaseValue, reason: 'current page unavailable' };
    const bump = (key) => {
      current[key] = Number(current[key] || 0) + 1000000;
      return current[key];
    };
    const loadRequestSeq = bump('_loadRequestSeq');
    current._latestSuccessfulLoadSeq = loadRequestSeq;
    const feedRequestSeq = bump('_feedRequestSeq');
    const detailRequestSeq = bump('_detailRequestSeq');
    bump('_historyRequestSeq');
    bump('_historyRoundRequestSeq');
    bump('_correctionRequestSeq');
    current._isVisible = false;
    current._pollInFlight = false;
    current._pollFailureCount = 0;
    current._burstRemaining = 0;
    current._mutationIntents = {};
    if (typeof current.clearRefreshTimer === 'function') current.clearRefreshTimer();
    if (typeof current.clearReceiptTimer === 'function') current.clearReceiptTimer();
    if (typeof current.clearHighlightTimer === 'function') current.clearHighlightTimer();
    if (typeof current.closeSheets === 'function') current.closeSheets();
    if (typeof current.closeHistorySheet === 'function') current.closeHistorySheet();
    return {
      ok: true,
      phase: phaseValue,
      loadRequestSeq,
      feedRequestSeq,
      detailRequestSeq,
      pollingFrozen: current._isVisible === false && !current._refreshTimer,
    };
  }, phase);
  if (!result || result.ok !== true || result.pollingFrozen !== true) {
    throw new Error(`Water fixture isolation failed during ${phase}: ${JSON.stringify(result || {})}`);
  }
  return result;
}

async function isolatePageDataRuntime(miniProgram, phase) {
  if (!miniProgram || typeof miniProgram.evaluate !== 'function') {
    throw new Error('Page data fixture isolation requires miniProgram.evaluate.');
  }
  const result = await miniProgram.evaluate(function isolateScreenshotPageData(phaseValue) {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    if (!current) return { ok: false, phase: phaseValue, reason: 'current page unavailable' };
    const generationKeys = [
      '_fetchSeq', '_lifecycleGeneration', '_pageLifecycleSeq', '_profileSyncSeq',
      '_identityAttemptSeq', '_recentLoadSeq', '_avatarResolveGen', '_entryGeneration',
      '_loadRequestSeq', '_feedRequestSeq', '_detailRequestSeq',
    ];
    const generations = {};
    generationKeys.forEach((key) => {
      current[key] = Number(current[key] || 0) + 1000000;
      generations[key] = current[key];
    });
    const methodCalls = [];
    const methodErrors = [];
    const callIfPresent = (name) => {
      if (typeof current[name] !== 'function') return;
      try {
        current[name]();
        methodCalls.push(name);
      } catch (err) {
        methodErrors.push(`${name}: ${String(err && err.message || err)}`);
      }
    };
    [
      'invalidateFetchSeq', 'invalidateWatchGen', 'clearLockTimers', 'clearNavTimers',
      'clearPostSaveNavTimer', 'clearIdentityTimeout', 'clearRefreshTimer',
      'clearReceiptTimer', 'clearHighlightTimer',
    ].forEach(callIfPresent);
    if (current._autoBackTimer) {
      try {
        clearTimeout(current._autoBackTimer);
        current._autoBackTimer = null;
      } catch (err) {
        methodErrors.push(`_autoBackTimer: ${String(err && err.message || err)}`);
      }
    }
    if (typeof current._offNetwork === 'function') {
      try {
        current._offNetwork();
        current._offNetwork = null;
        methodCalls.push('_offNetwork');
      } catch (err) {
        methodErrors.push(`_offNetwork: ${String(err && err.message || err)}`);
      }
    }
    current._pageActive = false;
    current._isVisible = false;
    return {
      ok: methodErrors.length === 0,
      phase: phaseValue,
      generations,
      methodCalls,
      methodErrors,
      pageFrozen: current._pageActive === false,
    };
  }, phase);
  if (!result || result.ok !== true || result.pageFrozen !== true) {
    throw new Error(`Page data fixture isolation failed during ${phase}: ${JSON.stringify(result || {})}`);
  }
  return result;
}

async function applyFixture(page, fixture, miniProgram) {
  if (!fixture || typeof fixture !== 'object') return null;
  const isolation = await isolateFixtureRuntime(miniProgram, 'before');
  if (fixture.roomData) await page.callMethod('applyRoomData', fixture.roomData);
  if (fixture.pageData) await page.setData(fixture.pageData);
  for (const method of Array.isArray(fixture.methods) ? fixture.methods : []) {
    await page.callMethod(method.name, ...(Array.isArray(method.args) ? method.args : []));
  }
  if (fixture.postData) await page.setData(fixture.postData);
  return isolation;
}

async function cleanupCaptureRun(miniProgram, options = {}) {
  const cleanupRoute = String(options.cleanupRoute || '/pages/launch/index');
  const page = await routeCasePage(miniProgram, 'reLaunch', cleanupRoute, {
    routeTimeoutMs: Number(options.routeTimeoutMs || 25000),
    recoveryTimeoutMs: Number(options.recoveryTimeoutMs || 10000),
  });
  const current = await timeout(
    miniProgram.send('App.getCurrentPage'),
    5000,
    'run-cleanup:App.getCurrentPage'
  );
  const stack = await timeout(
    miniProgram.evaluate(function inspectScreenshotCleanupStack() {
      if (typeof getCurrentPages !== 'function') return { available: false, length: 0, route: '' };
      const pages = getCurrentPages();
      const currentPage = pages.length ? pages[pages.length - 1] : null;
      return {
        available: true,
        length: pages.length,
        route: currentPage && (currentPage.route || currentPage.__route__ || ''),
      };
    }),
    5000,
    'run-cleanup:getCurrentPages'
  );
  const routeOk = locationsMatch(current, cleanupRoute);
  const stackOk = !!stack
    && stack.available === true
    && Number(stack.length) === 1
    && normalizeRoute(stack.route) === normalizeRoute(cleanupRoute);
  if (!routeOk || !stackOk) {
    throw new Error(
      `Run cleanup did not prove a one-page neutral rebuild: current=${normalizeRoute(current)}, stack=${JSON.stringify(stack || {})}.`
    );
  }
  return {
    ok: true,
    strategy: 'neutral-route-rebuild',
    route: normalizeLocation(current),
    pagePath: normalizeRoute(page),
    stack,
  };
}

async function cleanupFixture(page, miniProgram) {
  return cleanupCaptureRun(miniProgram);
}

async function routeCasePage(miniProgram, routeMethod, targetPath, options = {}) {
  const routeTimeoutMs = Number(options.routeTimeoutMs || 25000);
  try {
    return await timeout(
      miniProgram[routeMethod](targetPath),
      routeTimeoutMs,
      `${normalizeRoute(targetPath)}:${routeMethod}`
    );
  } catch (routeError) {
    if (!/timeout|timed out/i.test(String(routeError && routeError.message || routeError))) throw routeError;
    const recoveryTimeoutMs = Number(options.recoveryTimeoutMs || 10000);
    const recoveryPollMs = Number(options.recoveryPollMs || 250);
    const deadline = Date.now() + recoveryTimeoutMs;
    let lastError = routeError;
    while (Date.now() < deadline) {
      try {
        const remainingMs = Math.max(1, deadline - Date.now());
        const page = await timeout(
          miniProgram.currentPage(),
          Math.min(5000, remainingMs),
          `${normalizeRoute(targetPath)}:${routeMethod}:currentPage`
        );
        if (page && locationsMatch(page, targetPath)) return page;
        lastError = new Error(
          `Route recovery found ${normalizeRoute(page && page.path)} instead of ${normalizeRoute(targetPath)}.`
        );
      } catch (currentPageError) {
        lastError = currentPageError;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(recoveryPollMs, remainingMs)));
      }
    }
    const error = new Error(
      `Route acknowledgement timed out and recovery failed for ${normalizeRoute(targetPath)}: ${String(lastError && lastError.message || lastError)}`
    );
    error.cause = routeError;
    throw error;
  }
}

async function bindRuntimeSession(miniProgram, marker) {
  return miniProgram.evaluate(function bindBackgroundCaptureSession(value) {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (!app) return { ok: false, reason: 'getApp unavailable' };
    app.__codexBackgroundCaptureSession = value;
    return {
      ok: true,
      sessionId: app.__codexBackgroundCaptureSession.sessionId,
      projectPathHash: app.__codexBackgroundCaptureSession.projectPathHash,
      listenerIdentityHash: app.__codexBackgroundCaptureSession.listenerIdentityHash,
    };
  }, marker);
}

async function readRuntimeSession(miniProgram) {
  return miniProgram.evaluate(function readBackgroundCaptureSession() {
    const app = typeof getApp === 'function' ? getApp() : null;
    return app && app.__codexBackgroundCaptureSession || null;
  });
}

function validateSessionRecord(session, config) {
  const source = session && typeof session === 'object' ? session : {};
  const expectedPath = normalizeProjectPath(config.sourceProjectPath);
  const checks = {
    kind: source.kind === SESSION_KIND,
    sessionId: /^[a-f0-9]{64}$/i.test(String(source.sessionId || '')),
    endpoint: source.endpoint === config.wsEndpoint && isLocalWebSocketEndpoint(source.endpoint),
    projectPath: normalizeProjectPath(source.sourceProjectPath) === expectedPath && !!expectedPath,
    projectPathHash: source.projectPathHash === hashCanonical(expectedPath),
    expectedWindowWidth: Number(source.expectedWindowWidth) === Number(config.expectedWindowWidth)
      && Number(source.expectedWindowWidth) > 0,
    sdkVersion: !!String(source.expectedSDKVersion || ''),
    projectBinding: !!source.projectBinding
      && source.projectBinding.ok === true
      && source.projectBinding.method === PROJECT_BINDING_METHOD
      && source.projectBinding.listenerIdentityHash === listenerIdentityHash(source.listenerIdentity),
    listenerIdentity: !!source.listenerIdentity
      && source.listenerIdentity.ok === true
      && Number(source.listenerIdentity.port) === endpointPort(config.wsEndpoint)
      && Number(source.listenerIdentity.owningProcessId) > 0
      && !!String(source.listenerIdentity.processStartFileTimeUtc || ''),
    backgroundCaptureProcessFlags:
      validateBackgroundCaptureProcessFlags(source.listenerIdentity).ok,
    gitManifestHash: /^[a-f0-9]{64}$/i.test(String(source.gitManifestHash || '')),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

async function verifySessionBinding(miniProgram, config, options = {}) {
  const sessionValidation = validateSessionRecord(config.session, config);
  const listenerResolver = options.resolveListenerIdentity || resolveListenerIdentity;
  const currentListenerIdentity = listenerResolver(config.wsEndpoint);
  const listenerValidation = validateListenerIdentity(
    currentListenerIdentity,
    config.session && config.session.listenerIdentity
  );
  const [marker, rawToolInfo, currentPageInfo, rawSystemInfo] = await Promise.all([
    timeout(readRuntimeSession(miniProgram), 5000, 'doctor:runtime-session'),
    timeout(miniProgram.send('Tool.getInfo'), 5000, 'doctor:Tool.getInfo'),
    timeout(miniProgram.send('App.getCurrentPage'), 5000, 'doctor:App.getCurrentPage'),
    timeout(miniProgram.systemInfo(), 5000, 'doctor:systemInfo'),
  ]);
  const toolInfo = selectToolInfo(rawToolInfo);
  const systemInfo = selectSystemInfo(rawSystemInfo);
  const toolProjectPath = normalizeProjectPath(toolInfo.projectPath);
  const expectedProjectPath = normalizeProjectPath(config.sourceProjectPath);
  const git = currentGitManifest(REPOSITORY_ROOT);
  const checks = {
    sessionRecord: sessionValidation.ok,
    marker: !!marker
      && marker.sessionId === config.session.sessionId
      && marker.projectPathHash === config.session.projectPathHash
      && marker.listenerIdentityHash === config.session.projectBinding.listenerIdentityHash,
    listenerIdentity: listenerValidation.ok,
    sdkVersion: toolInfo.SDKVersion === config.session.expectedSDKVersion,
    viewport: systemInfo.windowWidth === config.expectedWindowWidth,
    route: !!normalizeRoute(currentPageInfo),
    toolProjectPath: !toolProjectPath || toolProjectPath === expectedProjectPath,
    sourceSnapshot: git.ok === true
      && hashCanonical(git) === config.session.gitManifestHash,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    sessionValidation,
    listenerValidation,
    currentListenerIdentity,
    marker,
    toolInfo,
    currentPageInfo,
    systemInfo,
    git,
  };
}

function validateProjectProvenance({ connection = {}, toolInfo = {} } = {}) {
  const expectedProjectPath = normalizeProjectPath(connection.sourceProjectPath);
  const toolProjectPath = normalizeProjectPath(toolInfo.projectPath);
  if (!expectedProjectPath) {
    return { ok: false, reason: 'missing exact sourceProjectPath input', mode: connection.mode || '' };
  }
  if (toolProjectPath) {
    return {
      ok: toolProjectPath === expectedProjectPath,
      reason: toolProjectPath === expectedProjectPath ? '' : 'Tool.getInfo projectPath does not match WEAPP_PROJECT_PATH',
      mode: connection.mode || '',
      evidence: 'Tool.getInfo.projectPath',
      expectedProjectPath,
      actualProjectPath: toolProjectPath,
    };
  }
  const binding = connection.sessionBinding || {};
  const trustedSessionBinding = binding.ok === true
    && binding.sessionValidation
    && binding.sessionValidation.checks
    && binding.sessionValidation.checks.projectBinding === true;
  return {
    ok: trustedSessionBinding,
    reason: trustedSessionBinding ? '' : 'trusted background session receipt or runtime nonce does not match',
    mode: connection.mode || '',
    evidence: trustedSessionBinding ? 'exact-project-session-receipt+runtime-nonce' : '',
    expectedProjectPath,
    endpoint: connection.endpoint || '',
    sessionFile: connection.sessionFile || '',
  };
}

function validateReceiptEvidence(evidence = {}) {
  const surface = evidence.captureSurface || 'page';
  const isFrame = surface === 'simulator-frame';
  const expectedWidth = Number(evidence.expectedWindowWidth || 0);
  const systemInfo = evidence.systemInfo || {};
  const png = evidence.png || {};
  const git = evidence.git || {};
  const sdkVersion = String(evidence.toolInfo && evidence.toolInfo.SDKVersion || '');
  const pixelRatio = Number(systemInfo.pixelRatio || 0);
  const windowWidth = Number(systemInfo.windowWidth || 0);
  const windowHeight = Number(systemInfo.windowHeight || 0);
  const pngWidth = Number(png.width || 0);
  const pngHeight = Number(png.height || 0);
  const pngScaleX = windowWidth > 0 ? pngWidth / windowWidth : 0;
  const pngScaleY = windowHeight > 0 ? pngHeight / windowHeight : 0;
  const pngScaleTolerance = windowWidth > 0 && windowHeight > 0
    ? Math.max(1 / windowWidth, 1 / windowHeight)
    : 0;
  const pngScaleIsReasonable = Number.isFinite(pngScaleX)
    && Number.isFinite(pngScaleY)
    && pngScaleX >= 0.5
    && pngScaleX <= 4
    && pngScaleY >= 0.5
    && pngScaleY <= 4;
  const pngGeometryIsProportional = pngScaleIsReasonable
    && Math.abs(pngScaleX - pngScaleY) <= pngScaleTolerance;
  const dirtyFiles = Array.isArray(git.files) ? git.files : [];
  const dirtyFilesValid = (!git.dirty || dirtyFiles.length > 0) && dirtyFiles.every((item) => (
    !!String(item && item.path || '')
    && typeof item.exists === 'boolean'
    && (item.exists
      ? /^[a-f0-9]{64}$/i.test(String(item.sha256 || ''))
      : String(item.sha256 || '') === '')
  ));
  const checks = {
    captureSurface: ['page', 'simulator-frame'].includes(surface),
    expectedWidth: expectedWidth > 0 && windowWidth === expectedWidth,
    sdkVersion: !!sdkVersion && (!evidence.expectedSDKVersion || sdkVersion === evidence.expectedSDKVersion),
    route: !!normalizeRoute(evidence.expectedRoute)
      && locationsMatch(evidence.currentPageInfo, evidence.expectedRoute),
    png: !!png.valid
      && png.byteLength > 20 * 1024
      && /^[a-f0-9]{64}$/i.test(String(png.sha256 || ''))
      && Number.isInteger(pngWidth) && pngWidth > 0
      && Number.isInteger(pngHeight) && pngHeight > 0
      && Number.isFinite(windowWidth) && windowWidth > 0
      && Number.isFinite(windowHeight) && windowHeight > 0
      && (isFrame || pngGeometryIsProportional),
    pixelRatio: pixelRatio > 0,
    fontSizeSetting: Number(systemInfo.fontSizeSetting || 0) > 0,
    git: git.ok === true
      && /^[a-f0-9]{40}$/i.test(String(git.head || ''))
      && typeof git.dirty === 'boolean'
      && Array.isArray(git.status)
      && dirtyFilesValid,
    selectorCoverage: !!(evidence.selectorCoverage && evidence.selectorCoverage.ok),
    horizontalOverflow: !!(evidence.horizontalOverflow && evidence.horizontalOverflow.ok),
    projectProvenance: !!(evidence.projectProvenance && evidence.projectProvenance.ok),
    horizontalAlignment: !evidence.horizontalAlignment || evidence.horizontalAlignment.ok === true,
    caseData: !!evidence.caseData && evidence.caseData.ok === true
      && /^[a-f0-9]{32}$/.test(String(evidence.caseData.fixtureNonce || ''))
      && /^[a-f0-9]{64}$/.test(String(evidence.caseData.stateBeforeHash || ''))
      && evidence.caseData.stateBeforeHash === evidence.caseData.stateAfterHash,
    sourceSnapshot: /^[a-f0-9]{64}$/i.test(String(evidence.expectedGitManifestHash || ''))
      && hashCanonical(git) === evidence.expectedGitManifestHash,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    captureSurface: {
      kind: surface,
      method: 'App.captureScreenshot',
      pageGeometryVerified: surface === 'page' && checks.png,
      systemChromeNoise: isFrame,
    },
    pngScaleX: isFrame ? null : pngScaleX,
    pngScaleY: isFrame ? null : pngScaleY,
    pngScaleTolerance: isFrame ? null : pngScaleTolerance,
  };
}

async function runDoctor(miniProgram, connection, config, options = {}) {
  const rebindViewport = options.rebindViewport;
  const isViewportRebind = rebindViewport !== undefined;
  if (isViewportRebind && (!Number.isInteger(rebindViewport) || rebindViewport <= 0)) {
    throw new Error('Viewport rebind requires an explicit positive target width.');
  }
  const originalWidth = Number(config.session && config.session.expectedWindowWidth);
  const sessionValidation = validateSessionRecord(config.session, isViewportRebind
    ? { ...config, expectedWindowWidth: originalWidth } : config);
  const listenerResolver = options.resolveListenerIdentity || resolveListenerIdentity;
  const currentListenerIdentity = listenerResolver(config.wsEndpoint);
  const listenerValidation = validateListenerIdentity(
    currentListenerIdentity,
    config.session && config.session.listenerIdentity
  );
  const [runtimeMarkerRead, rawToolInfo, currentPageInfo, rawSystemInfo] = await Promise.all([
    timeout(readRuntimeSession(miniProgram), 5000, 'doctor:runtime-session-before')
      .then((value) => ({ ok: true, value }))
      .catch((err) => ({ ok: false, value: null, error: String(err && err.message || err) })),
    timeout(miniProgram.send('Tool.getInfo'), 5000, 'doctor:Tool.getInfo'),
    timeout(miniProgram.send('App.getCurrentPage'), 5000, 'doctor:App.getCurrentPage'),
    timeout(miniProgram.systemInfo(), 5000, 'doctor:systemInfo'),
  ]);
  const toolInfo = selectToolInfo(rawToolInfo);
  const systemInfo = selectSystemInfo(rawSystemInfo);
  const runtimeMarkerBefore = runtimeMarkerRead.value;
  const expectedProjectPath = normalizeProjectPath(config.sourceProjectPath);
  const toolProjectPath = normalizeProjectPath(toolInfo.projectPath);
  const git = currentGitManifest(REPOSITORY_ROOT);
  const currentGitManifestHash = hashCanonical(git);
  const priorMarkerMatchesSession = !!runtimeMarkerBefore
    && runtimeMarkerBefore.sessionId === (config.session && config.session.sessionId)
    && runtimeMarkerBefore.projectPathHash === (config.session && config.session.projectPathHash)
    && runtimeMarkerBefore.listenerIdentityHash === (
      config.session && config.session.projectBinding && config.session.projectBinding.listenerIdentityHash
    );
  const sourceSnapshotChanged = currentGitManifestHash !== String(
    config.session && config.session.gitManifestHash || ''
  );
  const needsCompileProof = sourceSnapshotChanged || isViewportRebind;
  const pendingRefresh = config.session && config.session.pendingRefresh || null;
  const pendingMatchesCurrentSource = !!pendingRefresh
    && /^[a-f0-9]{64}$/i.test(String(pendingRefresh.challengeId || ''))
    && pendingRefresh.targetGitManifestHash === currentGitManifestHash
    && (isViewportRebind
      ? !!pendingRefresh.viewportRebind && pendingRefresh.viewportRebind.from === originalWidth
        && pendingRefresh.viewportRebind.to === rebindViewport
      : !pendingRefresh.viewportRebind);
  const runtimeMarkerMatchesPendingChallenge = pendingMatchesCurrentSource
    && !!runtimeMarkerBefore
    && runtimeMarkerBefore.refreshChallengeId === pendingRefresh.challengeId
    && runtimeMarkerBefore.targetGitManifestHash === currentGitManifestHash
    && runtimeMarkerBefore.projectPathHash === (config.session && config.session.projectPathHash)
    && runtimeMarkerBefore.listenerIdentityHash === (
      config.session && config.session.projectBinding && config.session.projectBinding.listenerIdentityHash
    );
  const changedSourceCompileProven = needsCompileProof
    && pendingMatchesCurrentSource
    && runtimeMarkerBefore === null;
  const baseChecks = {
    sessionRecord: sessionValidation.ok,
    runtimeMarkerReadable: runtimeMarkerRead.ok === true,
    listenerIdentity: listenerValidation.ok,
    toolProjectPath: !toolProjectPath || toolProjectPath === expectedProjectPath,
    sdkVersion: !!toolInfo.SDKVersion && toolInfo.SDKVersion === config.expectedSDKVersion
      && (!isViewportRebind || toolInfo.SDKVersion === config.session.expectedSDKVersion),
    viewport: systemInfo.windowWidth === (isViewportRebind ? rebindViewport : config.expectedWindowWidth),
    route: !!normalizeRoute(currentPageInfo),
    git: git.ok === true,
  };
  const checks = {
    ...baseChecks,
    runtimeRecompiledForChangedSource: !needsCompileProof || changedSourceCompileProven,
  };
  let marker = null;
  let markerBinding = null;
  let challengeBinding = null;
  let pendingSession = null;
  let action = '';

  if (Object.values(baseChecks).every(Boolean)
      && needsCompileProof
      && !changedSourceCompileProven) {
    if (runtimeMarkerMatchesPendingChallenge) {
      action = 'Source refresh challenge is still present. Compile/reload the exact worktree, then run ui:session:refresh again.';
    } else {
      const challengeId = crypto.randomBytes(32).toString('hex');
      const challengeMarker = {
        sessionId: config.session.sessionId,
        projectPathHash: config.session.projectPathHash,
        endpointHash: hashCanonical(config.wsEndpoint),
        listenerIdentityHash: config.session.projectBinding.listenerIdentityHash,
        refreshChallengeId: challengeId,
        targetGitManifestHash: currentGitManifestHash,
        boundAt: new Date().toISOString(),
      };
      challengeBinding = await timeout(
        bindRuntimeSession(miniProgram, challengeMarker),
        5000,
        'doctor:bind-source-refresh-challenge'
      );
      const challengeOk = !!challengeBinding
        && challengeBinding.ok === true
        && challengeBinding.sessionId === challengeMarker.sessionId
        && challengeBinding.projectPathHash === challengeMarker.projectPathHash
        && challengeBinding.listenerIdentityHash === challengeMarker.listenerIdentityHash;
      const gitAfterChallenge = currentGitManifest(REPOSITORY_ROOT);
      const sourceStable = gitAfterChallenge.ok === true
        && hashCanonical(gitAfterChallenge) === currentGitManifestHash;
      if (challengeOk && sourceStable) {
        pendingSession = {
          ...config.session,
          pendingRefresh: {
            challengeId,
            targetGitManifestHash: currentGitManifestHash,
            ...(isViewportRebind ? { viewportRebind: { from: originalWidth, to: rebindViewport } } : {}),
            createdAt: new Date().toISOString(),
          },
        };
        writeJsonAtomically(config.sessionFile, pendingSession);
        action = 'Source refresh challenge created. Compile/reload the exact worktree, then run ui:session:refresh again without changing source.';
      } else {
        action = sourceStable
          ? 'Unable to bind the source refresh challenge.'
          : 'Source changed while creating the refresh challenge; run ui:session:refresh again.';
      }
    }
  }

  if (Object.values(checks).every(Boolean)) {
    marker = {
      sessionId: crypto.randomBytes(32).toString('hex'),
      projectPathHash: config.session.projectPathHash,
      endpointHash: hashCanonical(config.wsEndpoint),
      listenerIdentityHash: config.session.projectBinding.listenerIdentityHash,
      boundAt: new Date().toISOString(),
    };
    markerBinding = await timeout(
      bindRuntimeSession(miniProgram, marker),
      5000,
      'doctor:bind-runtime-session'
    );
  }
  checks.marker = !!markerBinding
    && markerBinding.ok === true
    && markerBinding.sessionId === marker.sessionId
    && markerBinding.projectPathHash === marker.projectPathHash
    && markerBinding.listenerIdentityHash === marker.listenerIdentityHash;
  if (isViewportRebind && markerBinding) {
    const finalSystemInfo = selectSystemInfo(await miniProgram.systemInfo());
    checks.viewportStableDuringDoctor = finalSystemInfo.windowWidth === rebindViewport;
    checks.listenerStableDuringDoctor = validateListenerIdentity(listenerResolver(config.wsEndpoint), config.session.listenerIdentity).ok;
  }
  const gitAfterBinding = markerBinding ? currentGitManifest(REPOSITORY_ROOT) : null;
  checks.sourceStableDuringDoctor = !markerBinding || (
    gitAfterBinding.ok === true && hashCanonical(gitAfterBinding) === currentGitManifestHash
  );
  const ok = Object.values(checks).every(Boolean);
  const session = ok ? {
    ...config.session,
    refreshedAt: new Date().toISOString(),
    sessionId: marker.sessionId,
    toolInfo,
    currentPageInfo,
    systemInfo,
    gitHead: git.head,
    gitManifestHash: currentGitManifestHash,
    ...(isViewportRebind ? {
      expectedWindowWidth: rebindViewport,
      viewportRebindings: [...(config.session.viewportRebindings || []), {
        from: originalWidth, to: rebindViewport, reboundAt: new Date().toISOString(),
        priorSessionId: config.session.sessionId,
      }],
    } : {}),
  } : null;
  if (session) {
    delete session.pendingRefresh;
    writeJsonAtomically(config.sessionFile, session);
  }
  return {
    kind: 'weapp-ui-doctor-result-v3',
    ok,
    checks,
    sessionValidation,
    listenerValidation,
    currentListenerIdentity,
    runtimeMarkerBefore,
    runtimeMarkerRead,
    sourceSnapshotChanged,
    priorMarkerMatchesSession,
    pendingMatchesCurrentSource,
    runtimeMarkerMatchesPendingChallenge,
    changedSourceCompileProven,
    challengeBinding,
    pendingSession,
    action,
    markerBinding,
    sessionFile: config.sessionFile,
    session,
    connectionMode: connection.mode,
    toolInfo,
    currentPageInfo,
    systemInfo,
    git,
  };
}

async function checkCaseStyles(page, expectations = {}) {
  const failures = [];
  const values = [];
  for (const [selector, properties] of Object.entries(expectations)) {
    let elements;
    try { elements = await page.$$(selector); } catch (_) { elements = []; }
    if (!elements.length) failures.push({ selector, reason: 'missing-style-element' });
    for (let index = 0; index < elements.length; index += 1) {
      for (const [property, expected] of Object.entries(properties)) {
        let actual = null;
        try { actual = await elements[index].style(property); } catch (_) { /* Not ready. */ }
        values.push({ selector, index, property, actual });
        if (actual !== expected) failures.push({ selector, index, property, expected, actual });
      }
    }
  }
  return { ok: failures.length === 0, values, failures };
}

async function waitForCaseReady(page, item, timeoutMs, options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollMs = Number(options.pollMs || 50);
  const deadline = now() + timeoutMs;
  for (const selector of item.selectors) {
    const remainingMs = Math.max(1, deadline - now());
    await timeout(page.waitFor(selector), remainingMs, `ready:${selector}`);
  }
  let lastCoverage = null;
  while (now() <= deadline) {
    const dom = await collectDom(page, item.selectors);
    const selectorCoverage = validateSelectorCoverage(dom, item.selectors, item.selectorExpectations);
    const styleCoverage = await checkCaseStyles(page, item.styleExpectations);
    if (selectorCoverage.ok && styleCoverage.ok) return { ok: true, dom, selectorCoverage, styleCoverage };
    lastCoverage = { selectorCoverage, styleCoverage };
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs));
  }
  const error = new Error(`selector contract did not become ready: ${JSON.stringify(lastCoverage || {})}`);
  error.selectorCoverage = lastCoverage;
  throw error;
}

async function waitForVisualSettle(page, item, options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs || 5000);
  let previousHash = '';
  let samples = 0;
  do {
    const dom = await collectDom(page, item.selectors);
    const reveal = await page.$$('.reveal');
    const styles = await Promise.all(reveal.map(async (element) => ({
      opacity: await element.style('opacity'),
      transform: await element.style('transform'),
    })));
    const styleCoverage = await checkCaseStyles(page, item.styleExpectations);
    const ready = validateSelectorCoverage(dom, item.selectors, item.selectorExpectations).ok
      && styleCoverage.ok
      && styles.every((style) => Number(style.opacity) === 1);
    const currentHash = hashCanonical({ dom, styles, caseStyles: styleCoverage.values });
    samples += 1;
    if (ready && currentHash === previousHash) return { ok: true, samples, stateHash: currentHash, styleCoverage };
    previousHash = ready ? currentHash : '';
    await sleep(75);
  } while (now() <= deadline);
  throw new Error('Visual state did not stabilize before the deadline.');
}

async function runCase(name, miniProgram, connection, options = {}) {
  const item = cases[name];
  if (!item) throw new Error(`Unknown case: ${name}`);
  const config = options.config || connection.config;
  const runId = String(options.runId || `run-${Date.now()}`);
  const expectedWidth = Number(item.expectedWindowWidth || config.expectedWindowWidth || 0);
  if (!Number.isFinite(expectedWidth) || expectedWidth <= 0) {
    throw new Error(`${name}: WEAPP_EXPECTED_WINDOW_WIDTH is required when the case does not declare a fixed viewport.`);
  }
  const candidateDir = path.join(config.runRoot, runId, 'candidate');
  const candidateOutput = path.join(candidateDir, `${name}.png`);
  const candidateReceiptPath = path.join(candidateDir, `${name}.receipt.json`);
  const finalOutput = path.join(config.outDir, `${name}.png`);
  const finalReceiptPath = path.join(config.outDir, `${name}.receipt.json`);
  fs.mkdirSync(candidateDir, { recursive: true });

  const exceptionStart = connection.runtimeEvents.exceptions.length;
  const consoleStart = connection.runtimeEvents.console.length;
  let page = null;
  let fixtureIsolation = null;
  let fixtureCleanup = null;
  let cleanupError = null;
  let storageFixtureState = null;
  let storageFixtureEvidence = { ok: true, applied: false };
  let storageFixtureCleanup = { ok: true, restored: false };
  let caseDataBefore = null;
  let caseDataAfter = null;
  const fixtureNonce = crypto.randomBytes(16).toString('hex');
  let stateBefore = null;
  let visualSettle = null;
  let selectorReadiness = null;
  let result = {
    kind: 'weapp-ui-capture-receipt-v1',
    captureSurface: {
      kind: config.captureSurface || 'page',
      method: 'App.captureScreenshot',
      pageGeometryVerified: false,
      systemChromeNoise: config.captureSurface === 'simulator-frame',
    },
    name,
    runId,
    ok: false,
    captureOk: false,
    evidenceOk: false,
    reviewStatus: 'pending',
    candidateOutput,
    candidateReceiptPath,
    output: null,
    receiptPath: null,
    endpoint: connection.endpoint,
    connectionMode: connection.mode,
    sourceProjectPath: connection.sourceProjectPath,
    expectedRoute: normalizeRoute(item.path),
    expectedWindowWidth: expectedWidth,
    expectedSDKVersion: config.expectedSDKVersion || null,
    sessionFile: connection.sessionFile,
  };

  try {
    if (item.storageFixture) {
      const appliedStorage = await applyCaseStorageFixture(miniProgram, item.storageFixture);
      storageFixtureState = appliedStorage.state;
      storageFixtureEvidence = appliedStorage.evidence;
    }
    const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
    page = await routeCasePage(miniProgram, routeMethod, item.path, {
      routeTimeoutMs: config.routeTimeoutMs,
    });
    if (item.fixture) {
      fixtureIsolation = await applyFixture(page, item.fixture, miniProgram);
    } else {
      fixtureIsolation = await isolatePageDataRuntime(miniProgram, 'before');
      await page.setData(item.data || {});
      caseDataBefore = await captureDeclaredCaseData(page, item.data || {});
    }
    await page.setData({ __uiCaptureNonce: fixtureNonce });
    selectorReadiness = await waitForCaseReady(page, item, config.readinessTimeoutMs);
    visualSettle = await waitForVisualSettle(page, item);
    stateBefore = await page.data();
    const [rawToolInfo, currentPageInfo, rawSystemInfo, pageSize] = await Promise.all([
      timeout(miniProgram.send('Tool.getInfo'), 5000, `${name}:Tool.getInfo`),
      timeout(miniProgram.send('App.getCurrentPage'), 5000, `${name}:App.getCurrentPage`),
      timeout(miniProgram.systemInfo(), 5000, `${name}:systemInfo`),
      timeout(page.size(), 5000, `${name}:page.size`),
    ]);
    const toolInfo = selectToolInfo(rawToolInfo);
    const systemInfo = selectSystemInfo(rawSystemInfo);
    const dom = await collectDom(page, item.selectors);
    const horizontalAlignment = item.horizontalAlignment
      ? validateHorizontalAlignment(dom, item.horizontalAlignment)
      : null;
    const selectorCoverage = validateSelectorCoverage(dom, item.selectors, item.selectorExpectations);
    if (!selectorCoverage.ok) {
      const error = new Error(`${name}: selector contract changed during visual settle.`);
      error.selectorCoverage = selectorCoverage;
      throw error;
    }
    const horizontalOverflow = validateHorizontalOverflow(pageSize, systemInfo);
    const captureStyles = await checkCaseStyles(page, item.styleExpectations);
    if (!captureStyles.ok) {
      throw new Error(`${name}: style contract changed before capture: ${JSON.stringify(captureStyles.failures)}`);
    }
    await timeout(
      miniProgram.screenshot({ path: candidateOutput }),
      config.screenshotTimeoutMs,
      `${name}:App.captureScreenshot`
    );
    if (!item.fixture) caseDataAfter = await captureDeclaredCaseData(page, item.data || {});
    const stateAfter = await page.data();
    const caseData = {
      ok: stateBefore.__uiCaptureNonce === fixtureNonce
        && stateAfter.__uiCaptureNonce === fixtureNonce
        && hashCanonical(stateBefore) === hashCanonical(stateAfter)
        && (!!item.fixture || (caseDataBefore.ok && caseDataAfter.ok
          && caseDataBefore.actualHash === caseDataAfter.actualHash)),
      fixtureNonce,
      stateBeforeHash: hashCanonical(stateBefore),
      stateAfterHash: hashCanonical(stateAfter),
      before: caseDataBefore,
      after: caseDataAfter,
    };
    const png = inspectPngFile(candidateOutput);
    const git = currentGitManifest(REPOSITORY_ROOT);
    const projectProvenance = validateProjectProvenance({ connection, toolInfo });
    const receiptValidation = validateReceiptEvidence({
      captureSurface: config.captureSurface,
      expectedWindowWidth: expectedWidth,
      expectedSDKVersion: config.expectedSDKVersion,
      expectedRoute: item.path,
      toolInfo,
      currentPageInfo,
      systemInfo,
      png,
      git,
      selectorCoverage,
      selectorReadiness,
      horizontalOverflow,
      projectProvenance,
      horizontalAlignment,
      caseData,
      expectedGitManifestHash: config.session && config.session.gitManifestHash,
    });
    result = {
      ...result,
      captureOk: png.valid && png.byteLength > 20 * 1024,
      toolInfo,
      currentPageInfo,
      systemInfo,
      png,
      git,
      pageSize,
      dom,
      selectorCoverage,
      horizontalAlignment,
      horizontalOverflow,
      projectProvenance,
      fixtureIsolation,
      fixtureDefinitionHash: item.fixture ? hashCanonical(item.fixture) : null,
      caseDefinitionHash: hashCanonical(item),
      caseData,
      visualSettle,
      manualActions: item.fixture ? manualActions : [],
      receiptValidation,
      captureSurface: receiptValidation.captureSurface,
    };
  } catch (err) {
    if (err && err.storageFixtureCleanup) {
      storageFixtureCleanup = err.storageFixtureCleanup;
      if (!storageFixtureCleanup.ok) {
        cleanupError = [cleanupError, `storage fixture restore failed: ${storageFixtureCleanup.errors.join('; ')}`]
          .filter(Boolean)
          .join('; ');
      }
    }
    result.error = String(err && err.stack || err);
  } finally {
    if (storageFixtureState) {
      storageFixtureCleanup = await restoreCaseStorageFixture(miniProgram, storageFixtureState);
      if (!storageFixtureCleanup.ok) {
        cleanupError = [cleanupError, `storage fixture restore failed: ${storageFixtureCleanup.errors.join('; ')}`]
          .filter(Boolean)
          .join('; ');
      }
    }
    if (page) {
      if (options.deferPageCleanup === true) {
        fixtureCleanup = { ok: true, deferredToRunCleanup: true };
      } else {
        try {
          fixtureCleanup = await cleanupCaptureRun(miniProgram, {
            routeTimeoutMs: config.routeTimeoutMs,
          });
        } catch (err) {
          cleanupError = [cleanupError, String(err && err.message || err)]
            .filter(Boolean)
            .join('; ');
        }
      }
    }
  }

  const runtimeExceptions = connection.runtimeEvents.exceptions.slice(exceptionStart);
  const runtimeConsole = connection.runtimeEvents.console.slice(consoleStart);
  result.selectorReadiness = selectorReadiness;
  result.visualSettle = visualSettle;
  result.fixtureCleanup = fixtureCleanup;
  result.storageFixture = storageFixtureEvidence;
  result.storageFixtureCleanup = storageFixtureCleanup;
  result.cleanupError = cleanupError;
  result.runtimeExceptions = runtimeExceptions;
  result.runtimeConsole = runtimeConsole;
  result.evidenceOk = !!(result.receiptValidation && result.receiptValidation.ok)
    && !cleanupError
    && runtimeExceptions.length === 0;
  result.machineOk = result.captureOk && result.evidenceOk;
  result.ok = result.machineOk;
  result.promotion = {
    eligible: result.machineOk,
    promoted: false,
    output: finalOutput,
    receiptPath: finalReceiptPath,
  };
  writeJsonAtomically(candidateReceiptPath, result);
  return result;
}

function runManifest(results, runId, promotion, runContext = {}) {
  return {
    kind: 'weapp-ui-capture-run-v1',
    runId,
    mode: String(runContext.mode || 'capture'),
    finalsTouched: promotion.finalsTouched === null ? null : promotion.finalsTouched === true,
    publicationState: String(promotion.publicationState || 'unknown'),
    focusProbeId: String(runContext.focusProbeId || ''),
    sessionContext: runContext.sessionContext || null,
    captureSurface: results.length ? results[0].captureSurface || null : null,
    createdAt: new Date().toISOString(),
    ok: promotion.ok === true,
    promotion,
    cases: results.map((result) => ({
      name: result.name,
      captureSurface: result.captureSurface || null,
      ok: result.ok,
      captureOk: result.captureOk,
      evidenceOk: result.evidenceOk,
      machineOk: result.machineOk,
      reviewStatus: result.reviewStatus,
      candidateOutput: result.candidateOutput,
      candidateReceiptPath: result.candidateReceiptPath,
      output: result.output,
      receiptPath: result.receiptPath,
      promotion: result.promotion,
    })),
  };
}

function promoteRunResults(results, runId, options = {}) {
  const list = Array.isArray(results) ? results : [];
  const manifestPath = options.manifestPath || '';
  const runContext = options.runContext || {};
  const transactionId = `${runId}-batch`;
  const allEligible = list.length > 0
    && list.every((result) => result.machineOk === true && result.promotion && result.promotion.eligible === true);
  if (!allEligible) {
    list.forEach((result) => {
      result.ok = false;
      result.output = null;
      result.receiptPath = null;
      result.promotion.promoted = false;
      result.promotion.finalsTouched = false;
      result.promotion.publicationState = 'not-attempted';
      result.promotion.rollbackVerified = null;
      result.promotion.reason = 'run-level evidence failed; no final artifacts were changed';
      writeJsonAtomically(result.candidateReceiptPath, result);
    });
    const promotion = {
      ok: false,
      promoted: false,
      finalsTouched: false,
      publicationState: 'not-attempted',
      rollbackVerified: null,
      transactionId,
      reason: 'one-or-more-cases-failed',
    };
    if (manifestPath) writeJsonAtomically(manifestPath, runManifest(list, runId, promotion, runContext));
    return promotion;
  }

  const entries = [];
  list.forEach((result) => {
    result.ok = true;
    result.output = result.promotion.output;
    result.receiptPath = result.promotion.receiptPath;
    result.promotion.promoted = true;
    result.promotion.finalsTouched = true;
    result.promotion.publicationState = 'committed';
    result.promotion.rollbackVerified = null;
    result.promotion.transactionId = transactionId;
    delete result.promotion.reason;
    delete result.promotion.error;
    writeJsonAtomically(result.candidateReceiptPath, result);
    entries.push(
      { source: result.candidateOutput, target: result.output },
      { source: result.candidateReceiptPath, target: result.receiptPath }
    );
  });
  let candidateManifestPath = '';
  let publication;
  try {
    if (manifestPath) {
      candidateManifestPath = path.join(
        path.dirname(manifestPath),
        'candidate',
        'manifest.receipt.json'
      );
      const plannedPromotion = {
        ok: true,
        promoted: true,
        finalsTouched: true,
        publicationState: 'committed',
        rollbackVerified: null,
        transactionId,
        manifestPath,
      };
      writeJsonAtomically(candidateManifestPath, runManifest(list, runId, plannedPromotion, runContext));
      entries.push({ source: candidateManifestPath, target: manifestPath });
    }
    publication = publishFilesAtomically(entries, transactionId, options.publishOptions);
  } catch (err) {
    const message = String(err && err.message || err);
    const indeterminate = err && err.code === 'ATOMIC_PUBLICATION_INDETERMINATE';
    const rollbackWasVerified = !indeterminate && Array.isArray(err && err.rollbackVerification);
    const publicationState = indeterminate
      ? 'indeterminate'
      : (rollbackWasVerified ? 'rolled-back' : 'not-attempted');
    list.forEach((result) => {
      result.ok = false;
      result.output = null;
      result.receiptPath = null;
      result.promotion.promoted = indeterminate ? null : false;
      result.promotion.finalsTouched = indeterminate ? null : false;
      result.promotion.publicationState = publicationState;
      result.promotion.rollbackVerified = rollbackWasVerified ? true : (indeterminate ? false : null);
      result.promotion.error = message;
      if (indeterminate) result.promotion.rollbackVerification = err.rollbackVerification || [];
      writeJsonAtomically(result.candidateReceiptPath, result);
    });
    const promotion = {
      ok: false,
      promoted: indeterminate ? null : false,
      finalsTouched: indeterminate ? null : false,
      publicationState,
      rollbackVerified: rollbackWasVerified ? true : (indeterminate ? false : null),
      transactionId,
      error: message,
    };
    if (indeterminate) {
      promotion.rollbackErrors = err.rollbackErrors || [];
      promotion.rollbackVerification = err.rollbackVerification || [];
    }
    if (manifestPath) {
      const diagnosticManifestPath = indeterminate ? `${manifestPath}.indeterminate.json` : manifestPath;
      promotion.manifestPath = diagnosticManifestPath;
      writeJsonAtomically(diagnosticManifestPath, runManifest(list, runId, promotion, runContext));
    }
    return promotion;
  }
  const promotion = {
    ok: true,
    promoted: true,
    finalsTouched: true,
    publicationState: 'committed',
    rollbackVerified: null,
    transactionId,
    publication,
    manifestPath: manifestPath || null,
  };
  return promotion;
}

function finalizeFocusProbeResult(results, runId, options = {}) {
  const list = Array.isArray(results) ? results : [];
  if (list.length !== 1) {
    throw new Error('focus-probe-no-publish-v1 requires exactly one screenshot case.');
  }
  const result = list[0];
  const machineOk = result.machineOk === true;
  result.ok = machineOk;
  result.output = null;
  result.receiptPath = null;
  result.promotion = {
    eligible: machineOk,
    promoted: false,
    probeOnly: true,
    finalsTouched: false,
    publicationState: 'not-attempted',
    rollbackVerified: null,
    mode: 'focus-probe-no-publish-v1',
    reason: machineOk ? 'probe-only candidate retained; final artifacts were not touched' : 'probe evidence failed',
  };
  writeJsonAtomically(result.candidateReceiptPath, result);
  const promotion = {
    ok: machineOk,
    promoted: false,
    probeOnly: true,
    finalsTouched: false,
    publicationState: 'not-attempted',
    rollbackVerified: null,
    mode: 'focus-probe-no-publish-v1',
    caseName: result.name,
    reason: result.promotion.reason,
  };
  if (options.manifestPath) {
    writeJsonAtomically(
      options.manifestPath,
      runManifest(list, runId, promotion, {
        ...(options.runContext || {}),
        mode: 'focus-probe-no-publish-v1',
      })
    );
  }
  return promotion;
}

async function openMiniProgram(config, options = {}) {
  const validation = validateRuntimeConfig(config, { requireSession: options.requireSession });
  if (!validation.ok) {
    const failed = Object.entries(validation.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(', ');
    throw new Error(`Background screenshot configuration is invalid (${failed}). Run the explicit npm run ui:prewarm step first; use npm run ui:session:refresh for source changes.`);
  }
  const automator = options.automator || resolveAutomator();
  return {
    miniProgram: await timeout(
      automator.connect({ wsEndpoint: config.wsEndpoint }),
      Number(config.connectTimeoutMs || 15000),
      'miniprogram-automator.connect'
    ),
    mode: 'connect-preopened',
    endpoint: config.wsEndpoint,
    sourceProjectPath: config.sourceProjectPath,
    sessionFile: config.sessionFile,
    config,
    runtimeEvents: { console: [], exceptions: [] },
  };
}

function attachRuntimeEvents(connection) {
  connection.miniProgram.on('console', (event) => {
    connection.runtimeEvents.console.push(event);
  });
  connection.miniProgram.on('exception', (event) => {
    connection.runtimeEvents.exceptions.push(event);
  });
}

function disconnect(connection) {
  try {
    connection.miniProgram.disconnect();
  } catch (err) {
    // The shared DevTools session remains open; only this WebSocket is best-effort disconnected.
  }
}

async function main() {
  const command = parseScreenshotArgs(process.argv.slice(2));
  if (command.mode === 'list') {
    console.log(Object.keys(cases).join('\n'));
    return 0;
  }

  const captureMode = String(process.env.WEAPP_CAPTURE_MODE || 'capture').trim();
  if (!['capture', 'focus-probe-no-publish-v1'].includes(captureMode)) {
    throw new Error(`Unsupported WEAPP_CAPTURE_MODE: ${captureMode}`);
  }
  if (command.mode !== 'capture' && captureMode !== 'capture') {
    throw new Error(`${captureMode} can only run a screenshot capture command.`);
  }
  const sessionFile = resolveSessionFile(process.env, process.cwd());
  const sessionLock = acquireSessionLock(sessionFile, command.mode);
  let config = null;
  let connection = null;
  try {
    config = readRuntimeConfig(process.env, process.cwd(), {
      allowSessionFallback: true,
    });
    if (config.sessionFile !== sessionFile) {
      throw new Error('Screenshot session file changed while acquiring its lock.');
    }
    connection = await openMiniProgram(config, { requireSession: true });
    attachRuntimeEvents(connection);
    if (command.mode === 'doctor') {
      const binding = await verifySessionBinding(connection.miniProgram, config);
      console.log(JSON.stringify({ kind: 'weapp-ui-doctor-readonly-v1', ...binding,
        sourceProjectPath: connection.sourceProjectPath, endpoint: connection.endpoint,
        action: binding.ok ? '' : 'Run ui:session:refresh, compile, then ui:session:refresh again.',
      }, null, 2));
      return binding.ok ? 0 : 2;
    }
    if (command.mode === 'refresh-session') {
      const result = await runDoctor(connection.miniProgram, connection, config, {
        rebindViewport: command.rebindViewport,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 2;
    }

    connection.sessionBinding = await verifySessionBinding(connection.miniProgram, config);
    if (!connection.sessionBinding.ok) {
      console.log(JSON.stringify({
        kind: 'weapp-ui-session-binding-result-v1',
        ok: false,
        sessionFile: config.sessionFile,
        binding: connection.sessionBinding,
        action: 'Use ui:session:refresh around an explicit compile/reload for source changes; use ui:prewarm for a changed session.',
      }, null, 2));
      return 2;
    }
    const names = command.value.length ? command.value : Object.keys(cases);
    if (new Set(names).size !== names.length) {
      throw new Error('Duplicate screenshot case names are not allowed in one run.');
    }
    names.forEach((name) => {
      if (!cases[name]) throw new Error(`Unknown case: ${name}`);
    });
    const requestedRunId = String(process.env.WEAPP_CAPTURE_RUN_ID || '').trim();
    if (requestedRunId && !/^[A-Za-z0-9._-]+$/.test(requestedRunId)) {
      throw new Error('WEAPP_CAPTURE_RUN_ID may contain only letters, digits, dot, underscore and dash.');
    }
    const runId = requestedRunId
      || `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const focusProbeId = String(process.env.WEAPP_FOCUS_PROBE_ID || '').trim();
    if (captureMode === 'focus-probe-no-publish-v1') {
      if (!requestedRunId || !focusProbeId) {
        throw new Error('focus-probe-no-publish-v1 requires WEAPP_CAPTURE_RUN_ID and WEAPP_FOCUS_PROBE_ID.');
      }
      if (names.length !== 1) {
        throw new Error('focus-probe-no-publish-v1 requires exactly one screenshot case.');
      }
      if (cases[names[0]].storageFixture) {
        throw new Error(`focus-probe-no-publish-v1 rejects storage-mutating case: ${names[0]}`);
      }
    }
    const results = [];
    let runCleanup;
    let captureLoopError = null;
    let cleanupExceptionStart = 0;
    try {
      for (const name of names) {
        const result = await runCase(name, connection.miniProgram, connection, {
          config,
          runId,
          deferPageCleanup: true,
        });
        results.push(result);
        if (result.storageFixtureCleanup && result.storageFixtureCleanup.ok === false) break;
      }
    } catch (err) {
      captureLoopError = err;
    } finally {
      cleanupExceptionStart = connection.runtimeEvents.exceptions.length;
      try {
        runCleanup = await cleanupCaptureRun(connection.miniProgram, {
          routeTimeoutMs: config.routeTimeoutMs,
        });
      } catch (err) {
        runCleanup = { ok: false, error: String(err && err.message || err) };
      }
    }
    const runCleanupExceptions = connection.runtimeEvents.exceptions.slice(cleanupExceptionStart);
    if (runCleanupExceptions.length > 0) {
      runCleanup = {
        ...runCleanup,
        ok: false,
        runtimeExceptions: runCleanupExceptions,
      };
    }
    results.forEach((result) => {
      result.fixtureCleanup = runCleanup;
      if (captureLoopError) {
        result.captureLoopError = String(captureLoopError && captureLoopError.message || captureLoopError);
        result.evidenceOk = false;
        result.machineOk = false;
        result.ok = false;
        result.promotion.eligible = false;
      }
      if (!runCleanup.ok) {
        result.cleanupError = [result.cleanupError, runCleanup.error || 'run cleanup failed']
          .filter(Boolean)
          .join('; ');
        result.evidenceOk = false;
        result.machineOk = false;
        result.ok = false;
        result.promotion.eligible = false;
      }
      writeJsonAtomically(result.candidateReceiptPath, result);
    });
    if (captureLoopError) throw captureLoopError;
    const manifestPath = path.join(config.runRoot, runId, 'manifest.json');
    const runContext = {
      mode: captureMode,
      focusProbeId,
      sessionContext: {
        sessionId: config.session.sessionId,
        endpoint: config.session.endpoint,
        listenerIdentityHash: config.session.projectBinding.listenerIdentityHash,
        gitManifestHash: config.session.gitManifestHash,
      },
    };
    const promotion = captureMode === 'focus-probe-no-publish-v1'
      ? finalizeFocusProbeResult(results, runId, { manifestPath, runContext })
      : promoteRunResults(results, runId, { manifestPath, runContext });
    results.forEach((result) => console.log(JSON.stringify(result, null, 2)));
    console.log(JSON.stringify(promotion, null, 2));
    return promotion.ok ? 0 : 2;
  } finally {
    if (connection) disconnect(connection);
    releaseSessionLockOrThrow(sessionLock);
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = {
  SESSION_KIND,
  PROJECT_BINDING_METHOD,
  BACKGROUND_CAPTURE_CHROMIUM_FLAG,
  cases,
  manualActions,
  timeout,
  resolveAutomator,
  resolveLaunchCommand,
  ensureBackgroundCaptureNwPreArgs,
  parseScreenshotArgs,
  hashCanonical,
  normalizeRoute,
  normalizeQuery,
  normalizeLocation,
  locationsMatch,
  normalizeProjectPath,
  realpathOrResolved,
  isRunnerProjectPath,
  REPOSITORY_ROOT,
  isLocalWebSocketEndpoint,
  listenerIdentityHash,
  resolveListenerIdentity,
  validateListenerIdentity,
  validateDevToolsOwnership,
  validateBackgroundCaptureProcessFlags,
  resolveProcessIdentity,
  acquireSessionLock,
  releaseSessionLock,
  releaseSessionLockOrThrow,
  resolveSessionFile,
  sessionPoisonFile,
  sessionRecoveryFile,
  clearSessionPoison,
  clearSessionRecovery,
  readRuntimeConfig,
  validateRuntimeConfig,
  inspectPngBuffer,
  inspectPngFile,
  validateSelectorCoverage,
  validateHorizontalOverflow,
  currentGitManifest,
  publishFilesAtomically,
  writeJsonAtomically,
  buildProfileGateStorageFixture,
  applyCaseStorageFixture,
  restoreCaseStorageFixture,
  applyFixture,
  cleanupFixture,
  cleanupCaptureRun,
  routeCasePage,
  validateSessionRecord,
  bindRuntimeSession,
  readRuntimeSession,
  selectToolInfo,
  selectSystemInfo,
  verifySessionBinding,
  validateProjectProvenance,
  validateReceiptEvidence,
  runDoctor,
  runCase,
  promoteRunResults,
  finalizeFocusProbeResult,
  waitForCaseReady,
  waitForVisualSettle,
  openMiniProgram,
};
