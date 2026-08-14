'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  reconcileRegistry,
  renderStatus,
  validateRegistry
} = require('../scripts/worktree-manager');

const ROOT = path.resolve(__dirname, '..');

function sampleRegistry() {
  return {
    schemaVersion: 1,
    online: {
      version: '6.1.2-example',
      clientSource: 'abcdef0123456789'
    },
    limits: {
      control: 1,
      production: 1,
      active: 1,
      release: 1,
      mountedTotal: 4
    },
    worktrees: [
      {
        id: 'control',
        role: 'CONTROL',
        lifecycle: 'active',
        path: 'D:/repo-control',
        branch: 'codex/project-control',
        head: '1111111'
      },
      {
        id: 'production',
        role: 'PRODUCTION',
        lifecycle: 'readonly',
        path: 'D:/repo-production',
        branch: 'codex/production-baseline',
        head: 'abcdef0'
      },
      {
        id: 'legacy',
        role: 'EVIDENCE',
        lifecycle: 'archive_pending',
        path: 'D:/repo-legacy',
        branch: 'codex/legacy',
        head: '2222222'
      }
    ]
  };
}

function sampleInventory() {
  return {
    generatedAt: '2026-08-14T00:00:00.000Z',
    branches: [],
    worktrees: [
      { path: 'D:/repo-control', branch: 'codex/project-control', head: '1111111', dirtyFiles: [] },
      { path: 'D:/repo-production', branch: 'codex/production-baseline', head: 'abcdef0', dirtyFiles: [] },
      { path: 'D:/repo-legacy', branch: 'codex/legacy', head: '2222222', dirtyFiles: [' M notes.md'] }
    ]
  };
}

test('validateRegistry rejects duplicate ids and excess managed slots', () => {
  const duplicate = sampleRegistry();
  duplicate.worktrees.push({ ...duplicate.worktrees[0], path: 'D:/other-control' });
  assert.throws(() => validateRegistry(duplicate), /duplicate worktree id/i);

  const excess = sampleRegistry();
  excess.worktrees.push({
    id: 'second-production',
    role: 'PRODUCTION',
    lifecycle: 'readonly',
    path: 'D:/second-production',
    branch: 'codex/second-production',
    head: 'abcdef0'
  });
  assert.throws(() => validateRegistry(excess), /PRODUCTION slot/i);
});

test('reconcileRegistry keeps archive-pending worktrees outside managed slot limits', () => {
  const result = reconcileRegistry(sampleRegistry(), sampleInventory());

  assert.equal(result.registeredCount, 3);
  assert.equal(result.liveCount, 3);
  assert.equal(result.archivePendingCount, 1);
  assert.deepEqual(result.slotCounts, { CONTROL: 1, PRODUCTION: 1, ACTIVE: 0, RELEASE: 0 });
  assert.deepEqual(result.unregistered, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.violations, []);
});

test('reconcileRegistry keeps archived records without requiring them to stay mounted', () => {
  const registry = sampleRegistry();
  registry.worktrees[2].lifecycle = 'archived';
  const inventory = sampleInventory();
  inventory.worktrees.pop();

  const result = reconcileRegistry(registry, inventory);
  assert.equal(result.archivePendingCount, 0);
  assert.equal(result.archivedCount, 1);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.violations, []);
});

test('reconcileRegistry fails closed on unregistered worktrees and dirty production', () => {
  const inventory = sampleInventory();
  inventory.worktrees[1].dirtyFiles.push(' M miniprogram/app.js');
  inventory.worktrees.push({
    path: 'D:/unknown',
    branch: 'codex/unknown',
    head: '3333333',
    dirtyFiles: []
  });

  const result = reconcileRegistry(sampleRegistry(), inventory);
  assert.deepEqual(result.unregistered, ['D:/unknown']);
  assert.match(result.violations.join('\n'), /PRODUCTION worktree must be clean/);

  const output = renderStatus(result);
  assert.match(output, /6\.1\.2-example/);
  assert.match(output, /unregistered：1/);
  assert.match(output, /archive pending：1/);
});

test('checked-in control registry and release ledger remain machine readable', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'control', 'worktrees.json'), 'utf8'));
  validateRegistry(registry);
  assert.equal(registry.online.version, '6.1.2-e60d827-r3');
  assert.match(registry.online.clientSource, /^55bfc4f/);

  const ledger = fs.readFileSync(path.join(ROOT, 'control', 'release-ledger.jsonl'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.ok(ledger.some((entry) => entry.type === 'formal_online_confirmation'));
  assert.ok(ledger.some((entry) => entry.type === 'production_baseline_verification'));

  const manifests = [
    'incremental-ui-score-baseline-20260729.json',
    'local-ops-dashboard.json',
    'share-activity-collection.json'
  ].map((name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'control', 'archives', name), 'utf8')));
  for (const manifest of manifests) {
    assert.equal(manifest.source.clean, true);
    assert.equal(manifest.verification.result, 'passed');
    assert.equal(fs.existsSync(manifest.verification.restoreClone), true);
    assert.equal(manifest.removal.authorized, true);
    assert.equal(manifest.removal.worktreeStillMounted, false);
  }
  const localOps = manifests.find((manifest) => manifest.worktreeId === 'local-ops-dashboard');
  assert.equal(localOps.removal.filesystemResidual.originalPathExists, false);
  assert.equal(fs.existsSync(localOps.removal.filesystemResidual.originalPath), false);
  assert.equal(fs.existsSync(localOps.removal.filesystemResidual.lockedFilesBackup), true);
});
