const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const pagePath = require.resolve('../miniprogram/pages/water/index.js');

function loadPageDefinition() {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  let definition = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../core/profile') return {};
    if (request === '../../core/waterSession') return {};
    if (request === '../../core/waterLedger') {
      return {
        deriveLedger() { return []; },
        describeEntry() { return ''; }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  global.Page = (options) => { definition = options; };
  delete require.cache[pagePath];
  try {
    require(pagePath);
  } finally {
    Module._load = originalLoad;
    global.Page = originalPage;
  }
  return definition;
}

function createContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(definition).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return ctx;
}

test('water page starts polling when first async session arrives after onShow', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let setCalls = 0;
  let clearedHandle = null;
  global.setInterval = () => {
    setCalls += 1;
    return 77;
  };
  global.clearInterval = (handle) => {
    clearedHandle = handle;
  };

  try {
    ctx.onShow();
    assert.equal(setCalls, 0);

    ctx.applySession({
      id: 'water_1',
      title: '测试打水局',
      version: 1,
      participants: [],
      entries: [],
      isOwner: true,
      viewerParticipantId: ''
    });

    assert.equal(setCalls, 1);
    assert.equal(ctx._refreshTimer, 77);

    ctx.onHide();
    assert.equal(clearedHandle, 77);
    assert.equal(ctx._refreshTimer, null);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});
