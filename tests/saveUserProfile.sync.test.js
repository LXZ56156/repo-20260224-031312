const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../cloudfunctions/saveUserProfile/index.js');
const commonPath = require.resolve('../cloudfunctions/saveUserProfile/lib/common.js');

function loadMain(db) {
  const originalLoad = Module._load;
  const mockSdk = {
    init() {},
    database() {
      return db;
    },
    getWXContext() {
      return { OPENID: 'u_profile' };
    },
    DYNAMIC_CURRENT_ENV: 'test-env'
  };

  delete require.cache[mainPath];
  delete require.cache[commonPath];

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

function buildTournament(id, status, playerAvatar = '') {
  return {
    _id: id,
    status,
    version: 3,
    playerIds: ['u_profile'],
    players: [
      { id: 'u_profile', type: 'user', name: '球友A', avatar: playerAvatar, gender: 'female' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            teamA: [{ id: 'u_profile', name: '球友A', avatar: playerAvatar }],
            teamB: [{ id: 'u_other', name: '球友B', avatar: 'cloud://avatar/other' }]
          }
        ],
        restPlayers: [{ id: 'u_profile', name: '球友A', avatar: playerAvatar }]
      }
    ]
  };
}

test('saveUserProfile syncs avatar into draft and running tournaments only', async () => {
  const updates = [];
  const draftTournament = buildTournament('t_draft', 'draft', '');
  const runningTournament = buildTournament('t_running', 'running', '');
  const finishedTournament = buildTournament('t_finished', 'finished', '');
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc(id) {
            assert.equal(id, 'profile_existing');
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            return {
              async get() {
                return { data: [draftTournament, runningTournament, finishedTournament] };
              }
            };
          }
          return {
            async update(payload) {
              updates.push({ id: query._id, query, data: payload.data });
              return { stats: { updated: 1 } };
            }
          };
        },
        doc() {
          return {
            async get() {
              throw new Error('unexpected refetch');
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncedTournamentCount, 2);
  assert.equal(result.syncTruncated, false);
  assert.equal(result.data.syncedTournamentCount, 2);
  assert.equal(result.data.syncTruncated, false);
  assert.deepEqual(updates.map((item) => item.id).sort(), ['t_draft', 't_running']);
  for (const update of updates) {
    const player = update.data.players[0];
    const matchPlayer = update.data.rounds[0].matches[0].teamA[0];
    const restPlayer = update.data.rounds[0].restPlayers[0];
    assert.equal(player.avatar, 'cloud://avatar/new');
    assert.equal(matchPlayer.avatar, 'cloud://avatar/new');
    assert.equal(restPlayer.avatar, 'cloud://avatar/new');
  }
});

test('saveUserProfile retries avatar sync on version conflict using the latest tournament snapshot', async () => {
  const updates = [];
  let refetchCount = 0;
  const staleTournament = buildTournament('t_running', 'running', '');
  const latestTournament = {
    ...buildTournament('t_running', 'running', ''),
    version: 4,
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            teamA: [{ id: 'u_profile', name: '球友A', avatar: '', scoreA: 21 }],
            teamB: [{ id: 'u_other', name: '球友B', avatar: 'cloud://avatar/other', scoreB: 19 }],
            scoreA: 21,
            scoreB: 19
          }
        ],
        restPlayers: [{ id: 'u_profile', name: '球友A', avatar: '' }]
      }
    ]
  };
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc() {
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            return {
              async get() {
                return { data: [staleTournament] };
              }
            };
          }
          return {
            async update(payload) {
              updates.push({ query, data: payload.data });
              if (updates.length === 1) {
                return { stats: { updated: 0 } };
              }
              return { stats: { updated: 1 } };
            }
          };
        },
        doc(id) {
          assert.equal(id, 't_running');
          return {
            async get() {
              refetchCount += 1;
              return { data: latestTournament };
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncedTournamentCount, 1);
  assert.equal(result.syncTruncated, false);
  assert.equal(refetchCount, 1);
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].query, { _id: 't_running', version: 3 });
  assert.deepEqual(updates[1].query, { _id: 't_running', version: 4 });
  assert.equal(updates[1].data.rounds[0].matches[0].scoreA, 21);
  assert.equal(updates[1].data.rounds[0].matches[0].scoreB, 19);
  assert.equal(updates[1].data.rounds[0].matches[0].teamA[0].avatar, 'cloud://avatar/new');
});

