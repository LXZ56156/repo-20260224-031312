const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, load } = require('./helpers/tournament-cloud-fixture');
const frontend = require('../miniprogram/permission/permission');
const backend = require('../cloudfunctions/startTournament/lib/permission');

function fixture(status = 'draft', mode = 'multi_rotate') {
  return { _id: 't1', name: 'Role test', creatorId: 'owner', status, version: 5, mode,
    settingsConfigured: true, totalMatches: 1, courts: 1,
    players: ['owner', 'b', 'c', 'd'].map((id) => ({ id, name: id, gender: 'unknown', squad: id === 'owner' || id === 'b' ? 'A' : 'B' })),
    playerIds: ['owner', 'b', 'c', 'd', 'stale'], coManagers: [], pairTeams: [],
    rounds: [{ roundIndex: 0, matches: [{ matchIndex: 0, status: 'pending', teamA: ['owner', 'b'], teamB: ['c', 'd'] }] }]
  };
}
const read = (db) => db.rows.get('tournaments/t1');
const grant = { tournamentId: 't1', playerId: 'b', action: 'grant', clientRequestId: 'grant-b' };

test('frontend and backend management capability requires owner or bound roster intersection and does not expand isAdmin', () => {
  for (const perm of [frontend, backend]) {
    const t = fixture();
    t.players.push({ id: 'guest_1', name: 'b', type: 'guest' }, { id: 'g2', name: 'b', type: 'guest' }, 'unbound');
    t.coManagers = ['b', 'stale', 'guest_1', 'g2', 'unbound'];
    assert.equal(perm.isAdmin(t, 'b'), false);
    assert.equal(perm.canManageTournament(t, 'owner'), true);
    assert.equal(perm.canManageTournament(t, 'b'), true);
    for (const id of ['stale', 'guest_1', 'g2', 'unbound', 'c', '']) assert.equal(perm.canManageTournament(t, id), false, id);
    assert.equal(perm.canEditScore(t, 'c'), true);
    t.players = t.players.filter((p) => p && p.id !== 'b');
    assert.equal(perm.canManageTournament(t, 'b'), false);
  }
});

test('only owner grants/revokes a bound co-manager with one version and audit per idempotent request, including running', async () => {
  for (const status of ['draft', 'running']) {
    const db = createDb(fixture(status));
    const context = { openid: 'owner' };
    const handlers = load(db, context, ['manageCoManagers']);
    const result = await handlers.manageCoManagers(grant);
    assert.equal(result.ok, true);
    assert.deepEqual(read(db).coManagers, ['b']);
    assert.equal(read(db).version, 6);
    assert.equal((await handlers.manageCoManagers(grant)).state, 'deduped');
    assert.equal(read(db).version, 6);
    context.openid = 'b';
    assert.equal((await handlers.manageCoManagers({ ...grant, playerId: 'c', OPENID: 'owner' })).state, 'forbidden');
    context.openid = 'owner';
    assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke-b' })).ok, true);
    assert.deepEqual(read(db).coManagers, []);
    assert.equal(read(db).version, 7);
    assert.equal((await handlers.manageCoManagers(grant)).state, 'deduped');
    assert.deepEqual(read(db).coManagers, []);
    assert.equal([...db.rows.keys()].filter((key) => key.startsWith('client_request_logs/')).length, 2);
  }
});

test('grant rejects guest, missing roster, stale playerIds, payload spoof and changed payload under one request', async () => {
  const db = createDb(fixture());
  read(db).players.push({ id: 'g', name: 'b', type: 'guest' });
  const handlers = load(db, { openid: 'owner' }, ['manageCoManagers']);
  const before = globalThis.structuredClone([...db.rows]);
  for (const playerId of ['stale', 'g', 'owner', 'missing']) {
    assert.equal((await handlers.manageCoManagers({ ...grant, playerId, players: [{ id: playerId, type: 'user' }] })).ok, false);
    assert.deepEqual([...db.rows], before);
  }
  assert.equal((await handlers.manageCoManagers(grant)).ok, true);
  assert.equal((await handlers.manageCoManagers({ ...grant, playerId: 'c' })).ok, false);
  assert.deepEqual(read(db).coManagers, ['b']);
});

test('grant and roster removal conflict in either order without a dangling co-manager', async () => {
  for (const grantFirst of [true, false]) {
    const db = createDb(fixture());
    const handlers = load(db, { openid: 'owner' }, ['manageCoManagers', 'removePlayer']);
    const remove = { tournamentId: 't1', playerId: 'b', clientRequestId: 'remove-b' };
    if (grantFirst) {
      db.beforeCommit = async () => assert.equal((await handlers.manageCoManagers(grant)).ok, true);
      assert.equal((await handlers.removePlayer(remove)).ok, true);
    } else {
      db.beforeCommit = async () => assert.equal((await handlers.removePlayer(remove)).ok, true);
      assert.equal((await handlers.manageCoManagers(grant)).ok, false);
    }
    assert.equal(read(db).players.some((p) => p.id === 'b'), false);
    assert.deepEqual(read(db).coManagers, []);
  }
});

