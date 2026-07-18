const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { acquireExclusiveFileLock } = require('./exclusive-file-lock');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_RECORD_DIR = path.join(ROOT, 'docs', 'records');
const SCHEMA_VERSION = 1;
const SENSITIVE_KEY_PATTERN = /secret|authorization|password|passwd|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|private[_-]?key|open[_-]?id|union[_-]?id/i;

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
      /((?:[?&]|\b)(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|password|open[_-]?id|union[_-]?id)=)[^&\s"'#]+/gi,
      '$1<redacted>'
    )
    .replace(
      /("(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|authorization|password|passwd|private[_-]?key|secret(?:id|key)?|open[_-]?id|union[_-]?id)"\s*:\s*")[^"]*/gi,
      '$1<redacted>'
    )
    .replace(
      /(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|password|passwd|private[_-]?key(?:[_-]?path)?|secret(?:id|key)?|open[_-]?id|union[_-]?id)\s*[:=]\s*)[^&\s,;"'#]+/gi,
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

function runGitStrict(rootDir, args, options = {}) {
  const execute = options.execFileSync || execFileSync;
  try {
    return execute('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    const detail = error && error.message ? error.message : String(error || 'unknown Git error');
    throw new Error(`Git provenance command failed (git ${args.join(' ')}): ${detail}`);
  }
}

function buildStrictGitState(rootDir = ROOT, options = {}) {
  const branchValue = runGitStrict(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD'], options);
  const head = runGitStrict(rootDir, ['rev-parse', 'HEAD'], options);
  const shortHead = runGitStrict(rootDir, ['rev-parse', '--short', 'HEAD'], options);
  const status = runGitStrict(rootDir, ['status', '--short'], options);
  if (!/^[0-9a-f]{40,64}$/i.test(head) || !/^[0-9a-f]{7,64}$/i.test(shortHead)) {
    throw new Error('Git provenance returned an invalid HEAD');
  }
  return {
    branch: branchValue === 'HEAD' ? '(detached)' : branchValue,
    head,
    shortHead,
    dirty: Boolean(status),
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

function writeWorkflowRecordUnlocked(stream, payload = {}, options = {}) {
  const safeStream = sanitizeStreamName(stream);
  const rootDir = options.rootDir || ROOT;
  const recordedAt = options.recordedAt || new Date().toISOString();
  const { recordPath, latestPath } = preflightWorkflowRecord(safeStream, options);

  const record = sanitizeValue({
    schemaVersion: SCHEMA_VERSION,
    stream: safeStream,
    recordedAt,
    git: options.gitState || buildGitState(rootDir),
    payload
  });

  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pendingLatestPath = path.join(path.dirname(latestPath), `.${path.basename(latestPath)}.${unique}.pending`);
  const backupLatestPath = path.join(path.dirname(latestPath), `.${path.basename(latestPath)}.${unique}.backup`);
  const recordExisted = fs.existsSync(recordPath);
  const originalRecordSize = recordExisted ? fs.statSync(recordPath).size : 0;
  let recordTouched = false;
  let previousLatestMoved = false;
  let newLatestInstalled = false;

  try {
    fs.writeFileSync(pendingLatestPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const recordDescriptor = fs.openSync(recordPath, 'a');
    try {
      recordTouched = true;
      fs.writeSync(recordDescriptor, `${JSON.stringify(record)}\n`, null, 'utf8');
      fs.fsyncSync(recordDescriptor);
    } finally {
      fs.closeSync(recordDescriptor);
    }

    if (typeof options.beforeLatestPromote === 'function') options.beforeLatestPromote({ record, recordPath, latestPath });
    if (fs.existsSync(latestPath)) {
      fs.renameSync(latestPath, backupLatestPath);
      previousLatestMoved = true;
    }
    if (typeof options.beforePendingLatestPromote === 'function') options.beforePendingLatestPromote();
    fs.renameSync(pendingLatestPath, latestPath);
    newLatestInstalled = true;
  } catch (error) {
    const rollbackErrors = [];
    try {
      if (newLatestInstalled) fs.rmSync(latestPath, { force: true });
      if (previousLatestMoved && fs.existsSync(backupLatestPath) && !fs.existsSync(latestPath)) {
        if (typeof options.beforeLatestRestore === 'function') options.beforeLatestRestore();
        fs.renameSync(backupLatestPath, latestPath);
        previousLatestMoved = false;
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      if (recordTouched || fs.existsSync(recordPath) !== recordExisted) {
        if (recordExisted) fs.truncateSync(recordPath, originalRecordSize);
        else fs.rmSync(recordPath, { force: true });
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    const disposablePaths = previousLatestMoved ? [pendingLatestPath] : [pendingLatestPath, backupLatestPath];
    for (const temporaryPath of disposablePaths) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      const recovery = previousLatestMoved && fs.existsSync(backupLatestPath)
        ? `; preserved latest backup: ${backupLatestPath}`
        : '';
      const wrapped = new Error(`Workflow record write failed and rollback also failed: ${error.message}; rollback: ${rollbackErrors[0].message}${recovery}`);
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }

  try {
    fs.rmSync(backupLatestPath, { force: true });
  } catch (_) {
    // The JSONL append and latest record are complete; an old hidden backup can be cleaned later.
  }

  return { record, recordPath, latestPath };
}

function writeWorkflowRecord(stream, payload = {}, options = {}) {
  const safeStream = sanitizeStreamName(stream);
  const { recordDir } = preflightWorkflowRecord(safeStream, options);
  const lock = acquireExclusiveFileLock(path.join(recordDir, `.workflow-record-${safeStream}.lock`), {
    purpose: `workflow-record:${safeStream}`
  });
  let result;
  try {
    result = writeWorkflowRecordUnlocked(safeStream, payload, { ...options, recordDir });
  } catch (error) {
    try {
      lock.release();
    } catch (releaseError) {
      error.lockReleaseError = releaseError;
    }
    throw error;
  }
  try {
    lock.release();
  } catch (releaseError) {
    result.lockCleanupWarning = releaseError.message;
  }
  return result;
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
  buildStrictGitState,
  preflightWorkflowRecord,
  readLatestWorkflowRecord,
  sanitizeValue,
  writeWorkflowRecord,
  writeWorkflowRecordAfterRemoteSuccess
};
