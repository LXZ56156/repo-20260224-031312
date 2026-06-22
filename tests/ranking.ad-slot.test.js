const test = require('node:test');
const assert = require('node:assert/strict');

const adGuard = require('../miniprogram/core/adGuard');
const rankingPagePath = require.resolve('../miniprogram/pages/ranking/index.js');

function loadPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[rankingPagePath];
  require(rankingPagePath);
  global.Page = originalPage;
  return definition;
}

test('ranking reuses the analytics ad guard slot and exposure counter', () => {
  const originalShouldExpose = adGuard.shouldExposePageSlot;
  const originalMarkExposed = adGuard.markPageExposed;
  const keys = [];
  const definition = loadPageDefinition();
  const ctx = {
    data: { showResultAdSlot: false },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    refreshResultAdSlot: definition.refreshResultAdSlot
  };

  try {
    adGuard.shouldExposePageSlot = (key) => {
      keys.push(`check:${key}`);
      return true;
    };
    adGuard.markPageExposed = (key) => keys.push(`mark:${key}`);

    ctx.refreshResultAdSlot();

    assert.equal(ctx.data.showResultAdSlot, true);
    assert.deepEqual(keys, ['check:analytics', 'mark:analytics']);
  } finally {
    adGuard.shouldExposePageSlot = originalShouldExpose;
    adGuard.markPageExposed = originalMarkExposed;
    delete require.cache[rankingPagePath];
  }
});
