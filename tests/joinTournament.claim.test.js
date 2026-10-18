const clone = value => JSON.parse(JSON.stringify(value));
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/joinTournament/index.js');
const commonPath = require.resolve('../cloudfunctions/joinTournament/lib/common.js');
const modePath = require.resolve('../cloudfunctions/joinTournament/lib/mode.js');

function loadMain(db, openid = 'u_join') {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: openid };
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

function buildTournament(extra = {}) {
  return {
    _id: 't_1',
    creatorId: 'u_admin',
    status: 'draft',
    mode: 'fixed_pair_rr',
    version: 3,
    players: [
      { id: 'u_admin', type: 'user', name: '管理员', avatar: 'cloud://avatar/admin', gender: 'male' },
      { id: 'guest_1', type: 'guest', name: '球友A', avatar: '', gender: 'female' },
      { id: 'u_other', type: 'user', name: '球友B', avatar: 'cloud://avatar/b', gender: 'male' }
    ],
    playerIds: ['u_admin', 'guest_1', 'u_other'],
    pairTeams: [
      { id: 'pair_1', playerIds: ['guest_1', 'u_other'], name: '球友A / 球友B' }
    ],
    rankings: [
      { entityType: 'player', entityId: 'guest_1', playerId: 'guest_1', name: '球友A' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            teamA: [{ id: 'guest_1', name: '球友A', avatar: '' }, { id: 'u_other', name: '球友B', avatar: 'cloud://avatar/b' }],
            teamB: [{ id: 'u_admin', name: '管理员', avatar: 'cloud://avatar/admin' }, { id: 'u_other_2', name: '球友C', avatar: '' }]
          }
        ],
        restPlayers: [{ id: 'guest_1', name: '球友A', avatar: '' }]
      }
    ],
    ...extra
  };
}

