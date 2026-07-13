#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOTS = ['miniprogram', 'tests', 'scripts', 'cloudfunctions'];
const DEPRECATED = /wx\.(?:getSystemInfo(?:Sync)?|saveFile|removeSavedFile)\s*\(/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath, files);
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function scan(rootDir = ROOT) {
  const self = path.resolve(__filename);
  const findings = [];
  for (const relativeRoot of SEARCH_ROOTS) {
    const scanRoot = path.join(rootDir, relativeRoot);
    if (!fs.existsSync(scanRoot)) continue;
    for (const filePath of walk(scanRoot)) {
      if (path.resolve(filePath) === self) continue;
      const buffer = fs.readFileSync(filePath);
      if (buffer.includes(0)) continue;
      const lines = buffer.toString('utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        DEPRECATED.lastIndex = 0;
        if (DEPRECATED.test(line)) findings.push(`${path.relative(rootDir, filePath)}:${index + 1}:${line.trim()}`);
      });
    }
  }
  return findings;
}

function main() {
  const findings = scan();
  if (findings.length) {
    console.error(findings.join('\n'));
    console.error('Deprecated wx API detected. Use systemInfo.js or wx.getFileSystemManager() APIs.');
    return 1;
  }
  console.log('No deprecated wx.getSystemInfo / wx.getSystemInfoSync / wx.saveFile / wx.removeSavedFile usage found.');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { scan };
