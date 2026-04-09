const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('rotation template generator is deterministic for a targeted case', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-template-'));
  const first = path.join(tempDir, 'first.js');
  const second = path.join(tempDir, 'second.js');
  const firstMatchOptions = path.join(tempDir, 'first.match-options.js');
  const secondMatchOptions = path.join(tempDir, 'second.match-options.js');
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '6p-1c', '--output', first, '--frontend-output', firstMatchOptions], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '6p-1c', '--output', second, '--frontend-output', secondMatchOptions], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.equal(fs.readFileSync(firstMatchOptions, 'utf8'), fs.readFileSync(secondMatchOptions, 'utf8'));
});

test('rotation template generator is deterministic for a new 4-court case', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-template-'));
  const first = path.join(tempDir, 'first.js');
  const second = path.join(tempDir, 'second.js');
  const firstMatchOptions = path.join(tempDir, 'first.match-options.js');
  const secondMatchOptions = path.join(tempDir, 'second.match-options.js');
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '16p-4c', '--output', first, '--frontend-output', firstMatchOptions], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '16p-4c', '--output', second, '--frontend-output', secondMatchOptions], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.equal(fs.readFileSync(firstMatchOptions, 'utf8'), fs.readFileSync(secondMatchOptions, 'utf8'));
});

test('rotation template generator is deterministic for a coverage milestone case', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-template-'));
  const first = path.join(tempDir, 'first.js');
  const second = path.join(tempDir, 'second.js');
  const firstMatchOptions = path.join(tempDir, 'first.match-options.js');
  const secondMatchOptions = path.join(tempDir, 'second.match-options.js');
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '7p-1c', '--output', first, '--frontend-output', firstMatchOptions], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '7p-1c', '--output', second, '--frontend-output', secondMatchOptions], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.equal(fs.readFileSync(firstMatchOptions, 'utf8'), fs.readFileSync(secondMatchOptions, 'utf8'));
});

test('rotation template generator is deterministic for an expanded 20p-2c case', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-template-'));
  const first = path.join(tempDir, 'first.js');
  const second = path.join(tempDir, 'second.js');
  const firstMatchOptions = path.join(tempDir, 'first.match-options.js');
  const secondMatchOptions = path.join(tempDir, 'second.match-options.js');
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '20p-2c', '--output', first, '--frontend-output', firstMatchOptions], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '20p-2c', '--output', second, '--frontend-output', secondMatchOptions], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.equal(fs.readFileSync(firstMatchOptions, 'utf8'), fs.readFileSync(secondMatchOptions, 'utf8'));
});

test('rotation template generator is deterministic for an expanded 24p-3c case', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-template-'));
  const first = path.join(tempDir, 'first.js');
  const second = path.join(tempDir, 'second.js');
  const firstMatchOptions = path.join(tempDir, 'first.match-options.js');
  const secondMatchOptions = path.join(tempDir, 'second.match-options.js');
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '24p-3c', '--output', first, '--frontend-output', firstMatchOptions], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '24p-3c', '--output', second, '--frontend-output', secondMatchOptions], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.equal(fs.readFileSync(firstMatchOptions, 'utf8'), fs.readFileSync(secondMatchOptions, 'utf8'));
});
