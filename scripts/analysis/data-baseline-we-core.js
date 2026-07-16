'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CUTOFF_DATE = '2026-07-15';
const DEFAULT_WINDOW_DAYS = Object.freeze([90, 180]);
const DEFAULT_PORTRAIT_K_THRESHOLD = 5;
const DAILY_SOURCE_TYPES = Object.freeze([
  'dailySummary',
  'dailyVisitTrend',
  'visitPage',
  'visitDistribution',
  'dailyRetain'
]);
const SOURCE_TYPES = Object.freeze([
  'dailySummary',
  'dailyVisitTrend',
  'visitPage',
  'visitDistribution',
  'dailyRetain',
  'weeklyRetain',
  'monthlyRetain',
  'userPortrait'
]);
const SOURCE_TYPE_SET = new Set(SOURCE_TYPES);
const PORTRAIT_DIMENSIONS = Object.freeze(['ages', 'genders', 'platforms', 'devices']);

function compareCodePoints(left, right) {
  const leftValue = String(left);
  const rightValue = String(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function roundMetric(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toMetricNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseIsoDate(value, label = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a valid calendar date`);
  }
  return parsed;
}

function compactToIso(value, label = 'source date') {
  const raw = String(value || '');
  if (!/^\d{8}$/.test(raw)) throw new Error(`${label} must use YYYYMMDD`);
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  parseIsoDate(iso, label);
  return iso;
}

function isoToCompact(value) {
  parseIsoDate(value);
  return value.replaceAll('-', '');
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function windowStartDate(cutoffDate, windowDays) {
  const cutoff = parseIsoDate(cutoffDate, 'cutoffDate');
  return formatIsoDate(new Date(cutoff.getTime() - (windowDays - 1) * DAY_MS));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function jobKey(job) {
  return `${job.type}:${job.begin_date}:${job.end_date}`;
}

function buildExpectedJobs(requestedStartDate, cutoffDate) {
  const start = parseIsoDate(requestedStartDate, 'requestedStartDate');
  const cutoff = parseIsoDate(cutoffDate, 'cutoffDate');
  if (start > cutoff) throw new Error('requestedStartDate is after cutoffDate');
  const jobs = [];

  for (let day = start; day <= cutoff; day = addUtcDays(day, 1)) {
    const compact = formatIsoDate(day).replaceAll('-', '');
    for (const type of DAILY_SOURCE_TYPES) {
      jobs.push({ type, begin_date: compact, end_date: compact });
    }
  }

  let monday = new Date(start);
  while (monday.getUTCDay() !== 1) monday = addUtcDays(monday, 1);
  while (addUtcDays(monday, 6) <= cutoff) {
    jobs.push({
      type: 'weeklyRetain',
      begin_date: formatIsoDate(monday).replaceAll('-', ''),
      end_date: formatIsoDate(addUtcDays(monday, 6)).replaceAll('-', '')
    });
    monday = addUtcDays(monday, 7);
  }

  let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (month < start) month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  for (;;) {
    const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const monthEnd = addUtcDays(nextMonth, -1);
    if (monthEnd > cutoff) break;
    jobs.push({
      type: 'monthlyRetain',
      begin_date: formatIsoDate(month).replaceAll('-', ''),
      end_date: formatIsoDate(monthEnd).replaceAll('-', '')
    });
    month = nextMonth;
  }

  const cutoffCompact = cutoffDate.replaceAll('-', '');
  jobs.push({ type: 'userPortrait', begin_date: cutoffCompact, end_date: cutoffCompact });
  return jobs;
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (!isPlainObject(value)) return value;

  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'fetched_at' || key === 'fetchedAt') continue;
    output[key] = stableClone(value[key]);
  }
  return output;
}

function canonicalJson(value) {
  return JSON.stringify(stableClone(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizePagePath(value) {
  const withoutParameters = String(value == null ? '' : value)
    .trim()
    .split(/[?#]/, 1)[0]
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');

  if (
    !withoutParameters ||
    withoutParameters.length > 160 ||
    withoutParameters.split('/').includes('..') ||
    !/^[A-Za-z0-9_./-]+$/.test(withoutParameters)
  ) {
    return '_redacted_route';
  }
  return withoutParameters;
}

function normalizeDocuments(documents, cutoffCompact) {
  if (!Array.isArray(documents)) throw new Error('documents must be an array');

  const byKey = new Map();
  let duplicateArtifacts = 0;
  for (const document of documents) {
    if (!isPlainObject(document)) throw new Error('source artifact must be an object');
    const type = String(document.type || '');
    if (!SOURCE_TYPE_SET.has(type)) throw new Error(`unsupported We analysis type: ${type || '(missing)'}`);
    const beginDate = String(document.begin_date || '');
    const endDate = String(document.end_date || '');
    compactToIso(beginDate, `${type} begin_date`);
    compactToIso(endDate, `${type} end_date`);
    if (beginDate > endDate) throw new Error(`${type} begin_date is after end_date`);
    if (endDate > cutoffCompact) throw new Error(`${type} artifact is later than cutoffDate`);
    if (!isPlainObject(document.raw)) throw new Error(`${type} artifact raw payload must be an object`);

    const normalized = {
      type,
      begin_date: beginDate,
      end_date: endDate,
      raw: document.raw
    };
    const key = `${type}:${beginDate}:${endDate}`;
    const content = canonicalJson(normalized);
    const existing = byKey.get(key);
    if (existing) {
      if (existing.content !== content) {
        throw new Error(`conflicting duplicate We analysis artifact: ${key}`);
      }
      duplicateArtifacts += 1;
      continue;
    }
    byKey.set(key, { normalized, content });
  }

  const normalized = [...byKey.values()]
    .map((entry) => entry.normalized)
    .sort((left, right) => (
      compareCodePoints(left.type, right.type) ||
      compareCodePoints(left.begin_date, right.begin_date) ||
      compareCodePoints(left.end_date, right.end_date)
    ));
  return { normalized, duplicateArtifacts };
}

function listRows(document) {
  return Array.isArray(document.raw.list)
    ? document.raw.list.filter(isPlainObject)
    : [];
}

function retentionRowCount(document) {
  const newRows = Array.isArray(document.raw.visit_uv_new) ? document.raw.visit_uv_new.length : 0;
  const allRows = Array.isArray(document.raw.visit_uv) ? document.raw.visit_uv.length : 0;
  return Math.max(newRows, allRows);
}

function portraitRowCount(document) {
  let count = 0;
  for (const cohortKey of ['visit_uv_new', 'visit_uv']) {
    const cohort = isPlainObject(document.raw[cohortKey]) ? document.raw[cohortKey] : {};
    for (const dimension of PORTRAIT_DIMENSIONS) {
      if (Array.isArray(cohort[dimension])) count += cohort[dimension].length;
    }
  }
  return count;
}

function distributionRowCount(document) {
  let count = 0;
  for (const row of listRows(document)) {
    if (Array.isArray(row.item_list)) count += row.item_list.filter(isPlainObject).length;
  }
  return count;
}

function semanticRowCount(document) {
  if (document.type === 'dailyRetain' || document.type === 'weeklyRetain' || document.type === 'monthlyRetain') {
    return retentionRowCount(document);
  }
  if (document.type === 'userPortrait') return portraitRowCount(document);
  if (document.type === 'visitDistribution') return distributionRowCount(document);
  return listRows(document).length;
}

function responseHasData(document) {
  return semanticRowCount(document) > 0;
}

function numericManifestField(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildSourceCoverage(documents, manifest) {
  const manifestByType = isPlainObject(manifest && manifest.byType) ? manifest.byType : {};
  const sources = {};

  for (const type of SOURCE_TYPES) {
    const sourceDocuments = documents.filter((document) => document.type === type);
    const declared = isPlainObject(manifestByType[type]) ? manifestByType[type] : {};
    const requested = numericManifestField(declared.requested) ?? sourceDocuments.length;
    const declaredSucceeded = numericManifestField(declared.succeeded) ?? sourceDocuments.length;
    const failedRequests = numericManifestField(declared.failed) ?? Math.max(0, requested - declaredSucceeded);
    const missingSuccessfulArtifacts = Math.max(0, declaredSucceeded - sourceDocuments.length);
    const nonEmptyResponses = sourceDocuments.filter(responseHasData).length;
    const rawArtifactCount = sourceDocuments.length;
    const first = rawArtifactCount ? compactToIso(sourceDocuments[0].begin_date) : null;
    const last = rawArtifactCount ? compactToIso(sourceDocuments.at(-1).end_date) : null;
    let status = 'not_requested';
    if (requested > 0) {
      status = (
        failedRequests === 0 &&
        missingSuccessfulArtifacts === 0 &&
        declaredSucceeded === requested &&
        rawArtifactCount === declaredSucceeded
      ) ? 'complete' : 'partial';
    }

    sources[type] = {
      status,
      requestedRequests: requested,
      declaredSuccessfulRequests: declaredSucceeded,
      failedRequests,
      rawArtifactCount,
      missingSuccessfulArtifacts,
      nonEmptyResponses,
      successfulEmptyResponses: rawArtifactCount - nonEmptyResponses,
      semanticRows: sourceDocuments.reduce((sum, document) => sum + semanticRowCount(document), 0),
      firstRequestDate: first,
      lastRequestDate: last
    };
  }
  return sources;
}

function documentsInWindow(documents, type, startCompact, cutoffCompact) {
  return documents.filter((document) => (
    document.type === type &&
    document.begin_date >= startCompact &&
    document.begin_date <= cutoffCompact
  ));
}

function semanticRowDate(document, row, label) {
  const rawRefDate = row.ref_date == null || row.ref_date === ''
    ? null
    : String(row.ref_date);
  if (rawRefDate != null) {
    compactToIso(rawRefDate, `${label} ref_date`);
    if (rawRefDate < document.begin_date || rawRefDate > document.end_date) {
      throw new Error(`${label} ref_date is outside artifact range`);
    }
    return rawRefDate;
  }
  if (document.begin_date !== document.end_date) {
    throw new Error(`${label} row without ref_date has an ambiguous artifact range`);
  }
  return document.begin_date;
}

function uniqueListRows(documents, {
  label,
  logicalKey = () => '',
  normalizeRow = (row, date) => ({ ...row, ref_date: date })
}) {
  const byLogicalKey = new Map();
  for (const document of documents) {
    if (document.raw.list != null && !Array.isArray(document.raw.list)) {
      throw new Error(`${label} list must be an array`);
    }
    for (const row of document.raw.list || []) {
      if (!isPlainObject(row)) throw new Error(`${label} list row must be an object`);
      const date = semanticRowDate(document, row, label);
      const normalizedRow = normalizeRow(row, date);
      const key = `${date}:${logicalKey(normalizedRow, date)}`;
      const content = canonicalJson(normalizedRow);
      const existing = byLogicalKey.get(key);
      if (existing) {
        if (existing.content !== content) {
          throw new Error(`conflicting ${label} logical row for ${date}`);
        }
        continue;
      }
      byLogicalKey.set(key, { date, row: normalizedRow, content, key });
    }
  }
  return [...byLogicalKey.values()]
    .sort((left, right) => compareCodePoints(left.key, right.key))
    .map(({ date, row }) => ({ date, row }));
}

function rowsWithDates(documents, label) {
  return uniqueListRows(documents, { label });
}

function sumField(rows, field) {
  let sum = 0;
  let observations = 0;
  for (const item of rows) {
    const value = toMetricNumber(item.row[field]);
    if (value == null) continue;
    sum += value;
    observations += 1;
  }
  return {
    value: observations ? roundMetric(sum) : null,
    observations
  };
}

function weightedAverage(rows, valueField, weightField) {
  let weightedSum = 0;
  let denominator = 0;
  let observations = 0;
  for (const item of rows) {
    const value = toMetricNumber(item.row[valueField]);
    const weight = toMetricNumber(item.row[weightField]);
    if (value == null || weight == null || weight <= 0) continue;
    weightedSum += value * weight;
    denominator += weight;
    observations += 1;
  }
  return {
    value: denominator > 0 ? roundMetric(weightedSum / denominator) : null,
    observations,
    denominator: roundMetric(denominator)
  };
}

function aggregateTraffic(sourceDocuments) {
  const rows = rowsWithDates(sourceDocuments, 'dailyVisitTrend');
  const visitUv = sumField(rows, 'visit_uv');
  const visitPv = sumField(rows, 'visit_pv');
  const visitUvNew = sumField(rows, 'visit_uv_new');
  const sessions = sumField(rows, 'session_cnt');
  const stayTimePerVisitor = weightedAverage(rows, 'stay_time_uv', 'visit_uv');
  const stayTimePerSession = weightedAverage(rows, 'stay_time_session', 'session_cnt');
  const visitDepth = weightedAverage(rows, 'visit_depth', 'session_cnt');
  const observedDays = new Set(rows.map((item) => item.date)).size;

  return {
    semantics: {
      visitUvPersonDays: 'daily_uv_person_days_sum_not_window_unique_users',
      visitUvNewPersonDays: 'daily_new_uv_person_days_sum_not_window_unique_users',
      newUserUvPersonDayRatio: 'daily_new_uv_person_days_sum_divided_by_daily_uv_person_days_sum'
    },
    observedDays,
    successfulEmptyDays: sourceDocuments.filter((document) => listRows(document).length === 0).length,
    visitUvPersonDays: visitUv.value,
    visitPv: visitPv.value,
    visitUvNewPersonDays: visitUvNew.value,
    newUserUvPersonDayRatio: visitUv.value != null && visitUv.value > 0 && visitUvNew.value != null
      ? roundMetric(visitUvNew.value / visitUv.value)
      : null,
    sessions: sessions.value,
    weightedStayTimePerVisitor: stayTimePerVisitor.value,
    weightedStayTimePerSession: stayTimePerSession.value,
    weightedVisitDepth: visitDepth.value,
    metricObservations: {
      visitUv: visitUv.observations,
      visitPv: visitPv.observations,
      visitUvNew: visitUvNew.observations,
      sessions: sessions.observations,
      stayTimePerVisitor: stayTimePerVisitor.observations,
      stayTimePerSession: stayTimePerSession.observations,
      visitDepth: visitDepth.observations
    }
  };
}

function aggregateCumulativeUsers(sourceDocuments) {
  const byDate = new Map();
  for (const item of rowsWithDates(sourceDocuments, 'dailySummary')) {
    const value = toMetricNumber(item.row.visit_total);
    if (value == null) continue;
    const existing = byDate.get(item.date);
    if (existing != null && existing !== value) {
      throw new Error(`conflicting cumulative visit_total for ${item.date}`);
    }
    byDate.set(item.date, value);
  }
  const values = [...byDate.entries()].sort(([left], [right]) => compareCodePoints(left, right));
  if (!values.length) {
    return {
      semantics: 'cumulative_endpoint_not_window_unique_users',
      observedDays: 0,
      firstDate: null,
      firstValue: null,
      lastDate: null,
      lastValue: null,
      endpointDelta: null
    };
  }
  const [firstDate, firstValue] = values[0];
  const [lastDate, lastValue] = values.at(-1);
  return {
    semantics: 'cumulative_endpoint_not_window_unique_users',
    observedDays: values.length,
    firstDate: compactToIso(firstDate),
    firstValue: roundMetric(firstValue),
    lastDate: compactToIso(lastDate),
    lastValue: roundMetric(lastValue),
    endpointDelta: roundMetric(lastValue - firstValue)
  };
}

function aggregateSummarySharing(sourceDocuments) {
  const rows = rowsWithDates(sourceDocuments, 'dailySummary');
  return {
    observedDays: new Set(rows.map((item) => item.date)).size,
    sharePv: sumField(rows, 'share_pv').value,
    shareUvPersonDays: sumField(rows, 'share_uv').value
  };
}

const PAGE_FIELDS = Object.freeze([
  'page_visit_pv',
  'page_visit_uv',
  'page_share_pv',
  'page_share_uv',
  'entrypage_pv',
  'exitpage_pv'
]);

function newPageAccumulator(pagePath) {
  const accumulator = { pagePath, weightedStayTime: 0, stayWeight: 0 };
  for (const field of PAGE_FIELDS) {
    accumulator[field] = 0;
    accumulator[`${field}_observations`] = 0;
  }
  return accumulator;
}

function addPageMetric(accumulator, field, value) {
  const parsed = toMetricNumber(value);
  if (parsed == null) return;
  accumulator[field] += parsed;
  accumulator[`${field}_observations`] += 1;
}

function pageMetric(accumulator, field) {
  return accumulator[`${field}_observations`] > 0 ? roundMetric(accumulator[field]) : null;
}

function publicPageRow(accumulator) {
  return {
    pagePath: accumulator.pagePath,
    visitPv: pageMetric(accumulator, 'page_visit_pv'),
    visitUvPersonDays: pageMetric(accumulator, 'page_visit_uv'),
    sharePv: pageMetric(accumulator, 'page_share_pv'),
    shareUvPersonDays: pageMetric(accumulator, 'page_share_uv'),
    entryPv: pageMetric(accumulator, 'entrypage_pv'),
    exitPv: pageMetric(accumulator, 'exitpage_pv'),
    weightedStayTimePerPageView: accumulator.stayWeight > 0
      ? roundMetric(accumulator.weightedStayTime / accumulator.stayWeight)
      : null
  };
}

function aggregatePages(sourceDocuments) {
  const byPath = new Map();
  const rows = uniqueListRows(sourceDocuments, {
    label: 'visitPage',
    logicalKey: (row) => row.page_path,
    normalizeRow: (row, date) => ({
      ...row,
      ref_date: date,
      page_path: normalizePagePath(row.page_path)
    })
  });
  for (const { row } of rows) {
    const pagePath = row.page_path;
    const accumulator = byPath.get(pagePath) || newPageAccumulator(pagePath);
    for (const field of PAGE_FIELDS) addPageMetric(accumulator, field, row[field]);
    const stayTime = toMetricNumber(row.page_staytime_pv);
    const visitPv = toMetricNumber(row.page_visit_pv);
    if (stayTime != null && visitPv != null && visitPv > 0) {
      accumulator.weightedStayTime += stayTime * visitPv;
      accumulator.stayWeight += visitPv;
    }
    byPath.set(pagePath, accumulator);
  }

  const pages = [...byPath.values()].map(publicPageRow).sort((left, right) => (
    (right.visitPv == null ? -1 : right.visitPv) - (left.visitPv == null ? -1 : left.visitPv) ||
    compareCodePoints(left.pagePath, right.pagePath)
  ));
  const total = newPageAccumulator('_all');
  for (const accumulator of byPath.values()) {
    for (const field of PAGE_FIELDS) {
      total[field] += accumulator[field];
      total[`${field}_observations`] += accumulator[`${field}_observations`];
    }
    total.weightedStayTime += accumulator.weightedStayTime;
    total.stayWeight += accumulator.stayWeight;
  }

  return {
    semantics: {
      routeVisitUvPersonDays: 'daily_page_visit_uv_summed_across_routes_and_days_not_global_unique_visitors',
      routeShareUvPersonDays: 'daily_page_share_uv_summed_across_routes_and_days'
    },
    observedResponseDays: new Set(rows.map((item) => item.date)).size,
    successfulEmptyDays: sourceDocuments.filter((document) => listRows(document).length === 0).length,
    observedRows: rows.length,
    totalVisitPv: pageMetric(total, 'page_visit_pv'),
    routeVisitUvPersonDays: pageMetric(total, 'page_visit_uv'),
    totalSharePv: pageMetric(total, 'page_share_pv'),
    routeShareUvPersonDays: pageMetric(total, 'page_share_uv'),
    weightedStayTimePerPageView: total.stayWeight > 0
      ? roundMetric(total.weightedStayTime / total.stayWeight)
      : null,
    topPages: pages.slice(0, 20)
  };
}

function safeDistributionKey(value) {
  const normalized = String(value == null ? '' : value).trim();
  return /^\d+$/.test(normalized) ? normalized : '_other';
}

function sortedCategoryRows(map) {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value: roundMetric(value) }))
    .sort((left, right) => {
      if (left.key === '_other') return right.key === '_other' ? 0 : 1;
      if (right.key === '_other') return -1;
      return Number(left.key) - Number(right.key);
    });
}

function normalizeDistributionRow(row, date) {
  const index = String(row.index == null ? '' : row.index);
  if (row.item_list != null && !Array.isArray(row.item_list)) {
    throw new Error(`visitDistribution item_list must be an array for ${date}`);
  }
  const byRawKey = new Map();
  for (const item of row.item_list || []) {
    if (!isPlainObject(item)) throw new Error(`visitDistribution item must be an object for ${date}`);
    const value = toMetricNumber(item.value);
    if (value == null) continue;
    const rawKey = String(item.key == null ? '' : item.key);
    const existing = byRawKey.get(rawKey);
    if (existing != null && existing !== value) {
      throw new Error(`conflicting visitDistribution item key for ${date} index ${index}`);
    }
    byRawKey.set(rawKey, value);
  }
  return {
    ref_date: date,
    index,
    item_list: [...byRawKey.entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, value]) => ({ key, value }))
  };
}

function aggregateAccessSources(sourceDocuments) {
  const sessionCounts = new Map();
  const visitUv = new Map();
  const observedDates = new Set();
  const rows = uniqueListRows(sourceDocuments, {
    label: 'visitDistribution',
    logicalKey: (row) => row.index,
    normalizeRow: normalizeDistributionRow
  });
  for (const { date, row } of rows) {
    let target = null;
    if (row.index === 'access_source_session_cnt') target = sessionCounts;
    if (row.index === 'access_source_visit_uv') target = visitUv;
    if (!target) continue;
    for (const item of row.item_list) {
      const key = safeDistributionKey(item.key);
      target.set(key, (target.get(key) || 0) + item.value);
      observedDates.add(date);
    }
  }
  return {
    observedResponses: observedDates.size,
    sessionCounts: sortedCategoryRows(sessionCounts),
    visitUvPersonDays: sortedCategoryRows(visitUv)
  };
}

function validatePayloadRefDate(document) {
  if (document.raw.ref_date == null || document.raw.ref_date === '') return;
  const actual = String(document.raw.ref_date);
  let expected = document.begin_date;
  if (document.type === 'weeklyRetain') expected = `${document.begin_date}-${document.end_date}`;
  if (document.type === 'monthlyRetain') expected = document.begin_date.slice(0, 6);
  if (actual !== expected) {
    throw new Error(`${document.type} ref_date does not match artifact range`);
  }
}

function offsetMap(rows, label) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = Number(row.key);
    const value = toMetricNumber(row.value);
    if (!Number.isInteger(key) || key < 0 || value == null) continue;
    if (map.has(key) && map.get(key) !== value) {
      throw new Error(`conflicting ${label} retention offset ${key}`);
    }
    map.set(key, value);
  }
  return map;
}

function aggregateRetentionCohort(sourceDocuments, rawField, offset) {
  let sourceCohorts = 0;
  let observedCohorts = 0;
  let denominator = 0;
  let retained = 0;
  for (const document of sourceDocuments) {
    const offsets = offsetMap(document.raw[rawField], `${document.type} ${rawField}`);
    if (!offsets.has(0)) continue;
    sourceCohorts += 1;
    if (!offsets.has(offset)) continue;
    observedCohorts += 1;
    denominator += offsets.get(0);
    retained += offsets.get(offset);
  }
  return {
    sourceCohorts,
    observedCohorts,
    missingOffsetCohorts: sourceCohorts - observedCohorts,
    denominator: observedCohorts ? roundMetric(denominator) : null,
    retained: observedCohorts ? roundMetric(retained) : null,
    rate: observedCohorts && denominator > 0 ? roundMetric(retained / denominator) : null
  };
}

function retentionMetric(sourceDocuments, offset) {
  return {
    newUsers: aggregateRetentionCohort(sourceDocuments, 'visit_uv_new', offset),
    allVisitors: aggregateRetentionCohort(sourceDocuments, 'visit_uv', offset)
  };
}

function aggregateRetention(dailyDocuments, weeklyDocuments, monthlyDocuments) {
  return {
    d1: retentionMetric(dailyDocuments, 1),
    w1: retentionMetric(weeklyDocuments, 1),
    w4: retentionMetric(weeklyDocuments, 4),
    m1: retentionMetric(monthlyDocuments, 1)
  };
}

function sanitizePortraitLabel(value) {
  const normalized = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 80);
  return normalized || '_unnamed';
}

function publicPortraitDimension(rows, threshold) {
  const grouped = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const value = toMetricNumber(row.value);
      if (value == null) continue;
      const label = sanitizePortraitLabel(row.name);
      grouped.set(label, (grouped.get(label) || 0) + value);
    }
  }
  const publishedBuckets = [];
  let suppressedBucketCount = 0;
  for (const [label, value] of grouped) {
    if (value < threshold) {
      suppressedBucketCount += 1;
      continue;
    }
    publishedBuckets.push({ label, value: roundMetric(value) });
  }
  publishedBuckets.sort((left, right) => right.value - left.value || compareCodePoints(left.label, right.label));
  return { publishedBuckets, suppressedBucketCount };
}

function protectPortraitCohortDifferencing(newUsers, allVisitors, threshold) {
  const output = {};
  for (const dimension of PORTRAIT_DIMENSIONS) {
    const allByLabel = new Map(
      allVisitors[dimension].publishedBuckets.map((bucket) => [bucket.label, bucket.value])
    );
    let additionallySuppressed = 0;
    const publishedBuckets = newUsers[dimension].publishedBuckets.filter((bucket) => {
      const allValue = allByLabel.get(bucket.label);
      const safe = (
        allValue != null &&
        allValue >= bucket.value &&
        allValue - bucket.value >= threshold
      );
      if (!safe) additionallySuppressed += 1;
      return safe;
    });
    output[dimension] = {
      publishedBuckets,
      suppressedBucketCount: newUsers[dimension].suppressedBucketCount + additionallySuppressed
    };
  }
  return output;
}

function aggregatePortrait(sourceDocuments, threshold) {
  if (!sourceDocuments.length) return null;
  const latest = sourceDocuments.slice().sort((left, right) => (
    compareCodePoints(right.begin_date, left.begin_date) || compareCodePoints(right.end_date, left.end_date)
  ))[0];

  function cohort(rawField) {
    const source = isPlainObject(latest.raw[rawField]) ? latest.raw[rawField] : {};
    const output = {};
    for (const dimension of PORTRAIT_DIMENSIONS) {
      output[dimension] = publicPortraitDimension(source[dimension], threshold);
    }
    return output;
  }

  const allVisitors = cohort('visit_uv');
  const newUsers = protectPortraitCohortDifferencing(
    cohort('visit_uv_new'),
    allVisitors,
    threshold
  );
  return {
    asOfDate: compactToIso(latest.begin_date),
    kAnonymityThreshold: threshold,
    differentialProtection: 'new_user_bucket_requires_all_visitor_minus_new_user_count_at_or_above_k',
    cohorts: {
      newUsers,
      allVisitors
    }
  };
}

function aggregateWindow(documents, cutoffDate, windowDays) {
  const startDate = windowStartDate(cutoffDate, windowDays);
  const startCompact = isoToCompact(startDate);
  const cutoffCompact = isoToCompact(cutoffDate);
  const summaryDocuments = documentsInWindow(documents, 'dailySummary', startCompact, cutoffCompact);
  const trafficDocuments = documentsInWindow(documents, 'dailyVisitTrend', startCompact, cutoffCompact);
  const pageDocuments = documentsInWindow(documents, 'visitPage', startCompact, cutoffCompact);
  const distributionDocuments = documentsInWindow(documents, 'visitDistribution', startCompact, cutoffCompact);
  const dailyRetention = documentsInWindow(documents, 'dailyRetain', startCompact, cutoffCompact);
  const weeklyRetention = documentsInWindow(documents, 'weeklyRetain', startCompact, cutoffCompact);
  const monthlyRetention = documentsInWindow(documents, 'monthlyRetain', startCompact, cutoffCompact);

  return {
    startDate,
    endDate: cutoffDate,
    traffic: aggregateTraffic(trafficDocuments),
    cumulativeUsers: aggregateCumulativeUsers(summaryDocuments),
    sharing: aggregateSummarySharing(summaryDocuments),
    pages: aggregatePages(pageDocuments),
    accessSources: aggregateAccessSources(distributionDocuments),
    retention: aggregateRetention(dailyRetention, weeklyRetention, monthlyRetention)
  };
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function manifestTabularRowCount(document) {
  const candidates = [];
  if (Array.isArray(document.raw.list)) candidates.push(document.raw.list);
  for (const value of Object.values(document.raw)) {
    if (Array.isArray(value) && value !== document.raw.list) candidates.push(value);
  }
  const rows = candidates.find((items) => (
    items.length > 0 && items.every((item) => isPlainObject(item))
  ));
  return rows ? rows.length : 0;
}

function countJobsByType(jobs) {
  const counts = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
  for (const job of jobs) counts[job.type] += 1;
  return counts;
}

function manifestSummary(manifest, documents, expectedStartDate, cutoffDate) {
  const source = isPlainObject(manifest) ? manifest : {};
  const totalJobs = numericManifestField(source.totalJobs);
  const successfulRequests = numericManifestField(source.succeeded);
  const failedRequests = numericManifestField(source.failed);
  const expectedJobs = buildExpectedJobs(expectedStartDate, cutoffDate);
  const expectedJobKeys = new Set(expectedJobs.map(jobKey));
  const expectedByType = countJobsByType(expectedJobs);
  const documentByKey = new Map(documents.map((document) => [jobKey(document), document]));
  const artifactKeys = new Set(documentByKey.keys());
  const manifestByType = isPlainObject(source.byType) ? source.byType : {};
  const declaredTypes = Object.keys(manifestByType);
  const allRequiredSourcesDeclared = (
    declaredTypes.length === SOURCE_TYPES.length &&
    SOURCE_TYPES.every((type) => isPlainObject(manifestByType[type])) &&
    declaredTypes.every((type) => SOURCE_TYPE_SET.has(type))
  );
  const byTypeCountsMatchExpected = allRequiredSourcesDeclared && SOURCE_TYPES.every((type) => {
    const declared = manifestByType[type];
    return (
      numericManifestField(declared.requested) === expectedByType[type] &&
      numericManifestField(declared.succeeded) === expectedByType[type] &&
      numericManifestField(declared.failed) === 0
    );
  });

  const results = Array.isArray(source.results) ? source.results : [];
  const resultKeys = new Set();
  const returnedRowsByType = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
  let resultEntriesValid = Array.isArray(source.results);
  let duplicateResultKeys = false;
  let resultFileMappingsValid = Array.isArray(source.results);
  let resultRowCountsMatchArtifacts = Array.isArray(source.results);
  for (const result of results) {
    if (!isPlainObject(result)) {
      resultEntriesValid = false;
      resultFileMappingsValid = false;
      resultRowCountsMatchArtifacts = false;
      continue;
    }
    const type = String(result.type || '');
    const beginDate = String(result.begin_date || '');
    const endDate = String(result.end_date || '');
    const validMetadata = (
      SOURCE_TYPE_SET.has(type) &&
      /^\d{8}$/.test(beginDate) &&
      /^\d{8}$/.test(endDate) &&
      beginDate <= endDate &&
      result.ok === true
    );
    if (!validMetadata) resultEntriesValid = false;
    const key = `${type}:${beginDate}:${endDate}`;
    if (resultKeys.has(key)) duplicateResultKeys = true;
    resultKeys.add(key);

    const baseName = `${type}-${beginDate}-${endDate}`;
    const rowCount = numericManifestField(result.rowCount);
    if (
      result.jsonFile !== `${baseName}.json` ||
      rowCount == null ||
      (rowCount > 0 ? result.csvFile !== `${baseName}.csv` : result.csvFile !== '')
    ) {
      resultFileMappingsValid = false;
    }

    const matchingDocument = documentByKey.get(key);
    if (!matchingDocument || rowCount == null || rowCount !== manifestTabularRowCount(matchingDocument)) {
      resultRowCountsMatchArtifacts = false;
    }
    if (SOURCE_TYPE_SET.has(type) && rowCount != null) returnedRowsByType[type] += rowCount;
  }

  const declaredReturnedRowsMatchResults = allRequiredSourcesDeclared && SOURCE_TYPES.every((type) => (
    numericManifestField(manifestByType[type].returnedRows) === returnedRowsByType[type]
  ));
  const artifactsMatchExpectedJobs = setsEqual(artifactKeys, expectedJobKeys);
  const resultsMatchExpectedJobs = (
    resultEntriesValid &&
    !duplicateResultKeys &&
    setsEqual(resultKeys, expectedJobKeys)
  );
  const resultsMatchArtifacts = (
    resultEntriesValid &&
    !duplicateResultKeys &&
    setsEqual(resultKeys, artifactKeys)
  );
  const cutoffMatches = source.cutoffDate === cutoffDate;
  const requestedStartMatches = source.requestedStartDate === expectedStartDate;
  const totalBalances = totalJobs == null || successfulRequests == null || failedRequests == null
    ? null
    : totalJobs === successfulRequests + failedRequests;
  const successesMatchArtifacts = successfulRequests == null
    ? null
    : successfulRequests === documents.length;
  const topLevelCountsMatchExpected = (
    totalJobs === expectedJobs.length &&
    successfulRequests === expectedJobs.length &&
    failedRequests === 0
  );
  const tokenPersisted = typeof source.tokenPersisted === 'boolean' ? source.tokenPersisted : null;
  const remoteWritesExecuted = typeof source.remoteWritesExecuted === 'boolean'
    ? source.remoteWritesExecuted
    : null;
  const readOnlyContractSatisfied = tokenPersisted === false && remoteWritesExecuted === false;
  const exactJobMatrix = (
    cutoffMatches &&
    requestedStartMatches &&
    topLevelCountsMatchExpected &&
    allRequiredSourcesDeclared &&
    byTypeCountsMatchExpected &&
    artifactsMatchExpectedJobs &&
    resultsMatchExpectedJobs &&
    resultsMatchArtifacts &&
    resultFileMappingsValid &&
    resultRowCountsMatchArtifacts &&
    declaredReturnedRowsMatchResults
  );

  return {
    totalJobs,
    successfulRequests,
    failedRequests,
    totalBalances,
    successesMatchArtifacts,
    expectedStartDate,
    expectedJobCount: expectedJobs.length,
    cutoffMatches,
    requestedStartMatches,
    allRequiredSourcesDeclared,
    byTypeCountsMatchExpected,
    artifactsMatchExpectedJobs,
    resultsMatchExpectedJobs,
    resultsMatchArtifacts,
    resultFileMappingsValid,
    resultRowCountsMatchArtifacts,
    declaredReturnedRowsMatchResults,
    exactJobMatrix,
    tokenPersisted,
    remoteWritesExecuted,
    readOnlyContractSatisfied
  };
}

function analyzeWeData(documents, {
  manifest = {},
  cutoffDate = DEFAULT_CUTOFF_DATE,
  windowDays = DEFAULT_WINDOW_DAYS,
  portraitKThreshold = DEFAULT_PORTRAIT_K_THRESHOLD
} = {}) {
  parseIsoDate(cutoffDate, 'cutoffDate');
  if (
    !Array.isArray(windowDays) ||
    !windowDays.length ||
    windowDays.some((days) => !Number.isInteger(days) || days < 1)
  ) {
    throw new Error('windowDays must contain positive integers');
  }
  if (!Number.isInteger(portraitKThreshold) || portraitKThreshold < 2) {
    throw new Error('portraitKThreshold must be an integer >= 2');
  }

  const cutoffCompact = isoToCompact(cutoffDate);
  const normalized = normalizeDocuments(documents, cutoffCompact);
  normalized.normalized.forEach(validatePayloadRefDate);
  const sources = buildSourceCoverage(normalized.normalized, manifest);
  const windows = {};
  for (const days of [...new Set(windowDays)].sort((left, right) => left - right)) {
    windows[`${days}d`] = aggregateWindow(normalized.normalized, cutoffDate, days);
  }
  const requestedSources = Object.values(sources).filter((source) => source.status !== 'not_requested');
  const expectedStartDate = windowStartDate(cutoffDate, Math.max(...windowDays));
  const normalizedManifest = manifestSummary(
    manifest,
    normalized.normalized,
    expectedStartDate,
    cutoffDate
  );
  const manifestConsistent = (
    normalizedManifest.totalBalances === true &&
    normalizedManifest.successesMatchArtifacts === true &&
    normalizedManifest.exactJobMatrix === true &&
    normalizedManifest.readOnlyContractSatisfied === true
  );
  const status = (
    requestedSources.length === SOURCE_TYPES.length &&
    requestedSources.every((source) => source.status === 'complete') &&
    manifestConsistent
  )
    ? 'complete'
    : 'partial';
  const canonicalDocuments = normalized.normalized.map((document) => ({
    type: document.type,
    begin_date: document.begin_date,
    end_date: document.end_date,
    raw: document.raw
  }));

  return {
    schemaVersion: 3,
    status,
    cutoffDate,
    sources,
    windows,
    portrait: aggregatePortrait(
      normalized.normalized.filter((document) => document.type === 'userPortrait'),
      portraitKThreshold
    ),
    provenance: {
      inputArtifactCount: documents.length,
      uniqueArtifactCount: normalized.normalized.length,
      duplicateArtifacts: normalized.duplicateArtifacts,
      canonicalInputSha256: sha256(canonicalJson(canonicalDocuments)),
      manifest: normalizedManifest
    },
    privacy: {
      routeQueryAndFragmentOmitted: true,
      geographicDimensionsOmitted: true,
      directUserIdentifiersIncluded: false,
      portraitSmallBucketsSuppressed: true,
      portraitOverlappingCohortDifferencingProtected: true,
      portraitLimitation: 'new-user buckets are suppressed unless the derived returning-user count also meets k',
      containsSecrets: false
    }
  };
}

async function readJson(filePath, label) {
  let content;
  try {
    content = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error && error.code ? error.code : 'unknown error'}`);
  }
  try {
    return JSON.parse(content);
  } catch (_) {
    throw new Error(`invalid JSON in ${label}`);
  }
}

async function loadWeDataDirectory(inputDirectory) {
  const absoluteDirectory = path.resolve(inputDirectory);
  const names = (await fsp.readdir(absoluteDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (!names.includes('fetch-manifest.json')) {
    throw new Error('fetch-manifest.json is missing from We analysis input');
  }

  const manifest = await readJson(path.join(absoluteDirectory, 'fetch-manifest.json'), 'fetch-manifest.json');
  const documents = [];
  const artifactPattern = /^([A-Za-z]+)-(\d{8})-(\d{8})\.json$/;
  for (const name of names) {
    const match = name.match(artifactPattern);
    if (!match) continue;
    const [, fileType, fileBeginDate, fileEndDate] = match;
    if (!SOURCE_TYPE_SET.has(fileType)) continue;
    const document = await readJson(path.join(absoluteDirectory, name), name);
    if (
      document.type !== fileType ||
      String(document.begin_date) !== fileBeginDate ||
      String(document.end_date) !== fileEndDate
    ) {
      throw new Error(`artifact metadata does not match filename: ${name}`);
    }
    documents.push(document);
  }
  return { documents, manifest };
}

module.exports = {
  DEFAULT_CUTOFF_DATE,
  DEFAULT_PORTRAIT_K_THRESHOLD,
  SOURCE_TYPES,
  analyzeWeData,
  canonicalJson,
  loadWeDataDirectory,
  normalizePagePath,
  windowStartDate
};
