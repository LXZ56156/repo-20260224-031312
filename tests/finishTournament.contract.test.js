const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, load } = require('./helpers/tournament-cloud-fixture');

function fixture(mode = 'multi_rotate') {
  const players = ['owner', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, type: 'user', squad: i < 2 ? 'A' : 'B' }));
  return {
    _id: 't1', creatorId: 'owner', status: 'running', version: 5, mode, players,
    rules: { endCondition: { type: 'target_wins', target: 2 } },
    rounds: [{ roundIndex: 0, matches: Array.from({ length: 6 }, (_, matchIndex) => ({
      matchIndex, teamA: players.slice(0, 2), teamB: players.slice(2),
      status: matchIndex < 2 ? 'finished' : 'pending',
      ...(matchIndex < 2 ? { score: { teamA: 21, teamB: 18 }, scorerId: 'owner', scorerName: 'Owner' } : {})
    })) }]
  };
}

const finishEvent = { tournamentId: 't1', clientRequestId: 'finish-1' };
const lockEvent = { tournamentId: 't1', roundIndex: 0, matchIndex: 2, action: 'acquire', lockSessionId: 'session-1' };
const scoreEvent = { ...lockEvent, scoreA: 21, scoreB: 17 };
const read = (db) => db.rows.get('tournaments/t1');

test('manual finish preserves two results and cancels remaining matches without counting losses; same request audits once', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  const before = globalThis.structuredClone(read(db).rounds[0].matches.slice(0, 2));
  const result = await handlers.finishTournament(finishEvent);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'finished');
  assert.equal(result.data.version, 6);
  assert.equal(read(db).version, 6);
  assert.equal(read(db).status, 'finished');
  assert.deepEqual(read(db).rounds[0].matches.slice(0, 2), before);
  assert.ok(read(db).rounds[0].matches.slice(2).every((m) => m.status === 'canceled' && m.cancelReason === 'manual_finish' && !m.score));
  assert.equal(read(db).finishMeta.type, 'manual');
  assert.equal(read(db).finishMeta.operatorId, 'owner');
  assert.equal(read(db).finishMeta.clientRequestId, 'finish-1');
  assert.ok(read(db).rankings.every((row) => row.played === 2));
  const once = globalThis.structuredClone(read(db));
  const replay = await handlers.finishTournament(finishEvent);
  assert.equal(replay.state, 'deduped');
  assert.deepEqual(read(db), once);
  assert.equal([...db.rows.keys()].filter((key) => key.startsWith('client_request_logs/')).length, 1);
  assert.equal((await handlers.finishTournament({ ...finishEvent, clientRequestId: 'another' })).ok, false);
  assert.deepEqual(read(db), once);
});

test('manual finish rejects forged identity, draft, zero valid results, and active lock on any match without writes', async () => {
  for (const scenario of ['identity', 'draft', 'zero', 'active']) {
    const t = fixture();
    if (scenario === 'draft') t.status = 'draft';
    if (scenario === 'zero') t.rounds[0].matches.forEach((m) => { m.score = { teamA: 0, teamB: 0 }; });
    const db = createDb(t);
    if (scenario === 'active') db.rows.set('score_locks/t1_0_0', { tournamentId: 't1', ownerId: 'b', expireAt: Date.now() + 60000 });
    const handlers = load(db, { openid: scenario === 'identity' ? 'b' : 'owner' });
    const before = globalThis.structuredClone([...db.rows]);
    const result = await handlers.finishTournament({ ...finishEvent, creatorId: 'b', OPENID: 'owner' });
    assert.equal(result.ok, false, scenario);
    assert.equal(result.state, scenario === 'identity' ? 'forbidden' : scenario === 'active' ? 'occupied' : 'invalid');
    assert.deepEqual([...db.rows], before, scenario);
  }
});

test('new lock committed after finish reads locks forces finish retry and rejection', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  db.beforeCommit = async () => assert.equal((await handlers.scoreLock(lockEvent)).ok, true);
  const result = await handlers.finishTournament(finishEvent);
  assert.equal(result.state, 'occupied');
  assert.equal(read(db).status, 'running');
  assert.equal(read(db).version, 5);
  assert.equal(read(db).finishMeta, undefined);
  assert.ok(db.attempts >= 3);
});

test('finish committed during a new lock callback forces lock retry and keeps manual canceled matches locked out', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  db.beforeCommit = async () => assert.equal((await handlers.finishTournament(finishEvent)).ok, true);
  const result = await handlers.scoreLock(lockEvent);
  assert.equal(result.state, 'canceled');
  assert.equal(db.rows.has('score_locks/t1_0_2'), false);
  assert.equal((await handlers.submitScore(scoreEvent)).state, 'canceled');
  assert.equal(read(db).version, 6);
});

