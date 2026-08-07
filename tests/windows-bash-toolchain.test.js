const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Windows npm scripts route repository shell files through the guarded Git Bash launcher', () => {
  const packageJson = JSON.parse(read('package.json'));
  const shellScripts = Object.entries(packageJson.scripts)
    .filter(([, command]) => command.includes('.sh'));

  assert.ok(fs.existsSync(path.join(root, 'scripts/run-bash-script.js')));
  assert.ok(fs.existsSync(path.join(root, 'scripts/lib/git-bash.js')));
  assert.ok(shellScripts.length > 0);
  for (const [name, command] of shellScripts) {
    assert.doesNotMatch(command, /(^|\s)bash\s/, `${name} must not resolve the Windows WSL bash shim`);
    assert.match(command, /^node scripts\/run-bash-script\.js scripts\/.+\.sh(?:\s|$)/, `${name} must use the guarded launcher`);
  }
});

test('lint excludes generated Mini Program npm output', () => {
  const packageJson = JSON.parse(read('package.json'));
  const eslintConfig = read('eslint.config.js');

  assert.equal(packageJson.scripts.lint, 'node scripts/run-eslint.js');
  assert.ok(fs.existsSync(path.join(root, 'scripts/run-eslint.js')));
  assert.match(eslintConfig, /miniprogram\/miniprogram_npm\/\*\*/);
  assert.match(eslintConfig, /module\.exports\s*=\s*\[\s*\{\s*ignores:/);
  assert.doesNotMatch(eslintConfig, /export default/);
});

test('legacy Codex hook explicitly routes shell helpers through Git Bash on Windows', () => {
  const hooks = [
    read('.codex/hooks/user_prompt_sync_windows_mirror.py'),
    read('.codex/hooks/stop_sync_windows_mirror.py'),
  ];

  for (const hook of hooks) {
    assert.match(hook, /resolve_git_bash/);
    assert.match(hook, /os\.name == "nt"/);
    assert.match(hook, /helper\.suffix\.lower\(\) == "\.sh"/);
  }
});
