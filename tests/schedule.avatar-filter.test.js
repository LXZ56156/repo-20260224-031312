const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schedulePagePath = require.resolve('../miniprogram/pages/schedule/index.js');

function loadSchedulePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[schedulePagePath];
  require(schedulePagePath);
  global.Page = originalPage;
  return definition;
}

function createSchedulePageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.openid = 'u_admin';
  ctx.avatarCache = {
    'cloud://avatar/u_1': 'https://temp/avatar/u_1.png',
    'cloud://avatar/u_2': 'https://temp/avatar/u_2.png',
    'cloud://avatar/u_3': 'https://temp/avatar/u_3.png',
    'cloud://avatar/u_5': 'https://temp/avatar/u_5.png'
  };
  ctx.fetchTournament = () => Promise.resolve(null);
  ctx.hasActiveWatch = () => true;
  ctx.startWatch = () => {};
  ctx.data.tournamentId = 't_schedule_avatar';
  return ctx;
}

function buildTournament() {
  return {
    _id: 't_schedule_avatar',
    status: 'running',
    creatorId: 'u_admin',
    mode: 'fixed_pair_rr',
    players: [
      { id: 'u_1', name: '甲一', avatar: 'cloud://avatar/u_1' },
      { id: 'u_2', name: '乙二', avatar: 'cloud://avatar/u_2' },
      { id: 'u_3', name: '丙三', avatar: 'cloud://avatar/u_3' },
      { id: 'u_4', name: '丁四' },
      { id: 'u_5', name: '戊五', avatar: 'cloud://avatar/u_5' },
      { id: 'u_6', name: '己六' },
      { id: 'u_7', name: '庚七' },
      { id: 'u_8', name: '辛八' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          {
            matchIndex: 0,
            status: 'pending',
            teamA: [{ id: 'u_1', name: '甲一' }, { id: 'u_2', name: '乙二' }],
            teamB: [{ id: 'u_3', name: '丙三' }, { id: 'u_4', name: '丁四' }]
          },
          {
            matchIndex: 1,
            status: 'finished',
            scoreA: 21,
            scoreB: 18,
            teamA: [{ id: 'u_5', name: '戊五' }, { id: 'u_6', name: '己六' }],
            teamB: [{ id: 'u_7', name: '庚七' }, { id: 'u_8', name: '辛八' }]
          }
        ]
      },
      {
        roundIndex: 1,
        matches: [
          {
            matchIndex: 2,
            status: 'pending',
            teamA: [{ id: 'u_1', name: '甲一' }, { id: 'u_3', name: '丙三' }],
            teamB: [{ id: 'u_5', name: '戊五' }, { id: 'u_7', name: '庚七' }]
          },
          {
            matchIndex: 3,
            status: 'canceled',
            teamA: [{ id: 'u_2', name: '乙二' }, { id: 'u_4', name: '丁四' }],
            teamB: [{ id: 'u_6', name: '己六' }, { id: 'u_8', name: '辛八' }]
          }
        ]
      }
    ]
  };
}

function getVisibleMatchIndexes(roundsUi) {
  return (roundsUi || []).flatMap((round) => (round.matchesUi || []).map((match) => Number(match.matchIndex)));
}

function buildTournamentWithSecondRoundPending() {
  const tournament = buildTournament();
  tournament.rounds[0].matches[0].status = 'finished';
  tournament.rounds[0].matches[0].scoreA = 21;
  tournament.rounds[0].matches[0].scoreB = 19;
  return tournament;
}

test('schedule page shows a hint that tapping avatars filters matches', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxml'),
    'utf8'
  );

  assert.match(wxml, /selected-player-empty-hint/);
  assert.match(wxml, /wx:if="\{\{!selectedPlayersUi\.length\}\}"/);
  assert.match(wxml, />点击头像可筛选</);
});

