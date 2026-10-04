const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGitBash, toGitBashPath } = require('../scripts/lib/git-bash');

const REPO_DIR = path.resolve(__dirname, '..');

function runDeployPlan(files) {
  const command = resolveGitBash();
  const script = path.join(REPO_DIR, 'scripts/deploy-changed-cloudfunctions.sh');
  return spawnSync(
    command,
    [process.platform === 'win32' ? toGitBashPath(script) : script, '--files-from', '-', '--dry-run'],
    {
      cwd: REPO_DIR,
      input: `${files.join('\n')}\n`,
      encoding: 'utf8'
    }
  );
}

function deployedFunctions(output) {
  return output
    .split('\n')
    .filter((line) => /^ {2}[A-Za-z0-9_-]+$/.test(line))
    .map((line) => line.trim());
}

test('deploy changed cloudfunctions maps a direct function change', () => {
  const result = runDeployPlan(['cloudfunctions/login/index.js']);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployedFunctions(result.stdout), ['login']);
});

test('deploy changed cloudfunctions maps startTournament internals to startTournament', () => {
  const result = runDeployPlan(['cloudfunctions/startTournament/rotation.js']);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployedFunctions(result.stdout), ['startTournament']);
});

test('deploy changed cloudfunctions deduplicates multiple function changes', () => {
  const result = runDeployPlan([
    'cloudfunctions/login/index.js',
    'cloudfunctions/submitScore/index.js',
    'cloudfunctions/login/package.json'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployedFunctions(result.stdout), ['login', 'submitScore']);
});

test('deploy changed cloudfunctions expands shared template changes to all configured functions', () => {
  const result = runDeployPlan(['scripts/mode-common.template.js']);
  const functions = deployedFunctions(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Shared common template changed/);
  const configured = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'cloudbaserc.json'), 'utf8')).functions.map(item => item.name);
  assert.deepEqual(functions, configured);
  assert.equal(functions.includes('generateShareCode'), true);
  assert.equal(functions.includes('waterSession'), true);
  assert.equal(functions.at(-1), 'updateSettings');
});

test('deploy changed cloudfunctions skips unrelated changes', () => {
  const result = runDeployPlan(['miniprogram/pages/home/index.js']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No cloud function changes detected/);
  assert.deepEqual(deployedFunctions(result.stdout), []);
});

test('deploy changed cloudfunctions rejects direct lib changes without template changes', () => {
  const result = runDeployPlan(['cloudfunctions/login/lib/common.js']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cloudfunctions\/\*\/lib\/\*/);
  assert.match(result.stderr, /scripts\/\*-common\.template\.js/);
});

test('deploy changed cloudfunctions allows initial lib files for a new configured function', () => {
  const result = runDeployPlan([
    'cloudfunctions/generateShareCode/index.js',
    'cloudfunctions/generateShareCode/package.json',
    'cloudfunctions/generateShareCode/lib/common.js'
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployedFunctions(result.stdout), ['generateShareCode']);
});

test('configured cloudfunctions install declared wx-server-sdk dependencies in the cloud', () => {
  const config = JSON.parse(fs.readFileSync('cloudbaserc.json', 'utf8'));

  assert.ok(Array.isArray(config.functions));
  for (const item of config.functions) {
    assert.equal(typeof item, 'object');
    assert.equal(item.installDependency, true, `${item.name} must enable cloud dependency installation`);

    const packageJsonPath = path.join('cloudfunctions', item.name, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.equal(packageJson.dependencies['wx-server-sdk'], '2.6.3', `${item.name} must declare wx-server-sdk`);
  }
});

test('configuration-only timeout changes select only their function for commit, range and explicit file baselines', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-deploy-config-'));
  const unix = value => process.platform === 'win32' ? toGitBashPath(value) : value;
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    const script = path.join(root, 'scripts/deploy-changed-cloudfunctions.sh');
    fs.copyFileSync(path.join(REPO_DIR, 'scripts/deploy-changed-cloudfunctions.sh'), script);
    const git = args => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout.trim();
    };
    git(['init', '--quiet']);
    const config = { envId: 'test-env', functions: [{ name: 'login', installDependency: true }, { name: 'startTournament', installDependency: true, timeout: 3 }] };
    fs.writeFileSync(path.join(root, 'cloudbaserc.json'), JSON.stringify(config));
    git(['add', 'cloudbaserc.json']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    config.functions[1].timeout = 10;
    fs.writeFileSync(path.join(root, 'cloudbaserc.json'), JSON.stringify(config));
    git(['add', 'cloudbaserc.json']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'timeout']);
    const plan = args => spawnSync(resolveGitBash(), [unix(script), ...args, '--dry-run'], { cwd: root, encoding: 'utf8', input: 'cloudbaserc.json\n' });
    for (const args of [['--commit', 'HEAD'], ['--range', `${base}..HEAD`], ['--files-from', '-', '--config-base', base]]) {
      const result = plan(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(deployedFunctions(result.stdout), ['startTournament']);
    }
    const crlfList = path.join(root, 'changed files.txt');
    fs.writeFileSync(crlfList, 'cloudbaserc.json\r\n');
    const crlf = plan(['--files-from', unix(crlfList), '--config-base', base]);
    assert.equal(crlf.status, 0, crlf.stdout + crlf.stderr);
    assert.deepEqual(deployedFunctions(crlf.stdout), ['startTournament']);
    const ambiguous = plan(['--files-from', '-']);
    assert.notEqual(ambiguous.status, 0, ambiguous.stdout + ambiguous.stderr);
    assert.match(ambiguous.stderr, /config-base/);
    const unchanged = plan(['--files-from', '-', '--config-base', 'HEAD']);
    assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
    assert.deepEqual(deployedFunctions(unchanged.stdout), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
