#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { runFileSync } = require('./lib/process-runner');

const ROOT = path.resolve(__dirname, '..');

function buildVerificationPlan(files) {
  const normalized = [...new Set((files || []).map((file) => String(file).replace(/\\/g, '/')).filter(Boolean))];
  const isDocEntry = (file) => (
    file.startsWith('docs/') ||
    file === 'AGENTS.md' ||
    file === 'CLAUDE.md' ||
    file === 'README.md' ||
    file === '.github/copilot-instructions.md'
  );
  const hasProductOrCloud = normalized.some((file) => (
    file.startsWith('miniprogram/') || file.startsWith('cloudfunctions/')
  ));
  if (hasProductOrCloud) return [['npm', ['run', 'verify:full']]];

  const onlyDocs = normalized.length > 0 && normalized.every(isDocEntry);
  if (onlyDocs) {
    return [
      ['node', ['--test', 'tests/docs-governance.test.js', 'tests/repo-inventory.test.js']],
      ['npm', ['run', 'docs:check']],
      ['git', ['diff', '--check']]
    ];
  }

  return [
    ['npm', ['run', 'verify:light']],
    ['npm', ['run', 'docs:check']],
    ['git', ['diff', '--check']]
  ];
}

function gitLines(args) {
  const output = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function mergeChangedFiles(...groups) {
  return [...new Set(groups.flat().map((file) => String(file).replace(/\\/g, '/')).filter(Boolean))].sort();
}

function discoverChangedFiles(env = process.env) {
  const groups = [
    gitLines(['diff', '--name-only']),
    gitLines(['diff', '--cached', '--name-only']),
    gitLines(['ls-files', '--others', '--exclude-standard'])
  ];
  if (env.VERIFY_BASE) {
    groups.push(gitLines(['diff', '--name-only', `${env.VERIFY_BASE}...HEAD`]));
  }
  return mergeChangedFiles(...groups);
}

function resolveInvocation(command, args) {
  if (command !== 'npm') return [command, args];
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return [process.execPath, [npmCli, ...args]];
}

function main() {
  const files = discoverChangedFiles();
  const plan = buildVerificationPlan(files);
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({ files, plan }, null, 2));
    return 0;
  }
  console.log(`verify:changed: ${files.length} changed files`);
  for (const [command, args] of plan) {
    console.log(`> ${command} ${args.join(' ')}`);
    const [resolvedCommand, resolvedArgs] = resolveInvocation(command, args);
    const result = runFileSync(resolvedCommand, resolvedArgs, { cwd: ROOT, stdio: 'inherit' });
    if (result.error) {
      console.error(result.error.message);
      return 1;
    }
    if (result.status !== 0) return result.status == null ? 1 : result.status;
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  buildVerificationPlan,
  discoverChangedFiles,
  main,
  mergeChangedFiles,
  resolveInvocation
};