test('saveUserProfile paginates avatar sync beyond one cloud page', async () => {
  const updates = [];
  const pageSkips = [];
  const tournaments = Array.from({ length: 101 }, (_, idx) => buildTournament(`t_${idx}`, 'running', ''));
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc() {
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            let pageSkip = 0;
            let pageLimit = 100;
            return {
              skip(value) {
                pageSkip = Number(value) || 0;
                return this;
              },
              limit(value) {
                pageLimit = Number(value) || 100;
                return this;
              },
              async get() {
                pageSkips.push(pageSkip);
                return { data: tournaments.slice(pageSkip, pageSkip + pageLimit) };
              }
            };
          }
          return {
            async update(payload) {
              updates.push({ query, data: payload.data });
              return { stats: { updated: 1 } };
            }
          };
        },
        doc() {
          return {
            async get() {
              throw new Error('unexpected refetch');
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncedTournamentCount, 101);
  assert.equal(result.syncTruncated, false);
  assert.deepEqual(pageSkips, [0, 100]);
  assert.equal(updates.length, 101);
});

test('saveUserProfile exposes syncTruncated when avatar sync hits query cap', async () => {
  const pageSkips = [];
  const tournaments = Array.from({ length: 1001 }, (_, idx) => buildTournament(`t_${idx}`, 'running', 'cloud://avatar/new'));
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc() {
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            let pageSkip = 0;
            let pageLimit = 100;
            return {
              skip(value) {
                pageSkip = Number(value) || 0;
                return this;
              },
              limit(value) {
                pageLimit = Number(value) || 100;
                return this;
              },
              async get() {
                pageSkips.push(pageSkip);
                return { data: tournaments.slice(pageSkip, pageSkip + pageLimit) };
              }
            };
          }
          return {
            async update() {
              throw new Error('should not update unchanged avatar');
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncedTournamentCount, 0);
  assert.equal(result.syncTruncated, true);
  assert.equal(result.data.syncTruncated, true);
  assert.equal(pageSkips.includes(1000), true);
});

test('saveUserProfile does not sync avatar to guest player references', async () => {
  const updates = [];
  const guestTournament = {
    _id: 't_guest',
    status: 'draft',
    version: 3,
    playerIds: ['u_profile'],
    players: [
      { id: 'u_profile', type: 'guest', name: 'guest选手', avatar: '', gender: 'male' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            teamA: [{ id: 'u_profile', type: 'guest', name: 'guest选手', avatar: '' }],
            teamB: [{ id: 'u_other', name: '球友B', avatar: 'cloud://avatar/other' }]
          }
        ],
        restPlayers: []
      }
    ]
  };
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc() {
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            return {
              async get() {
                return { data: [guestTournament] };
              }
            };
          }
          return {
            async update() {
              throw new Error('should not update guest player');
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  // guest player should not be synced → syncedTournamentCount is 0
  assert.equal(result.syncedTournamentCount, 0);
});

test('saveUserProfile does not sync when tournament has no playerIds (known boundary)', async () => {
  const tournamentNoPlayerIds = {
    _id: 't_no_playerids',
    status: 'draft',
    version: 3,
    players: [
      { id: 'u_profile', type: 'user', name: '球友A', avatar: '', gender: 'female' }
    ],
    rounds: []
  };
  const db = {
    command: {
      in(values) {
        return { $in: values };
      },
      inc(value) {
        return { $inc: value };
      }
    },
    async createCollection() {},
    serverDate() {
      return { $serverDate: true };
    },
    collection(name) {
      if (name === 'user_profiles') {
        return {
          where() {
            return {
              limit() {
                return {
                  async get() {
                    return { data: [{ _id: 'profile_existing' }] };
                  }
                };
              }
            };
          },
          doc() {
            return {
              async update() {}
            };
          }
        };
      }
      assert.equal(name, 'tournaments');
      return {
        where(query) {
          if (query && query.status) {
            return {
              async get() {
                // tournament without playerIds won't match playerIds: _.all([openid])
                return { data: [] };
              }
            };
          }
          return {
            async update() {
              throw new Error('should not update');
            }
          };
        }
      };
    }
  };

  const { main } = loadMain(db);
  const result = await main({
    nickname: '球友A',
    avatar: 'cloud://avatar/new',
    gender: 'female'
  });

  assert.equal(result.ok, true);
  // tournament without playerIds won't be found → sync count is 0
  assert.equal(result.syncedTournamentCount, 0);
  // This is a known boundary: old tournaments without playerIds need separate data migration
});
