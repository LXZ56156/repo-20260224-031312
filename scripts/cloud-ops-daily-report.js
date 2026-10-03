#!/usr/bin/env node
'use strict';

// Offline by default. A manifest lists exact files, window and pagination cursors.
const fs = require('node:fs/promises');
const path = require('node:path');

function windowBounds(window) {
  if (!window || window.timeZone !== 'Asia/Shanghai') throw new Error('timeZone must be Asia/Shanghai');
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value || '')) throw new Error('explicit Beijing window required');
    const ms = Date.parse(value.replace(' ', 'T') + '+08:00');
    if (!Number.isFinite(ms) || new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') !== value) {
      throw new Error('invalid window date');
    }
    return ms;
  };
  const start = parse(window.start);
  const end = parse(window.end);
  if (end <= start) throw new Error('window end must follow start');
  return { start, end };
}

function parseObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const start = value.indexOf('{');
  if (start < 0) return null;
  try { return JSON.parse(value.slice(start)); } catch (_) { return null; }
}

function observation(content) {
  const values = [content.status_msg, content.ret_msg, content.log].map(parseObject).filter(Boolean);
  const outcomes = values.filter((value) => typeof value.ok === 'boolean' || value.phase === 'failed');
  const failed = outcomes.some((value) => value.ok === false || value.phase === 'failed');
  const succeeded = outcomes.some((value) => value.ok === true);
  return {
    business: failed && succeeded ? 'conflict' : failed ? 'failure' : succeeded ? 'success' : 'unknown',
    codes: values.map((value) => String(value.code || '')).filter((code) => /^[A-Z][A-Z0-9_]{0,79}$/.test(code)),
    traceIds: values.map((value) => String(value.traceId || '')).filter((value) => /^[A-Za-z0-9_-]{1,100}$/.test(value)),
    versions: values.map((value) => String(value.appVersion || '')).filter((value) => /^[A-Za-z0-9_.-]{1,64}$/.test(value)),
    hardTimeout: /(?:task timed out|execution timed out|time limit exceeded|hard timeout)/i.test(String(content.status_msg || ''))
  };
}

function timestamp(value) {
  if (typeof value === 'number') return value;
  const input = String(value || '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) return Date.parse(input.replace(' ', 'T') + '+08:00');
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(input)) return Date.parse(input);
  return NaN;
}

function queryPlan(window) {
  windowBounds(window);
  return {
    window,
    readOnly: true,
    command: 'logs search',
    timeRange: `${window.start},${window.end}`,
    pageLimit: 100,
    queries: {
      requestsAndBusiness: 'function_name:*',
      platformByFunction: "function_name:* | select function_name,status_code,count(distinct request_id) as invocations where src='system' AND status_code!=202 AND retry_num=0 group by function_name,status_code limit 100",
      platformFailures: "function_name:* | select function_name,request_id,status_code,status_msg,max(duration) as max_ms where src='system' AND status_code!=200 AND status_code!=202 AND retry_num=0 group by function_name,request_id,status_code,status_msg limit 100",
      anomalies: 'function_name:* AND (status_code:433 OR status_code:430 OR log:START_TIMEOUT OR log:VERSION_CONFLICT OR log:LOCK_EXPIRED OR log:LOCK_OCCUPIED)',
      missingParameterProbes: 'function_name:startTournament AND status_msg:TOURNAMENT_ID_REQUIRED'
    },
    notes: ['Follow every context until listOver=true; record each inputContext in manifest.', 'SQL group counts cannot reconstruct request-level business outcomes or sum overlapping groups.', 'Anomalies query is a shortlist; complete raw logs remain authoritative.']
  };
}