test('schedule page decorates match cards with avatar groups and inline member names', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament());

    const match = ctx.data.roundsUi[0].matchesUi[0];
    assert.equal(match.leftTeam.avatarItems.length, 2);
    assert.equal(match.leftTeam.avatarItems[0].avatarDisplay, 'https://temp/avatar/u_1.png');
    assert.equal(match.leftTeam.text, '甲一 / 乙二');
    assert.equal(match.filterStage, 'current');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page keeps initials visible before cloud avatar temp url resolves', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.avatarCache = {};
    ctx.applyTournament(buildTournament());

    const match = ctx.data.roundsUi[0].matchesUi[0];
    assert.equal(match.leftTeam.avatarItems[0].avatarRaw, 'cloud://avatar/u_1');
    assert.equal(match.leftTeam.avatarItems[0].avatarDisplay, '');
    assert.equal(match.leftTeam.avatarItems[1].avatarDisplay, '');
    assert.equal(match.rightTeam.avatarItems[0].avatarDisplay, '');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page restores initial fallback when avatar image fails to load', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament());
    assert.equal(ctx.data.roundsUi[0].matchesUi[0].leftTeam.avatarItems[0].avatarDisplay, 'https://temp/avatar/u_1.png');

    ctx.onAvatarImageError({ currentTarget: { dataset: { avatarRaw: 'cloud://avatar/u_1' } } });

    assert.equal(ctx.data.roundsUi[0].matchesUi[0].leftTeam.avatarItems[0].avatarDisplay, '');
    assert.equal(ctx.data.roundsUi[0].matchesUi[0].leftTeam.avatarItems[0].initial, '甲');
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page auto-scrolls to the current pending round once by default', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scrollCalls = [];

  global.wx = {
    pageScrollTo(options) {
      scrollCalls.push(options);
    }
  };
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    ctx.applyTournament(buildTournamentWithSecondRoundPending());

    assert.equal(ctx.data.firstPendingRoundIndex, 1);
    assert.equal(ctx.data.roundsUi[1].isCurrentRound, true);
    assert.deepEqual(scrollCalls, [{
      selector: '.round-card-current',
      duration: 220
    }]);

    ctx.applyTournament(buildTournamentWithSecondRoundPending());
    assert.equal(scrollCalls.length, 1);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    delete require.cache[schedulePagePath];
  }
});

test('schedule page status filter maps current, pending, and finished with canceled included', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.data.statusFilter = 'current';
    ctx.applyTournament(buildTournament());
    assert.deepEqual(getVisibleMatchIndexes(ctx.data.roundsUi), [0]);

    ctx.data.statusFilter = 'finished';
    ctx.applyTournament(buildTournament());
    assert.deepEqual(getVisibleMatchIndexes(ctx.data.roundsUi), [1, 3]);
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page combines avatar filters with contains/not_contains semantics', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.data.selectedPlayerIds = ['u_1', 'u_3'];
    ctx.data.avatarFilterMode = 'contains';
    ctx.applyTournament(buildTournament());
    assert.deepEqual(getVisibleMatchIndexes(ctx.data.roundsUi), [0, 2]);

    ctx.data.selectedPlayerIds = ['u_1', 'u_5'];
    ctx.data.avatarFilterMode = 'not_contains';
    ctx.applyTournament(buildTournament());
    assert.deepEqual(getVisibleMatchIndexes(ctx.data.roundsUi), [3]);
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page avatar tap toggles selection without needing navigation', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.applyTournament(buildTournament());
    ctx.onMatchPlayerAvatarTap({ currentTarget: { dataset: { playerId: 'u_1' } } });
    assert.deepEqual(ctx.data.selectedPlayerIds, ['u_1']);

    ctx.onMatchPlayerAvatarTap({ currentTarget: { dataset: { playerId: 'u_1' } } });
    assert.deepEqual(ctx.data.selectedPlayerIds, []);
  } finally {
    delete require.cache[schedulePagePath];
  }
});

test('schedule page shows empty hint when combined filters remove every match', () => {
  const definition = loadSchedulePageDefinition();
  const ctx = createSchedulePageContext(definition);

  try {
    ctx.data.selectedPlayerIds = ['u_1', 'u_8'];
    ctx.data.avatarFilterMode = 'contains';
    ctx.applyTournament(buildTournament());

    assert.equal(ctx.data.showFilterBar, true);
    assert.equal(ctx.data.filterEmptyText, '暂无符合条件的对阵');
    assert.equal(ctx.data.roundsUi.length, 0);
  } finally {
    delete require.cache[schedulePagePath];
  }
});
