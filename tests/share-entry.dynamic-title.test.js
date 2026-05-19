const test = require('node:test');
const assert = require('node:assert/strict');

const shareEntryPagePath = require.resolve('../miniprogram/pages/share-entry/index.js');

function loadShareEntryPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[shareEntryPagePath];
  require(shareEntryPagePath);
  global.Page = originalPage;
  return definition;
}

function createShareEntryPageContext(definition, openid = 'u_new') {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    openid,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

function buildTournament(status, extra = {}) {
  return {
    _id: 't_1',
    name: '周末友谊赛',
    status,
    creatorId: 'u_admin',
    mode: 'multi_rotate',
    players: [
      { id: 'u_admin', name: '组织者' },
      { id: 'u_joined', name: '已加入球友' },
      { id: 'u_a', name: '球友A' },
      { id: 'u_b', name: '球友B' }
    ],
    rounds: [
      {
        roundIndex: 0,
        matches: [
          { matchIndex: 0, status: status === 'draft' ? 'pending' : 'finished', teamA: ['u_admin', 'u_joined'], teamB: ['u_a', 'u_b'] }
        ]
      }
    ],
    ...extra
  };
}

function withTitleMock(fn) {
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    setNavigationBarTitle(payload) {
      calls.push(payload);
    }
  };
  try {
    fn(calls);
  } finally {
    global.wx = originalWx;
    delete require.cache[shareEntryPagePath];
  }
}

test('share-entry sets join title for unjoined draft tournaments', () => {
  withTitleMock((calls) => {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition, 'u_new');

    ctx.applyTournament(buildTournament('draft'));

    assert.equal(ctx.data.preview.primaryAction.text, '加入比赛');
    assert.deepEqual(calls, [{ title: '加入比赛·周末友谊赛' }]);
  });
});

test('share-entry sets view title for joined draft tournaments', () => {
  withTitleMock((calls) => {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition, 'u_joined');

    ctx.applyTournament(buildTournament('draft'));

    assert.equal(ctx.data.preview.primaryAction.text, '进入比赛');
    assert.deepEqual(calls, [{ title: '查看比赛·周末友谊赛' }]);
  });
});

test('share-entry sets view title for running and finished tournaments', () => {
  withTitleMock((calls) => {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition, 'u_new');

    ctx.applyTournament(buildTournament('running'));
    ctx.applyTournament(buildTournament('finished'));

    assert.deepEqual(calls, [
      { title: '查看比赛·周末友谊赛' }
    ]);
  });
});

test('share-entry invalid fallback does not override the static entry title', () => {
  withTitleMock((calls) => {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition, 'u_new');
    ctx.data.tournamentId = '';

    ctx.onRetry();

    assert.equal(ctx.data.preview.viewMode, 'invalid-match');
    assert.deepEqual(calls, []);
  });
});
