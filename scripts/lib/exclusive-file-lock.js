'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return false;
    return true;
  }
}

function writeLockFile(lockPath, owner) {
  const descriptor = fs.openSync(lockPath, 'wx');
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readLockOwner(lockPath) {
  const stats = fs.lstatSync(lockPath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Exclusive lock target is not a regular file: ${lockPath}`);
  }
  let owner;
  try {
    owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw new Error(`Exclusive lock is held by an unreadable owner; refusing stale takeover: ${lockPath}: ${error.message}`);
  }
  if (!owner || typeof owner !== 'object' || !Number.isInteger(owner.pid) || typeof owner.token !== 'string') {
    throw new Error(`Exclusive lock is held by an invalid owner; refusing stale takeover: ${lockPath}`);
  }
  return owner;
}

function acquireExclusiveFileLock(lockPath, options = {}) {
  const resolved = path.resolve(lockPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const owner = {
    pid: process.pid,
    token: crypto.randomUUID(),
    acquiredAt: new Date().toISOString(),
    purpose: String(options.purpose || 'exclusive-workflow')
  };

  try {
    writeLockFile(resolved, owner);
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
    const existing = readLockOwner(resolved);
    const checkAlive = options.isProcessAlive || isProcessAlive;
    if (checkAlive(existing.pid)) {
      const held = new Error(`Exclusive lock is held; ${existing.purpose || 'workflow'} is already running (pid=${existing.pid})`);
      held.code = 'EXCLUSIVE_LOCK_HELD';
      throw held;
    }

    const staleClaimPath = `${resolved}.stale-${owner.token}`;
    try {
      fs.renameSync(resolved, staleClaimPath);
    } catch (claimError) {
      const changed = new Error(`Exclusive lock changed during stale takeover; refusing to continue: ${resolved}`);
      changed.cause = claimError;
      throw changed;
    }
    try {
      writeLockFile(resolved, owner);
    } catch (createError) {
      if (!fs.existsSync(resolved) && fs.existsSync(staleClaimPath)) {
        try {
          fs.renameSync(staleClaimPath, resolved);
        } catch (_) {
          // Keep the create error; the stale claim remains attributable by token.
        }
      }
      throw createError;
    }
    fs.rmSync(staleClaimPath, { force: true });
  }

  let released = false;
  return {
    lockPath: resolved,
    owner,
    release() {
      if (released) return;
      if (!fs.existsSync(resolved)) {
        released = true;
        return;
      }
      const current = readLockOwner(resolved);
      if (current.token !== owner.token) {
        throw new Error(`Exclusive lock ownership changed; refusing to remove another owner's lock: ${resolved}`);
      }
      fs.rmSync(resolved, { force: true });
      released = true;
    }
  };
}

module.exports = {
  acquireExclusiveFileLock,
  isProcessAlive
};