test('score committed during finish callback is included after tournament conflict replay', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  db.beforeCommit = async () => {
    assert.equal((await handlers.scoreLock(lockEvent)).ok, true);
    assert.equal((await handlers.submitScore(scoreEvent)).ok, true);
  };
  assert.equal((await handlers.finishTournament(finishEvent)).ok, true);
  assert.equal(read(db).version, 7);
  assert.equal(read(db).finishMeta.completedMatches, 3);
  assert.equal(read(db).finishMeta.canceledMatches, 3);
  assert.deepEqual(read(db).rounds[0].matches[2].score, { teamA: 21, teamB: 17 });
  assert.ok(read(db).rankings.every((row) => row.played === 3));
});

test('concurrent same or distinct finish requests commit exactly one finish and audit', async () => {
  for (const clientRequestId of ['finish-1', 'finish-other']) {
    const db = createDb(fixture());
    const handlers = load(db);
    db.beforeCommit = async () => assert.equal((await handlers.finishTournament({ ...finishEvent, clientRequestId })).ok, true);
    const result = await handlers.finishTournament(finishEvent);
    assert.equal(result.state, clientRequestId === 'finish-1' ? 'deduped' : 'invalid');
    assert.equal(read(db).version, 6);
    assert.equal(read(db).finishMeta.clientRequestId, clientRequestId);
    assert.equal([...db.rows.keys()].filter((key) => key.startsWith('client_request_logs/')).length, 1);
  }
});

test('manual squad finish remains finished after correction and never revives manual canceled matches', async () => {
  const db = createDb(fixture('squad_doubles'));
  const handlers = load(db);
  assert.equal((await handlers.finishTournament(finishEvent)).ok, true);
  const correction = { ...scoreEvent, matchIndex: 1, scoreA: 18, scoreB: 21 };
  assert.equal((await handlers.scoreLock({ ...correction, action: 'acquire' })).ok, true);
  assert.equal((await handlers.submitScore(correction)).ok, true);
  assert.equal(read(db).status, 'finished');
  assert.ok(read(db).rounds[0].matches.slice(2).every((m) => m.status === 'canceled' && m.cancelReason === 'manual_finish'));
  assert.equal(read(db).rankings.find((r) => r.entityId === 'A').wins, 1);
  assert.equal(read(db).rankings.find((r) => r.entityId === 'B').wins, 1);
});

test('clone and reset clear manual finish metadata; old request cannot end a restarted tournament', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  assert.equal((await handlers.finishTournament(finishEvent)).ok, true);
  const cloned = await handlers.cloneTournament({ sourceTournamentId: 't1' });
  assert.equal(cloned.ok, true);
  assert.equal(db.rows.get(`tournaments/${cloned.tournamentId}`).finishMeta, undefined);
  assert.equal((await handlers.resetTournament({ tournamentId: 't1' })).ok, true);
  assert.equal(read(db).finishMeta, undefined);
  assert.deepEqual(read(db).rounds, []);
  const restarted = fixture();
  restarted.version = read(db).version + 1;
  db.rows.set('tournaments/t1', restarted);
  const before = globalThis.structuredClone(restarted);
  assert.equal((await handlers.finishTournament(finishEvent)).ok, false);
  assert.deepEqual(read(db), before);
});

test('finish transaction failure cannot leave partial tournament or audit writes', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  db.beforeCommit = () => { throw new Error('transaction conflict'); };
  const before = globalThis.structuredClone([...db.rows]);
  const result = await handlers.finishTournament(finishEvent);
  assert.equal(result.state, 'conflict');
  assert.deepEqual([...db.rows], before);
});

test('finish returns structured invalid/not_found contracts and fixed-pair rankings remain result-only', async () => {
  const db = createDb(fixture('fixed_pair_rr'));
  const t = read(db);
  t.pairTeams = [{ id: 'a', name: 'A', playerIds: ['owner', 'b'] }, { id: 'b', name: 'B', playerIds: ['c', 'd'] }];
  t.rounds[0].matches.forEach((match) => Object.assign(match, { unitAId: 'a', unitBId: 'b' }));
  const handlers = load(db);
  for (const event of [{}, { tournamentId: 't1' }]) {
    const result = await handlers.finishTournament({ ...event, __traceId: 'trace-finish' });
    assert.equal(result.ok, false);
    assert.equal(result.state, 'invalid');
    assert.equal(result.traceId, 'trace-finish');
    assert.deepEqual(result.data, {});
  }
  assert.equal((await handlers.finishTournament({ ...finishEvent, tournamentId: 'missing' })).state, 'not_found');
  assert.equal((await handlers.finishTournament(finishEvent)).ok, true);
  assert.ok(read(db).rankings.every((row) => row.entityType === 'team' && row.played === 2));
});

test('forced takeover after finish lock read conflicts with finish instead of committing half an end', async () => {
  const db = createDb(fixture());
  db.rows.set('score_locks/t1_0_2', { tournamentId: 't1', ownerId: 'b', expireAt: Date.now() - 1000, lockSessionId: 'old' });
  const handlers = load(db);
  db.beforeCommit = async () => assert.equal((await handlers.scoreLock({ ...lockEvent, force: true })).ok, true);
  assert.equal((await handlers.finishTournament(finishEvent)).state, 'occupied');
  assert.equal(read(db).status, 'running');
  assert.equal(read(db).finishMeta, undefined);
  assert.equal(db.rows.get('score_locks/t1_0_2').lockSessionId, 'session-1');
});

