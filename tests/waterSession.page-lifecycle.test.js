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

function sessionFixture(version, overrides = {}) {
  return {
    id: 'water_1',
    title: '测试打水局',
    version,
    participants: [
      { id: 'p1', name: '阿杰', claimed: true },
      { id: 'p2', name: '小林', claimed: true },
      { id: 'p3', name: 'Chris', claimed: false },
    ],
    entries: [],
    isOwner: true,
    viewerParticipantId: 'p1',
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

test('water page catches up immediately when returning from the background', async () => {
  let getCalls = 0;
  const definition = loadPageDefinition({
    waterSession: {
      async get() {
        getCalls += 1;
        return { session: sessionFixture(2) };
      }
    }
  });
  const ctx = createContext(definition);
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  global.setInterval = () => 77;
  global.clearInterval = () => {};

  try {
    ctx.onShow();
    ctx.applySession(sessionFixture(1));
    ctx.onHide();
    ctx.onShow();
    await Promise.resolve();
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }

  assert.equal(getCalls, 1);
  assert.equal(ctx.data.session.version, 2);
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

test('water mutation conflict forces a fresh session load while busy', async () => {
  let getCalls = 0;
  let busyDuringGet = false;
  let ctx;
  const definition = loadPageDefinition({
    waterSession: {
      async get() {
        getCalls += 1;
        busyDuringGet = ctx.data.busy;
        return { session: sessionFixture(2) };
      }
    }
  });
  ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  ctx.data.sessionId = 'water_1';
  ctx.data.session = sessionFixture(1);
  const conflict = Object.assign(new Error('账本已更新'), { state: 'conflict' });

  try {
    await ctx.runMutation(async () => { throw conflict; }, 'unused');
  } finally {
    global.wx = originalWx;
  }

  assert.equal(getCalls, 1);
  assert.equal(busyDuringGet, true);
  assert.equal(ctx.data.session.version, 2);
  assert.equal(ctx.data.busy, false);
});

test('water session ignores an older response that resolves after a newer version', async () => {
  const first = deferred();
  const second = deferred();
  let getCalls = 0;
  const definition = loadPageDefinition({
    waterSession: {
      get() {
        getCalls += 1;
        return getCalls === 1 ? first.promise : second.promise;
      }
    }
  });
  const ctx = createContext(definition);
  ctx.data.sessionId = 'water_1';
  ctx.data.session = sessionFixture(0);

  const olderRequest = ctx.loadSession({ silent: true });
  const newerRequest = ctx.loadSession({ silent: true });
  second.resolve({ session: sessionFixture(2, { title: '新响应' }) });
  await newerRequest;
  assert.equal(ctx.data.session.version, 2);

  first.resolve({ session: sessionFixture(1, { title: '旧响应' }) });
  await olderRequest;

  assert.equal(getCalls, 2);
  assert.equal(ctx.data.session.version, 2);
  assert.equal(ctx.data.session.title, '新响应');
});

test('water session ignores an older request error after a newer refresh succeeds', async () => {
  const first = deferred();
  let getCalls = 0;
  const definition = loadPageDefinition({
    waterSession: {
      get() {
        getCalls += 1;
        return getCalls === 1 ? first.promise : Promise.resolve({ session: sessionFixture(2) });
      }
    }
  });
  const ctx = createContext(definition);
  ctx.data.sessionId = 'water_1';
  ctx.data.session = sessionFixture(1);

  const olderRequest = ctx.loadSession();
  await ctx.loadSession({ silent: true });
  first.reject(new Error('旧请求失败'));
  await olderRequest;

  assert.equal(ctx.data.session.version, 2);
  assert.equal(ctx.data.loading, false);
  assert.equal(ctx.data.loadError, '');
});

test('water polling refresh preserves visible winner and loser selections by id', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applySession(sessionFixture(1));
  ctx.openGameSheet();
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p2' } } });

  ctx.applySession(sessionFixture(2));

  assert.deepEqual(ctx.data.winnerIds, ['p1']);
  assert.deepEqual(ctx.data.loserIds, ['p2']);
  assert.equal(ctx.data.gameParticipants.find((item) => item.id === 'p1').winnerSelected, true);
  assert.equal(ctx.data.gameParticipants.find((item) => item.id === 'p2').loserSelected, true);
  assert.equal(ctx.data.winnerSummary, '阿杰');
  assert.equal(ctx.data.loserSummary, '小林');
});

test('water polling refresh preserves the invited participant claim choice by id', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const viewerSession = sessionFixture(1, {
    isOwner: false,
    viewerParticipantId: '',
    participants: [
      { id: 'p1', name: '阿杰', claimed: true },
      { id: 'p2', name: '小林', claimed: false },
      { id: 'p3', name: 'Chris', claimed: false },
    ]
  });
  ctx.applySession(viewerSession);
  const selectedIndex = ctx.data.joinChoices.findIndex((item) => item.id === 'p3');
  assert.ok(selectedIndex > 0);
  ctx.setData({ joinIndex: selectedIndex });

  ctx.applySession({
    ...viewerSession,
    version: 2,
    participants: [viewerSession.participants[0], viewerSession.participants[2], viewerSession.participants[1]]
  });

  assert.equal(ctx.data.joinChoices[ctx.data.joinIndex].id, 'p3');
  assert.equal(ctx.data.joinChoices[ctx.data.joinIndex].name, '认领「Chris」');
  assert.notEqual(ctx.data.joinIndex, selectedIndex);

  ctx.applySession({
    ...viewerSession,
    version: 3,
    participants: viewerSession.participants.map((item) => item.id === 'p3' ? { ...item, claimed: true } : item)
  });
  assert.equal(ctx.data.joinIndex, 0);
  assert.equal(ctx.data.joinChoices[ctx.data.joinIndex].id, '');
});

test('water join captures the intended claim before awaiting the profile gate', async () => {
  const gate = deferred();
  const calls = [];
  const definition = loadPageDefinition({
    profile: {
      ensureProfileForAction() { return gate.promise; }
    },
    waterSession: {
      async join(...args) {
        calls.push(args);
        return { session: sessionFixture(3, { isOwner: false, viewerParticipantId: 'p3' }) };
      }
    }
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  const viewerSession = sessionFixture(1, { isOwner: false, viewerParticipantId: '' });
  ctx.applySession(viewerSession);
  ctx.setData({ joinIndex: ctx.data.joinChoices.findIndex((item) => item.id === 'p3') });

  const joining = ctx.onJoin();
  ctx.applySession({
    ...viewerSession,
    version: 2,
    participants: viewerSession.participants.map((item) => item.id === 'p3' ? { ...item, claimed: true } : item)
  });
  gate.resolve({ ok: true, profile: { nickName: '访客' } });
  try {
    await joining;
  } finally {
    global.wx = originalWx;
  }

  assert.deepEqual(calls, [['water_1', 2, '访客', 'p3']]);
});

test('water relay preview is recomputed when polling changes the roster', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applySession(sessionFixture(1, { participants: [{ id: 'p1', name: '阿杰', claimed: true }] }));
  ctx.openManualSheet();
  ctx.onSelectAddMode({ currentTarget: { dataset: { mode: 'relay' } } });
  ctx.onRelayInput({ detail: { value: '1. Chris' } });
  assert.deepEqual(ctx.data.relayNewNames, ['Chris']);

  ctx.applySession(sessionFixture(2, {
    participants: [
      { id: 'p1', name: '阿杰', claimed: true },
      { id: 'p2', name: 'Chris', claimed: false }
    ]
  }));

  assert.deepEqual(ctx.data.relayNewNames, []);
  assert.equal(ctx.data.relayDuplicateCount, 1);
});
