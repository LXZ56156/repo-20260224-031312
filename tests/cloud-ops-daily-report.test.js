'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildReport, windowBounds, queryPlan, main } = require('../scripts/cloud-ops-daily-report');

const window = { start: '2026-10-03 00:00:00', end: '2026-10-03 23:59:59', timeZone: 'Asia/Shanghai' };
function response(rows, extra = {}) {
  return { data: { results: rows, analysisRecords: [] }, meta: {
    startTime: window.start, endTime: window.end, queryString: 'function_name:*',
    listOver: true, context: '', returnCount: rows.length, ...extra
  } };
}
function row(id, extra = {}) {
  return { timestamp: '2026-10-03 10:00:00.000', content: {
    function_name: 'startTournament', request_id: id, src: 'system', retry_num: '0',
    status_code: '200', duration: '100', status_msg: '', ...extra
  } };
}
function source(rows, extra = {}) {
  return { name: 'sample', kind: 'raw', pages: [{ inputContext: '', response: response(rows) }], ...extra };
}

test('deduplicates requests, preserves business failure on platform200 and separates probes', () => {
  const failed = row('business-failed', { status_msg: JSON.stringify({ ok: false, code: 'START_TIMEOUT', traceId: 't1', appVersion: '6.1.2' }) });
  const rows = [failed, failed, row('hard-failed', { status_code: '433', status_msg: 'Task timed out after 10 seconds', duration: '10000' }),
    row('unknown'), row('ok', { status_msg: JSON.stringify({ ok: true, code: 'STARTED' }) }),
    row('smoke', { status_msg: JSON.stringify({ ok: false, code: 'TOURNAMENT_ID_REQUIRED' }) }),
    row('middle', { status_code: '202' }), row('retry', { retry_num: '1' })];
  const report = buildReport(window, [source(rows)]);
  assert.equal(report.complete, true);
  assert.deepEqual(Object.assign({}, report.functions.startTournament), {
    requests: 4, platformSuccess: 3, platformFailure: 1, platformConflict: 0,
    businessSuccess: 1, businessFailure: 1, businessUnknown: 2, businessConflict: 0,
    hardTimeout: 1, missingTrace: 3, missingVersion: 3, platformFailureRate: 0.25,
    requestP95Ms: 10000, durationCoverage: 4
  });
  assert.equal(report.missingParameterProbeCandidates.length, 1);
  assert.equal(report.anomalies.length, 2);
  assert.equal(report.coverage.appOnlyRequests, 1);
  assert.equal(report.coverage.filteredRows, 1);
  const algorithmTimeout = buildReport(window, [source([row('algorithm-timeout', { status_code: '430', status_msg: '排阵超时' })])]);
  assert.equal(algorithmTimeout.functions.startTournament.hardTimeout, 0);
});

test('correlates app failure by request ID without inferring success from committed/returned', () => {
  const report = buildReport(window, [source([
    row('a'), row('a', { src: 'app', status_code: '202', log: '[timing] {"phase":"failed","code":"START_TIMEOUT","traceId":"trace_a","tournamentId":"private-name"}' }),
    row('b'), row('b', { src: 'app', log: '[timing] {"phase":"committed","traceId":"trace_b"}' })
  ])]);
  assert.equal(report.functions.startTournament.businessFailure, 1);
  assert.equal(report.functions.startTournament.businessUnknown, 1);
  assert.equal(report.functions.startTournament.missingTrace, 0);
  assert.ok(!JSON.stringify(report).includes('private-name'));
});

test('requires complete pagination chain and excludes unproven full-window rates', () => {
  const first = { inputContext: '', response: response([row('a')], { listOver: false, context: 'cursor-a' }) };
  const truncated = buildReport(window, [source([], { pages: [first] })]);
  assert.equal(truncated.complete, false);
  assert.equal(truncated.functions.startTournament.platformFailureRate, null);
  const second = { inputContext: 'cursor-a', response: response([row('a'), row('b')]) };
  const full = buildReport(window, [source([], { pages: [first, second] })]);
  assert.equal(full.complete, true);
  assert.equal(full.functions.startTournament.requests, 2);
  second.inputContext = 'wrong-cursor';
  assert.equal(buildReport(window, [source([], { pages: [first, second] })]).complete, false);
  const subset = source([row('one-failure', { status_code: '433' })]);
  subset.pages[0].response.meta.queryString = 'function_name:* AND status_code:433';
  assert.equal(buildReport(window, [subset]).functions.startTournament.platformFailureRate, null);
});