test('finished share update is awaited once after successful commit and never for replayed finish', async () => {
  const t = fixture();
  Object.assign(t, { shareActivityId: 'share-1', shareActivityExpireAtMs: Date.now() + 120000, shareActivityState: 1 });
  const db = createDb(t);
  let started;
  let finishShare;
  let shareCalls = 0;
  const start = new Promise((resolve) => { started = resolve; });
  const wait = new Promise((resolve) => { finishShare = resolve; });
  const handlers = load(db, { openid: 'owner', openapi: { updatableMessage: {
    async setUpdatableMsg() { shareCalls += 1; started(); await wait; return { errCode: 0 }; }
  } } });
  let settled = false;
  const finish = handlers.finishTournament(finishEvent).then((result) => { settled = true; return result; });
  await Promise.race([start, finish.then(() => { assert.fail('finish must start its eligible share update'); })]);
  assert.equal(settled, false);
  assert.equal(read(db).status, 'finished');
  assert.equal(read(db).shareActivityState, 2);
  finishShare();
  assert.equal((await finish).ok, true);
  assert.equal((await handlers.finishTournament(finishEvent)).state, 'deduped');
  assert.equal(shareCalls, 1);
});

test('660-match manual finish uses one bounded active-lock query instead of hundreds of lock document reads', async () => {
  const t = fixture();
  const match = t.rounds[0].matches[2];
  t.rounds[0].matches.push(...Array.from({ length: 654 }, (_, i) => ({ ...match, matchIndex: i + 6 })));
  const db = createDb(t);
  assert.equal((await load(db).finishTournament(finishEvent)).ok, true);
  assert.equal(db.activeLockQueries, 1);
  assert.equal(db.lockDocReads, 0);
  assert.equal(read(db).finishMeta.canceledMatches, 658);
});

test('lock created after query captures empty result is caught by tournament write conflict', async () => {
  const db = createDb(fixture());
  const handlers = load(db);
  db.afterLockQuery = async () => assert.equal((await handlers.scoreLock(lockEvent)).ok, true);
  const result = await handlers.finishTournament(finishEvent);
  assert.equal(result.state, 'occupied');
  assert.equal(read(db).status, 'running');
  assert.equal(read(db).finishMeta, undefined);
  assert.equal(db.activeLockQueries, 2);
});

test('heartbeat started before expiry and committed after empty query forces finish replay and rejection', async () => {
  const previousNow = Date.now;
  let now = 100;
  Date.now = () => now;
  const db = createDb(fixture());
  db.rows.set('score_locks/t1_0_2', { tournamentId: 't1', ownerId: 'owner', expireAt: 150, lockSessionId: 'session-1' });
  const handlers = load(db);
  let started;
  let resume;
  const heartbeatStarted = new Promise((resolve) => { started = resolve; });
  const heartbeatResume = new Promise((resolve) => { resume = resolve; });
  db.beforeCommit = async () => { started(); await heartbeatResume; };
  try {
    const heartbeat = handlers.scoreLock({ ...lockEvent, action: 'heartbeat' });
    await heartbeatStarted;
    now = 200;
    db.afterLockQuery = async () => { resume(); assert.equal((await heartbeat).ok, true); };
    assert.equal((await handlers.finishTournament(finishEvent)).state, 'occupied');
    assert.equal(read(db).status, 'running');
    assert.equal(read(db).finishMeta, undefined);
    assert.equal(db.activeLockQueries, 2);
  } finally { resume(); Date.now = previousNow; }
});

test('finish committed after an in-flight heartbeat expires forces heartbeat replay and rejection', async () => {
  const previousNow = Date.now;
  let now = 100;
  Date.now = () => now;
  const db = createDb(fixture());
  db.rows.set('score_locks/t1_0_2', { tournamentId: 't1', ownerId: 'owner', expireAt: 150, lockSessionId: 'session-1' });
  const handlers = load(db);
  db.beforeCommit = async () => { now = 200; assert.equal((await handlers.finishTournament(finishEvent)).ok, true); };
  try {
    assert.equal((await handlers.scoreLock({ ...lockEvent, action: 'heartbeat' })).state, 'canceled');
    assert.equal(read(db).status, 'finished');
    assert.equal(db.rows.get('score_locks/t1_0_2').expireAt, 150);
  } finally { Date.now = previousNow; }
});

test('failed or malformed lock query cannot write a finish or an audit', async () => {
  for (const mode of ['error', 'malformed']) {
    const db = createDb(fixture());
    const originalCollection = db.collection;
    db.collection = (name) => name === 'score_locks' ? {
      where() { return { limit() { return { async get() {
        if (mode === 'error') throw new Error('query timeout');
        return { data: null };
      } }; } }; }
    } : originalCollection(name);
    const handlers = load(db);
    const before = globalThis.structuredClone([...db.rows]);
    await assert.rejects(handlers.finishTournament(finishEvent));
    assert.deepEqual([...db.rows], before);
  }
});
