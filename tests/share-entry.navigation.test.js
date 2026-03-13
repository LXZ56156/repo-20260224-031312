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

function createContext(definition) {
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

test('share-entry goLobby prefers redirectTo to avoid leaving an intermediate page in the stack', () => {
  const originalWx = global.wx;
  const definition = loadShareEntryPageDefinition();
  const ctx = createContext(definition);
  const calls = [];

  global.wx = {
    redirectTo(payload) {
      calls.push({ type: 'redirectTo', url: payload.url });
    },
    navigateTo(payload) {
      calls.push({ type: 'navigateTo', url: payload.url });
    }
  };

  try {
    ctx.setData({ tournamentId: 't_1' });
    ctx.goLobby('view_only');

    assert.deepEqual(calls, [{
      type: 'redirectTo',
      url: '/pages/lobby/index?tournamentId=t_1&fromShare=1&entry=view_only'
    }]);
  } finally {
    global.wx = originalWx;
    delete require.cache[shareEntryPagePath];
  }
});
