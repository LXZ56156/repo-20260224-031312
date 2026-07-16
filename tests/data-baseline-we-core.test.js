const test = require('node:test');
const assert = require('node:assert/strict');

const weBaseline = require('../scripts/analysis/data-baseline-we-core');

function document(type, date, raw, fetchedAt = '2026-07-16T01:02:03.000Z') {
  return {
    type,
    begin_date: date,
    end_date: date,
    fetched_at: fetchedAt,
    raw
  };
}

function manifest(byType) {
  const normalized = {};
  let totalJobs = 0;
  for (const [type, requested] of Object.entries(byType)) {
    normalized[type] = {
      requested,
      succeeded: requested,
      failed: 0,
      returnedRows: 0
    };
    totalJobs += requested;
  }
  return {
    schemaVersion: 1,
    totalJobs,
    succeeded: totalJobs,
    failed: 0,
    tokenPersisted: false,
    remoteWritesExecuted: false,
    byType: normalized
  };
}

function rangeDocument(type, beginDate, endDate, raw, fetchedAt = '2026-07-16T01:02:03.000Z') {
  return {
    type,
    begin_date: beginDate,
    end_date: endDate,
    fetched_at: fetchedAt,
    raw
  };
}

function compactDate(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function completeJobMatrix(startDate = '2026-01-17', cutoffDate = '2026-07-15') {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const cutoff = new Date(`${cutoffDate}T00:00:00.000Z`);
  const dailyTypes = [
    'dailySummary',
    'dailyVisitTrend',
    'visitPage',
    'visitDistribution',
    'dailyRetain'
  ];
  const jobs = [];

  for (let day = start; day <= cutoff; day = addUtcDays(day, 1)) {
    const compact = compactDate(day);
    for (const type of dailyTypes) jobs.push({ type, begin_date: compact, end_date: compact });
  }

  let monday = new Date(start);
  while (monday.getUTCDay() !== 1) monday = addUtcDays(monday, 1);
  for (; addUtcDays(monday, 6) <= cutoff; monday = addUtcDays(monday, 7)) {
    jobs.push({
      type: 'weeklyRetain',
      begin_date: compactDate(monday),
      end_date: compactDate(addUtcDays(monday, 6))
    });
  }

  let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (month < start) month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  for (;;) {
    const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const monthEnd = addUtcDays(nextMonth, -1);
    if (monthEnd > cutoff) break;
    jobs.push({
      type: 'monthlyRetain',
      begin_date: compactDate(month),
      end_date: compactDate(monthEnd)
    });
    month = nextMonth;
  }

  const cutoffCompact = cutoffDate.replaceAll('-', '');
  jobs.push({ type: 'userPortrait', begin_date: cutoffCompact, end_date: cutoffCompact });
  return jobs;
}

function emptyRawForJob(job) {
  if (job.type === 'dailyRetain') {
    return { ref_date: job.begin_date, visit_uv_new: [], visit_uv: [] };
  }
  if (job.type === 'weeklyRetain') {
    return { ref_date: `${job.begin_date}-${job.end_date}`, visit_uv_new: [], visit_uv: [] };
  }
  if (job.type === 'monthlyRetain') {
    return { ref_date: job.begin_date.slice(0, 6), visit_uv_new: [], visit_uv: [] };
  }
  if (job.type === 'userPortrait') {
    return { ref_date: job.begin_date, visit_uv_new: {}, visit_uv: {} };
  }
  return { list: [] };
}

function completeFixture() {
  const jobs = completeJobMatrix();
  const documents = jobs.map((job) => rangeDocument(
    job.type,
    job.begin_date,
    job.end_date,
    emptyRawForJob(job)
  ));
  const byType = {};
  const results = jobs.map((job) => {
    byType[job.type] ||= { requested: 0, succeeded: 0, failed: 0, returnedRows: 0 };
    byType[job.type].requested += 1;
    byType[job.type].succeeded += 1;
    const baseName = `${job.type}-${job.begin_date}-${job.end_date}`;
    return {
      ...job,
      ok: true,
      rowCount: 0,
      jsonFile: `${baseName}.json`,
      csvFile: ''
    };
  });
  return {
    documents,
    manifest: {
      schemaVersion: 1,
      cutoffDate: '2026-07-15',
      requestedStartDate: '2026-01-17',
      totalJobs: jobs.length,
      succeeded: jobs.length,
      failed: 0,
      byType,
      results,
      tokenPersisted: false,
      remoteWritesExecuted: false
    }
  };
}

test('page paths lose query and fragment data before aggregation', () => {
  assert.equal(
    weBaseline.normalizePagePath(' /pages/tournament/detail?id=user_123#score '),
    'pages/tournament/detail'
  );
  assert.equal(weBaseline.normalizePagePath('pages/../secret?token=value'), '_redacted_route');

  const result = weBaseline.analyzeWeData([
    document('visitPage', '20260715', {
      list: [{
        page_path: 'pages/home/home?openid=private#x',
        page_visit_pv: 3,
        page_visit_uv: 2,
        page_share_pv: 1,
        page_share_uv: 1,
        page_staytime_pv: 4
      }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitPage: 1 })
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.windows['90d'].pages.topPages[0].pagePath, 'pages/home/home');
  assert.equal(result.windows['90d'].pages.routeVisitUvPersonDays, 2);
  assert.equal('totalVisitUvPersonDays' in result.windows['90d'].pages, false);
  assert.match(result.windows['90d'].pages.semantics.routeVisitUvPersonDays, /across_routes/);
  assert.doesNotMatch(serialized, /openid|private/);
});

test('successful empty responses stay distinct from observed metric zeros', () => {
  const result = weBaseline.analyzeWeData([
    document('dailyVisitTrend', '20260714', { list: [] }),
    document('dailyVisitTrend', '20260715', {
      list: [{
        ref_date: '20260715',
        visit_uv: 0,
        visit_pv: 0,
        visit_uv_new: 0,
        session_cnt: 0,
        stay_time_uv: 0,
        stay_time_session: 0,
        visit_depth: 0
      }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyVisitTrend: 2 })
  });

  assert.equal(result.sources.dailyVisitTrend.successfulEmptyResponses, 1);
  assert.equal(result.sources.dailyVisitTrend.nonEmptyResponses, 1);
  assert.equal(result.windows['90d'].traffic.observedDays, 1);
  assert.equal(result.windows['90d'].traffic.visitUvPersonDays, 0);
  assert.equal(result.windows['90d'].traffic.visitUvNewPersonDays, 0);
  assert.equal(result.windows['90d'].traffic.newUserUvPersonDayRatio, null);
  assert.equal(
    result.windows['90d'].traffic.semantics.visitUvPersonDays,
    'daily_uv_person_days_sum_not_window_unique_users'
  );
});

test('retention only uses cohorts that contain the requested offset', () => {
  const result = weBaseline.analyzeWeData([
    document('dailyRetain', '20260713', {
      visit_uv_new: [{ key: 0, value: 10 }, { key: 1, value: 4 }],
      visit_uv: [{ key: 0, value: 20 }, { key: 1, value: 6 }]
    }),
    document('dailyRetain', '20260715', {
      visit_uv_new: [{ key: 0, value: 100 }],
      visit_uv: [{ key: 0, value: 200 }]
    }),
    document('weeklyRetain', '20260601', {
      visit_uv_new: [{ key: 0, value: 8 }, { key: 1, value: 2 }, { key: 4, value: 1 }],
      visit_uv: [{ key: 0, value: 16 }, { key: 1, value: 4 }, { key: 4, value: 2 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyRetain: 2, weeklyRetain: 1 })
  });

  const retention = result.windows['90d'].retention;
  assert.deepEqual(retention.d1.newUsers, {
    sourceCohorts: 2,
    observedCohorts: 1,
    missingOffsetCohorts: 1,
    denominator: 10,
    retained: 4,
    rate: 0.4
  });
  assert.equal(retention.w1.newUsers.rate, 0.25);
  assert.equal(retention.w4.newUsers.rate, 0.125);
});

test('public portrait excludes geography and suppresses small buckets', () => {
  const result = weBaseline.analyzeWeData([
    document('userPortrait', '20260715', {
      ref_date: '20260715',
      visit_uv_new: {
        province: [{ name: 'Sensitive Province', value: 99 }],
        city: [{ name: 'Sensitive City', value: 88 }],
        genders: [
          { id: 1, name: 'male', value: 8 },
          { id: 2, name: 'small-secret', value: 2 }
        ],
        platforms: [{ id: 1, name: 'iOS', value: 7 }],
        devices: [{ name: 'Device A', value: 5 }],
        ages: [{ id: 2, name: '25-29', value: 6 }]
      },
      visit_uv: {
        province: [{ name: 'Another Province', value: 100 }],
        city: [{ name: 'Another City', value: 100 }],
        genders: [{ id: 1, name: 'male', value: 10 }],
        platforms: [{ id: 1, name: 'iOS', value: 10 }],
        devices: [{ name: 'Device A', value: 10 }],
        ages: [{ id: 2, name: '25-29', value: 10 }]
      }
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ userPortrait: 1 }),
    portraitKThreshold: 5
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Province|City|small-secret|province|city/);
  assert.equal(result.portrait.cohorts.newUsers.genders.publishedBuckets.length, 0);
  assert.equal(result.portrait.cohorts.newUsers.genders.suppressedBucketCount, 2);
  assert.equal(result.portrait.cohorts.allVisitors.genders.publishedBuckets.length, 1);
  assert.equal('suppressedValue' in result.portrait.cohorts.newUsers.genders, false);
});

test('daily summary treats visit_total as a cumulative endpoint value', () => {
  const result = weBaseline.analyzeWeData([
    document('dailySummary', '20260714', {
      list: [{ ref_date: '20260714', visit_total: 100, share_pv: 1, share_uv: 1 }]
    }),
    document('dailySummary', '20260715', {
      list: [{ ref_date: '20260715', visit_total: 103, share_pv: 2, share_uv: 1 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailySummary: 2 })
  });

  assert.deepEqual(result.windows['90d'].cumulativeUsers, {
    semantics: 'cumulative_endpoint_not_window_unique_users',
    observedDays: 2,
    firstDate: '2026-07-14',
    firstValue: 100,
    lastDate: '2026-07-15',
    lastValue: 103,
    endpointDelta: 3
  });
  assert.notEqual(result.windows['90d'].cumulativeUsers.lastValue, 203);
});

test('analysis is deterministic across document order and fetched_at changes', () => {
  const documents = [
    document('dailySummary', '20260715', {
      list: [{ ref_date: '20260715', visit_total: 12, share_pv: 2, share_uv: 1 }]
    }),
    document('dailyVisitTrend', '20260715', {
      list: [{
        ref_date: '20260715',
        visit_uv: 3,
        visit_pv: 5,
        visit_uv_new: 1,
        session_cnt: 4,
        stay_time_uv: 10,
        stay_time_session: 8,
        visit_depth: 2
      }]
    })
  ];
  const sourceManifest = manifest({ dailySummary: 1, dailyVisitTrend: 1 });
  const first = weBaseline.analyzeWeData(documents, {
    cutoffDate: '2026-07-15',
    manifest: sourceManifest
  });
  const second = weBaseline.analyzeWeData(documents.slice().reverse().map((item) => ({
    ...item,
    fetched_at: '2099-01-01T00:00:00.000Z'
  })), {
    cutoffDate: '2026-07-15',
    manifest: { ...sourceManifest, fetchedAt: '2099-01-01T00:00:00.000Z' }
  });

  assert.deepEqual(second, first);
});

test('conflicting duplicate artifacts fail closed', () => {
  assert.throws(() => weBaseline.analyzeWeData([
    document('dailySummary', '20260715', { list: [{ visit_total: 1 }] }),
    document('dailySummary', '20260715', { list: [{ visit_total: 2 }] })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailySummary: 1 })
  }), /conflicting duplicate/i);
});

test('access-source categories aggregate by fixed numeric key without raw labels', () => {
  const result = weBaseline.analyzeWeData([
    document('visitDistribution', '20260715', {
      list: [{
        index: 'access_source_session_cnt',
        item_list: [
          { key: 10, value: 3 },
          { key: 'unexpected-private-label', value: 4 }
        ]
      }, {
        index: 'access_source_visit_uv',
        item_list: [{ key: 10, value: 2 }]
      }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitDistribution: 1 })
  });

  assert.deepEqual(result.windows['90d'].accessSources.sessionCounts, [
    { key: '10', value: 3 },
    { key: '_other', value: 4 }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /unexpected-private-label/);
});

test('manifest count mismatch makes an otherwise complete source partial', () => {
  const sourceManifest = manifest({ dailySummary: 1 });
  sourceManifest.totalJobs = 2;
  const result = weBaseline.analyzeWeData([
    document('dailySummary', '20260715', { list: [] })
  ], {
    cutoffDate: '2026-07-15',
    manifest: sourceManifest
  });

  assert.equal(result.sources.dailySummary.status, 'complete');
  assert.equal(result.status, 'partial');
  assert.equal(result.provenance.manifest.totalBalances, false);
  assert.equal(result.provenance.manifest.successesMatchArtifacts, true);
});

test('identical logical daily rows are deduplicated across overlapping artifacts', () => {
  const row = {
    ref_date: '20260715',
    visit_uv: 3,
    visit_pv: 5,
    visit_uv_new: 1,
    session_cnt: 4
  };
  const result = weBaseline.analyzeWeData([
    rangeDocument('dailyVisitTrend', '20260714', '20260715', { list: [row] }),
    document('dailyVisitTrend', '20260715', { list: [row] })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyVisitTrend: 2 })
  });

  assert.equal(result.windows['90d'].traffic.observedDays, 1);
  assert.equal(result.windows['90d'].traffic.visitUvPersonDays, 3);
  assert.equal(result.windows['90d'].traffic.visitPv, 5);
});

test('conflicting logical rows and out-of-range ref_date fail closed', () => {
  assert.throws(() => weBaseline.analyzeWeData([
    rangeDocument('dailyVisitTrend', '20260714', '20260715', {
      list: [{ ref_date: '20260715', visit_uv: 3 }]
    }),
    document('dailyVisitTrend', '20260715', {
      list: [{ ref_date: '20260715', visit_uv: 4 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyVisitTrend: 2 })
  }), /conflicting dailyVisitTrend logical row/i);

  assert.throws(() => weBaseline.analyzeWeData([
    document('dailyVisitTrend', '20260715', {
      list: [{ ref_date: '20990101', visit_uv: 9 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyVisitTrend: 1 })
  }), /outside artifact range/i);
});

test('page routes and distribution index keys deduplicate identical logical metrics', () => {
  const pages = weBaseline.analyzeWeData([
    document('visitPage', '20260715', {
      list: [{ page_path: 'pages/home/index?a=1', page_visit_pv: 4, page_visit_uv: 2 }]
    }),
    rangeDocument('visitPage', '20260714', '20260715', {
      list: [{ ref_date: '20260715', page_path: 'pages/home/index?a=2', page_visit_pv: 4, page_visit_uv: 2 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitPage: 2 })
  });
  assert.equal(pages.windows['90d'].pages.totalVisitPv, 4);
  assert.equal(pages.windows['90d'].pages.routeVisitUvPersonDays, 2);

  const distribution = weBaseline.analyzeWeData([
    document('visitDistribution', '20260715', {
      list: [{ index: 'access_source_session_cnt', item_list: [{ key: 3, value: 7 }] }]
    }),
    rangeDocument('visitDistribution', '20260714', '20260715', {
      list: [{
        ref_date: '20260715',
        index: 'access_source_session_cnt',
        item_list: [{ key: 3, value: 7 }]
      }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitDistribution: 2 })
  });
  assert.deepEqual(distribution.windows['90d'].accessSources.sessionCounts, [{ key: '3', value: 7 }]);

  assert.throws(() => weBaseline.analyzeWeData([
    document('visitPage', '20260715', {
      list: [{ page_path: 'pages/home/index?a=1', page_visit_pv: 4 }]
    }),
    rangeDocument('visitPage', '20260714', '20260715', {
      list: [{ ref_date: '20260715', page_path: 'pages/home/index?a=2', page_visit_pv: 5 }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitPage: 2 })
  }), /conflicting visitPage logical row/i);

  assert.throws(() => weBaseline.analyzeWeData([
    document('visitDistribution', '20260715', {
      list: [{ index: 'access_source_session_cnt', item_list: [{ key: 3, value: 7 }] }]
    }),
    rangeDocument('visitDistribution', '20260714', '20260715', {
      list: [{
        ref_date: '20260715',
        index: 'access_source_session_cnt',
        item_list: [{ key: 3, value: 8 }]
      }]
    })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ visitDistribution: 2 })
  }), /conflicting visitDistribution logical row/i);
});

test('overall complete requires the exact eight-source job matrix and result-file mapping', () => {
  const fixture = completeFixture();
  const complete = weBaseline.analyzeWeData(fixture.documents, {
    cutoffDate: '2026-07-15',
    manifest: fixture.manifest
  });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.provenance.manifest.exactJobMatrix, true);
  assert.equal(complete.provenance.manifest.resultsMatchArtifacts, true);
  assert.equal(complete.provenance.manifest.resultFileMappingsValid, true);

  const wrongFileManifest = JSON.parse(JSON.stringify(fixture.manifest));
  wrongFileManifest.results[0].jsonFile = 'stale-artifact.json';
  const wrongFile = weBaseline.analyzeWeData(fixture.documents, {
    cutoffDate: '2026-07-15',
    manifest: wrongFileManifest
  });
  assert.equal(wrongFile.status, 'partial');
  assert.equal(wrongFile.provenance.manifest.resultFileMappingsValid, false);

  const oneSource = weBaseline.analyzeWeData([
    document('dailyVisitTrend', '20260715', { list: [] })
  ], {
    cutoffDate: '2026-07-15',
    manifest: manifest({ dailyVisitTrend: 1 })
  });
  assert.equal(oneSource.status, 'partial');
  assert.equal(oneSource.provenance.manifest.exactJobMatrix, false);
});
