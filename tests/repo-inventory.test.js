'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseWorktreePorcelain,
  renderMarkdownSummary
} = require('../scripts/repo-inventory');

test('parseWorktreePorcelain handles branch, detached and prunable entries', () => {
  const parsed = parseWorktreePorcelain([
    'worktree D:/repo',
    'HEAD 1234567890abcdef',
    'branch refs/heads/codex/example',
    '',
    'worktree D:/detached',
    'HEAD abcdef0123456789',
    'detached',
    'prunable gitdir file points to non-existent location',
    ''
  ].join('\n'));

  assert.deepEqual(parsed, [
    {
      path: 'D:/repo',
      head: '1234567890abcdef',
      branch: 'codex/example',
      detached: false,
      locked: false,
      prunable: false
    },
    {
      path: 'D:/detached',
      head: 'abcdef0123456789',
      branch: '',
      detached: true,
      locked: false,
      prunable: true
    }
  ]);
});

test('renderMarkdownSummary highlights dirty worktrees without suggesting deletion', () => {
  const output = renderMarkdownSummary({
    generatedAt: '2026-08-14T00:00:00.000Z',
    branches: [{ name: 'master', head: '1234567', upstream: 'origin/master' }],
    worktrees: [{
      path: 'D:/repo',
      branch: 'master',
      head: '1234567',
      dirtyFiles: [' M file.js'],
      locked: false,
      prunable: false
    }]
  });

  assert.match(output, /dirty worktree：1/);
  assert.match(output, /不得据此自动删除或 prune/);
  assert.match(output, /`D:\/repo`/);
});
