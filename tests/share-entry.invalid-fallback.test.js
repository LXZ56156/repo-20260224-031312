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
