const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const pagePath = require.resolve('../miniprogram/pages/water/index.js');

function loadPageDefinition(overrides = {}) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  let definition = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../core/profile') return overrides.profile || {};
    if (request === '../../core/waterSession') return overrides.waterSession || {};
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

test('water game selector assigns one roster by active side and supports move or remove', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.data.participants = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '小林' },
    { id: 'p3', name: 'Chris' },
  ];

  ctx.openGameSheet();
  assert.equal(ctx.data.gameActiveSide, 'winner');
  assert.deepEqual(ctx.data.winnerIds, []);
  assert.deepEqual(ctx.data.loserIds, []);

  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  assert.deepEqual(ctx.data.winnerIds, ['p1']);
  assert.deepEqual(ctx.data.loserIds, []);
  assert.equal(ctx.data.winnerSummary, '阿杰');

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p2' } } });
  assert.deepEqual(ctx.data.winnerIds, ['p1']);
  assert.deepEqual(ctx.data.loserIds, ['p2']);
  assert.equal(ctx.data.loserSummary, '小林');

  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  assert.deepEqual(ctx.data.winnerIds, []);
  assert.deepEqual(ctx.data.loserIds, ['p2', 'p1']);

  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  assert.deepEqual(ctx.data.winnerIds, []);
  assert.deepEqual(ctx.data.loserIds, ['p2']);
});

test('water add sheet previews relay names and excludes existing or repeated players', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.data.participants = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '小林' },
  ];

  ctx.openManualSheet();
  assert.equal(ctx.data.addMode, 'manual');
  assert.deepEqual(ctx.data.relayNewNames, []);

  ctx.onSelectAddMode({ currentTarget: { dataset: { mode: 'relay' } } });
  ctx.onRelayInput({
    detail: {
      value: '周五晚上 8 点跟帖\n1阿杰\n2Chris\n3王姐\n4Chris\n费用：40/人'
    }
  });

  assert.equal(ctx.data.addMode, 'relay');
  assert.equal(ctx.data.relayRecognizedCount, 3);
  assert.equal(ctx.data.relayDuplicateCount, 2);
  assert.equal(ctx.data.relayOverflowCount, 0);
  assert.deepEqual(ctx.data.relayPreviewNames, ['阿杰', 'Chris', '王姐']);
  assert.deepEqual(ctx.data.relayNewNames, ['Chris', '王姐']);
});

test('water game search filters locally without clearing side selections', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.data.participants = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '小林' },
    { id: 'p3', name: '阿明' },
    { id: 'p4', name: 'Chris' },
    { id: 'p5', name: '王姐' },
    { id: 'p6', name: '小羽' },
    { id: 'p7', name: '老周' },
    { id: 'p8', name: '可乐' },
    { id: 'p9', name: '阿源' },
  ];

  ctx.openGameSheet();
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  ctx.onGameSearchInput({ detail: { value: '阿' } });

  assert.equal(ctx.data.gameSearchQuery, '阿');
  assert.deepEqual(ctx.data.gameParticipants.map((item) => item.id), ['p1', 'p3', 'p9']);
  assert.deepEqual(ctx.data.winnerIds, ['p1']);
  assert.equal(ctx.data.gameParticipants[0].winnerSelected, true);

  ctx.clearGameSearch();
  assert.equal(ctx.data.gameSearchQuery, '');
  assert.equal(ctx.data.gameParticipants.length, 9);
  assert.deepEqual(ctx.data.winnerIds, ['p1']);
});

test('water relay submit uses the existing addParticipants contract with parsed names', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    waterSession: {
      async addParticipants(...args) {
        calls.push(args);
        return {
          session: {
            id: 'water_1',
            title: '测试打水局',
            version: 4,
            participants: [
              { id: 'p1', name: '阿杰' },
              { id: 'p2', name: 'Chris' },
              { id: 'p3', name: '王姐' },
            ],
            entries: [],
            isOwner: true,
            viewerParticipantId: 'p1'
          }
        };
      }
    }
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  const toasts = [];
  global.wx = {
    showToast(options) { toasts.push(options); }
  };
  ctx.data.sessionId = 'water_1';
  ctx.data.session = { id: 'water_1', version: 3 };
  ctx.data.participants = [{ id: 'p1', name: '阿杰' }];
  ctx.data.relayRecognizedCount = 3;
  ctx.data.relayNewNames = ['Chris', '王姐'];

  try {
    await ctx.submitRelay();
  } finally {
    global.wx = originalWx;
  }

  assert.deepEqual(calls, [['water_1', 3, 'Chris\n王姐']]);
  assert.equal(toasts.at(-1).title, '已添加 2 人');
  assert.equal(ctx.data.manualSheetOpen, false);
});
