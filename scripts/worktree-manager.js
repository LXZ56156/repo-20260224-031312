#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { collectInventory } = require('./repo-inventory');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REGISTRY = path.join(ROOT, 'control', 'worktrees.json');
const MANAGED_ROLES = ['CONTROL', 'PRODUCTION', 'ACTIVE', 'RELEASE'];
const ALLOWED_ROLES = new Set([
  ...MANAGED_ROLES,
  'EVIDENCE',
  'CANDIDATE',
  'MIGRATION_SOURCE',
  'METADATA_ROOT'
]);

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function loadRegistry(file = DEFAULT_REGISTRY) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countManagedSlots(worktrees) {
  const counts = { CONTROL: 0, PRODUCTION: 0, ACTIVE: 0, RELEASE: 0 };
  for (const item of worktrees) {
    if (!['archive_pending', 'archived'].includes(item.lifecycle) && MANAGED_ROLES.includes(item.role)) {
      counts[item.role] += 1;
    }
  }
  return counts;
}

function validateRegistry(registry) {
  if (!registry || registry.schemaVersion !== 1) {
    throw new Error('worktree registry schemaVersion must be 1');
  }
  if (!registry.online?.version || !registry.online?.clientSource) {
    throw new Error('online version and clientSource are required');
  }
  if (!registry.limits || !Array.isArray(registry.worktrees)) {
    throw new Error('limits and worktrees are required');
  }

  const ids = new Set();
  const paths = new Set();
  for (const item of registry.worktrees) {
    if (!item.id || !item.path || !item.role || !item.lifecycle) {
      throw new Error('each worktree requires id, path, role and lifecycle');
    }
    if (ids.has(item.id)) throw new Error(`duplicate worktree id: ${item.id}`);
    ids.add(item.id);

    const normalized = normalizePath(item.path);
    if (paths.has(normalized)) throw new Error(`duplicate worktree path: ${item.path}`);
    paths.add(normalized);

    if (!ALLOWED_ROLES.has(item.role)) {
      throw new Error(`unsupported worktree role: ${item.role}`);
    }
  }

  const counts = countManagedSlots(registry.worktrees);
  const limits = {
    CONTROL: registry.limits.control,
    PRODUCTION: registry.limits.production,
    ACTIVE: registry.limits.active,
    RELEASE: registry.limits.release
  };
  for (const role of MANAGED_ROLES) {
    if (!Number.isInteger(limits[role]) || limits[role] < 0) {
      throw new Error(`${role} slot limit must be a non-negative integer`);
    }
    if (counts[role] > limits[role]) {
      throw new Error(`${role} slot limit exceeded: ${counts[role]}/${limits[role]}`);
    }
  }
  if (counts.CONTROL !== 1) throw new Error('CONTROL slot must contain exactly one worktree');
  if (counts.PRODUCTION !== 1) throw new Error('PRODUCTION slot must contain exactly one worktree');

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!Number.isInteger(registry.limits.mountedTotal) || total > registry.limits.mountedTotal) {
    throw new Error(`managed mounted slot limit exceeded: ${total}/${registry.limits.mountedTotal}`);
  }
  return registry;
}

