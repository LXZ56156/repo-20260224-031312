const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// This sequential fixture implements only the DB operations used by this journey.
// It does not model CloudBase concurrency or replace deployed runtime verification.
function createJourneyDb() {
  const collections = new Map();
  let nextId = 0;
  const copy = (value) => globalThis.structuredClone(value);
  function rows(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }
  function patch(row, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && value.operation === 'remove') delete row[key];
      else if (value && value.operation === 'inc') row[key] = (Number(row[key]) || 0) + value.amount;
      else row[key] = copy(value);
    }
  }
  const db = {
    command: {
      inc: (amount) => ({ operation: 'inc', amount }),
      remove: () => ({ operation: 'remove' })
    },
    serverDate: () => new Date(),
    createCollection: async (name) => { rows(name); },
    runTransaction: async (callback) => callback(db),
    collection(name) {
      const store = rows(name);
      function where(filter) {
        const selected = () => [...store.values()].filter((row) =>
          Object.entries(filter).every(([key, value]) => row[key] === value));
        return {
          async update({ data }) {
            const matches = selected();
            matches.forEach((row) => patch(row, data));
            return { stats: { updated: matches.length } };
          },
          async remove() {
            const matches = selected();
            matches.forEach((row) => store.delete(row._id));
            return { stats: { removed: matches.length } };
          },
          async get() { return { data: copy(selected()) }; }
        };
      }
      return {
        where,
        async add({ data }) {
          const id = `journey_${++nextId}`;
          store.set(id, { ...copy(data), _id: id });
          return { _id: id };
        },
        doc(id) {
          return {
            async get() {
              if (!store.has(id)) throw new Error('document.get:fail document does not exist');
              return { data: copy(store.get(id)) };
            },
            async set({ data }) { store.set(id, { ...copy(data), _id: id }); },
            async remove() { return where({ _id: id }).remove(); }
          };
        }
      };
    }
  };
  return db;
}

function loadHandlers(db, context) {
  const names = ['createTournament', 'addPlayers', 'updateSettings', 'startTournament',
    'scoreLock', 'submitScore', 'resetTournament', 'deleteTournament'];
  const sdk = {
    init() {},
    DYNAMIC_CURRENT_ENV: 'isolated-test',
    database: () => db,
    getWXContext: () => ({ OPENID: context.openid })
  };
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
  } finally {
    Module._load = originalLoad;
    paths.forEach((path) => { delete require.cache[path]; });
  }
}

test('real tournament handlers share one isolated DB through scoring, rankings, reset and delete', async () => {
  const db = createJourneyDb();
  const context = { openid: 'journey_owner' };
  const handlers = loadHandlers(db, context);
  async function succeed(name, event) {
    const result = await handlers[name](event);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    return result;
  }
  const created = await succeed('createTournament', {
    name: 'Handler journey', nickname: 'Owner', mode: 'multi_rotate', presetKey: 'custom'
  });
  const tournamentId = created.tournamentId;
  assert.ok(tournamentId);
  const read = async () => (await db.collection('tournaments').doc(tournamentId).get()).data;
  assert.equal((await read()).status, 'draft');
  await succeed('addPlayers', { tournamentId, names: ['B', 'C', 'D'] });
  assert.equal((await read()).players.length, 4);
  await succeed('updateSettings', { tournamentId, totalMatches: 1, courts: 1, pointsPerGame: 21 });
  assert.equal((await read()).settingsConfigured, true);
  await succeed('startTournament', { tournamentId });
  const started = await read();
  assert.equal(started.status, 'running');
  assert.equal(started.rounds.length, 1);
  assert.equal(started.rounds[0].matches.length, 1);
  const match = started.rounds[0].matches[0];
  const coordinates = { tournamentId, roundIndex: started.rounds[0].roundIndex, matchIndex: match.matchIndex };
  const lockId = `${tournamentId}_${coordinates.roundIndex}_${coordinates.matchIndex}`;
  const lockSessionId = 'journey-score-session';
  await succeed('scoreLock', { ...coordinates, action: 'acquire', lockSessionId });
  assert.equal((await db.collection('score_locks').doc(lockId).get()).data.lockSessionId, lockSessionId);

  const rejected = await handlers.submitScore({ ...coordinates, scoreA: 21, scoreB: 17, lockSessionId: 'stale-session' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'LOCK_EXPIRED');
  assert.equal((await read()).version, started.version);
  assert.equal((await read()).rounds[0].matches[0].status, 'pending');
  const submitted = await succeed('submitScore', { ...coordinates, scoreA: 21, scoreB: 17, lockSessionId });
  assert.equal(submitted.finished, true);
  const finished = await read();
  assert.equal(finished.status, 'finished');
  assert.equal(finished.rounds[0].matches[0].scorerId, context.openid);
  assert.equal(finished.rankings.length, 4);
  const winners = new Set(match.teamA.map((player) => player.id));
  assert.deepEqual(new Set(finished.rankings.filter((row) => row.wins === 1).map((row) => row.playerId)), winners);
  assert.equal((await db.collection('score_locks').where({ tournamentId }).get()).data.length, 0);

  const retry = await succeed('submitScore', { ...coordinates, scoreA: 21, scoreB: 17, lockSessionId });
  assert.equal(retry.deduped, true);
  assert.equal((await read()).version, finished.version);
  await succeed('resetTournament', { tournamentId });
  const reset = await read();
  assert.equal(reset.status, 'draft');
  assert.deepEqual(reset.rounds, []);
  assert.equal(reset.players.length, 4);
  assert.ok(reset.rankings.every((row) => row.wins === 0));
  await succeed('deleteTournament', { tournamentId });
  assert.equal((await db.collection('tournaments').where({ _id: tournamentId }).get()).data.length, 0);
  assert.equal((await db.collection('score_locks').where({ tournamentId }).get()).data.length, 0);
});
