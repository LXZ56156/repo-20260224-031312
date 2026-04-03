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
  const script = path.resolve(__dirname, '../scripts/generate-rotation-templates.js');
  const cwd = path.resolve(__dirname, '..');

  execFileSync('node', [script, '--cases', '6p-1c', '--output', first], { cwd, stdio: 'pipe' });
  execFileSync('node', [script, '--cases', '6p-1c', '--output', second], { cwd, stdio: 'pipe' });

  assert.equal(fs.readFileSync(first, 'utf8'), fs.readFileSync(second, 'utf8'));
});
