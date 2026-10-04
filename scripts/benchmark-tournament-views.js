#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const { validateBeforeGenerate } = require('../cloudfunctions/startTournament/logic');
const { validateSettings } = require('../cloudfunctions/updateSettings/logic');
const ROOT = path.resolve(__dirname, '..');
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function buildFixtures() {
  return [
    { label: 'small', players: 8, cycles: 1, recents: 1, courts: 2 },
    { label: 'medium', players: 16, cycles: 3, recents: 5, courts: 4 },
    { label: 'large', players: 24, cycles: 10, recents: 20, courts: 6 }
  ].map((config) => {
    const players = Array.from({ length: config.players }, (_, i) => ({
      id: `fixture-player-${String(i + 1).padStart(3, '0')}`,
      name: `匿名球员${String(i + 1).padStart(3, '0')}`, gender: 'unknown'
    }));
    const pairTeams = Array.from({ length: players.length / 2 }, (_, i) => ({
      id: `fixture-team-${i + 1}`, name: `匿名队${i + 1}`,
      playerIds: players.slice(i * 2, i * 2 + 2).map((p) => p.id)
    }));
    const totalMatches = pairTeams.length * (pairTeams.length - 1) / 2 * config.cycles;
    const tournament = {
      _id: `fixture-${config.label}-01`, name: `匿名基线${config.label}`,
      creatorId: players[0].id, status: 'running', mode: 'fixed_pair_rr',
      version: 1, players, pairTeams, courts: config.courts,
      settingsConfigured: true, totalMatches, scheduledMatches: totalMatches,
      rules: { gamesPerMatch: 1, pointsPerGame: 21,
        endCondition: { type: 'total_matches', target: totalMatches }, unfinishedPolicy: 'admin_decide' },
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z'
    };
    // Use the same validation and deterministic schedule generator as the cloud handler.
    validateBeforeGenerate(tournament);
    validateSettings(players, totalMatches, config.courts, tournament.mode, pairTeams);
    Object.assign(tournament, buildFixedPairSchedule(players, config.courts, pairTeams, { totalMatches }));
    const matches = tournament.rounds.flatMap((round) => round.matches);
    matches.forEach((match, i) => {
      if (i < Math.floor(matches.length / 2)) {
        Object.assign(match, { status: 'finished', score: { teamA: 21, teamB: 15 },
          scorerId: players[0].id, scorerName: players[0].name });
      }
    });
    const homeDocs = Array.from({ length: config.recents }, (_, i) => ({
      ...clone(tournament), _id: `fixture-${config.label}-${String(i + 1).padStart(2, '0')}`
    }));
    return { config, tournament, homeDocs };
  });
}

function createRuntime() {
  const saved = { Page: global.Page, wx: global.wx, getApp: global.getApp };
  const pages = {};
  const savedModules = {};
  let memory = new Map();
  let docs = [];
  let fixtureReadCalls = 0;
  let ioStubCpuMs = 0;
  let app;
  const forbidden = () => { throw new Error('External request forbidden in local baseline'); };
  const localIo = (operation) => {
    const start = performance.now();
    try { return operation(); } finally { ioStubCpuMs += performance.now() - start; }
  };
  global.getApp = () => app;
  global.wx = {
    getStorageSync: (key) => localIo(() => clone(memory.get(key))),
    setStorageSync: (key, value) => localIo(() => memory.set(key, clone(value))),
    removeStorageSync: (key) => localIo(() => memory.delete(key)),
    setNavigationBarTitle() {}, request: forbidden, downloadFile: forbidden,
    cloud: {
      callFunction: forbidden, getTempFileURL: forbidden, downloadFile: forbidden,
      database: () => ({
        command: { in: (ids) => ids },
        collection: (name) => {
          if (name !== 'tournaments') throw new Error(`Unexpected fixture collection: ${name}`);
          return { where: ({ _id: ids }) => ({ get: async () => {
            fixtureReadCalls += 1;
            return localIo(() => ({ data: clone(docs.filter((doc) => ids.includes(doc._id))) }));
          } }) };
        }
      })
    }
  };
  for (const name of ['schedule', 'home']) {
    const file = require.resolve(`../miniprogram/pages/${name}/index`);
    savedModules[file] = require.cache[file];
    global.Page = (definition) => { pages[name] = definition; };
    delete require.cache[file];
    require(file);
  }
  global.Page = saved.Page;
  return {
    pages,
    async measure(pageName, fixture) {
      memory = new Map([['recentTournaments', fixture.homeDocs.map((doc) => doc._id)]]);
      docs = fixture.homeDocs;
      fixtureReadCalls = 0;
      ioStubCpuMs = 0;
      app = { globalData: { openid: fixture.tournament.creatorId, _avatarCache: {} } };
      const patches = [];
      let setDataCpuMs = 0;
      const page = { ...pages[pageName], data: clone(pages[pageName].data),
        openid: app.globalData.openid,
        setData(patch, callback) {
          const start = performance.now();
          // Bridge cost is measured separately; JSON bytes are not device IPC or rendering cost.
          patches.push(clone(patch));
          for (const [key, value] of Object.entries(patch)) {
            const roundPath = /^roundsUi\[(\d+)\]$/.exec(key);
            if (roundPath) this.data.roundsUi[Number(roundPath[1])] = value;
            else this.data[key] = value;
          }
          setDataCpuMs += performance.now() - start;
          if (callback) callback.call(this);
        }
      };
      page.data.tournamentId = fixture.tournament._id;
      // No wx.pageScrollTo is provided, so real schedule focus never starts a timer.
      // No avatar URLs are in the fixture, so real avatar collection does not fetch.
      const start = performance.now();
      if (pageName === 'schedule') page.applyTournament(fixture.tournament);
      else if (pageName === 'home') await page.loadRecents();
      else throw new Error(`Unknown page: ${pageName}`);
      const instrumentedMs = performance.now() - start;
      return { jsMs: instrumentedMs - setDataCpuMs - ioStubCpuMs, instrumentedMs, setDataCpuMs, ioStubCpuMs,
        setDataCalls: patches.length,
        maxSetDataUtf8Bytes: Math.max(0, ...patches.map((patch) => Buffer.byteLength(JSON.stringify(patch), 'utf8'))),
        setDataUtf8Bytes: patches.reduce((sum, patch) => sum + Buffer.byteLength(JSON.stringify(patch), 'utf8'), 0),
        fixtureReadCalls, patches, data: page.data, page };
    },
    restore() {
      Object.assign(global, saved);
      for (const [file, cached] of Object.entries(savedModules)) {
        if (cached) require.cache[file] = cached;
        else delete require.cache[file];
      }
    }
  };
}

