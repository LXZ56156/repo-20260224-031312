'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');

const fetcher = require('../scripts/analysis/data-baseline-we-fetch-readonly');
const weAnalysis = require('../scripts/fetch-we-analysis');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'data-baseline-we-fetch-'));
}

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

test('buildJobMatrix deterministically creates the exact 180-day baseline matrix', () => {
  const jobs = fetcher.buildJobMatrix({ cutoffDate: '2026-07-15' });
  const jobsAgain = fetcher.buildJobMatrix({ cutoffDate: '2026-07-15' });
  const byType = Object.groupBy
    ? Object.groupBy(jobs, (job) => job.type)
    : jobs.reduce((groups, job) => {
      groups[job.type] = groups[job.type] || [];
      groups[job.type].push(job);
      return groups;
    }, {});

  assert.deepEqual(jobsAgain, jobs);
  assert.equal(jobs.length, 931);
  assert.equal(fetcher.getRequestedStartDate('2026-07-15'), '2026-01-17');

  for (const type of fetcher.DAILY_TYPES) {
    assert.equal(byType[type].length, 180, type);
    assert.deepEqual(byType[type][0], {
      type,
      begin_date: '20260117',
      end_date: '20260117'
    });
    assert.deepEqual(byType[type].at(-1), {
      type,
      begin_date: '20260715',
      end_date: '20260715'
    });
  }

  assert.equal(byType.weeklyRetain.length, 25);
  assert.deepEqual(byType.weeklyRetain[0], {
    type: 'weeklyRetain',
    begin_date: '20260119',
    end_date: '20260125'
  });
  assert.deepEqual(byType.weeklyRetain.at(-1), {
    type: 'weeklyRetain',
    begin_date: '20260706',
    end_date: '20260712'
  });

  assert.deepEqual(byType.monthlyRetain, [
    { type: 'monthlyRetain', begin_date: '20260201', end_date: '20260228' },
    { type: 'monthlyRetain', begin_date: '20260301', end_date: '20260331' },
    { type: 'monthlyRetain', begin_date: '20260401', end_date: '20260430' },
    { type: 'monthlyRetain', begin_date: '20260501', end_date: '20260531' },
    { type: 'monthlyRetain', begin_date: '20260601', end_date: '20260630' }
  ]);
  assert.deepEqual(byType.userPortrait, [
    { type: 'userPortrait', begin_date: '20260715', end_date: '20260715' }
  ]);
});

test('CLI requires explicit cutoff and output directory and never invents an env path', () => {
  assert.throws(() => fetcher.parseCliArgs([]), /--cutoff-date/);
  assert.throws(
    () => fetcher.parseCliArgs(['--cutoff-date', '2026-07-15']),
    /--output-dir/
  );
  assert.throws(
    () => fetcher.parseCliArgs([
      '--cutoff-date', '2026-07-15',
      '--output-dir', 'data/we-analysis/we-current',
      '--unknown', 'value'
    ]),
    /unknown option/
  );

  const parsed = fetcher.parseCliArgs([
    '--cutoff-date', '2026-07-15',
    '--output-dir', 'data/we-analysis/we-current',
    '--concurrency', '3'
  ]);
  assert.deepEqual(parsed, {
    cutoffDate: '2026-07-15',
    outputDir: 'data/we-analysis/we-current',
    envPath: '',
    concurrency: 3
  });
});

test('credentials come only from an explicit env path or supplied process environment', async () => {
  const tempDir = makeTempDir();
  const envPath = path.join(tempDir, 'explicit.env');
  fs.writeFileSync(envPath, 'WX_APPID=file_app\nWX_APPSECRET=file_secret\n');

  assert.deepEqual(await fetcher.loadCredentials({ envPath, env: {} }), {
    appid: 'file_app',
    secret: 'file_secret',
    source: 'explicit-env-path'
  });
  assert.deepEqual(await fetcher.loadCredentials({
    env: { WX_APPID: 'process_app', WX_APPSECRET: 'process_secret' }
  }), {
    appid: 'process_app',
    secret: 'process_secret',
    source: 'process-env'
  });
  await assert.rejects(
    fetcher.loadCredentials({ env: {} }),
    /explicit --env-path or process WX_APPID\/WX_APPSECRET/
  );
});

test('output directory must be inside the repository and gitignored', () => {
  const repoRoot = makeTempDir();
  const ignoredDir = path.join(repoRoot, 'data', 'we-analysis', 'baseline');

  assert.equal(fetcher.assertIgnoredOutputDir(ignoredDir, {
    repoRoot,
    checkIgnoreImpl: () => true
  }), ignoredDir);
  assert.throws(() => fetcher.assertIgnoredOutputDir(path.join(repoRoot, 'public-evidence'), {
    repoRoot,
    checkIgnoreImpl: () => false
  }), /gitignored/);
  assert.throws(() => fetcher.assertIgnoredOutputDir(path.resolve(repoRoot, '..', 'outside'), {
    repoRoot,
    checkIgnoreImpl: () => true
  }), /inside repository/);
});

