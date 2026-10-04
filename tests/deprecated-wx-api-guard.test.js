const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveGitBash, toGitBashPath } = require('../scripts/lib/git-bash');

const script = fs.readFileSync(
  path.resolve(__dirname, '../scripts/check-deprecated-wx-api.sh'),
  'utf8'
);

test('deprecated wx API guard excludes generated third-party miniprogram packages', () => {
  assert.match(script, /-g\s+'!miniprogram\/miniprogram_npm\/\*\*'/);
});

const shellPath = (value) => process.platform === 'win32' ? toGitBashPath(value) : value;
const quote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

function runGuard({ includeRg = true, source = 'wx.getWindowInfo();\n', scanError = false } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-deprecated-guard-'));
  const tools = path.join(fixture, 'tools');
  try {
    for (const directory of ['scripts', 'miniprogram', 'cloudfunctions', ...(scanError ? [] : ['tests']), 'tools']) {
      fs.mkdirSync(path.join(fixture, directory));
    }
    fs.writeFileSync(path.join(fixture, 'scripts/check-deprecated-wx-api.sh'), script);
    fs.writeFileSync(path.join(fixture, 'miniprogram/app.js'), source);
    // Keep PATH isolated without making the script's dirname prerequisite fail.
    fs.writeFileSync(path.join(tools, 'dirname'), '#!/bin/bash\nprintf "%s\\n" "${1%/*}"\n', { mode: 0o755 });
    if (includeRg) {
      const located = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['rg'], { encoding: 'utf8' });
      assert.equal(located.status, 0, `Actual ripgrep is required for scanner fixtures: ${located.stderr}`);
      const rgPath = located.stdout.split(/\r?\n/).find((line) => line && fs.existsSync(line));
      assert.ok(rgPath, 'Actual ripgrep executable must resolve');
      fs.writeFileSync(path.join(tools, 'rg'), `#!/bin/bash\nexec ${quote(shellPath(rgPath))} "$@"\n`, { mode: 0o755 });
    }
    return spawnSync(resolveGitBash(), ['--noprofile', '--norc', shellPath(path.join(fixture, 'scripts/check-deprecated-wx-api.sh'))], {
      cwd: fixture, encoding: 'utf8', env: { ...process.env, PATH: shellPath(tools) }
    });
  } finally {
    const resolved = path.resolve(fixture);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('weapp-deprecated-guard-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('deprecated wx API guard fails clearly when ripgrep is absent from PATH', () => {
  const result = runGuard({ includeRg: false });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rg.*(required|not found|missing|unavailable)/i);
  assert.doesNotMatch(result.stdout, /No deprecated/);
});

test('deprecated wx API guard succeeds when actual ripgrep finds no old API', () => {
  const result = runGuard();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No deprecated/);
});

test('deprecated wx API guard still rejects old APIs with actual ripgrep', () => {
  const result = runGuard({ source: 'wx.' + 'getSystemInfoSync();\n' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deprecated wx API detected/);
  assert.doesNotMatch(result.stdout, /No deprecated/);
});

test('deprecated wx API guard treats actual ripgrep exit 2 as a scan failure', () => {
  const result = runGuard({ scanError: true });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /scan failed.*2/i);
  assert.doesNotMatch(result.stdout, /No deprecated/);
});
