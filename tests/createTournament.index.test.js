const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/createTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/createTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/createTournament/lib/mode.js');

function loadMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_creator' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];
  delete require.cache[modePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(mainPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('createTournament writes normalized tournament document with default creator player', async () => {
  let createCollectionName = '';
  let addedData = null;
  const db = {
    async createCollection(name) {
      createCollectionName = name;
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        async add(payload) {
          addedData = payload.data;
          return { _id: 't_new' };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    name: '周五夜场',
    nickname: '',
    avatar: 'https://avatar.test/a.png',
    mode: 'squad_doubles',
    creatorGender: 'female',
    totalMatches: 12,
    courts: 2,
    presetKey: 'custom',
    pointsPerGame: 15,
    endConditionType: 'target_wins',
    endConditionTarget: 6
  });

  assert.deepEqual(result, { tournamentId: 't_new' });
  assert.equal(createCollectionName, 'tournaments');
  assert.equal(addedData.name, '周五夜场');
  assert.equal(addedData.creatorId, 'u_creator');
  assert.equal(addedData.mode, 'squad_doubles');
  assert.equal(addedData.settingsConfigured, true);
  assert.equal(addedData.courts, 2);
  assert.equal(addedData.totalMatches, 12);
  assert.equal(addedData.rules.pointsPerGame, 15);
  assert.deepEqual(addedData.rules.endCondition, { type: 'target_wins', target: 6 });
  assert.equal(addedData.players.length, 1);
  assert.deepEqual(addedData.players[0], {
    id: 'u_creator',
    name: '球员1',
    type: 'user',
    avatar: 'https://avatar.test/a.png',
    gender: 'female',
    squad: ''
  });
});

test('createTournament rejects empty tournament name', async () => {
  const db = {
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      throw new Error('should not write');
    }
  };
  const { main } = loadMain(db);

  await assert.rejects(() => main({ name: '   ' }), /赛事名称不能为空/);
});