test('full batch uses official POST read-only APIs, memory-only token, and secret-free manifest', async () => {
  const repoRoot = makeTempDir();
  const outputDir = path.join(repoRoot, 'data', 'we-analysis', 'we-current');
  const calls = [];
  const logs = [];
  const secret = 'DO_NOT_PERSIST_APP_SECRET';
  const token = 'DO_NOT_PERSIST_ACCESS_TOKEN';
  const fixedNow = Date.parse('2026-07-16T01:02:03.000Z');

  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/cgi-bin/stable_token')) {
      return makeJsonResponse({ access_token: token, expires_in: 7200 });
    }
    return makeJsonResponse({ list: [] });
  };

  const manifest = await fetcher.runReadOnlyBatch({
    cutoffDate: '2026-07-15',
    outputDir,
    repoRoot,
    env: { WX_APPID: 'test_appid', WX_APPSECRET: secret },
    concurrency: 4,
    retryBaseMs: 0,
    interJobDelayMs: 0,
    nowFn: () => fixedNow,
    fetchImpl,
    checkIgnoreImpl: () => true,
    saveOutputsImpl: async ({ type, begin_date, end_date }) => ({
      jsonPath: path.join(outputDir, `${type}-${begin_date}-${end_date}.json`),
      csvPath: '',
      rowCount: 0
    }),
    logger: { log(value) { logs.push(String(value)); } }
  });

  assert.equal(calls.length, 932);
  assert.equal(calls.every((call) => call.options.method === 'POST'), true);
  assert.equal(calls[0].url, 'https://api.weixin.qq.com/cgi-bin/stable_token');
  assert.equal(
    calls.slice(1).every((call) => (
      call.url.startsWith('https://api.weixin.qq.com/datacube/') &&
      call.url.includes('access_token=')
    )),
    true
  );
  assert.equal(manifest.totalJobs, 931);
  assert.equal(manifest.succeeded, 931);
  assert.equal(manifest.failed, 0);
  assert.equal(manifest.transport, 'POST');
  assert.equal(manifest.readOnly, true);
  assert.equal(manifest.tokenPersisted, false);
  assert.equal(manifest.remoteWritesExecuted, false);

  const manifestText = fs.readFileSync(path.join(outputDir, 'fetch-manifest.json'), 'utf8');
  const observableText = `${manifestText}\n${logs.join('\n')}`;
  assert.doesNotMatch(observableText, new RegExp(secret));
  assert.doesNotMatch(observableText, new RegExp(token));
  assert.equal(fs.existsSync(path.join(repoRoot, '.cache')), false);
  assert.deepEqual(
    new Set(calls.slice(1).map((call) => new URL(call.url).pathname)),
    new Set(fetcher.READ_ONLY_ENDPOINTS)
  );
});

test('batch refreshes a rejected token in memory and retries rate limits with bounded backoff', async () => {
  const repoRoot = makeTempDir();
  const outputDir = path.join(repoRoot, 'data', 'we-analysis', 'we-current');
  const tokenCalls = [];
  const datacubeCalls = [];
  const sleeps = [];
  let datacubeAttempt = 0;

  const manifest = await fetcher.runReadOnlyBatch({
    cutoffDate: '2026-07-15',
    jobs: [{ type: 'dailySummary', begin_date: '20260715', end_date: '20260715' }],
    outputDir,
    repoRoot,
    env: { WX_APPID: 'test_appid', WX_APPSECRET: 'test_secret' },
    concurrency: 1,
    maxAttempts: 3,
    retryBaseMs: 25,
    interJobDelayMs: 0,
    checkIgnoreImpl: () => true,
    requestStableTokenImpl: async (options) => {
      tokenCalls.push(options.forceRefresh);
      return { accessToken: tokenCalls.length === 1 ? 'token_one' : 'token_two' };
    },
    fetchDatacubeImpl: async (options) => {
      datacubeCalls.push(options.accessToken);
      datacubeAttempt += 1;
      if (datacubeAttempt === 1) {
        throw new weAnalysis.WechatApiError({ errcode: 40001, errmsg: 'expired' });
      }
      if (datacubeAttempt === 2) {
        throw new weAnalysis.WechatApiError({ errcode: 45009, errmsg: 'rate limit' });
      }
      return { list: [] };
    },
    saveOutputsImpl: async () => ({
      jsonPath: path.join(outputDir, 'dailySummary-20260715-20260715.json'),
      csvPath: '',
      rowCount: 0
    }),
    sleepFn: async (milliseconds) => { sleeps.push(milliseconds); },
    logger: { log() {} }
  });

  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(datacubeCalls, ['token_one', 'token_two', 'token_two']);
  assert.deepEqual(sleeps, [25]);
  assert.equal(manifest.succeeded, 1);
  assert.equal(manifest.failed, 0);
});

test('failed responses are reduced to bounded metadata without server messages', () => {
  const secretEcho = 'server echoed DO_NOT_PERSIST';
  const sanitized = fetcher.sanitizeError(new weAnalysis.WechatApiError({
    errcode: 48001,
    errmsg: secretEcho,
    endpoint: '/datacube/getweanalysisappiddailysummarytrend'
  }));

  assert.deepEqual(sanitized, {
    name: 'WechatApiError',
    errcode: 48001,
    endpoint: '/datacube/getweanalysisappiddailysummarytrend'
  });
  assert.doesNotMatch(JSON.stringify(sanitized), new RegExp(secretEcho));
});
