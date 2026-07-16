#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');

const baseline = require('./analysis/data-baseline-core');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_WINDOW_DAYS = 180;

const METRIC_DICTIONARY = Object.freeze({
  schemaVersion: 1,
  population: '去重后、createdAt 落在分析窗口内的 tournaments 快照',
  metrics: [
    {
      key: 'effective_completed',
      name: '有效完赛赛事',
      numerator: '已开赛、全部实际计划比赛（scheduledMatches 优先，旧数据回退 materialized/totalMatches）均有当前规则下合法且非平分的比分、status=finished、rankings 非空的赛事数',
      denominator: '窗口内创建赛事数',
      window: '按赛事 createdAt 纳入；完赛周按最后一个合法 scoredAt，缺失时才记录时间戳不可用',
      deduplication: '按赛事 _id 去重，保留 updatedAt 最新快照',
      source: 'tournaments'
    },
    {
      key: 'weekly_effective_completions_ma4',
      name: '4 周移动平均周有效完赛赛事数',
      numerator: '连续 4 个自然周内有效完赛赛事数之和',
      denominator: '4',
      window: 'Asia/Shanghai 周一至周日；没有完赛的周显式补 0；只为四个完整观察周计算移动平均',
      deduplication: '同一赛事只计一次',
      source: '优先 tournaments.rounds.matches.scoredAt 完整覆盖；旧字段 finishedAt 或 state=2 的 shareActivityUpdatedAt 仅作显式 proxy'
    },
    {
      key: 'organizer_28d_repeat',
      name: '主理人 28 日复办率',
      numerator: '首次可观测创建赛事后 28 日内再次创建赛事的主理人数',
      denominator: '在截止日前拥有完整 28 日观察窗的首次可观测主理人数',
      window: '首次可观测创建日至第 28 日（含）',
      deduplication: '按 creatorId 在内存中去重；公开产物只输出聚合数',
      source: 'tournaments.creatorId + createdAt',
      limitation: '当前快照不能证明窗口开始前没有更早创建行为，因此是窗口内 cohort 口径'
    },
    {
      key: 'participant_28d_rejoin',
      name: '参与者 28 日再次加入率',
      numerator: '首次可观测参与后 28 日内出现在另一赛事真实用户名单中的人数',
      denominator: '拥有完整 28 日观察窗的首次可观测真实参与者人数',
      window: '以赛事 createdAt 近似名单加入时点',
      deduplication: '排除 creatorId、自身重复名单项、type=guest 或 guest_ 前缀导入游客',
      source: 'tournaments.players + createdAt',
      limitation: '赛事快照没有 player.joinedAt，不能恢复精确加入时点'
    },
    {
      key: 'participant_28d_to_organizer',
      name: '参与者 28 日转主理人率',
      numerator: '首次可观测参与后 28 日内成为 creatorId 的人数',
      denominator: '拥有完整 28 日观察窗的首次可观测真实参与者人数',
      window: '以赛事 createdAt 近似参与时点',
      deduplication: '同 participant actor 去重，导入游客排除',
      source: 'tournaments.players + creatorId + createdAt'
    },
    {
      key: 'funnel_created_to_effective_completed',
      name: '创建到有效完赛漏斗',
      numerator: '各阶段单调通过的赛事数',
      denominator: '上一阶段赛事数及创建赛事数',
      window: '赛事 createdAt 落在分析窗口内',
      deduplication: '按赛事 _id 保留最新快照',
      source: 'tournaments',
      stages: ['created', 'roster_ready', 'started', 'first_score', 'half_scores', 'all_scores', 'effective_completed', 'share_or_repeat_lower_bound']
    },
    {
      key: 'combination_pareto',
      name: '赛事组合 Pareto',
      numerator: '相同 mode × playersCount × courts × totalMatches × presetKey × templateKey × engine 的已开赛赛事数',
      denominator: '全部已开赛赛事数',
      window: '赛事 createdAt 落在分析窗口内',
      deduplication: '按赛事 _id 去重；缺失字段保留 missing/unknown 类别',
      source: 'tournaments + schedulerMetaJson/fairnessJson',
      thresholds: [0.8, 0.9, 0.95]
    }
  ]
});

function usage() {
  return [
    '用法:',
    '  node scripts/audit-product-data.js --tournaments <export.json> --cutoff <YYYY-MM-DD> [--window-days 180] [--output-dir data/we-analysis/data-baseline]',
    '',
    '只读取当前仓库内的本地导出，不连接云数据库，也不执行任何写入类线上 API。'
  ].join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少值`);
    options[key] = value;
    index += 1;
  }
  if (!options.tournaments) throw new Error('缺少 --tournaments');
  if (!options.cutoff) throw new Error('缺少 --cutoff');
  const windowDays = Number(options['window-days'] || DEFAULT_WINDOW_DAYS);
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3660) {
    throw new Error('--window-days 必须是 1-3660 的整数');
  }
  return {
    help: false,
    tournaments: options.tournaments,
    cutoffDate: options.cutoff,
    windowDays,
    outputDir: options['output-dir'] || 'data/we-analysis/data-baseline'
  };
}

function resolveInsideRepo(value, label) {
  const absolute = path.resolve(REPO_ROOT, String(value || '').trim());
  const relative = path.relative(REPO_ROOT, absolute);
  if (!relative || relative === '.') return absolute;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} 必须位于当前 worktree 内`);
  }
  return absolute;
}

function parseTournamentPayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch (jsonError) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error('赛事导出为空');
    try {
      parsed = lines.map((line) => JSON.parse(line));
    } catch (_) {
      throw new Error(`赛事导出不是合法 JSON 或 JSON Lines: ${jsonError.message}`);
    }
  }
  if (Array.isArray(parsed)) return parsed;
  for (const key of ['data', 'tournaments', 'documents']) {
    if (Array.isArray(parsed && parsed[key])) return parsed[key];
  }
  throw new Error('赛事导出必须是数组，或包含 data[] / tournaments[] / documents[]');
}

function csvCell(value) {
  const normalized = value == null ? '' : String(value);
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function paretoToCsv(pareto) {
  const columns = [
    'mode', 'playersCount', 'courts', 'totalMatches', 'presetKey', 'templateKey', 'engine',
    'classifiable', 'count', 'effectiveCompletedCount', 'effectiveCompletionRate',
    'firstScoreToCompletionSamples', 'medianFirstScoreToCompletionHours',
    'share', 'cumulativeCount', 'cumulativeCoverage'
  ];
  const rows = Array.isArray(pareto && pareto.rows) ? pareto.rows : [];
  return `${[
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  ].join('\n')}\n`;
}

function collectSensitiveTokens(tournaments) {
  const tokens = new Set();
  const sensitiveKey = /(^_?id$|id$|openid|name$|nickname|avatar|phone|mobile|location)/i;
  const sensitiveArrayKey = /^(players|playerIds|teamA|teamB|restPlayers|rankings|pairTeams)$/i;
  function add(value) {
    const normalized = String(value == null ? '' : value).trim();
    if (normalized.length >= 6) tokens.add(normalized);
  }
  function visit(value, key = '') {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if ((typeof item === 'string' || typeof item === 'number') && sensitiveArrayKey.test(key)) add(item);
        visit(item, key);
      });
      return;
    }
    if (typeof value !== 'object') {
      if (sensitiveKey.test(key)) add(value);
      return;
    }
    Object.entries(value).forEach(([childKey, childValue]) => {
      if ((typeof childValue === 'string' || typeof childValue === 'number') && sensitiveKey.test(childKey)) {
        add(childValue);
      }
      visit(childValue, childKey);
    });
  }
  tournaments.forEach((tournament) => visit(tournament));
  return tokens;
}

function assertNoSensitiveTokens(text, sensitiveTokens) {
  const output = String(text || '');
  for (const token of sensitiveTokens) {
    if (output.includes(token)) {
      throw new Error('公开聚合产物命中源数据身份/资料值，已拒绝写出');
    }
  }
}

async function writeAtomic(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(tempPath, content, 'utf8');
  await fsp.rename(tempPath, filePath);
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function runAudit(options) {
  const inputPath = resolveInsideRepo(options.tournaments, '--tournaments');
  const outputDir = resolveInsideRepo(options.outputDir, '--output-dir');
  const inputText = await fsp.readFile(inputPath, 'utf8');
  const tournaments = parseTournamentPayload(inputText);
  const analyzed = baseline.analyzeTournamentData(tournaments, {
    cutoffDate: options.cutoffDate,
    windowDays: options.windowDays
  });
  const summary = baseline.toPublicSummary(analyzed);
  const sensitiveTokens = collectSensitiveTokens(tournaments);
  const artifacts = {
    'summary.json': jsonText(summary),
    'combination-pareto.json': jsonText(analyzed.pareto),
    'combination-pareto.csv': paretoToCsv(analyzed.pareto),
    'data-quality.json': jsonText({
      schemaVersion: 1,
      cutoffDate: analyzed.cutoffDate,
      window: analyzed.window,
      recordCounts: analyzed.recordCounts,
      dataQuality: analyzed.dataQuality
    }),
    'metric-dictionary.json': jsonText(METRIC_DICTIONARY),
    'manifest.json': jsonText({
      schemaVersion: 1,
      source: 'local_tournaments_export',
      sourceSha256: crypto.createHash('sha256').update(inputText).digest('hex'),
      cutoffDate: analyzed.cutoffDate,
      windowDays: analyzed.window.days,
      inputRecords: tournaments.length,
      outputFiles: ['summary.json', 'combination-pareto.json', 'combination-pareto.csv', 'data-quality.json', 'metric-dictionary.json'],
      remoteWritesExecuted: false
    })
  };
  Object.values(artifacts).forEach((content) => assertNoSensitiveTokens(content, sensitiveTokens));
  for (const [fileName, content] of Object.entries(artifacts)) {
    await writeAtomic(path.join(outputDir, fileName), content);
  }
  return {
    outputDir,
    analyzedRecords: analyzed.recordCounts.analyzed,
    effectiveCompleted: analyzed.funnel.stages.find((stage) => stage.key === 'effective_completed').count
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await runAudit(options);
  console.log(`脱敏数据基线已生成: ${path.relative(REPO_ROOT, result.outputDir)}`);
  console.log(`纳入赛事: ${result.analyzedRecords}; 有效完赛: ${result.effectiveCompleted}`);
  console.log('远程写操作: 未执行');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_WINDOW_DAYS,
  METRIC_DICTIONARY,
  REPO_ROOT,
  assertNoSensitiveTokens,
  collectSensitiveTokens,
  paretoToCsv,
  parseArgs,
  parseTournamentPayload,
  resolveInsideRepo,
  runAudit,
  usage
};
