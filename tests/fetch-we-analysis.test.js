const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const weAnalysis = require('../scripts/fetch-we-analysis');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'we-analysis-'));
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

test('fetch-we-analysis validates date arguments and supported type mapping', () => {
  assert.equal(weAnalysis.isValidYyyymmdd('20260512'), true);
  assert.equal(weAnalysis.isValidYyyymmdd('20260229'), false);
  assert.equal(weAnalysis.isValidYyyymmdd('20261301'), false);
  assert.equal(weAnalysis.isValidYyyymmdd('2026-05-12'), false);

  assert.equal(
    weAnalysis.getEndpointForType('dailyVisitTrend'),
    '/datacube/getweanalysisappiddailyvisittrend'
  );
  assert.deepEqual(weAnalysis.parseArgs(['visitPage', '20260512', '20260512']), {
    type: 'visitPage',
    begin_date: '20260512',
    end_date: '20260512'
  });

  assert.throws(() => weAnalysis.parseArgs(['unknown', '20260512', '20260512']), /unsupported type/);
  assert.throws(() => weAnalysis.parseArgs(['dailySummary', '2026-05-12', '20260512']), /begin_date/);
});

test('fetch-we-analysis reuses cached access_token before the five-minute refresh window', async () => {
  const tempDir = makeTempDir();
  const tokenCachePath = path.join(tempDir, '.cache/wechat-access-token.json');
  const nowMs = Date.parse('2026-05-12T00:00:00.000Z');

  fs.mkdirSync(path.dirname(tokenCachePath), { recursive: true });
  fs.writeFileSync(tokenCachePath, JSON.stringify({
    access_token: 'cached_token',
    expires_at: nowMs + weAnalysis.TOKEN_REFRESH_SKEW_MS + 1000
  }));

  const result = await weAnalysis.getAccessToken({
    appid: 'fake_appid',
    secret: 'fake_secret',
    tokenCachePath,
    nowMs,
    fetchImpl: async () => {
      throw new Error('should not request stable_token');
    }
  });

  assert.equal(result.accessToken, 'cached_token');
  assert.equal(result.fromCache, true);
});

test('fetch-we-analysis refreshes cached access_token inside the five-minute window', async () => {
  const tempDir = makeTempDir();
  const tokenCachePath = path.join(tempDir, '.cache/wechat-access-token.json');
  const nowMs = Date.parse('2026-05-12T00:00:00.000Z');
  const requestBodies = [];

  fs.mkdirSync(path.dirname(tokenCachePath), { recursive: true });
  fs.writeFileSync(tokenCachePath, JSON.stringify({
    access_token: 'almost_expired_token',
    expires_at: nowMs + weAnalysis.TOKEN_REFRESH_SKEW_MS - 1
  }));

  const result = await weAnalysis.getAccessToken({
    appid: 'fake_appid',
    secret: 'fake_secret',
    tokenCachePath,
    nowMs,
    fetchImpl: async (url, options) => {
      requestBodies.push(JSON.parse(options.body));
      return makeJsonResponse({ access_token: 'fresh_token', expires_in: 7200 });
    }
  });

  const cached = JSON.parse(fs.readFileSync(tokenCachePath, 'utf8'));
  assert.equal(result.accessToken, 'fresh_token');
  assert.equal(result.fromCache, false);
  assert.equal(requestBodies[0].force_refresh, false);
  assert.equal(cached.access_token, 'fresh_token');
  assert.equal(cached.expires_at, nowMs + 7200 * 1000);
});

test('fetch-we-analysis force-refreshes token and retries datacube once on token errors', async () => {
  const tempDir = makeTempDir();
  const envPath = path.join(tempDir, '.env.local');
  const tokenCachePath = path.join(tempDir, '.cache/wechat-access-token.json');
  const outputDir = path.join(tempDir, 'data/we-analysis');
  const nowMs = Date.parse('2026-05-12T12:00:00.000Z');
  const requests = [];

  fs.writeFileSync(envPath, [
    'WX_APPID=fake_appid',
    'WX_APPSECRET=fake_secret',
    ''
  ].join('\n'));

  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (String(url).includes('/cgi-bin/stable_token')) {
      const token = requests.filter((item) => String(item.url).includes('/cgi-bin/stable_token')).length === 1
        ? 'token_one'
        : 'token_two';
      return makeJsonResponse({ access_token: token, expires_in: 7200 });
    }
    if (String(url).includes('access_token=token_one')) {
      return makeJsonResponse({ errcode: 40001, errmsg: 'invalid credential' });
    }
    return makeJsonResponse({
      list: [
        { ref_date: '20260512', session_cnt: 3, visit_pv: 9 }
      ]
    });
  };

  const result = await weAnalysis.fetchWeAnalysis({
    type: 'dailyVisitTrend',
    begin_date: '20260512',
    end_date: '20260512',
    envPath,
    tokenCachePath,
    outputDir,
    nowFn: () => nowMs,
    fetchImpl,
    logger: { log() {}, warn() {}, error() {} }
  });

  const tokenRequests = requests.filter((item) => String(item.url).includes('/cgi-bin/stable_token'));
  const datacubeRequests = requests.filter((item) => String(item.url).includes('/datacube/'));
  const jsonText = fs.readFileSync(result.jsonPath, 'utf8');
  const csvText = fs.readFileSync(result.csvPath, 'utf8');

  assert.equal(tokenRequests.length, 2);
  assert.equal(tokenRequests[0].body.force_refresh, false);
  assert.equal(tokenRequests[1].body.force_refresh, true);
  assert.equal(datacubeRequests.length, 2);
  assert.equal(result.rowCount, 1);
  assert.equal(result.raw.list[0].session_cnt, 3);
  assert.match(jsonText, /"type": "dailyVisitTrend"/);
  assert.doesNotMatch(jsonText, /fake_secret|token_one|token_two/);
  assert.match(csvText, /^ref_date,session_cnt,visit_pv\n20260512,3,9\n$/);
});
