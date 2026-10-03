'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildReport, writeReport } = require('../scripts/we-analysis-report');

async function fixture(t, wrappers, errors = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'we-report-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const results = [];
  const files = [];
  for (const w of wrappers) {
    const file = `${w.type}-${w.begin_date}-${w.end_date}.json`;
    await fs.writeFile(path.join(dir, file), JSON.stringify(w));
    results.push({ type: w.type, begin_date: w.begin_date, end_date: w.end_date, ok: true });
    files.push(path.join(dir, file));
  }
  const manifestPath = path.join(dir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ results: [...results, ...errors] }));
  return { dir, files, manifestPath, begin: '20260901', endExclusive: '20260904', latestComplete: '20260903' };
}
const wrapper = (type, date, raw) => ({ type, begin_date: date, end_date: date, raw });
const visit = (date, extra = {}) => wrapper('dailyVisitTrend', date, { list: [{ ref_date: date, visit_pv: 10, visit_uv: 2, visit_uv_new: 1, session_cnt: 4, stay_time_uv: 8, stay_time_session: 4, visit_depth: 2, ...extra }] });
const retain = (date, denominator, target) => wrapper('dailyRetain', date, { ref_date: date, visit_uv_new: [{ key: 0, value: denominator }, ...target], visit_uv: [] });

test('manifest ignores unrelated files; UV/session/page means use their actual weights', async (t) => {
  const f = await fixture(t, [visit('20260901'), visit('20260902', { visit_uv: 6, session_cnt: 12, stay_time_uv: 16, stay_time_session: 8, visit_depth: 4 }),
    wrapper('visitPage', '20260901', { ref_date: '20260901', list: [{ page_path: 'pages/home/index', page_visit_pv: 1, page_visit_uv: 1, page_staytime_pv: 10, page_share_pv: 0 }] }),
    wrapper('visitPage', '20260902', { ref_date: '20260902', list: [{ page_path: 'pages/home/index', page_visit_pv: 3, page_visit_uv: 2, page_staytime_pv: 30, page_share_pv: 0 }] }),
    wrapper('dailySummary', '20260901', { list: [{ ref_date: '20260901', share_pv: 5, share_uv: 2 }] })]);
  await fs.writeFile(path.join(f.dir, 'dailyVisitTrend-legacy.json'), JSON.stringify(visit('20260901', { visit_pv: 99999 })));
  const r = await buildReport({ ...f, files: undefined });
  assert.equal(r.window.pv, 20);
  assert.equal(r.window.uvDays, 8);
  assert.equal(r.window.staySecPerDailyUser, 14);
  assert.equal(r.window.staySecPerSession, 7);
  assert.equal(r.window.depthPerSession, 3.5);
  assert.equal(r.window.pages[0].staySecPerPv, 25);
  assert.equal(r.window.pages[0].sharePv, 0);
  assert.equal(r.window.shares, 5);
  assert.equal(r.window.status, 'partial');
  assert.equal(r.window.evidence.pv.missingDays[0].date, '20260903');
  assert.equal(r.inputs.files.length, 5);
  assert.match(r.inputs.files[0].sha256, /^[a-f0-9]{64}$/);
});

test('mature retention requires both keys and uses pooled numerator/denominator', async (t) => {
  const f = await fixture(t, [retain('20260901', 10, [{ key: 1, value: 5 }, { key: 7, value: 9 }]), retain('20260902', 90, [{ key: 1, value: 9 }]), retain('20260903', 7, [{ key: 1, value: 0 }])]);
  const r = await buildReport({ ...f, manifestPath: undefined });
  const d1 = r.window.newRetention[0];
  assert.equal(d1.numerator, 14); assert.equal(d1.denominator, 100); assert.equal(d1.rate, 0.14);
  assert.equal(d1.matureCohorts, 2); assert.equal(d1.immature.length, 1);
  assert.equal(r.window.newRetention[1].rate, null);
  const missing = await buildReport({ ...f, manifestPath: undefined, latestComplete: '20260910' });
  assert.equal(missing.window.newRetention[1].matureCohorts, 1);
  assert.equal(missing.window.newRetention[1].missing.length, 2);
  assert.equal(missing.window.newRetention[1].rate, 0.9);
});

