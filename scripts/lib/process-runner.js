'use strict';

const cp = require('node:child_process');

function runFileSync(command, args = [], options = {}) {
  if (typeof command !== 'string' || !command) {
    throw new TypeError('command must be a non-empty string');
  }
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string')) {
    throw new TypeError('args must be an array of strings');
  }

  const startedAt = process.hrtime.bigint();
  const result = cp.spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || 'pipe',
    timeout: options.timeout,
    windowsHide: options.windowsHide !== false,
    shell: false
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  return {
    command,
    args: [...args],
    status: result.status,
    signal: result.signal,
    error: result.error || null,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    durationMs,
    shell: false
  };
}

function runFileOrThrow(command, args = [], options = {}) {
  const result = runFileSync(command, args, options);
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr.trim() || `exit ${result.status}`);
    const error = new Error(`Command failed: ${command} (${detail})`);
    error.result = result;
    throw error;
  }
  return result;
}

module.exports = { runFileOrThrow, runFileSync };
