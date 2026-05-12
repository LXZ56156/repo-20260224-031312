#!/usr/bin/env node

const fsp = require('node:fs/promises');
const path = require('node:path');

const WECHAT_API_BASE = 'https://api.weixin.qq.com';
const STABLE_TOKEN_URL = `${WECHAT_API_BASE}/cgi-bin/stable_token`;
const TOKEN_CACHE_PATH = path.resolve(process.cwd(), '.cache/wechat-access-token.json');
const OUTPUT_DIR = path.resolve(process.cwd(), 'data/we-analysis');
const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001]);

const TYPE_ENDPOINTS = Object.freeze({
  dailySummary: '/datacube/getweanalysisappiddailysummarytrend',
  dailyVisitTrend: '/datacube/getweanalysisappiddailyvisittrend',
  weeklyVisitTrend: '/datacube/getweanalysisappidweeklyvisittrend',
  monthlyVisitTrend: '/datacube/getweanalysisappidmonthlyvisittrend',
  visitPage: '/datacube/getweanalysisappidvisitpage',
  visitDistribution: '/datacube/getweanalysisappidvisitdistribution',
  userPortrait: '/datacube/getweanalysisappiduserportrait',
  dailyRetain: '/datacube/getweanalysisappiddailyretaininfo',
  weeklyRetain: '/datacube/getweanalysisappidweeklyretaininfo',
  monthlyRetain: '/datacube/getweanalysisappidmonthlyretaininfo'
});

class WechatApiError extends Error {
  constructor({ errcode, errmsg, endpoint }) {
    super(`微信接口错误 errcode=${errcode} errmsg=${errmsg || ''}`);
    this.name = 'WechatApiError';
    this.errcode = Number(errcode);
    this.errmsg = errmsg || '';
    this.endpoint = endpoint || '';
  }
}

function parseEnvContent(content) {
  const env = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    let value = normalized.slice(eqIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

async function loadEnvLocal(envPath = ENV_LOCAL_PATH) {
  let content;
  try {
    content = await fsp.readFile(envPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`未找到 ${path.relative(process.cwd(), envPath)}，请先按 .env.local.example 配置 WX_APPID 和 WX_APPSECRET`);
    }
    throw err;
  }

  const env = parseEnvContent(content);
  if (!env.WX_APPID) throw new Error('.env.local 缺少 WX_APPID');
  if (!env.WX_APPSECRET) throw new Error('.env.local 缺少 WX_APPSECRET');
  return env;
}

function isValidYyyymmdd(value) {
  if (!/^\d{8}$/.test(String(value || ''))) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (month < 1 || month > 12 || day < 1) return false;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

function getEndpointForType(type) {
  return TYPE_ENDPOINTS[type] || '';
}

function parseArgs(argv) {
  const [type, begin_date, end_date] = argv;
  if (!type || !begin_date || !end_date || argv.length !== 3) {
    throw new Error('用法: node scripts/fetch-we-analysis.js <type> <begin_date> <end_date>');
  }

  if (!getEndpointForType(type)) {
    throw new Error(`unsupported type: ${type}`);
  }
  if (!isValidYyyymmdd(begin_date)) {
    throw new Error(`begin_date 必须是有效 yyyymmdd 日期: ${begin_date}`);
  }
  if (!isValidYyyymmdd(end_date)) {
    throw new Error(`end_date 必须是有效 yyyymmdd 日期: ${end_date}`);
  }

  return { type, begin_date, end_date };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

async function writeJsonFile(filePath, value, mode) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const options = {
    encoding: 'utf8',
    ...(mode ? { mode } : {})
  };
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

async function readCachedAccessToken(tokenCachePath, nowMs) {
  const cached = await readJsonFile(tokenCachePath);
  if (!cached || typeof cached.access_token !== 'string') return null;

  const expiresAt = Number(cached.expires_at);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt <= nowMs + TOKEN_REFRESH_SKEW_MS) return null;

  return {
    accessToken: cached.access_token,
    expiresAt
  };
}

async function postJson(url, body, { fetchImpl = globalThis.fetch, label = 'request' } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node.js 环境没有 fetch，请使用 Node 18+');
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error(`${label} 请求失败: ${err && err.message ? err.message : err}`);
  }

  let text = '';
  if (response && typeof response.text === 'function') {
    text = await response.text();
  } else if (response && typeof response.json === 'function') {
    const parsed = await response.json();
    if (!response || response.ok === false) {
      const status = response && response.status ? response.status : 'unknown';
      throw new Error(`${label} HTTP ${status}`);
    }
    return parsed;
  }

  let parsed = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`${label} 响应不是合法 JSON: ${String(text).slice(0, 200)}`);
    }
  }

  if (!response || response.ok === false) {
    const status = response && response.status ? response.status : 'unknown';
    throw new Error(`${label} HTTP ${status}`);
  }

  return parsed;
}

