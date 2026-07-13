#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveWeappLocalConfig, validateProjectLayout } = require('../lib/weapp-local-config');
const { auditPowerShellLauncher, validateLauncherAudit } = require('../lib/weapp-launcher-audit');
const { runFileSync } = require('../lib/process-runner');

const repoDir = path.resolve(__dirname, '..', '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readEnvKeys(filePath) {
  const keys = new Set();
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*)=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function readEnvValue(filePath, key) {
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match && match[1] === key) return match[2].trim().replace(/^"|"$/g, '');
  }
  return '';
}

function hasTrustedProjectPath(configText, projectPath) {
  const quotedPath = JSON.stringify(String(projectPath));
  const escapedPath = quotedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignment = new RegExp(`^\\s*${escapedPath}\\s*=\\s*\\{([^}\\r\\n]*)\\}\\s*(?:#.*)?$`, 'm').exec(configText);
  return Boolean(assignment && /(?:^|[,\s])trust_level\s*=\s*["']trusted["'](?:[,\s]|$)/.test(assignment[1]));
}

function auditEnvironment(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const config = resolveWeappLocalConfig({ repoDir, env, platform });
  const rows = [];
  const add = (status, name, detail = '') => rows.push({ status, name, detail });
  const ok = (name, detail) => add('ok', name, detail);
  const warn = (name, detail) => add('warn', name, detail);
  const fail = (name, detail) => add('fail', name, detail);
  const exists = (name, filePath, required = true, safeDetail = filePath) => {
    if (fs.existsSync(filePath)) {
      ok(name, safeDetail);
      return true;
    }
    (required ? fail : warn)(name, `missing: ${safeDetail}`);
    return false;
  };

  if (platform === 'win32') ok('platform', platform);
  else warn('platform', `Windows-native audit is running on ${platform}; runtime launcher checks skipped`);

  const sourceLayout = validateProjectLayout(config.sourceDir, 'source');
  sourceLayout.ok
    ? ok('source project layout', config.sourceDir)
    : fail('source project layout', `missing: ${sourceLayout.missing.join(', ')}`);

  const gitRoot = runFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoDir });
  if (!gitRoot.error && gitRoot.status === 0 && path.resolve(gitRoot.stdout.trim()) === repoDir) {
    ok('git repository root', repoDir);
  } else {
    fail('git repository root', gitRoot.stderr.trim() || gitRoot.stdout.trim() || 'git rev-parse failed');
  }

  for (const [key, expected] of [['core.autocrlf', 'false'], ['core.longpaths', 'true']]) {
    const result = runFileSync('git', ['config', '--global', '--get', key], { cwd: repoDir });
    const actual = result.status === 0 ? result.stdout.trim() : '';
    actual === expected ? ok(`git ${key}`, actual) : fail(`git ${key}`, `expected ${expected}, got ${actual || '<unset>'}`);
  }

  const pkg = readJson(path.join(repoDir, 'package.json'));
  const ordinaryScripts = ['lint', 'test', 'check:cloud-common', 'check:deprecated-wx-api', 'check', 'verify:windows-env', 'verify:light', 'verify:full'];
  const shellDependent = ordinaryScripts.filter((name) => {
    const command = String(pkg.scripts && pkg.scripts[name] || '');
    return /(^|\s)bash(\s|$)/.test(command) || /(^|\s)[A-Z][A-Z0-9_]*=[^\s]+\s/.test(command);
  });
  shellDependent.length
    ? fail('ordinary npm shell independence', `shell-dependent scripts: ${shellDependent.join(', ')}`)
    : ok('ordinary npm shell independence', 'Node/PowerShell entrypoints; global script-shell is not required');

  const scriptShell = env.npm_config_script_shell || env.NPM_CONFIG_SCRIPT_SHELL || '';
  if (scriptShell) warn('npm script-shell', `configured but optional: ${scriptShell}`);
  else ok('npm script-shell', '<unset>; ordinary workflows remain supported');

  let automatorPackage;
  try {
    const automatorPackagePath = require.resolve('miniprogram-automator/package.json', { paths: [repoDir] });
    automatorPackage = readJson(automatorPackagePath);
    if (!automatorPackagePath.startsWith(path.join(repoDir, 'node_modules'))) {
      fail('miniprogram-automator', `resolved outside repository: ${automatorPackagePath}`);
    } else if (pkg.devDependencies['miniprogram-automator'] !== automatorPackage.version) {
      fail('miniprogram-automator', `package=${automatorPackage.version}; pinned=${pkg.devDependencies['miniprogram-automator'] || '<missing>'}`);
    } else {
      ok('miniprogram-automator', `local ${automatorPackage.version}`);
    }
  } catch (error) {
    fail('miniprogram-automator', error.message);
  }

  exists('DevTools CLI', config.devtoolsCli, platform === 'win32');
  const previewLayout = validateProjectLayout(config.previewDir, 'preview');
  previewLayout.ok
    ? ok('preview project layout', config.previewDir)
    : fail('preview project layout', `missing at ${config.previewDir}: ${previewLayout.missing.join(', ')}`);

  const launcherFilesPresent = [
    ['DevTools main launcher', config.mainLauncher],
    ['DevTools main launcher script', config.mainLauncherScript],
    ['DevTools preview launcher', config.previewLauncher],
    ['DevTools preview launcher script', config.previewLauncherScript]
  ].every(([name, filePath]) => exists(name, filePath, platform === 'win32'));

  if (platform === 'win32' && launcherFilesPresent) {
    for (const [role, cmdPath, scriptPath] of [
      ['source', config.mainLauncher, config.mainLauncherScript],
      ['preview', config.previewLauncher, config.previewLauncherScript]
    ]) {
      const cmd = fs.readFileSync(cmdPath, 'utf8');
      const expectedStem = path.basename(scriptPath);
      if (!cmd.includes(expectedStem) || !cmd.includes('%*')) {
        fail(`${role} launcher wrapper`, `must forward to ${expectedStem} with %*`);
        continue;
      }
      try {
        const audit = auditPowerShellLauncher(scriptPath, { cwd: repoDir, env, timeoutMs: 15000 });
        validateLauncherAudit(audit, config, role);
        ok(`${role} launcher project pairing`, `${audit.projectDir} -> ${audit.wsEndpoint}`);
      } catch (error) {
        fail(`${role} launcher project pairing`, error.message);
      }
    }
  }

  const manifestPath = path.join(config.previewDir, '.weapp-preview-sync.json');
  if (exists('preview sync manifest', manifestPath, true)) {
    try {
      const manifest = readJson(manifestPath);
      const pathMatches = manifest.sourceDir === config.wslSourceDir && manifest.previewDir === config.wslPreviewDir;
      pathMatches
        ? ok('preview manifest paths', `${manifest.sourceDir} -> ${manifest.previewDir}`)
        : fail('preview manifest paths', `expected ${config.wslSourceDir} -> ${config.wslPreviewDir}`);
      if (manifest.invalidatedReason) warn('preview manifest freshness', `stale by design: ${manifest.invalidatedReason}`);
      else warn('preview manifest freshness', `last synced at ${manifest.syncedAt || '<unknown>'}; verify before explicit preview/upload use`);
    } catch (error) {
      fail('preview sync manifest', `invalid JSON: ${error.message}`);
    }
  }

  const envLocal = path.join(repoDir, '.env.local');
  if (exists('.env.local', envLocal, false, '<local file>')) {
    const keys = readEnvKeys(envLocal);
    for (const key of ['WX_APPID', 'WX_APPSECRET', 'WX_PRIVATE_KEY_PATH', 'MP_ROBOT']) {
      keys.has(key) ? ok(`.env.local ${key}`, '<redacted>') : warn(`.env.local ${key}`, 'missing');
    }
    const privateKeyPath = readEnvValue(envLocal, 'WX_PRIVATE_KEY_PATH');
    if (privateKeyPath) {
      fs.existsSync(privateKeyPath)
        ? ok('WX_PRIVATE_KEY_PATH target', '<redacted path exists>')
        : warn('WX_PRIVATE_KEY_PATH target', '<redacted path missing>');
    }
  }

  const mcpPath = path.join(repoDir, '.mcp.json');
  if (exists('.mcp.json', mcpPath, false, '<local file>')) {
    try {
      const servers = readJson(mcpPath).mcpServers || {};
      for (const name of ['context7', 'playwright', 'cloudbase', 'weapp_dev']) {
        servers[name] ? ok(`mcp server ${name}`, 'present') : warn(`mcp server ${name}`, 'missing');
      }
      const endpoint = servers.weapp_dev && servers.weapp_dev.env && servers.weapp_dev.env.WEAPP_WS_ENDPOINT;
      endpoint === config.wsEndpoint
        ? ok('weapp_dev endpoint', endpoint)
        : fail('weapp_dev endpoint', `expected ${config.wsEndpoint}, got ${endpoint || '<unset>'}`);
    } catch (error) {
      fail('.mcp.json', `invalid JSON: ${error.message}`);
    }
  }

  for (const [name, relativePath, required] of [
    ['Codex config', '.codex/config.toml', true],
    ['Codex hooks config', '.codex/hooks.json', true],
    ['Codex cross-platform preflight', '.codex/hooks/weapp_preflight.js', true],
    ['Codex cross-platform stop', '.codex/hooks/weapp_stop.js', true],
    ['Codex Windows preflight', '.codex/hooks/windows_weapp_preflight.ps1', true],
    ['Codex Windows stop', '.codex/hooks/windows_weapp_stop.ps1', true],
    ['tracked main launcher', 'scripts/dev/start-weapp-main.ps1', true],
    ['tracked preview launcher', 'scripts/dev/start-weapp-preview.ps1', true],
    ['Tool.getInfo probe', 'scripts/dev/probe-weapp-automation.ps1', true],
    ['project.private.config.json', 'project.private.config.json', false],
    ['.vscode/settings.json', '.vscode/settings.json', false]
  ]) {
    exists(name, path.join(repoDir, relativePath), required);
  }

  const codexConfigPath = path.join(repoDir, '.codex', 'config.toml');
  if (fs.existsSync(codexConfigPath)) {
    const codexConfig = fs.readFileSync(codexConfigPath, 'utf8');
    const hasSource = hasTrustedProjectPath(codexConfig, config.sourceDir);
    const hasWsl = hasTrustedProjectPath(codexConfig, config.wslSourceDir);
    hasSource && hasWsl
      ? ok('Codex trusted project paths', 'Windows canonical + explicit WSL fallback')
      : fail('Codex trusted project paths', 'missing renamed Windows or WSL project path');
  }

  const postCommit = path.join(repoDir, '.git', 'hooks', 'post-commit');
  if (exists('.git/hooks/post-commit', postCommit, false)) {
    const hookText = fs.readFileSync(postCommit, 'utf8');
    /badminton-miniapp cloud post-commit deploy hook/.test(hookText) && /post-commit-cloud-deploy\.sh/.test(hookText)
      ? ok('post-commit hook content', 'guarded cloud deploy hook present')
      : warn('post-commit hook content', 'unexpected local hook content');
  }

  return { config, rows };
}

function main() {
  let result;
  try {
    result = auditEnvironment();
  } catch (error) {
    console.error(`[FAIL] environment audit initialization: ${error.message}`);
    return 1;
  }
  for (const row of result.rows) {
    const prefix = row.status === 'ok' ? '[OK]' : row.status === 'warn' ? '[WARN]' : '[FAIL]';
    console.log(`${prefix} ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
  }
  const failures = result.rows.filter((row) => row.status === 'fail');
  if (failures.length) {
    console.error(`Windows environment check failed: ${failures.length} issue(s).`);
    return 1;
  }
  console.log('Windows environment check completed.');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { auditEnvironment, hasTrustedProjectPath, main };
