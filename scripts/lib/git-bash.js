'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveGitBash(env = process.env) {
  if (process.platform !== 'win32') {
    return env.WEAPP_BASH || env.BASH_BIN || 'bash';
  }

  const candidates = [
    env.WEAPP_GIT_BASH,
    env.BASH_BIN,
    'D:\\Soft\\Git\\bin\\bash.exe',
    env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);

  const found = candidates.find((candidate) => path.isAbsolute(candidate) && fs.existsSync(candidate));
  if (!found) {
    throw new Error('Git Bash was not found. Set WEAPP_GIT_BASH to the absolute bash.exe path.');
  }
  return found;
}

function toGitBashPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

module.exports = {
  resolveGitBash,
  toGitBashPath,
};
