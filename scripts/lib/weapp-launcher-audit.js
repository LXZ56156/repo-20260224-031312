'use strict';

const {
  normalizeComparablePath
} = require('./weapp-local-config');
const { runFileSync } = require('./process-runner');

function parseAuditOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`Launcher audit must emit exactly one JSON line; received ${lines.length}`);
  }
  let audit;
  try {
    audit = JSON.parse(lines[0]);
  } catch (error) {
    throw new Error(`Launcher audit emitted invalid JSON: ${error.message}`);
  }
  return audit;
}

function auditPowerShellLauncher(scriptPath, options = {}) {
  const result = runFileSync(options.powershell || 'powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-Audit'
  ], {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs || 15000
  });

  if (result.error) {
    throw new Error(`Launcher audit could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Launcher audit failed with exit ${result.status}: ${result.stderr.trim() || '<no stderr>'}`);
  }
  return parseAuditOutput(result.stdout);
}

function requireField(audit, field) {
  if (audit[field] === undefined || audit[field] === null || audit[field] === '') {
    throw new Error(`Launcher audit is missing required field: ${field}`);
  }
}

function samePath(actual, expected) {
  return normalizeComparablePath(actual, { platform: 'win32' }) ===
    normalizeComparablePath(expected, { platform: 'win32' });
}

function validateLauncherAudit(audit, expected, role) {
  if (!audit || typeof audit !== 'object') throw new Error('Launcher audit payload must be an object');
  for (const field of ['schemaVersion', 'role', 'projectDir', 'sourceDir', 'cliPath', 'wsEndpoint', 'cliPort', 'autoPort']) {
    requireField(audit, field);
  }
  if (audit.schemaVersion !== 1) throw new Error(`Unsupported launcher audit schema: ${audit.schemaVersion}`);
  if (audit.role !== role) throw new Error(`Launcher role mismatch: expected ${role}, got ${audit.role}`);

  const expectedProject = role === 'source' ? expected.sourceDir : expected.previewDir;
  if (!samePath(audit.projectDir, expectedProject) || !samePath(audit.sourceDir, expected.sourceDir)) {
    throw new Error(`Launcher project pairing mismatch: role=${role}; project=${audit.projectDir}; source=${audit.sourceDir}`);
  }
  if (!samePath(audit.cliPath, expected.devtoolsCli)) {
    throw new Error(`Launcher CLI mismatch: expected ${expected.devtoolsCli}, got ${audit.cliPath}`);
  }
  if (audit.wsEndpoint !== expected.wsEndpoint || Number(audit.autoPort) !== Number(expected.autoPort)) {
    throw new Error(`Launcher endpoint mismatch: expected ${expected.wsEndpoint}, got ${audit.wsEndpoint}`);
  }
  if (Number(audit.cliPort) !== Number(expected.cliPort)) {
    throw new Error(`Launcher CLI port mismatch: expected ${expected.cliPort}, got ${audit.cliPort}`);
  }
  return audit;
}

module.exports = {
  auditPowerShellLauncher,
  parseAuditOutput,
  validateLauncherAudit
};