test('rejects mixed window and reports missing metadata/request identity/contradictions', () => {
  const mixed = response([]); mixed.meta.startTime = '2026-10-02 00:00:00';
  assert.throws(() => buildReport(window, [source([], { pages: [{ inputContext: '', response: mixed }] })]), /mixed window/);
  const incomplete = buildReport(window, [source([row(''), row('a'), row('a', { status_code: '433' })])]);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.functions.startTournament.platformConflict, 1);
  assert.equal(incomplete.functions.startTournament.platformFailureRate, null);
  assert.equal(buildReport(window, [source([], { pages: [{ response: { error: 'failed' } }] })]).complete, false);
  assert.throws(() => windowBounds({ ...window, timeZone: 'UTC' }), /Asia\/Shanghai/);
  assert.throws(() => windowBounds({ ...window, start: '2026-02-30 00:00:00' }), /invalid window date/);
});

test('aggregate distinct groups keep smoke separate but do not claim a reconstructed total', () => {
  const aggregate = response([], { queryString: 'function_name:startTournament | select status_code,status_msg,count(distinct request_id) as invocations group by status_code,status_msg limit 100' });
  aggregate.data.analysisRecords = [{ status_code: 200, status_msg: '{"ok":false,"code":"TOURNAMENT_ID_REQUIRED"}', invocations: 1 }];
  const report = buildReport(window, [{ name: 'post-deploy', kind: 'aggregate', functionName: 'startTournament', pages: [{ inputContext: '', response: aggregate }] }]);
  assert.equal(report.complete, true);
  assert.equal(report.requestReconstruction, 'unavailable-aggregate-only');
  assert.deepEqual(report.functions, {});
  assert.equal(report.aggregateGroups[0].missingParameterProbeCandidate, true);
  assert.equal(report.aggregateGroups[0].business, 'failure');
  assert.equal(report.aggregateGroups[0].missingTrace, true);
  assert.equal(report.aggregateGroups[0].missingVersion, true);
  assert.equal(report.aggregateGroups[0].requestAssociation, 'unavailable-aggregate-group');
  aggregate.meta.queryString = aggregate.meta.queryString.replace('limit 100', 'limit 1');
  assert.equal(buildReport(window, [{ name: 'limited', kind: 'aggregate', pages: [{ inputContext: '', response: aggregate }] }]).complete, false);
});

test('offline manifest reads only named files and refuses output overwrite', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'badminton-ops-report-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'input.json');
  await fs.writeFile(path.join(root, 'page.json'), JSON.stringify(response([row('ok')])));
  await fs.writeFile(path.join(root, 'old.json'), 'invalid unrelated file');
  await fs.writeFile(manifest, JSON.stringify({ window, sources: [{ name: 'named', kind: 'raw', files: [{ file: 'page.json', inputContext: '' }] }] }));
  const target = path.join(root, 'new-report');
  assert.equal((await main(['--manifest', manifest, '--output', target])).complete, true);
  const before = await fs.readFile(path.join(target, 'report.json'), 'utf8');
  await assert.rejects(main(['--manifest', manifest, '--output', target]), { code: 'EEXIST' });
  assert.equal(await fs.readFile(path.join(target, 'report.json'), 'utf8'), before);
  await assert.rejects(main(['--live']), /unknown/);
  const plan = queryPlan(window);
  assert.equal(plan.command, 'logs search');
  assert.ok(Object.values(plan.queries).every((query) => query.startsWith('function_name:')));
  assert.ok(!JSON.stringify(plan).includes('callFunction'));
});
