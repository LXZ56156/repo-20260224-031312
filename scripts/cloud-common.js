#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function discoverTemplates(rootDir = ROOT) {
  return fs.readdirSync(path.join(rootDir, 'scripts'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('-common.template.js'))
    .map((entry) => path.join(rootDir, 'scripts', entry.name))
    .sort();
}

function targetBasename(templatePath) {
  const name = path.basename(templatePath);
  return name === 'cloud-common.template.js'
    ? 'common'
    : name.slice(0, -'-common.template.js'.length);
}

function cloudFunctionDirs(rootDir = ROOT) {
  return fs.readdirSync(path.join(rootDir, 'cloudfunctions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, 'cloudfunctions', entry.name))
    .sort();
}

function check(rootDir = ROOT) {
  const templates = discoverTemplates(rootDir);
  if (!templates.length) throw new Error(`no cloud common templates found under ${path.join(rootDir, 'scripts')}`);
  const mismatches = [];
  for (const functionDir of cloudFunctionDirs(rootDir)) {
    for (const template of templates) {
      const target = path.join(functionDir, 'lib', `${targetBasename(template)}.js`);
      if (!fs.existsSync(target)) {
        mismatches.push(`missing shared lib: ${path.relative(rootDir, target)}`);
      } else if (!fs.readFileSync(template).equals(fs.readFileSync(target))) {
        mismatches.push(`shared lib mismatch: ${path.relative(rootDir, target)}`);
      }
    }
  }
  if (mismatches.length) {
    throw new Error(`${mismatches.join('\n')}\ncloud shared lib check failed; run: npm run sync:cloud-common`);
  }
  return { templates, functions: cloudFunctionDirs(rootDir).length };
}

function sync(rootDir = ROOT) {
  const templates = discoverTemplates(rootDir);
  if (!templates.length) throw new Error(`no cloud common templates found under ${path.join(rootDir, 'scripts')}`);
  for (const functionDir of cloudFunctionDirs(rootDir)) {
    const libDir = path.join(functionDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    for (const template of templates) {
      fs.copyFileSync(template, path.join(libDir, `${targetBasename(template)}.js`));
    }
  }
  return { templates, functions: cloudFunctionDirs(rootDir).length };
}

function main() {
  const action = process.argv[2] || 'check';
  try {
    if (action === 'check') {
      const result = check();
      console.log(`cloud shared lib check passed (${result.templates.length} templates, ${result.functions} functions)`);
      return 0;
    }
    if (action === 'sync') {
      const result = sync();
      console.log(`cloud common synced to cloudfunctions/*/lib from ${result.templates.length} templates`);
      return 0;
    }
    console.error('Usage: node scripts/cloud-common.js <check|sync>');
    return 1;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = { check, cloudFunctionDirs, discoverTemplates, sync, targetBasename };
