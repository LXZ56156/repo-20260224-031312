const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveUploadSource } = require('../scripts/mp-ci');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ci-source-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'core.hooksPath', path.join(dir, 'disabled-hooks'));
  fs.mkdirSync(path.join(dir, 'miniprogram'));
  fs.writeFileSync(path.join(dir, 'project.config.json'), JSON.stringify({ miniprogramRoot: 'miniprogram/' }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '9.8.7' }));
  fs.writeFileSync(path.join(dir, 'miniprogram/app.json'), '{}');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture source');
  return { dir, git };
}

test('upload metadata comes from actual target Git and ignores unrelated docs changes', (t) => {
  const { dir, git } = fixture(t);
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs/note.md'), 'local note');
  const source = resolveUploadSource(dir);
  assert.equal(source.version, `9.8.7-${git('rev-parse', '--short', 'HEAD')}`);
  assert.equal(source.desc, 'fixture source');
  assert.throws(() => resolveUploadSource(dir, 'wrong-commit-version'), /MP_VERSION/);
});

test('upload rejects modified and untracked packaged source', (t) => {
  const { dir } = fixture(t);
  fs.writeFileSync(path.join(dir, 'miniprogram/app.json'), '{"pages":[]}');
  assert.throws(() => resolveUploadSource(dir), /未提交/);
  fs.writeFileSync(path.join(dir, 'miniprogram/app.json'), '{}');
  fs.writeFileSync(path.join(dir, 'miniprogram/new.js'), 'new source');
  assert.throws(() => resolveUploadSource(dir), /未提交/);
});

test('upload rejects a mirror without its own Git source', (t) => {
  const { dir } = fixture(t);
  const mirror = path.join(dir, 'mirror');
  fs.mkdirSync(mirror);
  fs.writeFileSync(path.join(mirror, 'project.config.json'), '{}');
  assert.throws(() => resolveUploadSource(mirror), /Git/);
});