function buildReport(window, sources) {
  const bounds = windowBounds(window);
  if (!Array.isArray(sources) || !sources.length) throw new Error('explicit sources required');
  const issues = [];
  const requests = new Map();
  const aggregates = [];
  const sourceChecks = [];
  const completeFunctionScopes = new Set();
  let environmentId = null;
  let filteredRows = 0;
  let rawSources = 0;
  for (const source of sources) {
    if (!['raw', 'aggregate'].includes(source.kind) || !Array.isArray(source.pages) || !source.pages.length) {
      throw new Error('source kind and explicit pages required');
    }
    let expectedContext = '';
    let query = null;
    let complete = true;
    const problem = (message) => { complete = false; issues.push(`${source.name}: ${message}`); };
    for (let i = 0; i < source.pages.length; i += 1) {
      const page = source.pages[i];
      const response = page.response;
      const meta = response && response.meta;
      const data = response && response.data;
      if (response && response.error) { problem('CLI error'); continue; }
      if (!meta || !data) { problem('missing CLI data/meta'); continue; }
      if (meta.envId) {
        if (environmentId !== null && environmentId !== meta.envId) throw new Error(`${source.name}: mixed environment`);
        environmentId = meta.envId;
      }
      if (meta.startTime !== window.start || meta.endTime !== window.end) throw new Error(`${source.name}: mixed window`);
      if (typeof meta.queryString !== 'string' || !meta.queryString) { problem('missing query'); }
      else if (query === null) query = meta.queryString;
      else if (query !== meta.queryString) throw new Error(`${source.name}: mixed query`);
      if (page.inputContext !== expectedContext) problem('pagination context chain unverified');
      const last = i === source.pages.length - 1;
      if (meta.listOver !== last) problem(last ? 'last page not terminal; truncated or unverified' : 'unexpected terminal page');
      expectedContext = String(meta.context || '');
      if (!last && !expectedContext) problem('missing next context');
      if (source.kind === 'aggregate') {
        if (!/count\s*\(\s*distinct\s+request_id\s*\)/i.test(query || '')) problem('aggregate is not request_id-distinct');
        if (!Array.isArray(data.analysisRecords)) { problem('missing analysisRecords'); continue; }
        // SQL LIMIT 100 is separate from CLI listOver; reaching it may truncate groups.
        const match = (query || '').match(/\blimit\s+(\d+)\s*$/i);
        if (match && data.analysisRecords.length >= Number(match[1])) problem('SQL group limit reached');
        for (const row of data.analysisRecords) {
          const count = Number(row.invocations);
          if (!Number.isSafeInteger(count) || count < 0) { problem('invalid aggregate count'); continue; }
          if (!Number.isFinite(Number(row.status_code)) || Number(row.status_code) <= 0) { problem('invalid aggregate status'); continue; }
          const seen = observation(row);
          const functionName = String(row.function_name || source.functionName || 'unknown');
          aggregates.push({
            source: source.name,
            functionName,
            statusCode: Number(row.status_code),
            reportedDistinctPerGroup: count,
            business: seen.business,
            codes: [...new Set(seen.codes)],
            traceIds: [...new Set(seen.traceIds)],
            appVersions: [...new Set(seen.versions)],
            missingTrace: !seen.traceIds.length,
            missingVersion: !seen.versions.length,
            requestAssociation: 'unavailable-aggregate-group',
            missingParameterProbeCandidate: functionName === 'startTournament' && seen.codes.includes('TOURNAMENT_ID_REQUIRED')
          });
        }
        continue;
      }
      if (!Array.isArray(data.results)) { problem('missing raw results'); continue; }
      if (Number(meta.returnCount) !== data.results.length) problem('returnCount differs from raw rows');
      for (const row of data.results) {
        const content = row.content || row;
        const time = timestamp(row.timestamp || content.__TIMESTAMP__);
        if (!Number.isFinite(time)) { problem('raw timestamp missing or ambiguous'); continue; }
        if (time < bounds.start || time > bounds.end) { problem('raw row outside window'); continue; }
        if (!['system', 'app'].includes(content.src)) { filteredRows += 1; continue; }
        if (content.retry_num === undefined || content.retry_num === '') { problem('retry_num missing'); continue; }
        if (Number(content.retry_num) !== 0) { filteredRows += 1; continue; }
        const functionName = String(content.function_name || '');
        const requestId = String(content.request_id || '');
        if (!functionName || !requestId) { problem('raw function_name/request_id missing'); continue; }
        const key = `${functionName}:${requestId}`;
        const item = requests.get(key) || { functionName, requestId, statuses: new Set(), outcomes: new Set(), codes: new Set(), traceIds: new Set(), versions: new Set(), durations: [], hardTimeout: false };
        const seen = observation(content);
        if (content.src === 'system' && Number(content.status_code) !== 202) {
          const status = Number(content.status_code);
          if (!Number.isFinite(status) || status <= 0) problem('invalid terminal platform status');
          else item.statuses.add(status);
          const duration = Number(content.duration);
          if (content.duration !== '' && Number.isFinite(duration) && duration >= 0) item.durations.push(duration);
          item.hardTimeout = item.hardTimeout || status === 433 || (status !== 200 && seen.hardTimeout);
        }
        if (seen.business !== 'unknown') item.outcomes.add(seen.business);
        seen.codes.forEach((code) => item.codes.add(code));
        seen.traceIds.forEach((value) => item.traceIds.add(value));
        seen.versions.forEach((value) => item.versions.add(value));
        requests.set(key, item);
      }
    }
    const scope = source.kind === 'raw' && (query || '').match(/^function_name:(\*|[A-Za-z0-9_-]+)$/);
    if (source.kind === 'raw') rawSources += 1;
    if (scope && complete) completeFunctionScopes.add(scope[1]);
    sourceChecks.push({ name: source.name, kind: source.kind, pages: source.pages.length, complete, requestScope: scope ? scope[1] : 'subset-or-aggregate' });
  }
  const functions = {};
  const anomalies = [];
  const probes = [];
  let appOnlyRequests = 0;
  for (const item of requests.values()) {
    if (!item.statuses.size) { appOnlyRequests += 1; continue; }
    const platform = item.statuses.size > 1 ? 'conflict' : item.statuses.has(200) ? 'success' : 'failure';
    const business = item.outcomes.size > 1 || item.outcomes.has('conflict') ? 'conflict' : [...item.outcomes][0] || 'unknown';
    const detail = { functionName: item.functionName, requestId: item.requestId, platform, business, statusCodes: [...item.statuses], codes: [...item.codes], traceIds: [...item.traceIds], appVersions: [...item.versions], hardTimeout: item.hardTimeout };
    if (item.functionName === 'startTournament' && item.codes.has('TOURNAMENT_ID_REQUIRED')) { probes.push(detail); continue; }
    const summary = functions[item.functionName] || { requests: 0, platformSuccess: 0, platformFailure: 0, platformConflict: 0, businessSuccess: 0, businessFailure: 0, businessUnknown: 0, businessConflict: 0, hardTimeout: 0, missingTrace: 0, missingVersion: 0, durations: [] };
    summary.requests += 1;
    summary[`platform${platform[0].toUpperCase()}${platform.slice(1)}`] += 1;
    summary[`business${business[0].toUpperCase()}${business.slice(1)}`] += 1;
    summary.hardTimeout += Number(item.hardTimeout);
    summary.missingTrace += Number(!item.traceIds.size);
    summary.missingVersion += Number(!item.versions.size);
    if (item.durations.length) summary.durations.push(Math.max(...item.durations));
    if (platform !== 'success' || business === 'failure' || business === 'conflict') anomalies.push(detail);
    functions[item.functionName] = summary;
  }
  const complete = sourceChecks.every((item) => item.complete);
  for (const [functionName, value] of Object.entries(functions)) {
    const fullCoverage = completeFunctionScopes.has('*') || completeFunctionScopes.has(functionName);
    value.platformFailureRate = complete && fullCoverage && value.platformConflict === 0 ? value.platformFailure / value.requests : null;
    value.durations.sort((a, b) => a - b);
    value.requestP95Ms = value.durations.length ? value.durations[Math.ceil(value.durations.length * 0.95) - 1] : null;
    value.durationCoverage = value.durations.length;
    delete value.durations;
  }
  return {
    schemaVersion: 1, window, complete,
    metricPopulation: 'Terminal raw requests, with missing-parameter probe candidates displayed separately; production traffic is not verified.',
    sourceChecks, issues,
    requestReconstruction: rawSources > 0 ? 'raw-request-id-deduped' : 'unavailable-aggregate-only',
    functions, anomalies, missingParameterProbeCandidates: probes, aggregateGroups: aggregates,
    coverage: { appOnlyRequests, filteredRows, rawSources },
    limitations: [
      'Platform success does not prove business success; missing business results remain unknown.',
      'Missing-parameter calls are probe candidates, not proven test traffic; displayed separately.',
      'Aggregate group counts are not summed into an exact request total or success rate.',
      'Raw P95 uses one maximum reported terminal duration per request and reports coverage.',
      'No real-client receipt, retention enforcement, alerts subscription or production/test separation proven.'
    ]
  };
}

