const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { buildLocalTournamentSnapshot } = require('../miniprogram/core/storage/tournament');
const { buildLocalPerformancePayload } = require('../miniprogram/core/performanceStats');
const { computeMyPerformanceStats } = require('../cloudfunctions/getMyPerformanceStats/logic');
const { buildShareEntryViewModel } = require('../miniprogram/core/shareMeta');
const { computeAnalytics } = require('../miniprogram/pages/analytics/logic');

// Offline SDK and sequential in-memory DB exercise source handlers and result/lock contracts.
// It cannot prove CloudBase transaction concurrency or deployed database permissions.
function createDb() {
  const stores = new Map();
  let nextId = 0;
  const copy = (value) => globalThis.structuredClone(value);
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const values = (row, key) => key.split('.').reduce((items, part) => items.flatMap((item) =>
    Array.isArray(item) ? item.map((child) => child && child[part]) : [item && item[part]]), [row]);
  function matches(row, query) {
    if (query && query.op === 'and') return query.value.every((q) => matches(row, q));
    if (query && query.op === 'or') return query.value.some((q) => matches(row, q));
    return Object.entries(query).every(([key, expected]) => values(row, key).some((actual) => {
      if (!expected || !expected.op) return actual === expected;
      if (expected.op === 'in') return expected.value.some((v) => Array.isArray(actual) ? actual.includes(v) : actual === v);
      if (expected.op === 'neq') return actual !== expected.value;
      if (expected.op === 'eq') return +actual === +expected.value;
      if (expected.op === 'gt') return actual > expected.value;
      if (expected.op === 'lt') return actual < expected.value;
      throw new Error(`Unsupported fixture query ${expected.op}`);
    }));
  }
  function patch(row, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && value.op === 'remove') delete row[key];
      else if (value && value.op === 'inc') row[key] = (Number(row[key]) || 0) + value.value;
      else row[key] = copy(value);
    }
  }
  const command = Object.fromEntries(['and', 'or', 'in', 'neq', 'eq', 'gt', 'lt', 'inc'].map((op) => [op, (value) => ({ op, value })]));
  command.remove = () => ({ op: 'remove' });
  const db = {
    command, serverDate: () => new Date(), createCollection: async (name) => { store(name); },
    runTransaction: async (callback) => callback(db),
    collection(name) {
      const rows = store(name);
      function where(filter) {
        let max = Infinity;
        let fields = null;
        const orders = [];
        const selected = () => [...rows.values()].filter((row) => matches(row, filter));
        const query = {
          limit(n) { max = n; return query; },
          field(value) { fields = value; return query; },
          orderBy(key, order) { orders.push([key, order]); return query; },
          async get() {
            const result = selected().sort((a, b) => {
              for (const [key, direction] of orders) {
                if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
                if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
              }
              return 0;
            }).slice(0, max);
            return { data: copy(fields ? result.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => fields[key]))) : result) };
          },
          async update({ data }) { const result = selected(); result.forEach((row) => patch(row, data)); return { stats: { updated: result.length } }; },
          async remove() { const result = selected(); result.forEach((row) => rows.delete(row._id)); return { stats: { removed: result.length } }; }
        };
        return query;
      }
      return {
        where,
        async add({ data }) { const id = `singles_${++nextId}`; rows.set(id, { ...copy(data), _id: id }); return { _id: id }; },
        doc(id) {
          return {
            async get() { if (!rows.has(id)) throw new Error('document.get:fail document does not exist'); return { data: copy(rows.get(id)) }; },
            async set({ data }) { rows.set(id, { ...copy(data), _id: id }); },
            async update({ data }) { return where({ _id: id }).update({ data }); },
            async remove() { return where({ _id: id }).remove(); }
          };
        }
      };
    }
  };
  return db;
}

function loadHandlers(db, context) {
  const names = ['createTournament', 'addPlayers', 'joinTournament', 'updateSettings', 'startTournament',
    'scoreLock', 'submitScore', 'finishTournament', 'resetTournament', 'getMyTournaments', 'cloneTournament'];
  const sdk = { init() {}, DYNAMIC_CURRENT_ENV: 'isolated-test', database: () => db,
    getWXContext: () => ({ OPENID: context.openid }) };
  const originalLoad = Module._load;
  const paths = names.map((name) => require.resolve(`../cloudfunctions/${name}/index.js`));
  Module._load = function (request, parent, isMain) {
    return request === 'wx-server-sdk' ? sdk : originalLoad.call(this, request, parent, isMain);
  };
  try {
    return Object.fromEntries(names.map((name, index) => {
      delete require.cache[paths[index]];
      return [name, require(paths[index]).main];
    }));
  } finally { Module._load = originalLoad; paths.forEach((path) => { delete require.cache[path]; }); }
}