test('61503 and missing numeric fields stay unknown, never become zero', async (t) => {
  const f = await fixture(t, [visit('20260901', { visit_uv: null })], [{ type: 'dailyVisitTrend', begin_date: '20260902', end_date: '20260902', ok: false, code: 61503 }]);
  const r = await buildReport({ ...f, files: undefined, latestComplete: '20260901' });
  assert.equal(r.window.uvDays, null);
  assert.equal(r.window.evidence.uvDays.missingDays.length, 3);
  assert.equal(r.window.evidence.pv.missingDays[0].reason, 'not_complete');
  assert.equal(r.inputs.attempts.find(x => x.code === 61503).resolved, false);
});

test('resolved retry is accepted, duplicate successful requests fail', async (t) => {
  const f = await fixture(t, [visit('20260901')]);
  const success = { type: 'dailyVisitTrend', begin_date: '20260901', end_date: '20260901', ok: true };
  await fs.writeFile(f.manifestPath, JSON.stringify({ results: [{ ...success, ok: false, code: 61504 }], retries: [success] }));
  assert.equal((await buildReport({ ...f, files: undefined })).inputs.attempts[0].resolved, true);
  await fs.writeFile(f.manifestPath, JSON.stringify({ results: [success], retries: [success] }));
  await assert.rejects(buildReport({ ...f, files: undefined }), /duplicate/);
});

test('metadata mismatch, out-of-range rows and duplicate files fail audibly', async (t) => {
  const f = await fixture(t, [visit('20260901')]);
  await assert.rejects(buildReport({ ...f, manifestPath: undefined, files: [f.files[0], f.files[0]] }), /duplicate/);
  await fs.writeFile(f.files[0], JSON.stringify(visit('20260902')));
  await assert.rejects(buildReport({ ...f, files: undefined }), /metadata/);
  await fs.writeFile(f.files[0], JSON.stringify(wrapper('dailyVisitTrend', '20260901', { list: [{ ref_date: '20260902' }] })));
  await assert.rejects(buildReport({ ...f, files: undefined }), /ref_date/);
  await assert.rejects(buildReport({ ...f, files: undefined, begin: '20260230' }), /invalid date/);
});

test('period deduplicated data stays separate and overlapping period requests fail', async (t) => {
  const month = { type: 'monthlyVisitTrend', begin_date: '20260901', end_date: '20260930', raw: { list: [{ ref_date: '202609', visit_uv: 100 }] } };
  const f = await fixture(t, [visit('20260901'), month]);
  const r = await buildReport({ ...f, files: undefined });
  assert.equal(r.window.uvDays, 2); assert.equal(r.periods[0].raw.list[0].visit_uv, 100);
  const overlapping = path.join(f.dir, 'overlap.json');
  await fs.writeFile(overlapping, JSON.stringify({ ...month, begin_date: '20260902' }));
  await assert.rejects(buildReport({ ...f, manifestPath: undefined, files: [...f.files, overlapping] }), /overlap|period/);
  const weekA = path.join(f.dir, 'week-a.json'), weekB = path.join(f.dir, 'week-b.json');
  for (const [file, begin, end] of [[weekA, '20260901', '20260907'], [weekB, '20260902', '20260908']]) {
    await fs.writeFile(file, JSON.stringify({ type: 'weeklyVisitTrend', begin_date: begin, end_date: end, raw: { list: [{ ref_date: `${begin}-${end}`, visit_uv: 100 }] } }));
  }
  await assert.rejects(buildReport({ ...f, manifestPath: undefined, files: [weekA, weekB] }), /overlapping/);
});

test('output refuses existing directory; legacy entry requires explicit inputs', async (t) => {
  const f = await fixture(t, [visit('20260901')]);
  const r = await buildReport({ ...f, files: undefined });
  const out = path.join(f.dir, 'new-report');
  await writeReport(r, out);
  await assert.rejects(writeReport(r, out), /EEXIST/);
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/analyze-we-data.js')], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.match(cli.stderr, /manifest|files/); assert.equal(cli.stdout, '');
});
