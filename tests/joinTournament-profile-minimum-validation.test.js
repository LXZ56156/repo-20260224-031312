const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const joinTournamentIndexPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const joinTournamentCommonPath = require.resolve('../cloudfunctions/joinTournament/lib/common.js');
const joinTournamentModePath = require.resolve('../cloudfunctions/joinTournament/lib/mode.js');

function loadJoinTournamentMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_viewer' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[joinTournamentIndexPath];
  delete require.cache[joinTournamentCommonPath];
  delete require.cache[joinTournamentModePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(joinTournamentIndexPath);
  } finally {
    Module._load = originalLoad;
  }
}

function buildTournament(extra = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'multi_rotate',
    version: 1,
    players: [],
    ...extra
  };
}

function createDbHarness(options = {}) {
  const tournamentDoc = options.tournamentDoc || buildTournament();
  const userProfiles = Array.isArray(options.userProfiles) ? options.userProfiles : [];
  const calls = {
    updatePayload: null
  };

  const buildTransactionApi = () => ({
    collection(name) {
      if (name === 'tournaments') {
        return {
          doc(id) {
            assert.equal(id, 't_1');
            return {
              async get() {
                return { data: tournamentDoc };
              },
              async update(payload) {
                calls.updatePayload = payload;
                return { stats: { updated: 1 } };
              }
            };
          }
        };
      }
      throw new Error(`unexpected transaction collection ${name}`);
    }
  });

  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    async runTransaction(fn) {
      return fn(buildTransactionApi());
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where(query) {
            assert.deepEqual(query, { openid: 'u_viewer' });
            return {
              limit(size) {
                assert.equal(size, 1);
                return {
                  async get() {
                    return { data: userProfiles };
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`unexpected top-level collection ${name}`);
    }
  };
  return { db, calls };
}

test('joinTournament rejects join requests that still miss minimum profile fields after fallback', async () => {
  const { db, calls } = createDbHarness();
  const { main } = loadJoinTournamentMain(db);

  const result = await main({ tournamentId: 't_1' }, {});

  assert.deepEqual(result, {
    ok: false,
    code: 'PROFILE_MINIMUM_REQUIRED',
    message: '请先完善昵称、头像、性别后再加入比赛',
    state: 'invalid',
    traceId: '',
    data: {}
  });
  assert.equal(calls.updatePayload, null);
});

test('joinTournament can backfill minimum profile fields from user_profiles', async () => {
  const { db, calls } = createDbHarness({
    userProfiles: [{
      nickName: '云端球友',
      avatar: 'cloud://avatar-file',
      gender: 'female'
    }]
  });
  const { main } = loadJoinTournamentMain(db);

  const result = await main({ tournamentId: 't_1' }, {});

  assert.equal(result.ok, true);
  assert.equal(result.added, true);
  assert.deepEqual(result.player, {
    id: 'u_viewer',
    name: '云端球友',
    avatar: 'cloud://avatar-file',
    gender: 'female',
    squad: ''
  });
  assert.ok(calls.updatePayload && Array.isArray(calls.updatePayload.data.players));
  assert.deepEqual(calls.updatePayload.data.players[0], result.player);
});
