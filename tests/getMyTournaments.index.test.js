const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const op = (kind) => (value) => ({ kind, value });
function values(doc, path) {
  if (!path.length) return Array.isArray(doc) ? doc : [doc];
  if (Array.isArray(doc)) return doc.flatMap((item) => values(item, path));
  return values(doc && doc[path[0]], path.slice(1));
}
function matches(doc, query) {
  if (query.kind === 'and') return query.value.every((part) => matches(doc, part));
  if (query.kind === 'or') return query.value.some((part) => matches(doc, part));
  return Object.entries(query).every(([key, condition]) => {
    const found = values(doc, key.split('.'));
    if (!condition || !condition.kind) return found.includes(condition);
    if (condition.kind === 'in') return found.some((v) => condition.value.includes(v));
    if (condition.kind === 'neq') return found.every((v) => v !== condition.value);
    if (condition.kind === 'lt') return found.some((v) => v < condition.value);
    if (condition.kind === 'gt') return found.some((v) => v > condition.value);
    if (condition.kind === 'eq') return found.some((v) => +v === +condition.value);
    throw new Error(`unhandled ${condition.kind}`);
  });
}
function load(rows, openid = 'owner', failParticipant = false) {
  const calls = [];
  const db = {
    command: Object.fromEntries(['and', 'or', 'in', 'neq', 'lt', 'gt', 'eq'].map((kind) => [kind, op(kind)])),
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        where(query) { this.query = query; return this; },
        orderBy(key, direction) { calls.push([key, direction]); return this; },
        field() { return this; },
        limit(n) { this.n = n; return this; },
        async get() {
          if (failParticipant && JSON.stringify(this.query).includes('neq')) throw new Error('missing index');
          const data = rows.filter((row) => matches(row, this.query)).sort((a, b) => b.updatedAt - a.updatedAt || a._id.localeCompare(b._id));
          return { data: data.slice(0, this.n) };
        }
      };
    }
  };
  const sdk = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }), DYNAMIC_CURRENT_ENV: 'isolated' };
  const original = Module._load;
  Module._load = function patched(name, ...args) { return name === 'wx-server-sdk' ? sdk : original.call(this, name, ...args); };
  try {
    const path = require.resolve('../cloudfunctions/getMyTournaments/index');
    delete require.cache[path];
    return { ...require(path), calls };
  } finally { Module._load = original; }
}
function tournament(id, extra = {}) {
  return { _id: id, name: `比赛${id}`, mode: 'multi_rotate', status: 'running', updatedAt: new Date('2026-10-03T01:00:00Z'), rounds: [], ...extra };
}

test('recovery merges 25 owner and 25 participant memberships with 10 overlaps into stable 40, without gaps', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => tournament(`t${String(i).padStart(2, '0')}`, {
    creatorId: i < 25 ? 'owner' : 'other', players: i >= 15 ? [{ id: 'owner' }] : [{ id: 'guest' }]
  }));
  const api = load(rows);
  const first = await api.main({ openid: 'other' });
  assert.equal(first.ok, true);
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  const second = await api.main({ cursor: first.nextCursor });
  assert.equal(second.ok, true);
  assert.equal(second.hasMore, false);
  assert.deepEqual(first.items.concat(second.items).map((item) => item.id), rows.map((row) => row._id));
  assert.deepEqual(first.items[15].roles, ['owner', 'participant']);
  assert.ok(api.calls.some(([key]) => key === '_id'));
});

test('recovery uses creator or actual roster IDs; guest name and stale playerIds do not confer membership', async () => {
  const rows = [
    tournament('a', { creatorId: 'owner', players: [] }),
    tournament('b', { players: [{ playerId: 'owner' }], status: 'draft' }),
    tournament('c', { players: [{ _id: 'owner' }], status: 'finished' }),
    tournament('d', { players: [{ id: 'guest_1', name: 'owner' }] }),
    tournament('e', { players: [], playerIds: ['owner'] }),
    tournament('f', { playerIds: ['owner'] })
  ];
  const result = await load(rows).main({ openid: 'guest_1' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.map((item) => item.id), ['a', 'b', 'c', 'f']);
  const json = JSON.stringify(result);
  for (const key of ['creatorId', 'playerIds', 'clientRequestId', 'shareCode', 'rounds']) assert.equal(json.includes(`"${key}"`), false);
});

test('recovery query failure cannot become a successful empty or partial list', async () => {
  const result = await load([tournament('a', { creatorId: 'owner' })], 'owner', true).main({});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOURNAMENT_RECOVERY_FAILED');
  assert.equal(result.items, undefined);
  assert.equal(result.message.includes('index'), false);
});

test('recovery cursors reject tampering and another actual identity', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => tournament(`t${String(i).padStart(2, '0')}`, { creatorId: 'owner' }));
  const first = await load(rows).main({});
  assert.ok(first.nextCursor);
  assert.equal((await load(rows, 'other').main({ cursor: first.nextCursor })).code, 'INVALID_CURSOR');
  assert.equal((await load(rows).main({ cursor: first.nextCursor.slice(0, -1) + '!' })).code, 'INVALID_CURSOR');
  assert.equal((await load(rows, '').main({})).code, 'PERMISSION_DENIED');
});

test('recovery rechecks deleted and unbound membership when continuing, without resurrecting rows', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => tournament(`t${String(i).padStart(2, '0')}`, { players: [{ id: 'owner' }] }));
  const api = load(rows);
  const first = await api.main({});
  rows.splice(20, 1);
  rows[20].players = [];
  rows[20].playerIds = ['owner'];
  const next = await api.main({ cursor: first.nextCursor });
  assert.equal(next.ok, true);
  assert.deepEqual(next.items.map((item) => item.id), ['t22', 't23', 't24', 't25', 't26', 't27', 't28', 't29']);
});

test('stale participant index scan cap exposes a continuation, never a complete empty list', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => tournament(`t${String(i).padStart(3, '0')}`, { players: [], playerIds: ['owner'] }));
  rows.push(tournament('z', { players: [{ id: 'owner' }] }));
  const api = load(rows);
  const first = await api.main({});
  assert.equal(first.ok, true);
  assert.equal(first.code, 'TOURNAMENT_RECOVERY_PAGE_PARTIAL');
  assert.equal(first.completePage, false);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.items, []);
  const next = await api.main({ cursor: first.nextCursor });
  assert.equal(next.hasMore, false);
  assert.deepEqual(next.items.map((item) => item.id), ['z']);
});

test('recovery counts only valid finished scores and orders different dates before ID ties', async () => {
  const rows = [
    tournament('a', { creatorId: 'owner', updatedAt: new Date('2026-10-01'), rounds: [{ matches: [
      { status: 'finished', score: { teamA: 21, teamB: 18 } },
      { status: 'pending', score: { teamA: 21, teamB: 18 } },
      { status: 'canceled', score: { teamA: 21, teamB: 18 } },
      { status: 'finished', score: { teamA: 21, teamB: 21 } }
    ] }] }),
    tournament('b', { creatorId: 'owner' })
  ];
  const result = await load(rows).main({});
  assert.deepEqual(result.items.map((item) => item.id), ['b', 'a']);
  assert.equal(result.items[1].completedMatches, 1);
  assert.equal(result.items[1].totalMatches, 4);
});
