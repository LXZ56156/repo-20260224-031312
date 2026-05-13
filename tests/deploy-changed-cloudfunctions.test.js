const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function runDeployPlan(files) {
  return spawnSync(
    'bash',
    ['scripts/deploy-changed-cloudfunctions.sh', '--files-from', '-', '--dry-run'],
    {
      cwd: process.cwd(),
      input: `${files.join('\n')}\n`,
      encoding: 'utf8'
    }
  );
}

function deployedFunctions(output) {
  return output
    .split('\n')
    .filter((line) => /^  [A-Za-z0-9_-]+$/.test(line))
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
  assert.equal(functions.length, 20);
  assert.equal(functions[0], 'addPlayers');
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