function reconcileRegistry(registry, inventory) {
  validateRegistry(registry);
  const registeredByPath = new Map(
    registry.worktrees.map((item) => [normalizePath(item.path), item])
  );
  const liveByPath = new Map(
    inventory.worktrees.map((item) => [normalizePath(item.path), item])
  );
  const unregistered = inventory.worktrees
    .filter((item) => !registeredByPath.has(normalizePath(item.path)))
    .map((item) => item.path);
  const missing = registry.worktrees
    .filter((item) => item.lifecycle !== 'archived' && !liveByPath.has(normalizePath(item.path)))
    .map((item) => item.path);
  const headDrift = [];
  const branchDrift = [];
  const violations = [];

  for (const registered of registry.worktrees) {
    const live = liveByPath.get(normalizePath(registered.path));
    if (!live) continue;
    if (registered.lifecycle === 'archived') {
      violations.push(`archived worktree must not remain mounted: ${registered.path}`);
    }
    if (registered.head && !String(registered.head).startsWith(String(live.head)) &&
        !String(live.head).startsWith(String(registered.head))) {
      headDrift.push(`${registered.id}: ${registered.head} -> ${live.head}`);
    }
    if (registered.branch && registered.branch !== live.branch) {
      branchDrift.push(`${registered.id}: ${registered.branch} -> ${live.branch}`);
    }
    if (registered.role === 'PRODUCTION') {
      if (live.dirtyFiles.length > 0) {
        violations.push(`PRODUCTION worktree must be clean: ${registered.path}`);
      }
      const expected = String(registry.online.clientSource).slice(0, 7);
      if (live.head !== expected) {
        violations.push(`PRODUCTION HEAD must match online client source ${expected}: ${live.head}`);
      }
    }
    if (registered.role === 'METADATA_ROOT' && live.dirtyFiles.length > 0) {
      violations.push(`METADATA_ROOT worktree must be clean: ${registered.path}`);
    }
  }

  return {
    generatedAt: inventory.generatedAt,
    online: registry.online,
    registeredCount: registry.worktrees.length,
    liveCount: inventory.worktrees.length,
    archivePendingCount: registry.worktrees.filter((item) => item.lifecycle === 'archive_pending').length,
    archivedCount: registry.worktrees.filter((item) => item.lifecycle === 'archived').length,
    metadataRootCount: registry.worktrees.filter((item) => item.role === 'METADATA_ROOT').length,
    slotCounts: countManagedSlots(registry.worktrees),
    unregistered,
    missing,
    headDrift,
    branchDrift,
    violations
  };
}

function renderStatus(result) {
  const slots = result.slotCounts;
  const lines = [
    '项目 worktree 控制面',
    `线上版本：${result.online.version}`,
    `客户端源码：${result.online.clientSource}`,
    `registered：${result.registeredCount}  live：${result.liveCount}`,
    `managed slots：CONTROL ${slots.CONTROL} / PRODUCTION ${slots.PRODUCTION} / ACTIVE ${slots.ACTIVE} / RELEASE ${slots.RELEASE}`,
    `metadata roots：${result.metadataRootCount}`,
    `archive pending：${result.archivePendingCount}`,
    `archived：${result.archivedCount}`,
    `unregistered：${result.unregistered.length}`,
    `missing：${result.missing.length}`,
    `HEAD drift：${result.headDrift.length}`,
    `branch drift：${result.branchDrift.length}`,
    `violations：${result.violations.length}`
  ];
  const details = [
    ['未登记 worktree', result.unregistered],
    ['登记但未挂载', result.missing],
    ['HEAD 漂移', result.headDrift],
    ['分支漂移', result.branchDrift],
    ['规则违反', result.violations]
  ];
  for (const [title, values] of details) {
    if (values.length > 0) {
      lines.push('', `${title}：`, ...values.map((value) => `- ${value}`));
    }
  }
  return `${lines.join('\n')}\n`;
}

function isHealthy(result) {
  return [
    result.unregistered,
    result.missing,
    result.headDrift,
    result.branchDrift,
    result.violations
  ].every((items) => items.length === 0);
}

function main(argv = process.argv.slice(2)) {
  const command = argv.find((arg) => !arg.startsWith('--')) || 'status';
  if (command !== 'status') throw new Error(`unsupported command: ${command}`);
  const registry = loadRegistry();
  const result = reconcileRegistry(registry, collectInventory(ROOT));
  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(renderStatus(result));
  return isHealthy(result) ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`worktree-manager: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  isHealthy,
  loadRegistry,
  normalizePath,
  reconcileRegistry,
  renderStatus,
  validateRegistry
};
