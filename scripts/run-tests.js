'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
function testArguments(root, args = []) {
  const files = args.filter((arg) => !arg.startsWith('--'));
  const flags = args.filter((arg) => arg.startsWith('--'));
  const selected = files.length ? files : fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.js')).sort().map((name) => `tests/${name}`);
  if (!selected.length) throw new Error('No test files selected');
  for (const file of selected) if (!fs.statSync(path.resolve(root, file)).isFile()) throw new Error(`Not a test file: ${file}`);
  return ['--test', ...(flags.some((arg) => arg.startsWith('--test-concurrency=')) ? [] : ['--test-concurrency=1']), ...flags, ...selected];
}
if (require.main === module) {
  try {
    const root = path.join(__dirname, '..');
    const result = spawnSync(process.execPath, testArguments(root, process.argv.slice(2)), {cwd: root, stdio: 'inherit'});
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {testArguments};
