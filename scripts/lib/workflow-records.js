const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_RECORD_DIR = path.join(ROOT, 'docs', 'records');
const SCHEMA_VERSION = 1;
const SENSITIVE_KEY_PATTERN = /secret|authorization|password|passwd|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|private[_-]?key/i;

class RemoteActionEvidenceError extends Error {
  constructor(stream, cause) {
    const detail = cause && cause.message ? cause.message : String(cause || 'unknown evidence write error');
    super(`Remote action succeeded, evidence write failed for ${stream}: ${detail}`);
    this.name = 'RemoteActionEvidenceError';
    this.code = 'REMOTE_ACTION_SUCCEEDED_EVIDENCE_WRITE_FAILED';
    this.remoteActionSucceeded = true;
    this.cause = cause;
  }
}

function sanitizeStreamName(stream) {
  const value = String(stream || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    throw new Error(`Invalid workflow record stream: ${stream}`);
  }
  return value;
}

function redactString(value) {
  return String(value)
    .replace(
      /((?:[?&]|^)(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|password)=)[^&\s"'#]+/gi,
      '$1<redacted>'
    )
    .replace(
      /("(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|authorization|password|passwd|private[_-]?key|secret(?:id|key)?)"\s*:\s*")[^"]*/gi,
      '$1<redacted>'
    )
    .replace(/(\bBearer\s+)[^\s"',;]+/gi, '$1<redacted>');
}

function sanitizeValue(value, key = '') {
  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return '<redacted>';
  }

  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey)
      ])
    );
  }
  return value;
}

function runGit(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return '';
  }
}

function buildGitState(rootDir = ROOT) {
  const branch = runGit(rootDir, ['branch', '--show-current']);
  const head = runGit(rootDir, ['rev-parse', 'HEAD']);
  const shortHead = runGit(rootDir, ['rev-parse', '--short', 'HEAD']);
  const status = runGit(rootDir, ['status', '--short']);
  return {
    branch,
    head,
    shortHead,
    dirty: !!status,
    dirtyFiles: status ? status.split(/\r?\n/).filter(Boolean) : []
  };
}

function ensureRecordDir(recordDir) {
  fs.mkdirSync(recordDir, { recursive: true });
}

function assertWritableRecordFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`workflow record target must be a regular file: ${filePath}`);
  }
  fs.accessSync(filePath, fs.constants.W_OK);
}

function preflightWorkflowRecord(stream, options = {}) {
  const safeStream = sanitizeStreamName(stream);
  const recordDir = options.recordDir || process.env.WEAPP_RECORD_DIR || DEFAULT_RECORD_DIR;
  const recordPath = path.join(recordDir, `${safeStream}.jsonl`);
  const latestPath = path.join(recordDir, `${safeStream}-latest.json`);
  const probePath = path.join(
    recordDir,
    `.workflow-record-preflight-${safeStream}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  let descriptor = null;

  try {
    ensureRecordDir(recordDir);
    const recordDirStats = fs.statSync(recordDir);
    if (!recordDirStats.isDirectory()) {
      throw new Error(`workflow record directory is not a directory: ${recordDir}`);
    }
    fs.accessSync(recordDir, fs.constants.W_OK);
    assertWritableRecordFile(recordPath);
    assertWritableRecordFile(latestPath);
    descriptor = fs.openSync(probePath, 'wx');
    fs.writeSync(descriptor, 'workflow-record-preflight\n', null, 'utf8');
    fs.closeSync(descriptor);
    descriptor = null;
    fs.unlinkSync(probePath);
    return { recordDir, recordPath, latestPath };
  } catch (error) {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch (_) {
        // Preserve the original preflight error.
      }
    }
    try {
      fs.rmSync(probePath, { force: true });
    } catch (_) {
      // Preserve the original preflight error.
    }
    const wrapped = new Error(`Workflow record preflight failed for ${safeStream}: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function writeWorkflowRecord(stream, payload = {}, options = {}) {
  const safeStream = sanitizeStreamName(stream);
  const rootDir = options.rootDir || ROOT;
  const recordedAt = options.recordedAt || new Date().toISOString();
  const { recordPath, latestPath } = preflightWorkflowRecord(safeStream, options);

  const record = sanitizeValue({
    schemaVersion: SCHEMA_VERSION,
    stream: safeStream,
    recordedAt,
    git: buildGitState(rootDir),
    payload
  });

  fs.appendFileSync(recordPath, `${JSON.stringify(record)}\n`, 'utf8');
  fs.writeFileSync(latestPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return { record, recordPath, latestPath };
}

function writeWorkflowRecordAfterRemoteSuccess(stream, payload = {}, options = {}) {
  try {
    return writeWorkflowRecord(stream, payload, options);
  } catch (error) {
    throw new RemoteActionEvidenceError(sanitizeStreamName(stream), error);
  }
}

function readLatestWorkflowRecord(stream, options = {}) {
  const safeStream = sanitizeStreamName(stream);
  const recordDir = options.recordDir || process.env.WEAPP_RECORD_DIR || DEFAULT_RECORD_DIR;
  const latestPath = path.join(recordDir, `${safeStream}-latest.json`);
  if (!fs.existsSync(latestPath)) return null;
  return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
}

module.exports = {
  DEFAULT_RECORD_DIR,
  RemoteActionEvidenceError,
  ROOT,
  SCHEMA_VERSION,
  buildGitState,
  preflightWorkflowRecord,
  readLatestWorkflowRecord,
  sanitizeValue,
  writeWorkflowRecord,
  writeWorkflowRecordAfterRemoteSuccess
};
