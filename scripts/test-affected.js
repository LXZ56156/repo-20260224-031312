#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

function selectChecks(files, testFiles) {
  const selected = new Set();
  const uncoveredAreas = new Set();
  let full = false;
  let cloudCommon = false;
  const add = (pattern) => testFiles.filter((file) => pattern.test(file)).forEach((file) => selected.add(file));
  for (const raw of files) {
    const file = raw.replace(/\\/g, '/');
    if (/^(docs\/|.*\.md$)/.test(file)) continue;
    if (file.startsWith('tests/')) { if (testFiles.includes(file)) selected.add(file); else full = true; continue; }
    if (/^\.(codex|claude)\//.test(file) || file.endsWith('weapp-dev.sh')) { add(/weapp-hook-config|codex.user-prompt-hook/); continue; }
    if (/^scripts\/dev\/(weapp-ui-|weapp-background-|weapp-pixel-|weapp-screenshot-|water-v2-screenshot)/.test(file)) {
      add(/weapp-ui-screenshot|weapp-pixel/); continue;
    }
    if (file === 'scripts/test-affected.js') { add(/test-affected/); continue; }
    if (/^scripts\/.*common\.template\.js$|^cloudfunctions\/[^/]+\/lib\//.test(file)) {
      cloudCommon = true; add(/cloud|permission|score|submit|join|startTournament|water/); continue;
    }
    const area = file.match(/^miniprogram\/pages\/([^/]+)\//) || file.match(/^cloudfunctions\/([^/]+)\//);
    if (area) {
      const name = area[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = testFiles.filter((entry) => new RegExp(name, 'i').test(entry));
      matches.forEach((entry) => selected.add(entry));
      if (!matches.length) {
        full = true;
        uncoveredAreas.add(area[1]);
      } else if (!/\.(wxss|wxml)$/.test(file)) {
        add(/smoke|async-stale|sync/i);
      }
      continue;
    }
    if (/\.(js|json|wxml|wxss|wxs|sh|ps1)$/.test(file)) full = true;
  }
  return { files, tests: full ? testFiles : [...selected].sort(), full, cloudCommon, uncoveredAreas: [...uncoveredAreas].sort(),
    note: 'Explicit affected checks only; no mirror, preview, upload, or automatic baseline update.' };
}
function main() {
  const args = process.argv.slice(2);
  const run = args.includes('--run');
  let files = args.filter((arg) => arg !== '--run');
  if (!files.length) files = [...new Set([
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/),
  ].filter(Boolean))];
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((name) => name.endsWith('.test.js')).map((name) => `tests/${name}`);
  const plan = selectChecks(files, tests);
  console.log(JSON.stringify(plan, null, 2));
  if (!run) return;
  if (plan.tests.length) {
    const result = spawnSync(process.execPath, ['--test', ...plan.tests], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) { process.exitCode = result.status || 1; return; }
  }
  if (plan.cloudCommon) {
    const result = spawnSync(process.execPath, ['scripts/run-bash-script.js', 'scripts/check-cloud-common.sh'], { cwd: ROOT, stdio: 'inherit' });
    process.exitCode = result.status || (result.error ? 1 : 0);
  }
}
if (require.main === module) main();
module.exports = { selectChecks };
