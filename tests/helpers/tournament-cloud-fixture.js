const Module = require('node:module');
const assert = require('node:assert/strict');

// Offline snapshot isolation: only conflicting writes cause callback replay.
// This fixture does not prove wx SDK/runtime/security-rule behaviour.
function createDb(tournament) {
  const rows = new Map([['tournaments/t1', globalThis.structuredClone(tournament)]]);
  const revisions = new Map();
  let nextId = 0;
  const copy = (value) => value === undefined ? undefined : globalThis.structuredClone(value);
  function patch(row, data) {
    const out = copy(row || {});
    for (const [key, value] of Object.entries(data)) {
      assert.notEqual(key, '_id');
      if (value && value.op === 'inc') out[key] = (Number(out[key]) || 0) + value.amount;
      else if (value && value.op === 'remove') delete out[key];
      else out[key] = copy(value);
    }
    return out;
  }
  function reader(snapshot, writes) {
    return { collection(name) {
      return {
        async add({ data }) {
          const id = `copy_${++nextId}`;
          writes.set(`${name}/${id}`, { ...copy(data), _id: id });
          return { _id: id };
        },
        where(filter) {
          const selected = () => [...snapshot.entries()].filter(([key, row]) =>
            key.startsWith(`${name}/`) && Object.entries(filter).every(([k, v]) =>
              v && v.op === 'gt' ? row[k] > v.value : row[k] === v));
          let limit = Infinity;
          const query = {
            limit(value) { limit = value; return query; },
            async get() {
              const data = copy(selected().slice(0, limit).map(([, row]) => row));
              if (name === 'score_locks') {
                assert.equal(limit, 1);
                assert.deepEqual(Object.keys(filter).sort(), ['expireAt', 'tournamentId']);
                db.activeLockQueries += 1;
                if (db.afterLockQuery) {
                  const hook = db.afterLockQuery;
                  db.afterLockQuery = null;
                  await hook();
                }
              }
              return { data };
            },
            async update({ data }) {
              const matches = selected();
              matches.forEach(([key, row]) => writes.set(key, patch(row, data)));
              return { stats: { updated: matches.length } };
            },
            async remove() {
              const matches = selected();
              matches.forEach(([key]) => writes.set(key, undefined));
              return { stats: { removed: matches.length } };
            }
          };
          return query;
        },
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              if (name === 'score_locks') db.lockDocReads += 1;
              if (!snapshot.has(key)) throw new Error('document does not exist');
              return { data: copy(snapshot.get(key)) };
            },
            async set({ data }) {
              assert.equal(Object.hasOwn(data, '_id'), false);
              writes.set(key, { ...copy(data), _id: id });
            },
            async update({ data }) {
              if (!snapshot.has(key)) return { stats: { updated: 0 } };
              writes.set(key, patch(snapshot.get(key), data));
              return { stats: { updated: 1 } };
            },
            async remove() { writes.set(key, undefined); }
          };
        }
      };
    } };
  }
  function commit(writes) {
    for (const [key, value] of writes) {
      if (value === undefined) rows.delete(key);
      else rows.set(key, copy(value));
      revisions.set(key, (revisions.get(key) || 0) + 1);
    }
  }
  const db = {
    rows, attempts: 0, beforeCommit: null, afterLockQuery: null, activeLockQueries: 0, lockDocReads: 0,
    command: { inc: (amount) => ({ op: 'inc', amount }), remove: () => ({ op: 'remove' }), gt: (value) => ({ op: 'gt', value }) },
    serverDate: () => new Date(),
    createCollection: async () => {},
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        db.attempts += 1;
        const expected = new Map(revisions);
        const snapshot = new Map([...rows].map(([key, value]) => [key, copy(value)]));
        const writes = new Map();
        const result = await callback(reader(snapshot, writes));
        if (writes.size && db.beforeCommit) {
          const hook = db.beforeCommit;
          db.beforeCommit = null;
          await hook();
        }
        if ([...writes.keys()].some((key) => (expected.get(key) || 0) !== (revisions.get(key) || 0))) continue;
        commit(writes);
        return result;
      }
      throw new Error('transaction conflict');
    },
    collection(name) {
      const writes = new Map();
      const collection = reader(rows, writes).collection(name);
      return {
        ...collection,
        where(filter) {
          const query = collection.where(filter);
          return { limit(value) { query.limit(value); return this; }, get: (...args) => query.get(...args),
            async update(...args) { const result = await query.update(...args); commit(writes); return result; },
            async remove(...args) { const result = await query.remove(...args); commit(writes); return result; } };
        },
        doc(id) {
          const document = collection.doc(id);
          return Object.fromEntries(Object.entries(document).map(([key, fn]) => [key, async (...args) => {
            const result = await fn(...args); commit(writes); return result;
          }]));
        }
      };
    }
  };
  return db;
}

function load(db, context = { openid: 'owner' }, names = ['finishTournament', 'scoreLock', 'submitScore', 'resetTournament', 'cloneTournament']) {
  const original = Module._load;
  const sdk = { init() {}, database: () => db, getWXContext: () => ({ OPENID: context.openid }),
    openapi: context.openapi, DYNAMIC_CURRENT_ENV: 'offline' };
  Module._load = function (request, parent, main) {
    return request === 'wx-server-sdk' ? sdk : original.call(this, request, parent, main);
  };
  try {
    return Object.fromEntries(names.map((name) => {
      const path = require.resolve(`../../cloudfunctions/${name}/index.js`);
      delete require.cache[path];
      return [name, require(path).main];
    }));
  } finally { Module._load = original; }
}


module.exports = { createDb, load };
