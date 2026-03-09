const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentSync = require('../miniprogram/core/tournamentSync');

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

function createShareEntryPageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('share-entry invalid state can navigate back to home', () => {
  const originalWx = global.wx;
  let relaunched = '';

  global.wx = {
    reLaunch({ url, fail }) {
      relaunched = url;
      if (typeof fail === 'function') fail();
    },
    navigateTo({ url }) {
      relaunched = url;
    }
  };

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);
    ctx.setData({
      preview: {
        secondaryAction: { key: 'home', text: '返回首页' }
      }
    });

    ctx.onSecondaryAction();

    assert.equal(relaunched, '/pages/home/index');
  } finally {
    global.wx = originalWx;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry uses retryable sync failure copy for network-like errors', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'network',
      errorMessage: 'network timeout',
      cachedDoc: null
    });

    await ctx.fetchTournament('t_1');

    assert.equal(ctx.data.loadError, true);
    assert.equal(ctx.data.preview.viewMode, 'retryable-error');
    assert.equal(ctx.data.preview.headline, '同步失败，请稍后重试');
    assert.match(ctx.data.preview.subtitle, /同步失败/);
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[shareEntryPagePath];
  }
});

test('share-entry keeps invalid link copy for not_found errors', async () => {
  const originalFetchTournament = tournamentSync.fetchTournament;

  try {
    const definition = loadShareEntryPageDefinition();
    const ctx = createShareEntryPageContext(definition);

    tournamentSync.fetchTournament = async () => ({
      ok: false,
      errorType: 'not_found',
      errorMessage: '未找到赛事',
      cachedDoc: null
    });

    await ctx.fetchTournament('t_1');

    assert.equal(ctx.data.preview.viewMode, 'invalid-match');
    assert.equal(ctx.data.preview.headline, '比赛不存在或已关闭');
  } finally {
    tournamentSync.fetchTournament = originalFetchTournament;
    delete require.cache[shareEntryPagePath];
  }
});