for (const count of [2, 3, 4, 6, 8]) {
  test(`offline SDK/DB singles handlers complete ${count}-person journey: configure, score, correct, share, recover, clone and reset`, async () => {
    const db = createDb();
    const context = { openid: 'singles_owner' };
    const handlers = loadHandlers(db, context);
    const succeed = async (name, event) => {
      const result = await handlers[name](event);
      assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
      assert.ok(result.code && result.state && result.message);
      return result;
    };
    const created = await succeed('createTournament', { name: '单打旅程', nickname: '主办', mode: 'singles_round_robin', clientRequestId: `create-${count}` });
    const tournamentId = created.tournamentId;
    const read = async () => (await db.collection('tournaments').doc(tournamentId).get()).data;
    const target = count === 3 ? 11 : count === 6 ? 15 : 21;
    const cycles = count === 4 ? 2 : 1;
    await succeed('updateSettings', { tournamentId, courts: 2, cycles, pointsPerGame: target });
    const tooSoon = await handlers.startTournament({ tournamentId });
    assert.equal(tooSoon.code, 'START_VALIDATION_FAILED');
    await succeed('addPlayers', { tournamentId, names: Array.from({ length: count - 1 }, (_, i) => `导入${i}`) });
    assert.equal((await read()).players.length, count);
    for (const patch of [{ courts: 3 }, { cycles: 3 }, { pointsPerGame: 12 }]) {
      const before = await read();
      assert.equal((await handlers.updateSettings({ tournamentId, ...patch })).code, 'SETTINGS_INVALID');
      assert.deepEqual(await read(), before);
    }
    const startedResult = await succeed('startTournament', { tournamentId, clientRequestId: `start-${count}` });
    const started = await read();
    assert.equal(started.totalMatches, count * (count - 1) / 2 * cycles);
    assert.equal(started.rules.cycles, cycles);
    assert.equal(startedResult.state, 'started');
    assert.equal((await handlers.updateSettings({ tournamentId, courts: 1 })).code, 'SETTINGS_DRAFT_ONLY');
    const matches = started.rounds.flatMap((round) => round.matches.map((match) => ({ ...match, roundIndex: round.roundIndex })));
    assert.equal(matches.length, started.totalMatches);
    const first = { tournamentId, roundIndex: matches[0].roundIndex, matchIndex: matches[0].matchIndex };
    context.openid = 'unbound_user_with_imported_name';
    assert.equal((await handlers.scoreLock({ ...first, action: 'acquire' })).code, 'LOCK_FORBIDDEN');
    context.openid = 'singles_owner';
    for (const [index, match] of matches.entries()) {
      const coordinates = { tournamentId, roundIndex: match.roundIndex, matchIndex: match.matchIndex };
      const lockSessionId = `session-${count}-${index}`;
      await succeed('scoreLock', { ...coordinates, action: 'acquire', lockSessionId });
      if (index === 0) {
        const bad = await handlers.submitScore({ ...coordinates, scoreA: target - 1, scoreB: 0, lockSessionId });
        assert.equal(bad.code, 'SCORE_INVALID');
        assert.equal(bad.state, 'invalid');
        const decimal = await handlers.submitScore({ ...coordinates, scoreA: target + 0.9, scoreB: target - 3, lockSessionId });
        assert.equal(decimal.code, 'SCORE_INVALID');
        assert.equal((await read()).rounds[match.roundIndex].matches[match.matchIndex].status, 'pending');
        assert.equal((await handlers.submitScore({ ...coordinates, scoreA: target, scoreB: target - 3, lockSessionId: 'stale' })).code, 'LOCK_EXPIRED');
        await succeed('scoreLock', { ...coordinates, action: 'heartbeat', lockSessionId });
      }
      const submitted = await succeed('submitScore', { ...coordinates, scoreA: target, scoreB: target - 3, lockSessionId });
      assert.equal(submitted.finished, index === matches.length - 1);
      const after = await read();
      const retried = await succeed('submitScore', { ...coordinates, scoreA: target, scoreB: target - 3, lockSessionId });
      assert.equal(retried.deduped, true);
      assert.equal((await read()).version, after.version);
    }
    const finished = await read();
    assert.equal(finished.status, 'finished');
    assert.ok(finished.rankings.every((row) => row.played === (count - 1) * cycles));
    assert.equal(finished.rankings.reduce((sum, row) => sum + row.wins, 0), matches.length);
    assert.equal((await db.collection('score_locks').where({ tournamentId }).get()).data.length, 0);
    await succeed('scoreLock', { ...first, action: 'acquire', lockSessionId: 'correction' });
    await succeed('submitScore', { ...first, scoreA: target - 2, scoreB: target, lockSessionId: 'correction' });
    const corrected = await read();
    assert.ok(corrected.rankings.every((row) => row.played === (count - 1) * cycles));
    const report = computeAnalytics(corrected);
    assert.equal(report.summary.finishedMatches, matches.length);
    assert.deepEqual(report.playerStats.map((row) => row.rank), corrected.rankings.map((row) => row.rank));
    assert.equal(buildShareEntryViewModel({ tournament: corrected, openid: context.openid }).modeLabel, '单打循环');
    const snapshot = buildLocalTournamentSnapshot(corrected);
    assert.equal(snapshot.mode, 'singles_round_robin');
    assert.equal(snapshot.rules.pointsPerGame, target);
    const localStats = buildLocalPerformancePayload([snapshot], context.openid);
    const cloudStats = computeMyPerformanceStats([corrected], context.openid);
    assert.equal(localStats.matchesPlayed, (count - 1) * cycles);
    assert.equal(localStats.wins, cloudStats.wins);
    assert.equal(localStats.losses, cloudStats.losses);
    const recovery = await succeed('getMyTournaments', {});
    assert.equal(recovery.items[0].mode, 'singles_round_robin');
    assert.equal(recovery.items[0].completedMatches, matches.length);
    const cloned = await succeed('cloneTournament', { sourceTournamentId: tournamentId, clientRequestId: `clone-${count}` });
    const copy = (await db.collection('tournaments').doc(cloned.tournamentId).get()).data;
    assert.equal(copy.mode, 'singles_round_robin');
    assert.equal(copy.rules.cycles, cycles);
    assert.equal(copy.rules.pointsPerGame, target);
    await succeed('resetTournament', { tournamentId });
    const reset = await read();
    assert.equal(reset.status, 'draft');
    assert.deepEqual(reset.rounds, []);
    assert.equal(reset.players.length, count);
    assert.equal(reset.rules.cycles, cycles);
    assert.ok(reset.rankings.every((row) => row.played === 0));
    assert.equal((await handlers.submitScore({ ...first, scoreA: target, scoreB: target - 3, lockSessionId: 'correction' })).ok, false);
    await succeed('startTournament', { tournamentId, clientRequestId: `restart-${count}` });
    assert.equal((await handlers.submitScore({ ...first, scoreA: target, scoreB: target - 3, lockSessionId: 'correction' })).code, 'LOCK_EXPIRED');
  });
}

