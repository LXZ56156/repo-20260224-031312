const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Local-only database, following the V2 cloud test's serialized transaction model.
function memoryDb() {
  let tables = {};
  const clone = value => JSON.parse(JSON.stringify(value));
  const collection = (store, name) => {
    const docs = store[name] || (store[name] = {});
    return {
      doc(id) { return {
        async get() {
          if (!docs[id]) throw new Error('document.get:fail document does not exist');
          return { data: { _id: id, ...clone(docs[id]) } };
        },
        async set({ data }) { docs[id] = clone(data); return { _id: id }; },
        async update({ data }) { Object.assign(docs[id], clone(data)); return { stats: { updated: 1 } }; }
      }; },
      where(filter) {
        let order, limit = Infinity;
        const query = {
          orderBy(field, direction) { order = { field, direction }; return query; },
          limit(value) { limit = value; return query; },
          async get() {
            let rows = Object.entries(docs).map(([id, data]) => ({ _id: id, ...clone(data) })).filter(row =>
              Object.entries(filter).every(([key, value]) => {
                if (value && typeof value === 'object') {
                  if ('$lt' in value) return row[key] < value.$lt;
                  if ('$gt' in value) return row[key] > value.$gt;
                  if ('$in' in value) return value.$in.includes(row[key]);
                }
                return row[key] === value;
              }));
            if (order) rows.sort((a, b) => (a[order.field] < b[order.field] ? -1 : a[order.field] > b[order.field] ? 1 : 0) * (order.direction === 'asc' ? 1 : -1));
            return { data: rows.slice(0, limit) };
          }
        };
        return query;
      }
    };
  };
  return {
    command: { lt: value => ({ $lt: value }), gt: value => ({ $gt: value }), in: value => ({ $in: value }) },
    serverDate: () => ({ $serverDate: true }),
    async createCollection(name) { tables[name] ||= {}; },
    collection: name => collection(tables, name),
    async runTransaction(handler) {
      const draft = clone(tables);
      const result = await handler({ collection: name => collection(draft, name) });
      tables = draft;
      return result;
    }
  };
}

test('water client wrappers and cloud handler share one ledger lifecycle and preserve old links', async t => {
  const db = memoryDb();
  await db.collection('water_feature_flags').doc('collaborative_v2').set({ data: {
    emergencyReadOnly: false, v2Read: true, rosterWrite: true, ownerWrite: true,
    memberWrite: true, correctWrite: true, reverseWrite: true, createRoundWrite: true,
    canaryRoomIds: [], canaryOpenids: [], revision: 1
  } });
  let openid = 'test_owner';
  const mainPath = require.resolve('../cloudfunctions/waterSession/index.js');
  const originalLoad = Module._load;
  const oldMain = require.cache[mainPath];
  const oldWx = global.wx;
  t.after(() => {
    global.wx = oldWx;
    if (oldMain) require.cache[mainPath] = oldMain;
    else delete require.cache[mainPath];
  });
  delete require.cache[mainPath];
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return {
      init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }), DYNAMIC_CURRENT_ENV: 'isolated-test'
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  let handler;
  try { handler = require(mainPath).main; } finally { Module._load = originalLoad; }
  const requests = [];
  global.wx = { cloud: { async callFunction({ name, data }) {
    assert.equal(name, 'waterSession');
    requests.push(JSON.parse(JSON.stringify(data)));
    return { result: await handler(data) };
  } } };
  const client = require('../miniprogram/core/waterSession');
  const created = await client.createLedger('阿杰', { clientRequestId: 'e2e_create' });
  const roomId = created.data.room.id;
  const roundId = created.data.round.id;
  const ownerId = created.data.viewer.participantId;
  assert.equal(created.data.room.participants.length, 1);
  assert.equal((await client.createLedger('阿杰', { clientRequestId: 'e2e_create' })).data.room.id, roomId);
  const roster = await client.addParticipantsV2(roomId, ['小林'], { expectedRoomVersion: created.data.room.roomVersion, clientRequestId: 'e2e_add' });
  const lin = roster.data.room.participants.find(item => item.name === '小林');
  openid = 'test_member';
  const visitor = await client.getV2(roomId);
  assert.equal(visitor.data.viewer.role, 'visitor');
  const joined = await client.joinV2(roomId, '小林', {
    claimParticipantId: lin.id, expectedRoomVersion: roster.data.room.roomVersion, clientRequestId: 'e2e_join'
  });
  assert.equal(joined.data.viewer.role, 'member');
  const recorded = await client.recordGameV2(roomId, roundId, [lin.id], [ownerId], 2, { clientRequestId: 'e2e_record' });
  assert.equal(recorded.data.round.activeRecordCount, 1);
  const replay = await client.recordGameV2(roomId, roundId, [lin.id], [ownerId], 2, { clientRequestId: 'e2e_record' });
  assert.equal(replay.data.entry.id, recorded.data.entry.id);
  const reversed = await client.reverseEntry(roomId, roundId, recorded.data.entry.rootEntryId, recorded.data.entry.id, { clientRequestId: 'e2e_reverse' });
  assert.equal(reversed.data.round.activeRecordCount, 0);
  assert.ok(reversed.data.round.ledger.every(row => row.net === 0));
  assert.equal((await client.listEntries(roomId, roundId)).data.entries.length, 2);
  assert.ok((await client.listLedgers()).data.ledgers.some(item => item.id === roomId));
  openid = 'test_owner';
  const before = await client.getV2(roomId);
  const next = await client.createLedger('阿杰', { clientRequestId: 'e2e_next' });
  assert.notEqual(next.data.room.id, roomId);
  assert.equal(next.data.room.participants.length, 1);
  assert.equal(next.data.round.recordCount, 0);
  // Existing shared roomId links still load their original book after a new one is created.
  const oldLink = await client.getV2(roomId);
  assert.deepEqual(oldLink.data.round, before.data.round);
  assert.deepEqual(oldLink.data.room.participants, before.data.room.participants);
  assert.equal((await client.listLedgers()).data.ledgers.length, 2);
  assert.ok(requests.every(item => item.apiVersion === 2 && item.__traceId));
  assert.ok(requests.filter(item => ['get', 'listEntries', 'listLedgers'].includes(item.action)).every(item => !item.clientRequestId));
});
