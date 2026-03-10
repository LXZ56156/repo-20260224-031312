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

function createDbHarness(options = {}) {
  const tournamentDoc = options.tournamentDoc;
  const updateStats = options.updateStats || { updated: 1 };
  const shouldThrowMissingDoc = !!options.shouldThrowMissingDoc;
  const db = {
    command: {
      inc(value) {
        return { $inc: value };
      }
    },
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'tournaments') {
        return {
          doc(id) {
            assert.equal(id, 't_1');
            return {
              async get() {
                if (shouldThrowMissingDoc) throw new Error('document.get:fail document does not exist');
                return { data: tournamentDoc };
              }
            };
          },
          where(query) {
            assert.deepEqual(query, { _id: 't_1', version: 1 });
            return {
              async update() {
                return { stats: updateStats };
              }
            };
          }
        };
      }
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [] };
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }
  };
  return db;
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

test('joinTournament returns stable codes for missing id and missing tournament', async () => {
  const missingIdMain = loadJoinTournamentMain(createDbHarness({ tournamentDoc: buildTournament() })).main;
  assert.deepEqual(await missingIdMain({}, {}), {
    ok: false,
    code: 'TOURNAMENT_ID_REQUIRED',
    message: '缺少赛事ID',
    state: 'invalid',
    traceId: ''
  });

  const missingDocMain = loadJoinTournamentMain(createDbHarness({ shouldThrowMissingDoc: true })).main;
  assert.deepEqual(await missingDocMain({ tournamentId: 't_1' }, {}), {
    ok: false,
    code: 'TOURNAMENT_NOT_FOUND',
    message: '赛事不存在',
    state: 'not_found',
    traceId: ''
  });
});

test('joinTournament returns JOIN_DRAFT_ONLY for non-draft tournaments', async () => {
  const { main } = loadJoinTournamentMain(createDbHarness({
    tournamentDoc: buildTournament({ status: 'running' })
  }));

  assert.deepEqual(await main({ tournamentId: 't_1' }, {}), {
    ok: false,
    code: 'JOIN_DRAFT_ONLY',
    message: '非草稿阶段不可加入/修改',
    state: 'forbidden',
    traceId: ''
  });
});

test('joinTournament returns VERSION_CONFLICT for optimistic update misses', async () => {
  const { main } = loadJoinTournamentMain(createDbHarness({
    tournamentDoc: buildTournament(),
    updateStats: { updated: 0 }
  }));

  assert.deepEqual(await main({
    tournamentId: 't_1',
    nickname: '新球友',
    avatar: 'cloud://avatar-file',
    gender: 'male'
  }, {}), {
    ok: false,
    code: 'VERSION_CONFLICT',
    message: '并发冲突，请重试',
    state: 'conflict',
    traceId: ''
  });
});