function summarize(samples) {
  const result = {};
  for (const key of ['jsMs', 'setDataCalls', 'setDataUtf8Bytes', 'maxSetDataUtf8Bytes']) {
    const values = samples.map((s) => s[key]).sort((a, b) => a - b);
    const at = (percent) => values[Math.max(0, Math.ceil(values.length * percent) - 1)];
    result[key] = { p50: at(0.5), p95: at(0.95), min: values[0], max: values[values.length - 1] };
  }
  return result;
}

async function run({ samples = 100, warmup = 10, out }) {
  if (!Number.isInteger(samples) || samples < 20 || !Number.isInteger(warmup) || warmup < 0) {
    throw new Error('samples must be an integer >=20; warmup must be an integer >=0');
  }
  if (!out) throw new Error('Specify a NEW output directory with --out');
  const output = path.resolve(out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output); // Refuse to overwrite any existing evidence directory.
  const fixtures = buildFixtures();
  fs.writeFileSync(path.join(output, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  const runtime = createRuntime();
  const results = [];
  try {
    for (const fixture of fixtures) {
      for (const page of ['schedule', 'home']) {
        for (let i = 0; i < warmup; i += 1) await runtime.measure(page, fixture);
        const rows = [];
        let patchParts;
        for (let i = 0; i < samples; i += 1) {
          const row = await runtime.measure(page, fixture);
          if (!patchParts) patchParts = row.patches.map((patch) => ({
            keys: Object.keys(patch), utf8Bytes: Buffer.byteLength(JSON.stringify(patch), 'utf8'),
            fields: Object.fromEntries(Object.entries(patch).map(([key, value]) =>
              [key, Buffer.byteLength(JSON.stringify(value), 'utf8')]))
          }));
          rows.push({ jsMs: row.jsMs, instrumentedMs: row.instrumentedMs,
            setDataCpuMs: row.setDataCpuMs, ioStubCpuMs: row.ioStubCpuMs,
            setDataCalls: row.setDataCalls, setDataUtf8Bytes: row.setDataUtf8Bytes,
            maxSetDataUtf8Bytes: row.maxSetDataUtf8Bytes,
            fixtureReadCalls: row.fixtureReadCalls });
        }
        results.push({ scenario: fixture.config.label, page, config: fixture.config,
          players: fixture.tournament.players.length, matches: fixture.tournament.totalMatches,
          rounds: fixture.tournament.rounds.length,
          fixtureHash: hash(fixture), inputHash: hash(page === 'schedule' ? fixture.tournament : fixture.homeDocs),
          inputUtf8Bytes: Buffer.byteLength(JSON.stringify(page === 'schedule' ? fixture.tournament : fixture.homeDocs), 'utf8'),
          ...summarize(rows), patchParts, samples: rows });
      }
    }
    const sourceHashes = Object.fromEntries([
      __filename, ...Object.keys(require.cache).filter((file) =>
        file.startsWith(path.join(ROOT, 'miniprogram')) || file.startsWith(path.join(ROOT, 'cloudfunctions')))
    ].sort().map((file) => [path.relative(ROOT, file).replace(/\\/g, '/'),
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    const report = {
      schemaVersion: 3, createdAt: new Date().toISOString(),
      node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0].model, logicalCpus: os.cpus().length,
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      sourceHashes, sourceHash: hash(sourceHashes), fixtureHash: hash(fixtures), samples, warmup,
      percentile: 'nearest-rank: sorted[ceil(N*p)-1]',
      scope: 'Node wall-clock JS per fresh Page; module load, fixture creation and Page initialization excluded. jsMs = instrumentedMs - setDataCpuMs - ioStubCpuMs: measured setData serialization/assignment and fixture database/storage clone time excluded. Home uses an immediate fixture database Promise. No network/avatar fetch/real wx storage/IPC/WXML/phone rendering. Not phone first-screen or CPU utilization.',
      payload: 'Sum UTF-8 JSON.stringify(patch) bytes across all setData calls, including repeated keys; not network traffic or actual WeChat bridge encoding.',
      results
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, fixtureHash: report.fixtureHash, sourceHash: report.sourceHash,
      results: results.map(({ scenario, page, jsMs, setDataCalls, setDataUtf8Bytes, maxSetDataUtf8Bytes }) =>
        ({ scenario, page, jsMs, setDataCalls, setDataUtf8Bytes, maxSetDataUtf8Bytes })) }, null, 2));
    return report;
  } finally { runtime.restore(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--out', '--samples', '--warmup'].includes(key) || args[i + 1] === undefined) {
      throw new Error('Usage: node scripts/benchmark-tournament-views.js --out <new-dir> [--samples 100] [--warmup 10]');
    }
    options[key.slice(2)] = key === '--out' ? args[i + 1] : Number(args[i + 1]);
  }
  run(options).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildFixtures, createRuntime, summarize, hash, run };
