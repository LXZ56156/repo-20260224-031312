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

  assert.deepEqual(result, {
    ok: true,
    code: 'TOURNAMENT_CREATED',
    message: '已创建比赛',
    state: 'created',
    traceId: '',
    tournamentId: 't_new',
    data: { tournamentId: 't_new' }
  });
  assert.equal(createCollectionName, 'tournaments');
  assert.equal(addedData.name, '周五夜场');
  assert.equal(addedData.creatorId, 'u_creator');
  assert.equal(addedData.mode, 'squad_doubles');
  assert.equal(addedData.settingsConfigured, false);
  assert.equal(addedData.courts, 0);
  assert.equal(addedData.totalMatches, 0);
  assert.equal(addedData.rules.pointsPerGame, 21);
  assert.deepEqual(addedData.rules.endCondition, { type: 'total_matches', target: 1 });
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

test('createTournament rejects wxfile avatar before creating a tournament', async () => {
  const db = {
    collection() {
      throw new Error('should not write tournament');
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    name: '周五夜场',
    avatar: 'wxfile://tmp/avatar.png',
    mode: 'multi_rotate',
    creatorGender: 'female',
    __traceId: 'trace-create-avatar'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_AVATAR_INVALID');
  assert.equal(result.message, '头像地址无效，请重新上传');
  assert.equal(result.state, 'invalid');
  assert.equal(result.traceId, 'trace-create-avatar');
});

test('createTournament applies fixed rotation preset defaults without adding real modes', async () => {
  const expected = [
    { presetKey: 'rotation_6', playerLimit: 6, totalMatches: 9 },
    { presetKey: 'rotation_7', playerLimit: 7, totalMatches: 14 },
    { presetKey: 'rotation_8', playerLimit: 8, totalMatches: 14 }
  ];

  for (const item of expected) {
    let addedData = null;
    const db = {
      async createCollection() {},
      serverDate() {
        return { $serverDate: true };
      },
      collection(name) {
        assert.equal(name, 'tournaments');
        return {
          async add(payload) {
            addedData = payload.data;
            return { _id: `t_${item.playerLimit}` };
          }
        };
      }
    };
    const { main } = loadMain(db);

    const result = await main({
      name: '周末自定义赛',
      nickname: '组织者',
      mode: 'squad_doubles',
      presetKey: item.presetKey
    });

    assert.equal(result.ok, true);
    assert.equal(addedData.name, `${item.playerLimit}人转`);
    assert.equal(addedData.mode, 'multi_rotate');
    assert.equal(addedData.presetKey, item.presetKey);
    assert.equal(addedData.playerLimit, item.playerLimit);
    assert.equal(addedData.settingsConfigured, true);
    assert.equal(addedData.totalMatches, item.totalMatches);
    assert.equal(addedData.courts, 1);
    assert.equal(addedData.rules.pointsPerGame, 21);
    assert.deepEqual(addedData.rules.endCondition, {
      type: 'total_matches',
      target: item.totalMatches
    });
    assert.equal(addedData.players.length, 1);
  }
});

test('createTournament falls back unknown presetKey to custom without auto configuration', async () => {
  let addedData = null;
  const db = {
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        async add(payload) {
          addedData = payload.data;
          return { _id: 't_custom' };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    name: '未知模板',
    mode: 'multi_rotate',
    presetKey: 'rotation_9'
  });

  assert.equal(result.ok, true);
  assert.equal(addedData.mode, 'multi_rotate');
  assert.equal(addedData.presetKey, 'custom');
  assert.equal(Object.prototype.hasOwnProperty.call(addedData, 'playerLimit'), false);
  assert.equal(addedData.settingsConfigured, false);
  assert.equal(addedData.totalMatches, 0);
  assert.equal(addedData.courts, 0);
});

test('createTournament returns structured invalid result for empty tournament name', async () => {
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

  const result = await main({ name: '   ', __traceId: 'trace-create-invalid' });
  assert.deepEqual(result, {
    ok: false,
    code: 'SETTINGS_INVALID',
    message: '赛事名称不能为空',
    state: 'invalid',
    traceId: 'trace-create-invalid',
    data: {}
  });
});

test('createTournament treats repeated clientRequestId as deduped success', async () => {
  let addCalled = false;
  const db = {
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                return {
                  data: {
                    status: 'succeeded',
                    resourceId: 't_existing'
                  }
                };
              }
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        async add() {
          addCalled = true;
          return { _id: 't_should_not_write' };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({
    name: '周五夜场',
    clientRequestId: 'req_create_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'deduped');
  assert.equal(result.deduped, true);
  assert.equal(result.tournamentId, 't_existing');
  assert.equal(result.clientRequestId, 'req_create_1');
  assert.equal(addCalled, false);
});

test('createTournament concurrent same clientRequestId only creates one tournament document', async () => {
  const state = {
    requestLog: null,
    tournaments: []
  };
  let barrierCount = 0;
  let releaseBarrier = null;
  const barrierPromise = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const waitForBarrier = async () => {
    barrierCount += 1;
    if (barrierCount >= 2) releaseBarrier();
    await barrierPromise;
  };
  const db = {
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(handler) {
      const pending = {
        tournamentData: null,
        tournamentId: '',
        requestLog: null
      };
      const result = await handler({
        collection(name) {
          if (name === 'client_request_logs') {
            return {
              doc() {
                return {
                  async get() {
                    await waitForBarrier();
                    if (state.requestLog) return { data: state.requestLog };
                    throw new Error('document.get:fail requested document does not exist');
                  },
                  async set(payload) {
                    pending.requestLog = payload.data;
                  }
                };
              }
            };
          }
          if (name === 'tournaments') {
            return {
              async add(payload) {
                pending.tournamentData = payload.data;
                pending.tournamentId = `t_${state.tournaments.length + 1}`;
                return { _id: pending.tournamentId };
              }
            };
          }
          throw new Error(`unexpected collection ${name}`);
        }
      });
      if (pending.requestLog) {
        if (state.requestLog) throw new Error('write conflict');
        state.requestLog = pending.requestLog;
      }
      if (pending.tournamentData) {
        state.tournaments.push({
          _id: pending.tournamentId,
          ...pending.tournamentData
        });
      }
      return result;
    },
    collection(name) {
      if (name === 'client_request_logs') {
        return {
          doc() {
            return {
              async get() {
                if (state.requestLog) return { data: state.requestLog };
                throw new Error('document.get:fail requested document does not exist');
              }
            };
          }
        };
      }
      if (name === 'tournaments') {
        return {
          async add() {
            throw new Error('unexpected fallback add');
          }
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }
  };
  const { main } = loadMain(db);

  const [first, second] = await Promise.all([
    main({ name: '周五夜场', clientRequestId: 'req_create_concurrent_1' }),
    main({ name: '周五夜场', clientRequestId: 'req_create_concurrent_1' })
  ]);

  assert.equal(state.tournaments.length, 1);
  assert.equal(state.requestLog.resourceId, state.tournaments[0]._id);
  assert.deepEqual([first.state, second.state].sort(), ['created', 'deduped']);
  assert.deepEqual([first.tournamentId, second.tournamentId], [state.tournaments[0]._id, state.tournaments[0]._id]);
});