function assertNoWechatError(payload, endpoint) {
  if (!payload || payload.errcode == null || Number(payload.errcode) === 0) return;
  throw new WechatApiError({
    errcode: payload.errcode,
    errmsg: payload.errmsg || '',
    endpoint
  });
}

async function requestStableToken({
  appid,
  secret,
  forceRefresh = false,
  fetchImpl = globalThis.fetch
}) {
  const payload = await postJson(STABLE_TOKEN_URL, {
    grant_type: 'client_credential',
    appid,
    secret,
    force_refresh: Boolean(forceRefresh)
  }, {
    fetchImpl,
    label: 'stable_token'
  });

  assertNoWechatError(payload, '/cgi-bin/stable_token');
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('stable_token 响应缺少 access_token');
  }

  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('stable_token 响应缺少有效 expires_in');
  }

  return {
    accessToken: payload.access_token,
    expiresIn
  };
}

async function getAccessToken({
  appid,
  secret,
  tokenCachePath = TOKEN_CACHE_PATH,
  nowMs = Date.now(),
  forceRefresh = false,
  fetchImpl = globalThis.fetch
}) {
  if (!forceRefresh) {
    const cached = await readCachedAccessToken(tokenCachePath, nowMs);
    if (cached) {
      return {
        accessToken: cached.accessToken,
        expiresAt: cached.expiresAt,
        fromCache: true
      };
    }
  }

  const fresh = await requestStableToken({
    appid,
    secret,
    forceRefresh,
    fetchImpl
  });
  const expiresAt = nowMs + fresh.expiresIn * 1000;

  await writeJsonFile(tokenCachePath, {
    fetched_at: new Date(nowMs).toISOString(),
    expires_at: expiresAt,
    expires_in: fresh.expiresIn,
    access_token: fresh.accessToken
  }, 0o600);

  return {
    accessToken: fresh.accessToken,
    expiresAt,
    fromCache: false
  };
}

async function fetchDatacube({
  type,
  begin_date,
  end_date,
  accessToken,
  fetchImpl = globalThis.fetch
}) {
  const endpoint = getEndpointForType(type);
  if (!endpoint) throw new Error(`unsupported type: ${type}`);

  const url = `${WECHAT_API_BASE}${endpoint}?access_token=${encodeURIComponent(accessToken)}`;
  const payload = await postJson(url, {
    begin_date,
    end_date
  }, {
    fetchImpl,
    label: `datacube ${type}`
  });

  assertNoWechatError(payload, endpoint);
  return payload;
}

function isTokenError(error) {
  return error instanceof WechatApiError && TOKEN_ERROR_CODES.has(Number(error.errcode));
}