test('joinTournament explicitly claims a selected guest and rewrites tournament references', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      assert.equal(name, 'user_profiles');
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      return handler({
        collection(name) {
          assert.equal(name, 'tournaments');
          return {
            doc(id) {
              assert.equal(id, 't_1');
              return {
                async get() {
                  return { data: buildTournament() };
                },
                async update(payload) {
                  writtenData = payload.data;
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({ tournamentId: 't_1', action: 'claim_guest', claimGuestId: 'guest_1', claimConfirmed: true, expectedVersion: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'JOINED');
  assert.equal(result.claimed, true);
  assert.equal(result.claimedGuestId, 'guest_1');
  assert.equal(result.player.id, 'u_join');
  assert.equal(writtenData.players.some((item) => item.id === 'guest_1'), false);
  assert.equal(writtenData.players.some((item) => item.id === 'u_join' && item.avatar === 'cloud://avatar/a.png'), true);
  assert.deepEqual(writtenData.playerIds, ['u_admin', 'u_join', 'u_other']);
  assert.deepEqual(writtenData.pairTeams[0].playerIds, ['u_join', 'u_other']);
  assert.equal(writtenData.rounds[0].matches[0].teamA[0].id, 'u_join');
  assert.equal(writtenData.rounds[0].restPlayers[0].id, 'u_join');
  assert.equal(writtenData.rankings[0].playerId, 'u_join');
  assert.equal(writtenData.rankings[0].entityId, 'u_join');
  assert.equal(writtenData.rankings[0].entityType, 'player');
});

test('joinTournament does not auto-claim when multiple guests share the same normalized name', async () => {
  let writtenData = null;
  const db = {
    serverDate() {
      return { $serverDate: true };
    },
    collection() {
      return {
        where() {
          return {
            limit() {
              return {
                async get() {
                  return {
                    data: [{
                      nickName: '球友A',
                      avatar: 'cloud://avatar/a.png',
                      gender: 'female'
                    }]
                  };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      return handler({
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return {
                    data: buildTournament({
                      players: [
                        { id: 'guest_1', type: 'guest', name: '球友A', avatar: '', gender: 'female' },
                        { id: 'guest_2', type: 'guest', name: '球友A', avatar: '', gender: 'female' }
                      ],
                      playerIds: ['guest_1', 'guest_2'],
                      pairTeams: []
                    })
                  };
                },
                async update(payload) {
                  writtenData = payload.data;
                  return { stats: { updated: 1 } };
                }
              };
            }
          };
        }
      });
    }
  };
  const { main } = loadMain(db);

  const result = await main({ tournamentId: 't_1' });

  assert.equal(result.ok, true);
  assert.equal(result.claimed, undefined);
  assert.equal(writtenData.players.filter((item) => item.id.startsWith('guest_')).length, 2);
  assert.equal(writtenData.players.some((item) => item.id === 'u_join'), true);
});

function claimHarness(tournament = buildTournament(), openid = 'u_join') {
  let current = clone(tournament);
  let writes = 0;
  const db = {
    serverDate: () => 123,
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) }),
    runTransaction: async (fn) => fn({ collection: () => ({ doc: () => ({
      get: async () => ({ data: clone(current) }),
      update: async ({ data }) => { writes++; current = { ...current, ...clone(data) }; }
    }) }) })
  };
  return { main: loadMain(db, openid).main, current: () => current, writes: () => writes };
}
const claimRequest = (extra = {}) => ({ tournamentId: 't_1', nickname: '球友A',
  avatar: 'cloud://avatar/a', gender: 'female', action: 'claim_guest', claimGuestId: 'guest_1',
  claimConfirmed: true, expectedVersion: 3, clientRequestId: 'claim_1', ...extra });

test('ordinary join never claims a uniquely named guest', async () => {
  const h = claimHarness();
  const r = await h.main(claimRequest({ action: 'join' }));
  assert.equal(r.ok, true);
  assert.equal(r.claimed, undefined);
  assert.equal(h.current().players.length, 4);
  assert.ok(h.current().players.some(p => p.id === 'guest_1'));
});

test('explicit claim validates consent, version, target and draft status without writes', async () => {
  for (const [extra, tournament, code] of [
    [{ claimConfirmed: false }, {}, 'CLAIM_CONFIRMATION_REQUIRED'],
    [{ expectedVersion: 2 }, {}, 'VERSION_CONFLICT'],
    [{ expectedVersion: undefined }, {}, 'VERSION_CONFLICT'],
    [{ claimGuestId: 'u_other' }, {}, 'CLAIM_TARGET_UNAVAILABLE'],
    [{ claimGuestId: 'missing' }, {}, 'CLAIM_TARGET_UNAVAILABLE'],
    [{}, { status: 'running' }, 'JOIN_DRAFT_ONLY']
  ]) {
    const h = claimHarness(buildTournament(tournament));
    const r = await h.main(claimRequest(extra));
    assert.equal(r.code, code);
    assert.equal(h.writes(), 0);
  }
});

test('explicit claim preserves squad, references and ranking data; retry is idempotent', async () => {
  const t = buildTournament({ mode: 'squad_doubles' });
  t.players[1].squad = 'B';
  t.rankings[0].wins = 7;
  const h = claimHarness(t);
  const r = await h.main(claimRequest({ squadChoice: 'A', openid: 'u_other' }));
  assert.equal(r.claimed, true);
  assert.equal(r.player.squad, 'B');
  assert.equal(h.current().rankings[0].wins, 7);
  assert.equal(h.current().rankings[0].playerId, 'u_join');
  assert.equal(h.current().creatorId, 'u_admin');
  assert.deepEqual(h.current().pairTeams[0].playerIds, ['u_join', 'u_other']);
  assert.equal(h.current().rounds[0].restPlayers[0].id, 'u_join');
  const retry = await h.main(claimRequest());
  assert.equal(retry.deduped, true);
  assert.equal(h.writes(), 1);
});

test('explicit guest selection disambiguates equal names and rejects another member', async () => {
  const t = buildTournament();
  t.players.push({ id: 'guest_2', name: '球友A', type: 'guest' });
  t.playerIds.push('guest_2');
  const h = claimHarness(t);
  assert.equal((await h.main(claimRequest({ claimGuestId: 'guest_2' }))).claimed, true);
  assert.ok(h.current().players.some(p => p.id === 'guest_1'));
  assert.equal((await h.main(claimRequest())).code, 'CLAIM_ALREADY_JOINED');
});


test('explicit claim requires the authenticated cloud identity', async () => {
  const h = claimHarness(buildTournament(), '');
  const r = await h.main(claimRequest({ openid: 'u_join' }));
  assert.equal(r.code, 'PERMISSION_DENIED');
  assert.equal(h.writes(), 0);
});