test('offline SDK/DB singles manual finish refuses live locks, preserves one result and cancels only unplayed matches', async () => {
  const db = createDb();
  const context = { openid: 'owner' };
  const handlers = loadHandlers(db, context);
  const created = await handlers.createTournament({ name: '提前收赛', nickname: '主办', mode: 'singles_round_robin' });
  const tournamentId = created.tournamentId;
  await handlers.addPlayers({ tournamentId, names: ['甲', '乙', '丙', '丁', '戊'] });
  await handlers.updateSettings({ tournamentId, courts: 2, pointsPerGame: 21, cycles: 1 });
  await handlers.startTournament({ tournamentId });
  const first = { tournamentId, roundIndex: 0, matchIndex: 0 };
  await handlers.scoreLock({ ...first, action: 'acquire', lockSessionId: 'first' });
  await handlers.submitScore({ ...first, scoreA: 30, scoreB: 29, lockSessionId: 'first' });
  const second = { tournamentId, roundIndex: 0, matchIndex: 1 };
  await handlers.scoreLock({ ...second, action: 'acquire', lockSessionId: 'second' });
  const blocked = await handlers.finishTournament({ tournamentId, clientRequestId: 'finish' });
  assert.equal(blocked.code, 'LOCK_OCCUPIED');
  await handlers.scoreLock({ ...second, action: 'release', lockSessionId: 'second' });
  const result = await handlers.finishTournament({ tournamentId, clientRequestId: 'finish' });
  assert.equal(result.ok, true);
  assert.equal(result.completedMatches, 1);
  assert.equal(result.canceledMatches, 14);
  const finished = (await db.collection('tournaments').doc(tournamentId).get()).data;
  assert.equal(finished.rankings.reduce((sum, row) => sum + row.played, 0), 2);
  assert.equal(finished.rankings.reduce((sum, row) => sum + row.losses, 0), 1);
  const retried = await handlers.finishTournament({ tournamentId, clientRequestId: 'finish' });
  assert.equal(retried.deduped, true);
  assert.equal((await handlers.submitScore({ ...second, scoreA: 21, scoreB: 19, lockSessionId: 'second' })).code, 'MATCH_CANCELED');
  assert.match(buildShareEntryViewModel({ tournament: finished }).progressText, /仅统计已录 1\/15/);
  await handlers.resetTournament({ tournamentId });
  assert.equal((await handlers.finishTournament({ tournamentId, clientRequestId: 'finish' })).code, 'FINISH_REQUEST_EXPIRED');
});

