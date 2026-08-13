const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');

const mainPath = require.resolve('../cloudfunctions/waterSession/index.js');

function enabledFeatureConfig() {
  return {
    emergencyReadOnly: false,
    v2Read: true,
    rosterWrite: true,
    ownerWrite: true,
    memberWrite: true,
    correctWrite: true,
    reverseWrite: true,
    createRoundWrite: true,
    canaryRoomIds: [],
    canaryOpenids: [],
    revision: 1
  };
}

function makeDb(seed = null, featureConfig = enabledFeatureConfig()) {
  let doc = seed ? { ...seed } : null;
  const touched = [];
  const docApi = {
    async get() {
      if (!doc) throw new Error('document.get:fail document does not exist');
      return { data: { ...doc } };
    },
    async set(payload) {
      doc = { ...payload.data };
      touched.push('waterSessions:set');
      return { _id: 'water_test' };
    },
    async update(payload) {
      doc = { ...doc, ...payload.data };
      touched.push('waterSessions:update');
      return { stats: { updated: 1 } };
    }
  };
  const db = {
    serverDate() { return { $serverDate: true }; },
    async createCollection(name) { touched.push(`${name}:create`); },
    collection(name) {
      touched.push(name);
      assert.notEqual(name, 'tournaments');
      if (name === 'water_feature_flags') {
        return {
          doc() {
            return {
              async get() {
                if (!featureConfig) throw new Error('document.get:fail document does not exist');
                return { data: { ...featureConfig } };
              }
            };
          }
        };
      }
      return { doc() { return docApi; } };
    },
    async runTransaction(handler) {
      return handler({ collection: db.collection.bind(db) });
    }
  };
  return { db, touched, read: () => doc };
}

function loadMain(db, openid = 'u_owner') {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: openid }; },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };
  delete require.cache[mainPath];
  Module._load = function patched(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(mainPath).main;
  } finally {
    Module._load = originalLoad;
  }
}

function activeSession() {
  return {
    _id: 'water_test',
    ownerOpenid: 'u_owner',
    title: '测试打水局',
    status: 'active',
    version: 3,
    participants: [
      { id: 'a', name: '阿杰', openid: 'u_owner', source: 'owner' },
      { id: 'b', name: '小林', openid: '', source: 'manual' }
    ],
    entries: [],
    recentRequestIds: []
  };
}

test('waterSession is registered for explicit cloud dependency installation', () => {
  const config = JSON.parse(fs.readFileSync('cloudbaserc.json', 'utf8'));
  const item = config.functions.find((entry) => entry.name === 'waterSession');

  assert.ok(item, 'waterSession must be registered in cloudbaserc.json');
  assert.equal(item.installDependency, true);
});

test('create writes only waterSessions and never exposes openid', async () => {
  const state = makeDb();
  const main = loadMain(state.db);
  const res = await main({ action: 'create', ownerName: '阿杰', clientRequestId: 'req_create' });

  assert.equal(res.ok, true);
  assert.equal(res.code, 'WATER_SESSION_CREATED');
  assert.equal(res.session.isOwner, true);
  assert.equal(res.session.participants[0].isViewer, true);
  assert.equal(Object.prototype.hasOwnProperty.call(res, 'openid'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.data, 'openid'), false);
  assert.equal(JSON.stringify(res).includes('u_owner'), false);
  assert.ok(state.touched.every((item) => !String(item).includes('tournaments')));
});

test('owner records one game with optimistic version and idempotent retry', async () => {
  const state = makeDb(activeSession());
  const main = loadMain(state.db);
  const event = {
    action: 'recordGame',
    sessionId: 'water_test',
    expectedVersion: 3,
    winnerIds: ['a'],
    loserIds: ['b'],
    unitsPerPlayer: 1,
    clientRequestId: 'req_game_1'
  };
  const first = await main(event);
  const retry = await main(event);

  assert.equal(first.ok, true);
  assert.equal(first.session.version, 4);
  assert.equal(first.session.entries.length, 1);
  assert.equal(retry.ok, true);
  assert.equal(retry.state, 'deduped');
  assert.equal(retry.session.entries.length, 1);
});

test('stale version is a structured conflict and does not mutate entries', async () => {
  const state = makeDb(activeSession());
  const main = loadMain(state.db);
  const res = await main({
    action: 'recordDirect',
    sessionId: 'water_test',
    expectedVersion: 2,
    playerId: 'a',
    counterpartyId: 'b',
    direction: 'plus',
    units: 1,
    clientRequestId: 'req_direct_stale'
  });

  assert.equal(res.ok, false);
  assert.equal(res.code, 'VERSION_CONFLICT');
  assert.equal(res.state, 'conflict');
  assert.equal(state.read().entries.length, 0);
});

test('invitee cannot write entries but can claim a manual participant', async () => {
  const deniedState = makeDb(activeSession());
  const deniedMain = loadMain(deniedState.db, 'u_invitee');
  const denied = await deniedMain({
    action: 'recordDirect',
    sessionId: 'water_test',
    expectedVersion: 3,
    playerId: 'a',
    counterpartyId: 'b',
    direction: 'minus',
    units: 1,
    clientRequestId: 'req_forbidden'
  });
  assert.equal(denied.code, 'WATER_SESSION_FORBIDDEN');

  const joinedState = makeDb(activeSession());
  const joinedMain = loadMain(joinedState.db, 'u_invitee');
  const joined = await joinedMain({
    action: 'join',
    sessionId: 'water_test',
    expectedVersion: 3,
    nickname: '新昵称',
    claimParticipantId: 'b',
    clientRequestId: 'req_join_claim'
  });
  assert.equal(joined.ok, true);
  assert.equal(joined.session.viewerParticipantId, 'b');
  assert.equal(joined.session.participants.length, 2);
});
