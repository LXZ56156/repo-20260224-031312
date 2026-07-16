#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const weAnalysis = require('../fetch-we-analysis');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WINDOW_DAYS = 180;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_INTER_JOB_DELAY_MS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DAILY_TYPES = Object.freeze([
  'dailySummary',
  'dailyVisitTrend',
  'visitPage',
  'visitDistribution',
  'dailyRetain'
]);
const BATCH_TYPES = Object.freeze([
  ...DAILY_TYPES,
  'weeklyRetain',
  'monthlyRetain',
  'userPortrait'
]);
const READ_ONLY_ENDPOINTS = Object.freeze(
  BATCH_TYPES.map((type) => weAnalysis.TYPE_ENDPOINTS[type])
);
const RATE_LIMIT_ERROR_CODES = new Set([-1, 45009]);

class SafeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SafeConfigurationError';
  }
}

function parseIsoDate(value, label = 'date') {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!matched) {
    throw new SafeConfigurationError(`${label} must use YYYY-MM-DD`);
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new SafeConfigurationError(`${label} must be a valid calendar date`);
  }
  return timestamp;
}

function formatIsoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatCompactDate(timestamp) {
  return formatIsoDate(timestamp).replace(/-/g, '');
}

function getRequestedStartDate(cutoffDate, windowDays = WINDOW_DAYS) {
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new SafeConfigurationError('windowDays must be a positive integer');
  }
  const cutoffTimestamp = parseIsoDate(cutoffDate, 'cutoffDate');
  return formatIsoDate(cutoffTimestamp - (windowDays - 1) * MILLISECONDS_PER_DAY);
}

function buildDailyJobs(startTimestamp, cutoffTimestamp) {
  const jobs = [];
  for (
    let timestamp = startTimestamp;
    timestamp <= cutoffTimestamp;
    timestamp += MILLISECONDS_PER_DAY
  ) {
    const date = formatCompactDate(timestamp);
    for (const type of DAILY_TYPES) {
      jobs.push({ type, begin_date: date, end_date: date });
    }
  }
  return jobs;
}

function buildWeeklyJobs(startTimestamp, cutoffTimestamp) {
  const jobs = [];
  const startDay = new Date(startTimestamp).getUTCDay();
  const daysUntilMonday = (8 - startDay) % 7;
  const firstMonday = startTimestamp + daysUntilMonday * MILLISECONDS_PER_DAY;

  for (
    let monday = firstMonday;
    monday + 6 * MILLISECONDS_PER_DAY <= cutoffTimestamp;
    monday += 7 * MILLISECONDS_PER_DAY
  ) {
    jobs.push({
      type: 'weeklyRetain',
      begin_date: formatCompactDate(monday),
      end_date: formatCompactDate(monday + 6 * MILLISECONDS_PER_DAY)
    });
  }
  return jobs;
}

function buildMonthlyJobs(startTimestamp, cutoffTimestamp) {
  const jobs = [];
  const start = new Date(startTimestamp);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();

  if (start.getUTCDate() !== 1) {
    month += 1;
    if (month === 12) {
      year += 1;
      month = 0;
    }
  }

  let hasCompleteMonth = true;
  while (hasCompleteMonth) {
    const monthStart = Date.UTC(year, month, 1);
    const monthEnd = Date.UTC(year, month + 1, 0);
    if (monthEnd > cutoffTimestamp) {
      hasCompleteMonth = false;
      continue;
    }
    jobs.push({
      type: 'monthlyRetain',
      begin_date: formatCompactDate(monthStart),
      end_date: formatCompactDate(monthEnd)
    });
    month += 1;
    if (month === 12) {
      year += 1;
      month = 0;
    }
  }
  return jobs;
}

function buildJobMatrix({ cutoffDate, windowDays = WINDOW_DAYS }) {
  const cutoffTimestamp = parseIsoDate(cutoffDate, 'cutoffDate');
  const startTimestamp = cutoffTimestamp - (windowDays - 1) * MILLISECONDS_PER_DAY;
  const cutoffCompact = formatCompactDate(cutoffTimestamp);

  return [
    ...buildDailyJobs(startTimestamp, cutoffTimestamp),
    ...buildWeeklyJobs(startTimestamp, cutoffTimestamp),
    ...buildMonthlyJobs(startTimestamp, cutoffTimestamp),
    { type: 'userPortrait', begin_date: cutoffCompact, end_date: cutoffCompact }
  ];
}

