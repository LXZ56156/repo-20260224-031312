const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const mainPath = path.join(__dirname, '..', 'cloudfunctions', 'generateShareCode', 'index.js');

function clearModule(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
  } catch (_) {}
}

function buildTournament(extra = {}) {
  return {
    _id: 'tid_123',
    creatorId: 'u_owner',
    players: [{ id: 'u_owner', name: '创建者' }],
    playerIds: ['u_owner'],
    ...extra
  };
}

function loadMain(options = {}) {
  const originalLoad = Module._load;
  const calls = {
    getUnlimited: [],
    uploadFile: []
  };
  const tournament = options.tournament;
  const mockSdk = {
    init() {},
    database() {
      return {
        collection(name) {
          assert.equal(name, 'tournaments');
          return {
            doc(id) {
              assert.equal(id, String(options.expectedTournamentId || 'tid_123'));
              return {
                async get() {
                  if (options.readError) throw options.readError;
                  return { data: tournament };
                }
              };
            }
          };
        }
      };
    },
    getWXContext() {
      return { OPENID: String(options.openid || 'u_owner') };
    },
    openapi: {
      wxacode: {
        async getUnlimited(payload) {
          calls.getUnlimited.push(payload);
          return { buffer: Buffer.from('png-content') };
        }
      }
    },
    async uploadFile(payload) {
      calls.uploadFile.push(payload);
      return { fileID: 'cloud://test/share-codes/code.png' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  clearModule(mainPath);
  clearModule(path.join(path.dirname(mainPath), 'lib', 'common.js'));
  clearModule(path.join(path.dirname(mainPath), 'lib', 'player.js'));
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockSdk;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return { ...require(mainPath), calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('generateShareCode returns structured failure for missing tournamentId', async () => {
  const { main, calls } = loadMain({ tournament: buildTournament() });

  const result = await main({});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOURNAMENT_ID_REQUIRED');
  assert.equal(result.state, 'invalid');
  assert.equal(calls.getUnlimited.length, 0);
});

test('generateShareCode refuses viewers outside the tournament', async () => {
  const { main, calls } = loadMain({
    tournament: buildTournament(),
    openid: 'u_viewer'
  });

  const result = await main({ tournamentId: 'tid_123' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
  assert.equal(result.state, 'forbidden');
  assert.equal(calls.getUnlimited.length, 0);
});

test('generateShareCode validates scene before calling wxacode', async () => {
  const tournamentId = '中文赛事';
  const { main, calls } = loadMain({
    tournament: buildTournament({ _id: tournamentId }),
    expectedTournamentId: tournamentId
  });

  const result = await main({ tournamentId });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARE_CODE_SCENE_INVALID');
  assert.equal(result.state, 'invalid');
  assert.equal(calls.getUnlimited.length, 0);
});

test('generateShareCode creates a develop code and uploads it to a deterministic path', async () => {
  const { main, calls } = loadMain({ tournament: buildTournament() });

  const result = await main({
    tournamentId: 'tid_123',
    envVersion: 'develop',
    __traceId: 'trace_share_code'
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'SHARE_CODE_READY');
  assert.equal(result.state, 'ready');
  assert.equal(result.traceId, 'trace_share_code');
  assert.equal(result.fileID, 'cloud://test/share-codes/code.png');
  assert.equal(result.data.fileID, 'cloud://test/share-codes/code.png');
  assert.deepEqual(calls.getUnlimited, [{
    page: 'pages/share-entry/index',
    scene: 'tid_123',
    checkPath: false,
    envVersion: 'develop',
    width: 280
  }]);
  assert.equal(calls.uploadFile.length, 1);
  assert.match(calls.uploadFile[0].cloudPath, /^share-codes\/develop\/[0-9a-f]{40}\.png$/);
  assert.deepEqual(calls.uploadFile[0].fileContent, Buffer.from('png-content'));
});

test('generateShareCode enables path validation for release codes', async () => {
  const { main, calls } = loadMain({ tournament: buildTournament() });

  await main({ tournamentId: 'tid_123', envVersion: 'release' });

  assert.equal(calls.getUnlimited[0].checkPath, true);
  assert.equal(calls.getUnlimited[0].envVersion, 'release');
});
