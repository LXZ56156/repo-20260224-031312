'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {resolveGitBash} = require('./lib/git-bash');

function collectPreflight(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const cacheDir = options.cacheDir === undefined ? process.env.npm_config_cache || '' : options.cacheDir;
  const checks = [];
  const check = (id, run, hint) => {
    try {run(); checks.push({id, status: 'pass'});}
    catch (_) {checks.push({id, status: 'fail', hint});}
  };
  check('checkout', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    if (pkg.name !== 'badminton-miniapp' || lock.lockfileVersion !== 3) throw new Error('checkout');
  }, 'Run in the actual Git/npm checkout (the registered parent may contain main).');
  check('tmp-access', () => {fs.accessSync(path.join(root, 'tmp'), fs.constants.R_OK | fs.constants.W_OK);}, 'Create checkout/tmp explicitly if missing; this probe does not create directories.');
  check('dependencies', () => {
    const resolve = options.resolveDependency || ((name) => require.resolve(name, {paths: [root]}));
    for (const name of ['eslint', 'miniprogram-ci', 'miniprogram-automator', 'canvas']) resolve(name);
  }, 'Install from the reviewed root lockfile before testing; no install is performed.');
  check('canvas-native', () => {
    if (options.loadCanvas) options.loadCanvas();
    else {
      const canvas = require(require.resolve('canvas', {paths: [root]}));
      canvas.createCanvas(1, 1).getContext('2d');
    }
  }, 'Check the locked canvas native binary and Node ABI; no file is rendered.');
  check('shell', () => {
    const resolved = (options.resolveBash || resolveGitBash)();
    const executable = path.isAbsolute(resolved) ? resolved
      : String(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, resolved)).find((candidate) => fs.existsSync(candidate));
    if (!executable) throw new Error('unresolved shell');
    fs.accessSync(executable, fs.constants.R_OK | fs.constants.X_OK);
  }, 'Windows: set WEAPP_GIT_BASH to an existing Git bash.exe; non-Windows: set WEAPP_BASH/BASH_BIN to an absolute executable. No shell is launched.');
  if (cacheDir) check('npm-cache-access', () => {fs.accessSync(path.resolve(cacheDir), fs.constants.R_OK | fs.constants.W_OK);}, 'Verify the explicit npm cache path and access; this probe never creates or changes it.');
  else checks.push({id: 'npm-cache-access', status: 'unverified', hint: 'Pass the path returned by npm config get cache as npm_config_cache; default paths are not assumed.'});
  checks.push({id: 'platform-runtime', status: 'unverified', hint: 'This is not a WSL/DevTools session, credential, cloud, UI or full-test acceptance check. Run the corresponding platform gates separately.'});
  return {readOnly: true, root, platform: process.platform, node: process.version, ready: checks.every((item) => item.status !== 'fail'), checks};
}

if (require.main === module) {
  const result = collectPreflight();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ready ? 0 : 1;
}
module.exports = {collectPreflight};