test('offline SDK/DB singles roster caps import and new join at eight without partial writes', async () => {
  const db = createDb();
  const context = { openid: 'owner' };
  const handlers = loadHandlers(db, context);
  const created = await handlers.createTournament({ name: '单打人数上限', nickname: '主办', mode: 'singles_round_robin' });
  const tournamentId = created.tournamentId;
  const read = async () => (await db.collection('tournaments').doc(tournamentId).get()).data;
  const before = await read();
  const rejected = await handlers.addPlayers({ tournamentId, names: ['一', '二', '三', '四', '五', '六', '七', '八'] });
  assert.equal(rejected.code, 'PLAYER_LIMIT_EXCEEDED');
  assert.deepEqual(await read(), before);
  assert.equal((await handlers.addPlayers({ tournamentId, names: ['一', '二', '三', '四', '五', '六', '七'] })).ok, true);
  const full = await read();
  assert.equal(full.players.length, 8);
  context.openid = 'new_real_caller';
  const joined = await handlers.joinTournament({ tournamentId, nickname: '全新球友',
    avatar: 'https://example.com/avatar.png', gender: 'male' });
  assert.equal(joined.code, 'PLAYER_LIMIT_REACHED');
  assert.deepEqual(await read(), full);
});

test('offline SDK/DB empty singles draft persists zero totals and chosen cycles/points', async () => {
  const db = createDb();
  const context = { openid: 'empty_owner' };
  const handlers = loadHandlers(db, context);
  const created = await handlers.createTournament({ name: '空名单单打草稿', nickname: '主办', mode: 'singles_round_robin' });
  assert.equal(created.ok, true);
  const tournamentId = created.tournamentId;
  const document = db.collection('tournaments').doc(tournamentId);
  // Seed a legal empty draft independently of the creator's automatic roster entry.
  await document.update({ data: { players: [], playerIds: [], rankings: [], totalMatches: 12 } });
  const saved = await handlers.updateSettings({ tournamentId, totalMatches: 0, endConditionTarget: 0,
    endConditionType: 'total_matches', courts: 2, cycles: 2, pointsPerGame: 11,
    clientRequestId: 'save_empty_singles' });
  assert.equal(saved.ok, true);
  assert.equal(saved.code, 'SETTINGS_UPDATED');
  const persisted = (await document.get()).data;
  assert.deepEqual(persisted.players, []);
  assert.equal(persisted.status, 'draft');
  assert.equal(persisted.settingsConfigured, true);
  assert.equal(persisted.totalMatches, 0);
  assert.deepEqual(persisted.rules.endCondition, { type: 'total_matches', target: 0 });
  assert.equal(persisted.courts, 2);
  assert.equal(persisted.rules.cycles, 2);
  assert.equal(persisted.rules.pointsPerGame, 11);
  assert.equal(persisted.rules.gamesPerMatch, 1);
  assert.equal((await handlers.startTournament({ tournamentId })).code, 'START_VALIDATION_FAILED');
});
