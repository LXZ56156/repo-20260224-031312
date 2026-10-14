const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const clone = value => JSON.parse(JSON.stringify(value));

const cases = [
  ['startTournament', { clientRequestId: 'start-1' }],
  ['addPlayers', { players: [{ name: 'New player', gender: 'male' }] }],
  ['removePlayer', { playerId: 'p2', clientRequestId: 'remove-1' }],
  ['updateSettings', { name: 'Updated name' }],
  ['setReferee', { refereeId: 'p2' }]
];

function tournament() {
  return {
    _id: 't_1', creatorId: 'owner', status: 'draft', version: 3,
    mode: 'multi_rotate', settingsConfigured: true, totalMatches: 1, courts: 1,
    players: ['owner', 'p2', 'p3', 'p4'].map(id => ({ id, name: id, gender: 'male' })),
    playerIds: ['owner', 'p2', 'p3', 'p4'], pairTeams: [],
    rules: { pointsPerGame: 21, endCondition: { type: 'total_matches', target: 1 } }
  };
}

function loadMain(name, db) {
  const mainPath = require.resolve('../cloudfunctions/' + name + '/index');
  const originalLoad = Module._load;
  delete require.cache[mainPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return {
      init() {}, database: () => db, getWXContext: () => ({ OPENID: 'owner' }),
      DYNAMIC_CURRENT_ENV: 'offline-only'
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(mainPath).main; } finally { Module._load = originalLoad; }
}

// Read-set conflict and atomic commit model; this is not a cloud-engine test.
function memoryDb({ failLog = false, revokeOnCommit = false } = {}) {
  let store = { tournaments: { t_1: tournament() }, client_request_logs: {} };
  let revision = 0;
  let attempts = 0;
  const writes = [];
  const collection = (draft, name) => ({
    doc(id) {
      return {
        async get() {
          const value = draft[name]?.[id];
          if (!value) throw new Error('document.get:fail document does not exist');
          return { data: clone(value) };
        },
        async update({ data }) {
          assert.equal(name, 'tournaments');
          assert.equal(id, 't_1');
          assert.equal(Object.hasOwn(data, '_id'), false);
          const current = draft[name][id];
          for (const [key, value] of Object.entries(data)) {
            if (value?.$remove) delete current[key];
            else current[key] = value?.$inc ? Number(current[key] || 0) + value.$inc : clone(value);
          }
          writes.push(name);
          return { stats: { updated: 1 } };
        },
        async set({ data }) {
          if (failLog && name === 'client_request_logs') throw new Error('synthetic log write failure');
          draft[name] ||= {};
          draft[name][id] = clone(data);
          writes.push(name);
          return { _id: id };
        }
      };
    },
    where() { throw new Error('query update escapes the SDK transaction'); }
  });
  const db = {
    command: { inc: value => ({ $inc: value }), remove: () => ({ $remove: true }) },
    serverDate: () => ({ $serverDate: true }),
    async createCollection(name) { store[name] ||= {}; },
    collection: name => collection(store, name),
    async runTransaction(handler) {
      for (let retry = 0; retry < 2; retry++) {
        attempts++;
        const readRevision = revision;
        const draft = clone(store);
        const result = await handler({ collection: name => collection(draft, name) });
        if (revokeOnCommit && retry === 0) {
          store.tournaments.t_1.creatorId = 'other';
          store.tournaments.t_1.version++;
          revision++;
        }
        if (readRevision !== revision) continue;
        store = draft;
        revision++;
        return result;
      }
      throw new Error('write conflict');
    }
  };
  return { db, read: () => clone(store), writes, attempts: () => attempts };
}

for (const [name, event] of cases) {
  test(name + ' writes the document read in its transaction and increments its version once', async () => {
    const state = memoryDb();
    const result = await loadMain(name, state.db)({ tournamentId: 't_1', ...event });
    assert.equal(result.ok, true);
    assert.equal(state.read().tournaments.t_1.version, 4);
    assert.equal(state.writes.filter(value => value === 'tournaments').length, 1);
  });

  test(name + ' rechecks authority after a read conflict and does not commit the stale write', async () => {
    const state = memoryDb({ revokeOnCommit: true });
    let result;
    try { result = await loadMain(name, state.db)({ tournamentId: 't_1', ...event }); }
    catch (err) { assert.match(err.message, /无权限/); }
    if (result) assert.equal(result.ok, false);
    assert.equal(state.attempts(), 2);
    assert.deepEqual(state.read(), {
      tournaments: { t_1: { ...tournament(), creatorId: 'other', version: 4 } },
      client_request_logs: {}
    });
  });
}

for (const name of ['startTournament', 'removePlayer']) {
  test(name + ' rolls back the tournament when the request log fails, then replays without a second write', async () => {
    const state = memoryDb({ failLog: true });
    const event = cases.find(item => item[0] === name)[1];
    const before = state.read();
    await assert.rejects(loadMain(name, state.db)({ tournamentId: 't_1', ...event }), /synthetic log write failure/);
    assert.deepEqual(state.read(), before);
    const retryState = memoryDb();
    const main = loadMain(name, retryState.db);
    assert.equal((await main({ tournamentId: 't_1', ...event })).ok, true);
    const committed = retryState.read();
    assert.equal((await main({ tournamentId: 't_1', ...event })).state, 'deduped');
    assert.deepEqual(retryState.read(), committed);
    assert.equal(retryState.writes.filter(value => value === 'tournaments').length, 1);
  });
}
