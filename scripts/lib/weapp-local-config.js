'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const DEFAULT_WS_ENDPOINT = 'ws://127.0.0.1:39420';
const DEFAULT_CLI_PORT = 39421;
const DEFAULT_LAUNCHER_DIR = 'D:\\weapp-mcp-launcher';
const DEFAULT_DEVTOOLS_CLI = 'D:\\Soft\\微信web开发者工具\\cli.bat';
const DEFAULT_GIT_BASH = 'D:\\Soft\\Git\\bin\\bash.exe';
const DEFAULT_WSL_SOURCE_DIR = '/home/lizixuan/projects(WSL)/badminton-miniapp';

function isWindowsPath(value) {
  return /^[A-Za-z]:[\\/]/.test(String(value || ''));
}

function stripTrailingSeparators(value) {
  const text = String(value || '');
  if (/^[A-Za-z]:[\\/]?$/.test(text) || text === '/') return text;
  return text.replace(/[\\/]+$/, '');
}

function normalizeComparablePath(value, options = {}) {
  if (!value) return '';
  const platform = options.platform || process.platform;
  let resolved;
  try {
    resolved = fs.existsSync(value) ? fs.realpathSync.native(value) : value;
  } catch (_) {
    resolved = value;
  }

  if (isWindowsPath(resolved)) {
    const normalized = stripTrailingSeparators(path.win32.resolve(resolved));
    return platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  const normalized = stripTrailingSeparators(path.resolve(resolved));
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function windowsToWslPath(value) {
  if (!isWindowsPath(value)) return String(value || '').replace(/\\/g, '/');
  const drive = value[0].toLowerCase();
  const rest = value.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/mnt/${drive}/${rest}`;
}

function toGitBashPath(value) {
  if (!isWindowsPath(value)) return String(value || '').replace(/\\/g, '/');
  const drive = value[0].toLowerCase();
  const rest = value.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${drive}/${rest}`;
}

function parseEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch (_) {
    throw new Error(`Invalid WEAPP_WS_ENDPOINT: ${endpoint}`);
  }
  if (!['ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`WEAPP_WS_ENDPOINT must use ws:// or wss://: ${endpoint}`);
  }
  const autoPort = Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80));
  if (!Number.isInteger(autoPort) || autoPort < 1 || autoPort > 65535) {
    throw new Error(`Invalid automation port in WEAPP_WS_ENDPOINT: ${endpoint}`);
  }
  return { parsed, autoPort };
}

function resolveWeappLocalConfig(options = {}) {
  const repoDir = path.resolve(options.repoDir || path.resolve(__dirname, '..', '..'));
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const sourceDir = repoDir;
  const previewDir = path.resolve(env.WEAPP_PREVIEW_DIR || path.join(path.dirname(repoDir), 'badminton-miniapp-preview'));
  if (normalizeComparablePath(sourceDir, { platform }) === normalizeComparablePath(previewDir, { platform })) {
    throw new Error(`WEAPP_PREVIEW_DIR must not equal the source project: ${previewDir}`);
  }

  const launcherDir = env.WEAPP_LAUNCHER_DIR || DEFAULT_LAUNCHER_DIR;
  const wsEndpoint = env.WEAPP_WS_ENDPOINT || DEFAULT_WS_ENDPOINT;
  const { autoPort } = parseEndpoint(wsEndpoint);

  return {
    sourceDir,
    previewDir,
    mainLauncher: env.WEAPP_MAIN_LAUNCHER || path.win32.join(launcherDir, 'weapp-main-dev.cmd'),
    mainLauncherScript: env.WEAPP_MAIN_LAUNCHER_SCRIPT || path.win32.join(launcherDir, 'weapp-main-dev.ps1'),
    previewLauncher: env.WEAPP_PREVIEW_LAUNCHER || path.win32.join(launcherDir, 'weapp-mcp.cmd'),
    previewLauncherScript: env.WEAPP_PREVIEW_LAUNCHER_SCRIPT || path.win32.join(launcherDir, 'weapp-mcp.ps1'),
    devtoolsCli: env.WEAPP_DEVTOOLS_CLI || DEFAULT_DEVTOOLS_CLI,
    wsEndpoint,
    autoPort,
    cliPort: Number(env.WEAPP_CLI_PORT || DEFAULT_CLI_PORT),
    gitBash: env.WEAPP_GIT_BASH || DEFAULT_GIT_BASH,
    wslSourceDir: env.WEAPP_WSL_SOURCE_DIR || DEFAULT_WSL_SOURCE_DIR,
    wslPreviewDir: env.WEAPP_WSL_PREVIEW_DIR || windowsToWslPath(previewDir),
    platform
  };
}

function validateProjectLayout(projectDir, role = 'source') {
  const required = role === 'source'
    ? ['project.config.json', path.join('miniprogram', 'app.js'), 'package.json', '.git']
    : ['project.config.json', path.join('miniprogram', 'app.js')];
  const missing = required.filter((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)));
  return {
    ok: missing.length === 0,
    role,
    projectDir,
    missing
  };
}

module.exports = {
  DEFAULT_CLI_PORT,
  DEFAULT_DEVTOOLS_CLI,
  DEFAULT_GIT_BASH,
  DEFAULT_LAUNCHER_DIR,
  DEFAULT_WS_ENDPOINT,
  DEFAULT_WSL_SOURCE_DIR,
  isWindowsPath,
  normalizeComparablePath,
  resolveWeappLocalConfig,
  toGitBashPath,
  validateProjectLayout,
  windowsToWslPath
};
