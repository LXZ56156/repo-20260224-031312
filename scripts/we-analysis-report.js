#!/usr/bin/env node
'use strict';
// Offline only: exact requests/files, never directory discovery.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const DAILY = new Set(['dailyVisitTrend', 'dailySummary', 'visitPage', 'dailyRetain', 'visitDistribution']);
const PERIOD = new Set(['weeklyVisitTrend', 'monthlyVisitTrend', 'weeklyRetain', 'monthlyRetain', 'userPortrait']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const key = x => `${x.type}:${x.begin_date}:${x.end_date}`;
function date(value) {
  const compact = String(value || '').replaceAll('-', '');
  if (!/^\d{8}$/.test(compact)) throw new Error(`invalid date: ${value}`);
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) throw new Error(`invalid date: ${value}`);
  return compact;
}
function addDays(value, n) {
  const d = date(value);
  const ms = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
  return new Date(ms + n * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
}
function number(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`invalid numeric field: ${label}`);
  return value;
}
function metadata(x) {
  if (!DAILY.has(x.type) && !PERIOD.has(x.type)) throw new Error(`unsupported type: ${x.type}`);
  const begin = date(x.begin_date), end = date(x.end_date);
  if (begin !== x.begin_date || end !== x.end_date || end < begin) throw new Error('invalid request metadata');
  if (DAILY.has(x.type) && begin !== end) throw new Error('daily metadata must cover exactly one date');
  if (x.type.startsWith('monthly') && (begin.slice(6) !== '01' || addDays(end, 1).slice(6) !== '01' || begin.slice(0, 6) !== end.slice(0, 6))) throw new Error('monthly period metadata must cover a complete month');
  if (x.type.startsWith('weekly') && addDays(begin, 6) !== end) throw new Error('weekly period metadata must cover seven dates');
}
function validateRaw(x) {
  if (!x.raw || typeof x.raw !== 'object' || Array.isArray(x.raw)) throw new Error(`missing raw: ${key(x)}`);
  if (x.raw.errcode) throw new Error(`successful input contains errcode: ${key(x)}`);
  const expected = DAILY.has(x.type) ? x.begin_date : x.type.startsWith('monthly') ? x.begin_date.slice(0, 6) : `${x.begin_date}-${x.end_date}`;
  if (['dailyVisitTrend', 'dailySummary', 'weeklyVisitTrend', 'monthlyVisitTrend'].includes(x.type)) {
    if (!Array.isArray(x.raw.list) || x.raw.list.length !== 1 || x.raw.list[0].ref_date !== expected) throw new Error(`ref_date/list mismatch: ${key(x)}`);
  } else if (x.raw.ref_date !== expected) throw new Error(`ref_date mismatch: ${key(x)}`);
  if (['visitPage', 'visitDistribution'].includes(x.type) && !Array.isArray(x.raw.list)) throw new Error(`missing list: ${key(x)}`);
  if (x.type === 'visitPage') {
    const seen = new Set();
    for (const row of x.raw.list) {
      if (!row.page_path || seen.has(row.page_path)) throw new Error(`duplicate/missing page_path: ${key(x)}`);
      seen.add(row.page_path);
    }
  }
  if (x.type.endsWith('Retain')) {
    for (const kind of ['visit_uv_new', 'visit_uv']) {
      if (x.raw[kind] === undefined) continue;
      if (!Array.isArray(x.raw[kind])) throw new Error(`invalid retention list: ${key(x)}`);
      const seen = new Set();
      for (const row of x.raw[kind]) {
        if (!Number.isInteger(row.key) || row.key < 0 || seen.has(row.key)) throw new Error(`duplicate/invalid retention key: ${key(x)}`);
        seen.add(row.key); number(row.value, `${key(x)}:${kind}:${row.key}`);
      }
    }
  }
}
async function buildReport(options) {
  const begin = date(options.begin), endExclusive = date(options.endExclusive), latestComplete = date(options.latestComplete);
  if (endExclusive <= begin) throw new Error('endExclusive must follow begin');
  if (!!options.manifestPath === !!options.files) throw new Error('supply exactly one manifest or explicit files list');
  let requests, manifest = null, attempts = [];
  if (options.manifestPath) {
    const file = path.resolve(options.manifestPath), bytes = await fs.readFile(file), data = JSON.parse(bytes);
    if (!Array.isArray(data.results)) throw new Error('manifest results must be an array');
    attempts = [...data.results, ...(data.retries || []), ...(data.additional || [])];
    for (const attempt of attempts) { metadata(attempt); if (typeof attempt.ok !== 'boolean') throw new Error('manifest attempt requires boolean ok'); }
    const successes = attempts.filter(x => x.ok), successfulKeys = new Set(successes.map(key));
    attempts = attempts.map(x => ({ type: x.type, begin_date: x.begin_date, end_date: x.end_date, ok: x.ok, code: x.code ?? null, resolved: !x.ok && successfulKeys.has(key(x)) }));
    requests = successes.map(x => ({ file: path.join(path.dirname(file), `${x.type}-${x.begin_date}-${x.end_date}.json`), expected: x }));
    manifest = { file, sha256: hash(bytes) };
  } else {
    if (!Array.isArray(options.files) || !options.files.length) throw new Error('explicit files list must not be empty');
    requests = options.files.map(file => ({ file: path.resolve(file) }));
  }
  const docs = [], inputs = [], seenFiles = new Set(), seenRequests = new Set();
  for (const request of requests) {
    if (seenFiles.has(request.file)) throw new Error(`duplicate file/request: ${request.file}`);
    seenFiles.add(request.file);
    const bytes = await fs.readFile(request.file), x = JSON.parse(bytes);
    metadata(x);
    if (request.expected && key(x) !== key(request.expected)) throw new Error(`file metadata mismatch: ${request.file}`);
    if (seenRequests.has(key(x))) throw new Error(`duplicate request metadata: ${key(x)}`);
    seenRequests.add(key(x));
    // Portraits are independent overlapping windows; their dimensions are never summed.
    if (x.type !== 'userPortrait' && docs.some(d => d.type === x.type && d.begin_date <= x.end_date && x.begin_date <= d.end_date)) throw new Error(`overlapping requests: ${key(x)}`);
    validateRaw(x); docs.push(x);
    inputs.push({ file: request.file, sha256: hash(bytes), type: x.type, begin_date: x.begin_date, end_date: x.end_date, usedInDailyWindow: DAILY.has(x.type) && x.begin_date >= begin && x.begin_date < endExclusive && x.begin_date <= latestComplete });
  }
  const days = [];
  for (let d = begin; d < endExclusive; d = addDays(d, 1)) days.push(d);
  const lookup = (type, d) => docs.find(x => x.type === type && x.begin_date === d);
  const missingReason = (type, d) => {
    if (d > latestComplete) return 'not_complete';
    const error = attempts.find(x => x.type === type && x.begin_date === d && !x.ok && !x.resolved);
    return error ? `api_error_${error.code}` : 'missing_input';
  };
  const evidence = {};
  function metric(name, type, field, weight) {
    let numerator = 0, denominator = 0;
    const includedDays = [], missingDays = [];
    for (const d of days) {
      const doc = d <= latestComplete ? lookup(type, d) : null;
      if (!doc) { missingDays.push({ date: d, reason: missingReason(type, d) }); continue; }
      const row = doc.raw.list[0], value = number(row[field], `${type}:${d}:${field}`), w = weight ? number(row[weight], `${type}:${d}:${weight}`) : 1;
      if (value === null || w === null) { missingDays.push({ date: d, reason: 'missing_field' }); continue; }
      numerator += value * w; denominator += w; includedDays.push({ date: d, value, weight: w });
    }
    const value = includedDays.length && (!weight || denominator > 0) ? weight ? numerator / denominator : numerator : null;
    evidence[name] = { status: !includedDays.length ? 'missing' : missingDays.length ? 'partial' : 'complete', numerator, denominator: weight ? denominator : null, includedDays, missingDays };
    return value;
  }
  const window = { begin, endExclusive, latestComplete,
    pv: metric('pv', 'dailyVisitTrend', 'visit_pv'), sessions: metric('sessions', 'dailyVisitTrend', 'session_cnt'),
    uvDays: metric('uvDays', 'dailyVisitTrend', 'visit_uv'), newUsers: metric('newUsers', 'dailyVisitTrend', 'visit_uv_new'),
    staySecPerDailyUser: metric('staySecPerDailyUser', 'dailyVisitTrend', 'stay_time_uv', 'visit_uv'),
    staySecPerSession: metric('staySecPerSession', 'dailyVisitTrend', 'stay_time_session', 'session_cnt'),
    depthPerSession: metric('depthPerSession', 'dailyVisitTrend', 'visit_depth', 'session_cnt'),
    shares: metric('shares', 'dailySummary', 'share_pv'), shareUvDays: metric('shareUvDays', 'dailySummary', 'share_uv'), evidence };
  window.avgDailyUv = evidence.uvDays.includedDays.length ? window.uvDays / evidence.uvDays.includedDays.length : null;
  function retention(kind, lag) {
    let numerator = 0, denominator = 0;
    const included = [], missing = [], immature = [];
    for (const d of days) {
      if (addDays(d, lag) > latestComplete) { immature.push(d); continue; }
      const doc = lookup('dailyRetain', d);
      if (!doc) { missing.push({ date: d, reason: missingReason('dailyRetain', d) }); continue; }
      const rows = doc.raw[kind] || [], zero = rows.find(x => x.key === 0), target = rows.find(x => x.key === lag);
      const den = number(zero?.value, `${kind}:${d}:0`), num = number(target?.value, `${kind}:${d}:${lag}`);
      if (den === null || num === null) { missing.push({ date: d, reason: 'missing_key_or_value' }); continue; }
      if (num > den) throw new Error(`retention numerator exceeds denominator: ${kind}:${d}:${lag}`);
      numerator += num; denominator += den; included.push({ date: d, targetDate: addDays(d, lag), numerator: num, denominator: den });
    }
    return { day: lag, status: !included.length ? 'missing' : missing.length ? 'partial' : 'complete', numerator, denominator, rate: denominator > 0 ? numerator / denominator : null, matureCohorts: included.length, included, missing, immature };
  }
  window.newRetention = [1, 7, 14].map(k => retention('visit_uv_new', k));
  window.activeRetention = [1, 7, 14].map(k => retention('visit_uv', k));
  const pageDays = days.filter(d => d <= latestComplete && lookup('visitPage', d));
  const missingPageDays = days.filter(d => !pageDays.includes(d)).map(d => ({ date: d, reason: missingReason('visitPage', d) }));
  const pagePaths = [...new Set(pageDays.flatMap(d => lookup('visitPage', d).raw.list.map(row => row.page_path)))];
  window.pages = pagePaths.map(pagePath => {
    const rows = pageDays.flatMap(d => lookup('visitPage', d).raw.list.filter(row => row.page_path === pagePath).map(row => ({ date: d, ...row })));
    const p = { path: pagePath, evidence: {} };
    for (const [name, field, weight] of [['pv', 'page_visit_pv'], ['uvDays', 'page_visit_uv'], ['staySecPerPv', 'page_staytime_pv', 'page_visit_pv'], ['entryPv', 'entrypage_pv'], ['exitPv', 'exitpage_pv'], ['sharePv', 'page_share_pv'], ['shareUvDays', 'page_share_uv']]) {
      let numerator = 0, denominator = 0;
      const included = [], missing = [...missingPageDays];
      for (const row of rows) {
        const value = number(row[field], `${pagePath}:${row.date}:${field}`), w = weight ? number(row[weight], `${pagePath}:${row.date}:${weight}`) : 1;
        if (value === null || w === null) { missing.push({ date: row.date, reason: 'missing_field' }); continue; }
        numerator += value * w; denominator += w; included.push({ date: row.date, value, weight: w });
      }
      p[name] = included.length && (!weight || denominator > 0) ? weight ? numerator / denominator : numerator : null;
      p.evidence[name] = { status: !included.length ? 'missing' : missing.length ? 'partial' : 'complete', numerator, denominator: weight ? denominator : null, included, missing };
    }
    p.pvShare = window.pv > 0 && p.pv !== null ? p.pv / window.pv : null;
    return p;
  }).sort((a, b) => (b.pv || 0) - (a.pv || 0));
  window.pageCoverage = { includedDays: pageDays, missingDays: missingPageDays };
  const retentionMissing = [...window.newRetention, ...window.activeRetention].some(x => x.missing.length > 0);
  window.status = Object.values(evidence).every(x => x.status === 'missing') ? 'missing' : Object.values(evidence).every(x => x.status === 'complete') && !missingPageDays.length && !retentionMissing ? 'complete' : 'partial';
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), timezone: 'Asia/Shanghai',
    notes: ['Daily UV sums are user-days, not unique people.', 'Partial totals cover only known values; inspect evidence before comparison.', 'Page sharing fields and dailySummary global sharing are separate.', 'Period/portrait responses are preserved separately, never summed into daily windows; period retention maturity is not evaluated.', 'Page absence from a valid daily list means no reported row; missing response/field remains unknown.', 'No business database data, trend interpretation or causal conclusions are generated.'],
    inputs: { manifest, files: inputs, attempts }, window,
    periods: docs.filter(x => PERIOD.has(x.type)).map(x => ({ type: x.type, begin: x.begin_date, endExclusive: addDays(x.end_date, 1), status: x.end_date > latestComplete ? 'not_complete' : x.type.endsWith('Retain') ? 'maturity_not_evaluated' : 'available', raw: x.raw })),
    dailyEvidence: docs.filter(x => DAILY.has(x.type) && x.begin_date >= begin && x.begin_date < endExclusive && x.begin_date <= latestComplete).map(x => ({ type: x.type, date: x.begin_date, raw: x.raw })) };
}
async function writeReport(report, directory) {
  await fs.mkdir(directory); // Existing target is an error; no overwrite.
  await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
async function cli(args = process.argv.slice(2)) {
  const options = {};
  let output;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`missing value: ${flag}`);
    if (flag === '--manifest') options.manifestPath = value;
    else if (flag === '--file') (options.files ||= []).push(value);
    else if (flag === '--begin') options.begin = value;
    else if (flag === '--end-exclusive') options.endExclusive = value;
    else if (flag === '--latest-complete') options.latestComplete = value;
    else if (flag === '--out') output = value;
    else throw new Error(`unknown option: ${flag}`);
  }
  if (!options.manifestPath && !options.files) throw new Error('explicit --manifest or --file inputs required; see docs/tools/we-analysis-local-script.md');
  const report = await buildReport(options);
  if (output) await writeReport(report, path.resolve(output));
  else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
if (require.main === module) cli().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildReport, writeReport, cli };
