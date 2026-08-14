#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function runGit(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trimEnd();
}

function parseWorktreePorcelain(text) {
  const result = [];
  let current = null;
  function finish() {
    if (current) result.push(current);
    current = null;
  }
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      finish();
      current = {
        path: line.slice('worktree '.length),
        head: '',
        branch: '',
        detached: false,
        locked: false,
        prunable: false
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line.startsWith('locked')) {
      current.locked = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  finish();
  return result;
}

function collectInventory(repoDir = ROOT) {
  const worktrees = parseWorktreePorcelain(runGit(['worktree', 'list', '--porcelain'], repoDir))
    .map((item) => {
      let dirtyFiles = [];
      try {
        const status = runGit(['status', '--porcelain'], item.path);
        dirtyFiles = status ? status.split(/\r?\n/) : [];
      } catch (error) {
        dirtyFiles = [`! unable to read status: ${error.message}`];
      }
      return {
        ...item,
        head: item.head.slice(0, 7),
        branch: item.branch || '(detached)',
        dirtyFiles
      };
    });

  const branchText = runGit([
    'for-each-ref',
    'refs/heads',
    '--sort=-committerdate',
    '--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(committerdate:short)%09%(subject)'
  ], repoDir);
  const branches = branchText ? branchText.split(/\r?\n/).map((line) => {
    const [name, head, upstream, date, ...subject] = line.split('\t');
    return { name, head, upstream, date, subject: subject.join('\t') };
  }) : [];

  return { generatedAt: new Date().toISOString(), branches, worktrees };
}

function escapeCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdownSummary(inventory) {
  const dirtyCount = inventory.worktrees.filter((item) => item.dirtyFiles.length > 0).length;
  const lines = [
    '# Repository inventory',
    '',
    `- 生成时间：${inventory.generatedAt}`,
    `- 本地分支：${inventory.branches.length}`,
    `- worktree：${inventory.worktrees.length}`,
    `- dirty worktree：${dirtyCount}`,
    '- 这是只读盘点；不得据此自动删除或 prune。',
    '',
    '| branch | HEAD | dirty | path |',
    '|---|---|---:|---|'
  ];
  for (const item of inventory.worktrees) {
    lines.push(`| ${escapeCell(item.branch)} | ${escapeCell(item.head)} | ${item.dirtyFiles.length} | \`${escapeCell(item.path)}\` |`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const inventory = collectInventory(ROOT);
  if (process.argv.includes('--json')) console.log(JSON.stringify(inventory, null, 2));
  else process.stdout.write(renderMarkdownSummary(inventory));
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  collectInventory,
  parseWorktreePorcelain,
  renderMarkdownSummary
};