async function loadManifest(manifestPath) {
  const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  const absolute = path.resolve(manifestPath);
  const manifest = await readJson(absolute);
  windowBounds(manifest.window);
  if (!Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error('explicit sources required');
  const base = path.dirname(absolute);
  const sources = [];
  for (const source of manifest.sources) {
    if (!Array.isArray(source.files) || !source.files.length) throw new Error('explicit source files required');
    const pages = [];
    for (const entry of source.files) {
      if (!entry.file || typeof entry.file !== 'string') throw new Error('explicit file required');
      const target = path.resolve(base, entry.file);
      const relative = path.relative(base, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('source files must remain within manifest directory');
      pages.push({ inputContext: entry.inputContext, response: await readJson(target) });
    }
    sources.push({ ...source, pages });
  }
  return { window: manifest.window, sources };
}

async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];
    if (name === '--queries') options.queries = true;
    else if (['--manifest', '--output', '--start', '--end'].includes(name) && args[i + 1] && !args[i + 1].startsWith('--')) options[name.slice(2)] = args[++i];
    else throw new Error(`unknown or missing argument: ${name}`);
  }
  let result;
  if (options.queries) result = queryPlan({ start: options.start, end: options.end, timeZone: 'Asia/Shanghai' });
  else {
    if (!options.manifest) throw new Error('usage: --manifest EXPLICIT_JSON [--output NEW_DIRECTORY], or --queries --start BEIJING_TIME --end BEIJING_TIME');
    const input = await loadManifest(options.manifest);
    result = buildReport(input.window, input.sources);
  }
  if (options.output) {
    const target = path.resolve(options.output);
    await fs.mkdir(target); // Existing directories, including empty ones, are rejected.
    await fs.writeFile(path.join(target, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  }
  return result;
}

if (require.main === module) main().then((result) => {
  console.log(JSON.stringify(result, null, 2));
  if (result.complete === false) process.exitCode = 2;
}).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { windowBounds, queryPlan, buildReport, loadManifest, main };