function valueToCsvCell(value) {
  const normalized = isPlainObject(value) || Array.isArray(value)
    ? JSON.stringify(value)
    : (value == null ? '' : String(value));

  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function extractTabularRows(raw) {
  if (!raw || !isPlainObject(raw)) return [];

  const candidates = [];
  if (Array.isArray(raw.list)) candidates.push(raw.list);
  for (const value of Object.values(raw)) {
    if (Array.isArray(value) && value !== raw.list) candidates.push(value);
  }

  const rows = candidates.find((items) => (
    items.length > 0 && items.every((item) => isPlainObject(item))
  ));
  return rows || [];
}

function rowsToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';

  const columns = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [
    columns.map(valueToCsvCell).join(',')
  ];
  for (const row of rows) {
    lines.push(columns.map((key) => valueToCsvCell(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function saveOutputs({
  type,
  begin_date,
  end_date,
  fetchedAt,
  raw,
  outputDir = OUTPUT_DIR
}) {
  const baseName = `${type}-${begin_date}-${end_date}`;
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const csvPath = path.join(outputDir, `${baseName}.csv`);
  const rows = extractTabularRows(raw);
  const output = {
    type,
    begin_date,
    end_date,
    fetched_at: fetchedAt,
    raw
  };

  await writeJsonFile(jsonPath, output);

  if (rows.length > 0) {
    await fsp.mkdir(path.dirname(csvPath), { recursive: true });
    await fsp.writeFile(csvPath, rowsToCsv(rows), 'utf8');
    return {
      jsonPath,
      csvPath,
      rowCount: rows.length
    };
  }

  return {
    jsonPath,
    csvPath: '',
    rowCount: 0
  };
}

async function fetchWeAnalysis({
  type,
  begin_date,
  end_date,
  envPath = ENV_LOCAL_PATH,
  tokenCachePath = TOKEN_CACHE_PATH,
  outputDir = OUTPUT_DIR,
  nowFn = Date.now,
  fetchImpl = globalThis.fetch,
  logger = console
}) {
  parseArgs([type, begin_date, end_date]);

  const env = await loadEnvLocal(envPath);
  const nowMs = nowFn();
  const tokenResult = await getAccessToken({
    appid: env.WX_APPID,
    secret: env.WX_APPSECRET,
    tokenCachePath,
    nowMs,
    fetchImpl
  });

  let raw;
  try {
    raw = await fetchDatacube({
      type,
      begin_date,
      end_date,
      accessToken: tokenResult.accessToken,
      fetchImpl
    });
  } catch (err) {
    if (!isTokenError(err)) throw err;

    if (logger && typeof logger.warn === 'function') {
      logger.warn(`access_token 失效或过期，errcode=${err.errcode}，强制刷新后重试一次`);
    }

    const refreshed = await getAccessToken({
      appid: env.WX_APPID,
      secret: env.WX_APPSECRET,
      tokenCachePath,
      nowMs: nowFn(),
      forceRefresh: true,
      fetchImpl
    });
    raw = await fetchDatacube({
      type,
      begin_date,
      end_date,
      accessToken: refreshed.accessToken,
      fetchImpl
    });
  }

  const saved = await saveOutputs({
    type,
    begin_date,
    end_date,
    fetchedAt: new Date(nowFn()).toISOString(),
    raw,
    outputDir
  });

  return {
    ...saved,
    raw,
    type,
    begin_date,
    end_date
  };
}

function formatCliError(err) {
  if (err instanceof WechatApiError) {
    const endpoint = err.endpoint ? ` endpoint=${err.endpoint}` : '';
    return `微信接口错误: errcode=${err.errcode} errmsg=${err.errmsg}${endpoint}`;
  }
  return err && err.stack ? err.stack : String(err);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await fetchWeAnalysis(args);
  const relativeJson = path.relative(process.cwd(), result.jsonPath);
  const relativeCsv = result.csvPath ? path.relative(process.cwd(), result.csvPath) : '';

  console.log(`已拉取 ${result.type} ${result.begin_date}-${result.end_date}`);
  console.log(`JSON: ${relativeJson}`);
  if (relativeCsv) {
    console.log(`CSV: ${relativeCsv} (${result.rowCount} rows)`);
  } else {
    console.log('CSV: 未生成（返回结构不适合表格或列表为空）');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(formatCliError(err));
    process.exitCode = 1;
  });
}

module.exports = {
  ENV_LOCAL_PATH,
  OUTPUT_DIR,
  STABLE_TOKEN_URL,
  TOKEN_CACHE_PATH,
  TOKEN_ERROR_CODES,
  TOKEN_REFRESH_SKEW_MS,
  TYPE_ENDPOINTS,
  WechatApiError,
  extractTabularRows,
  fetchDatacube,
  fetchWeAnalysis,
  formatCliError,
  getAccessToken,
  getEndpointForType,
  isTokenError,
  isValidYyyymmdd,
  loadEnvLocal,
  parseArgs,
  parseEnvContent,
  readCachedAccessToken,
  requestStableToken,
  rowsToCsv,
  saveOutputs
};