test('co-manager may configure/import/assign squads/referee/remove but cannot delete/reset/finish; revoke invalidates next call', async () => {
  const db = createDb(fixture());
  read(db).coManagers = ['b'];
  const context = { openid: 'b' };
  const handlers = load(db, context, ['manageCoManagers', 'addPlayers', 'updateSettings', 'setPlayerSquad', 'managePairTeams',
    'setReferee', 'removePlayer', 'resetTournament', 'deleteTournament', 'finishTournament', 'cloneTournament', 'scoreLock', 'submitScore']);
  assert.equal((await handlers.updateSettings({ tournamentId: 't1', name: 'Changed' })).ok, true);
  assert.equal((await handlers.addPlayers({ tournamentId: 't1', names: ['E'] })).ok, true);
  assert.equal((await handlers.setReferee({ tournamentId: 't1', refereeId: 'c' })).ok, true);
  read(db).mode = 'squad_doubles';
  assert.equal((await handlers.setPlayerSquad({ tournamentId: 't1', playerId: 'c', squad: 'A' })).ok, true);
  read(db).mode = 'fixed_pair_rr';
  assert.equal((await handlers.managePairTeams({ tournamentId: 't1', action: 'create', playerIds: ['owner', 'b'] })).ok, true);
  assert.equal((await handlers.removePlayer({ tournamentId: 't1', playerId: 'd' })).ok, true);
  await assert.rejects(handlers.resetTournament({ tournamentId: 't1' }), /无权限/);
  await assert.rejects(handlers.deleteTournament({ tournamentId: 't1' }), /无权限/);
  assert.equal((await handlers.cloneTournament({ sourceTournamentId: 't1' })).ok, false);
  assert.equal((await handlers.finishTournament({ tournamentId: 't1', clientRequestId: 'finish' })).state, 'forbidden');
  context.openid = 'owner';
  assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke' })).ok, true);
  context.openid = 'b';
  assert.equal((await handlers.updateSettings({ tournamentId: 't1', name: 'Forbidden' })).ok, false);
  assert.equal(frontend.canEditScore(read(db), 'b'), true);
  read(db).status = 'running';
  const score = { tournamentId: 't1', roundIndex: 0, matchIndex: 0, lockSessionId: 'b-score' };
  assert.equal((await handlers.scoreLock({ ...score, action: 'acquire' })).ok, true);
  assert.equal((await handlers.submitScore({ ...score, scoreA: 21, scoreB: 17 })).ok, true);
});

test('replay and concurrent duplicate role requests never duplicate audit; failed transaction never leaves role writes', async () => {
  const db = createDb(fixture());
  const handlers = load(db, { openid: 'owner' }, ['manageCoManagers']);
  db.beforeCommit = async () => assert.equal((await handlers.manageCoManagers(grant)).ok, true);
  assert.equal((await handlers.manageCoManagers(grant)).state, 'deduped');
  assert.equal(read(db).version, 6);
  assert.equal([...db.rows.keys()].filter((key) => key.startsWith('client_request_logs/')).length, 1);
  const before = globalThis.structuredClone([...db.rows]);
  db.beforeCommit = () => { throw new Error('transaction conflict'); };
  assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke' })).state, 'conflict');
  assert.deepEqual([...db.rows], before);
});

test('co-manager start and concurrent revoke serialize, and running assignment never opens draft configuration', async () => {
  for (const startFirst of [true, false]) {
    const db = createDb(fixture()); read(db).coManagers = ['b'];
    const context = { openid: 'b' };
    const handlers = load(db, context, ['manageCoManagers', 'startTournament', 'updateSettings']);
    if (startFirst) {
      db.beforeCommit = async () => {
        context.openid = 'owner';
        assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke' })).ok, true);
        context.openid = 'b';
      };
      assert.equal((await handlers.startTournament({ tournamentId: 't1', clientRequestId: 'start' })).ok, false);
      assert.equal(read(db).status, 'draft');
    } else {
      context.openid = 'owner';
      db.beforeCommit = async () => {
        context.openid = 'b';
        assert.equal((await handlers.startTournament({ tournamentId: 't1', clientRequestId: 'start' })).ok, true);
        context.openid = 'owner';
      };
      assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke' })).ok, true);
      assert.equal(read(db).status, 'running');
    }
    assert.deepEqual(read(db).coManagers, []);
    context.openid = 'owner';
    assert.equal((await handlers.manageCoManagers({ ...grant, clientRequestId: 'grant-running' })).ok, true);
    if (read(db).status === 'running') {
      context.openid = 'b';
      assert.equal((await handlers.updateSettings({ tournamentId: 't1', name: 'Too late' })).ok, false);
    }
  }
});

test('non-transactional squad/pair management cannot commit stale capability after concurrent revoke', async () => {
  for (const name of ['setPlayerSquad', 'managePairTeams']) {
    const db = createDb(fixture('draft', name === 'setPlayerSquad' ? 'squad_doubles' : 'fixed_pair_rr'));
    read(db).coManagers = ['b'];
    const context = { openid: 'b' };
    const handlers = load(db, context, ['manageCoManagers', name]);
    const originalCollection = db.collection;
    db.collection = (collectionName) => {
      const collection = originalCollection(collectionName);
      if (collectionName !== 'tournaments') return collection;
      return { ...collection, where(filter) {
        const query = collection.where(filter);
        return { async update(payload) {
          context.openid = 'owner';
          assert.equal((await handlers.manageCoManagers({ ...grant, action: 'revoke', clientRequestId: 'revoke' })).ok, true);
          context.openid = 'b';
          return query.update(payload);
        } };
      } };
    };
    const event = name === 'setPlayerSquad'
      ? { tournamentId: 't1', playerId: 'c', squad: 'A' }
      : { tournamentId: 't1', action: 'create', playerIds: ['owner', 'b'] };
    assert.equal((await handlers[name](event)).state, 'conflict');
    assert.deepEqual(read(db).coManagers, []);
    assert.equal(read(db).players.find((p) => p.id === 'c').squad, 'B');
    assert.deepEqual(read(db).pairTeams, []);
  }
});
