'use strict';
const fs = require('node:fs');
const path = require('node:path');
function scan(root) {
  const violations = [];
  const ignoredDirs = new Set(['node_modules', '.git', 'tmp', 'coverage', 'dist']);
  const pattern = /wx\.(getSystemInfo(Sync)?|saveFile|removeSavedFile)\s*\(/;
  function visit(relative) {
    const full = path.join(root, relative);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) {
        if (!ignoredDirs.has(name) && !name.startsWith('.')) visit(`${relative}/${name}`);
      }
    } else if (stat.isFile()) {
      if (relative.startsWith('miniprogram/miniprogram_npm/') || /scripts\/check-deprecated-wx-api\.(js|sh)$/.test(relative)) return;
      const content = fs.readFileSync(full);
      if (content.includes(0)) return;
      content.toString('utf8').split(/\r?\n/).forEach((line, index) => {
        if (pattern.test(line)) violations.push(`${relative}:${index + 1}:${line.trim()}`);
      });
    }
  }
  for (const dir of ['miniprogram', 'tests', 'scripts', 'cloudfunctions']) visit(dir);
  return violations;
}
function main(root = path.join(__dirname, '..')) {
  try {
    const violations = scan(root);
    if (violations.length) { console.error(violations.join('\n')); console.error('Deprecated wx API detected. Use core/systemInfo.js and FileSystemManager APIs.'); return 1; }
    console.log('No deprecated wx API usage found.'); return 0;
  } catch (_) { console.error('Deprecated wx API scan failed; check source directories and read access.'); return 2; }
}
if (require.main === module) process.exitCode = main();
module.exports = {scan, main};
