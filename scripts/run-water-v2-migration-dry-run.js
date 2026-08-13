#!/usr/bin/env node
'use strict';

const path = require('node:path');

const {
  runLegacyMigrationDryRunAudit
} = require('../cloudfunctions/waterSession/waterMigration');

const DANGEROUS_FLAGS = new Set([
  '--write',
  '--apply',
  '--execute',
  '--commit',
  '--migrate',
  '--deploy',
  '--upload'
]);

function usageText() {
  return [
    '用法:',
    '  node scripts/run-water-v2-migration-dry-run.js --adapter <只读-adapter.js> [--page-size 100]',
    '',
    '安全边界:',
    '  - 此入口始终为零写入 dry-run，没有 apply/write 模式。',
    '  - adapter 必须导出且只导出 listLegacyRooms({ cursor, limit }) 与 read(collection, id)。',
    '  - runner 不内置 CloudBase SDK、凭据、部署或迁移写入能力。',
    '  - JSON 只写 stdout；如需留档，由调用方显式重定向。',
    '',
    'adapter 返回:',
    '  listLegacyRooms(...) -> { roomIds: string[], nextCursor: string }',
    '',
    '示例:',
    '  node scripts/run-water-v2-migration-dry-run.js --adapter ./tmp/read-only-water-adapter.js > dry-run.json',
    '',
    '退出码:',
    '  0 = 全部房间可迁移且守恒；2 = 已输出 JSON，但存在数据/分页异常；1 = 参数或执行错误。'
  ].join('\n');
}

function dryRunOnlyError(flag) {
  const error = new Error(`只支持零写入 dry-run，拒绝参数 ${flag}`);
  error.code = 'MIGRATION_DRY_RUN_ONLY';
  return error;
}

function parseArgs(argv) {
  const args = {
    adapterPath: '',
    pageSize: 100,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || '');
    if (DANGEROUS_FLAGS.has(value)
        || value.startsWith('--write=')
        || value.startsWith('--apply=')
        || value.startsWith('--execute=')) {
      throw dryRunOnlyError(value);
    }
    if (value === '--dry-run') continue;
    if (value === '--help' || value === '-h') {
      args.help = true;
      continue;
    }
    if (value === '--adapter') {
      index += 1;
      args.adapterPath = String(argv[index] || '').trim();
      if (!args.adapterPath) throw new Error('--adapter 缺少模块路径');
      continue;
    }
    if (value === '--page-size') {
      index += 1;
      args.pageSize = Number(argv[index]);
      if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 100) {
        throw new Error('--page-size 必须是 1 到 100 的整数');
      }
      continue;
    }
    throw new Error(`未知参数: ${value}`);
  }
  if (!args.help && !args.adapterPath) throw new Error('缺少 --adapter <只读-adapter.js>');
  return args;
}

async function loadAdapter(adapterPath) {
  const absolutePath = path.resolve(process.cwd(), adapterPath);
  const loaded = require(absolutePath);
  if (loaded && typeof loaded.createReadOnlyAdapter === 'function') {
    return loaded.createReadOnlyAdapter();
  }
  if (loaded && loaded.adapter) return loaded.adapter;
  if (loaded && loaded.default) return loaded.default;
  return loaded;
}

function formatError(error) {
  const code = error && error.code ? `[${error.code}] ` : '';
  return `${code}${String(error && error.message || error)}`;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usageText());
    return null;
  }
  const adapter = await loadAdapter(args.adapterPath);
  const report = await runLegacyMigrationDryRunAudit({
    adapter,
    pageSize: args.pageSize
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.anomalyCount > 0) process.exitCode = 2;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(formatError(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DANGEROUS_FLAGS,
  formatError,
  loadAdapter,
  main,
  parseArgs,
  usageText
};