function parsePositiveInteger(value, label, maximum) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw new SafeConfigurationError(`${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || (maximum && parsed > maximum)) {
    throw new SafeConfigurationError(`${label} is outside the allowed range`);
  }
  return parsed;
}

function parseCliArgs(argv) {
  const values = {
    cutoffDate: '',
    outputDir: '',
    envPath: '',
    concurrency: DEFAULT_CONCURRENCY
  };
  const seen = new Set();
  const names = new Map([
    ['--cutoff-date', 'cutoffDate'],
    ['--output-dir', 'outputDir'],
    ['--env-path', 'envPath'],
    ['--concurrency', 'concurrency']
  ]);

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const key = names.get(option);
    if (!key) throw new SafeConfigurationError(`unknown option: ${option || '(empty)'}`);
    if (seen.has(option)) throw new SafeConfigurationError(`duplicate option: ${option}`);
    if (index + 1 >= argv.length || String(argv[index + 1]).length === 0) {
      throw new SafeConfigurationError(`${option} requires a value`);
    }
    seen.add(option);
    values[key] = argv[index + 1];
  }

  if (!values.cutoffDate) throw new SafeConfigurationError('--cutoff-date is required');
  if (!values.outputDir) throw new SafeConfigurationError('--output-dir is required');
  parseIsoDate(values.cutoffDate, '--cutoff-date');
  values.concurrency = parsePositiveInteger(values.concurrency, '--concurrency', 16);
  return values;
}

function defaultCheckIgnore({ repoRoot, relativePath }) {
  const result = spawnSync(
    'git',
    ['check-ignore', '--quiet', '--', relativePath.replace(/\\/g, '/')],
    {
      cwd: repoRoot,
      stdio: 'ignore',
      windowsHide: true
    }
  );
  return result.status === 0;
}

function assertIgnoredOutputDir(outputDir, {
  repoRoot = REPO_ROOT,
  checkIgnoreImpl = defaultCheckIgnore
} = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedOutput = path.resolve(resolvedRoot, outputDir);
  const relativePath = path.relative(resolvedRoot, resolvedOutput);
  const isInside = Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  if (!isInside) {
    throw new SafeConfigurationError('output directory must be inside repository');
  }
  if (!checkIgnoreImpl({
    repoRoot: resolvedRoot,
    outputDir: resolvedOutput,
    relativePath
  })) {
    throw new SafeConfigurationError('output directory must be gitignored');
  }
  return resolvedOutput;
}

async function loadCredentials({
  envPath = '',
  env = process.env,
  loadEnvImpl = weAnalysis.loadEnvLocal
} = {}) {
  if (envPath) {
    const loaded = await loadEnvImpl(envPath);
    return {
      appid: loaded.WX_APPID,
      secret: loaded.WX_APPSECRET,
      source: 'explicit-env-path'
    };
  }

  if (env && env.WX_APPID && env.WX_APPSECRET) {
    return {
      appid: String(env.WX_APPID),
      secret: String(env.WX_APPSECRET),
      source: 'process-env'
    };
  }
  throw new SafeConfigurationError(
    'credentials require explicit --env-path or process WX_APPID/WX_APPSECRET'
  );
}

function sanitizeError(error) {
  const errcode = Number(error && error.errcode);
  const endpoint = READ_ONLY_ENDPOINTS.includes(String(error && error.endpoint || ''))
    ? String(error.endpoint)
    : '';
  return {
    name: error instanceof weAnalysis.WechatApiError ? 'WechatApiError' : 'Error',
    errcode: Number.isFinite(errcode) ? errcode : null,
    endpoint
  };
}

function isRetryableError(error) {
  if (!(error instanceof weAnalysis.WechatApiError)) return true;
  return RATE_LIMIT_ERROR_CODES.has(Number(error.errcode));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertValidJob(job) {
  if (!job || !BATCH_TYPES.includes(job.type)) {
    throw new SafeConfigurationError('job contains an unsupported read-only type');
  }
  if (!weAnalysis.isValidYyyymmdd(job.begin_date) || !weAnalysis.isValidYyyymmdd(job.end_date)) {
    throw new SafeConfigurationError('job contains an invalid compact date');
  }
  if (job.begin_date > job.end_date) {
    throw new SafeConfigurationError('job begin_date must not follow end_date');
  }
}

function assertSavedOutput(saved, job, outputDir) {
  const expectedBase = `${job.type}-${job.begin_date}-${job.end_date}`;
  const expectedJson = `${expectedBase}.json`;
  const expectedCsv = `${expectedBase}.csv`;
  const jsonFile = path.basename(String(saved && saved.jsonPath || ''));
  const csvFile = saved && saved.csvPath ? path.basename(String(saved.csvPath)) : '';
  const resolvedOutput = path.resolve(outputDir);
  const jsonParent = path.resolve(path.dirname(String(saved && saved.jsonPath || '')));
  const csvParent = csvFile ? path.resolve(path.dirname(String(saved.csvPath))) : resolvedOutput;

  if (
    jsonFile !== expectedJson ||
    (csvFile && csvFile !== expectedCsv) ||
    jsonParent !== resolvedOutput ||
    csvParent !== resolvedOutput
  ) {
    throw new Error('output writer returned an unexpected file mapping');
  }
  return { jsonFile, csvFile };
}

function createTypeSummary(jobs) {
  const byType = {};
  for (const job of jobs) {
    if (!byType[job.type]) {
      byType[job.type] = {
        requested: 0,
        succeeded: 0,
        failed: 0,
        returnedRows: 0
      };
    }
    byType[job.type].requested += 1;
  }
  return byType;
}

function assertManifestContainsNoCredentials(manifest, credentials, accessToken) {
  const serialized = JSON.stringify(manifest);
  for (const sensitive of [credentials.appid, credentials.secret, accessToken]) {
    if (sensitive && serialized.includes(String(sensitive))) {
      throw new Error('refusing to write manifest containing credentials');
    }
  }
}

async function runReadOnlyBatch({
  cutoffDate,
  outputDir,
  repoRoot = REPO_ROOT,
  envPath = '',
  env = process.env,
  jobs,
  concurrency = DEFAULT_CONCURRENCY,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  interJobDelayMs = DEFAULT_INTER_JOB_DELAY_MS,
  nowFn = Date.now,
  fetchImpl = globalThis.fetch,
  checkIgnoreImpl = defaultCheckIgnore,
  requestStableTokenImpl = weAnalysis.requestStableToken,
  fetchDatacubeImpl = weAnalysis.fetchDatacube,
  saveOutputsImpl = weAnalysis.saveOutputs,
  sleepFn = sleep,
  logger = console
}) {
  parseIsoDate(cutoffDate, 'cutoffDate');
  const resolvedOutputDir = assertIgnoredOutputDir(outputDir, { repoRoot, checkIgnoreImpl });
  const workerCount = parsePositiveInteger(concurrency, 'concurrency', 16);
  const attemptLimit = parsePositiveInteger(maxAttempts, 'maxAttempts', 10);
  if (!Number.isFinite(retryBaseMs) || retryBaseMs < 0) {
    throw new SafeConfigurationError('retryBaseMs must be a non-negative number');
  }
  if (!Number.isFinite(interJobDelayMs) || interJobDelayMs < 0) {
    throw new SafeConfigurationError('interJobDelayMs must be a non-negative number');
  }

  const requestedJobs = jobs ? jobs.map((job) => ({ ...job })) : buildJobMatrix({ cutoffDate });
  requestedJobs.forEach(assertValidJob);
  const credentials = await loadCredentials({ envPath, env });
  await fs.mkdir(resolvedOutputDir, { recursive: true });

  let accessToken = (await requestStableTokenImpl({
    appid: credentials.appid,
    secret: credentials.secret,
    forceRefresh: false,
    fetchImpl
  })).accessToken;
  if (!accessToken) throw new Error('stable token response was incomplete');

  let refreshPromise = null;
  async function refreshToken() {
    if (!refreshPromise) {
      refreshPromise = requestStableTokenImpl({
        appid: credentials.appid,
        secret: credentials.secret,
        forceRefresh: true,
        fetchImpl
      }).then((result) => {
        if (!result || !result.accessToken) throw new Error('stable token refresh was incomplete');
        accessToken = result.accessToken;
      }).finally(() => {
        refreshPromise = null;
      });
    }
    await refreshPromise;
  }

  const fetchedAt = new Date(nowFn()).toISOString();
  const results = new Array(requestedJobs.length);
  let cursor = 0;
  let completed = 0;

  async function fetchJob(job) {
    let tokenRetried = false;
    let retryOrdinal = 0;
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      try {
        const raw = await fetchDatacubeImpl({
          ...job,
          accessToken,
          fetchImpl
        });
        const saved = await saveOutputsImpl({
          ...job,
          fetchedAt,
          raw,
          outputDir: resolvedOutputDir
        });
        const files = assertSavedOutput(saved, job, resolvedOutputDir);
        return {
          ...job,
          ok: true,
          rowCount: Number(saved.rowCount || 0),
          jsonFile: files.jsonFile,
          csvFile: files.csvFile
        };
      } catch (error) {
        if (weAnalysis.isTokenError(error) && !tokenRetried) {
          tokenRetried = true;
          await refreshToken();
          continue;
        }
        if (isRetryableError(error) && attempt < attemptLimit - 1) {
          retryOrdinal += 1;
          await sleepFn(retryBaseMs * (2 ** (retryOrdinal - 1)));
          continue;
        }
        return {
          ...job,
          ok: false,
          rowCount: 0,
          jsonFile: '',
          csvFile: '',
          error: sanitizeError(error)
        };
      }
    }
    return {
      ...job,
      ok: false,
      rowCount: 0,
      jsonFile: '',
      csvFile: '',
      error: { name: 'Error', errcode: null, endpoint: '' }
    };
  }

  async function worker() {
    while (cursor < requestedJobs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fetchJob(requestedJobs[index]);
      completed += 1;
      if (
        logger &&
        typeof logger.log === 'function' &&
        (completed % 50 === 0 || completed === requestedJobs.length)
      ) {
        const failedSoFar = results.filter((result) => result && !result.ok).length;
        logger.log(`progress=${completed}/${requestedJobs.length} failed=${failedSoFar}`);
      }
      if (interJobDelayMs > 0) await sleepFn(interJobDelayMs);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(workerCount, Math.max(requestedJobs.length, 1)) },
      () => worker()
    )
  );

  const byType = createTypeSummary(requestedJobs);
  let succeeded = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      succeeded += 1;
      byType[result.type].succeeded += 1;
      byType[result.type].returnedRows += result.rowCount;
    } else {
      failed += 1;
      byType[result.type].failed += 1;
    }
  }

  const manifest = {
    schemaVersion: 1,
    fetchMode: 'wechat-datacube-read-only',
    transport: 'POST',
    readOnly: true,
    fetchedAt,
    cutoffDate,
    requestedStartDate: getRequestedStartDate(cutoffDate),
    windowDays: WINDOW_DAYS,
    concurrency: workerCount,
    totalJobs: requestedJobs.length,
    succeeded,
    failed,
    byType,
    results,
    tokenPersisted: false,
    remoteWritesExecuted: false
  };
  assertManifestContainsNoCredentials(manifest, credentials, accessToken);
  await fs.writeFile(
    path.join(resolvedOutputDir, 'fetch-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  return manifest;
}

function formatSafeCliError(error) {
  if (error instanceof SafeConfigurationError) return error.message;
  const sanitized = sanitizeError(error);
  const code = sanitized.errcode == null ? '' : ` errcode=${sanitized.errcode}`;
  const endpoint = sanitized.endpoint ? ` endpoint=${sanitized.endpoint}` : '';
  return `read-only We datacube fetch failed${code}${endpoint}`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/analysis/data-baseline-we-fetch-readonly.js',
    '    --cutoff-date YYYY-MM-DD',
    '    --output-dir <gitignored-directory>',
    '    [--env-path <explicit-env-file>]',
    '    [--concurrency 1-16]',
    '',
    'Without --env-path, WX_APPID and WX_APPSECRET must already exist in the process environment.'
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(usage());
    return;
  }
  const options = parseCliArgs(argv);
  const manifest = await runReadOnlyBatch({
    ...options,
    outputDir: path.resolve(REPO_ROOT, options.outputDir),
    envPath: options.envPath ? path.resolve(process.cwd(), options.envPath) : '',
    repoRoot: REPO_ROOT
  });
  console.log(JSON.stringify({
    totalJobs: manifest.totalJobs,
    succeeded: manifest.succeeded,
    failed: manifest.failed,
    tokenPersisted: false,
    remoteWritesExecuted: false
  }));
  if (manifest.failed > 0) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(formatSafeCliError(error));
    process.exitCode = 1;
  });
}

module.exports = {
  BATCH_TYPES,
  DAILY_TYPES,
  DEFAULT_CONCURRENCY,
  READ_ONLY_ENDPOINTS,
  REPO_ROOT,
  SafeConfigurationError,
  WINDOW_DAYS,
  assertIgnoredOutputDir,
  buildJobMatrix,
  formatSafeCliError,
  getRequestedStartDate,
  loadCredentials,
  main,
  parseCliArgs,
  runReadOnlyBatch,
  sanitizeError,
  usage
};
