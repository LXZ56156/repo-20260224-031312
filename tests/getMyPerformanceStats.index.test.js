const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/getMyPerformanceStats/index.js');
const logicPath = require.resolve('../cloudfunctions/getMyPerformanceStats/logic.js');

function loadMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_stat' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[logicPath];

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

test('getMyPerformanceStats aggregates finished participated tournaments from indexed query', async () => {
  const queries = [];
  const db = {
    command: {
      in(value) {
        return { $in: value };
      },
      exists(value) {
        return { $exists: value };
      }
    },
    collection(name) {
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          queries.push(query);
          return {
            field() {
              return this;
            },
            skip() {
              return this;
            },
            limit() {
              return this;
            },
            async get() {
              if (query.playerIds && query.playerIds.$in) {
                return {
                  data: [{
                    _id: 't_1',
                    status: 'finished',
                    playerIds: ['u_stat'],
                    rounds: [{
                      matches: [{
                        status: 'finished',
                        teamA: [{ id: 'u_stat' }],
                        teamB: [{ id: 'p_2' }],
                        scoreA: 21,
                        scoreB: 18,
                        scoredAt: '2026-03-12T10:00:00.000Z'
                      }]
                    }],
                    updatedAt: '2026-03-12T10:10:00.000Z'
                  }]
                };
              }
              return { data: [] };
            }
          };
        }
      };
    }
  };
  const { main } = loadMain(db);

  const result = await main({ window: 'all' });

  assert.equal(queries.length >= 2, true);
  assert.equal(result.ok, true);
  assert.equal(result.tournamentsCompleted, 1);
  assert.equal(result.matchesPlayed, 1);
  assert.equal(result.wins, 1);
  assert.equal(result.losses, 0);
  assert.equal(result.pointDiff, 3);
  assert.match(String(result.updatedAt || ''), /^20/);
});
