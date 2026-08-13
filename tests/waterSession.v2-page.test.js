const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const pagePath = require.resolve('../miniprogram/pages/water/index.js');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadPageDefinition(waterSession = {}, profile = null) {
  const originalLoad = Module._load;
  const originalPage = global.Page;
  let definition = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../core/profile') {
      return profile || {
        async ensureProfileForAction() {
          return { ok: true, profile: { nickName: '王姐' } };
        },
      };
    }
    if (request === '../../core/waterSession') return waterSession;
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
    },
  };
  Object.keys(definition).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return ctx;
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

function payload(overrides = {}) {
  const participants = [
    { id: 'p1', name: '阿杰', claimed: true },
    { id: 'p2', name: '王姐', claimed: true },
    { id: 'p3', name: 'Chris', claimed: true },
  ];
  return {
    room: {
      id: 'water_1',
      roomVersion: 4,
      syncVersion: 16,
      participants,
    },
    round: {
      id: 'round_3',
      number: 3,
      title: '8月9日打水局',
      status: 'active',
      recordCount: 12,
      activeRecordCount: 11,
      eventCount: 16,
      revision: 8,
      ledger: [
        { participantId: 'p1', won: 8, treat: 2, net: 6 },
        { participantId: 'p2', won: 7, treat: 4, net: 3 },
        { participantId: 'p3', won: 4, treat: 3, net: 1 },
      ],
    },
    viewer: { participantId: 'p2', role: 'member' },
    capabilities: {
      v2Read: true,
      canManageRoster: false,
      canOwnerWrite: false,
      canMemberWrite: true,
      canCorrect: true,
      canReverse: true,
      canCreateRound: false,
      emergencyReadOnly: false,
      revision: 2,
    },
    entries: [
      {
        id: 'e16',
        rootEntryId: 'e10',
        targetEntryId: 'e15',
        eventType: 'entry_corrected',
        category: 'game',
        status: 'active',
        actorParticipantId: 'p2',
        actorNameSnapshot: '王姐',
        rootCreatedByParticipantId: 'p2',
        createdAtMs: new Date('2026-08-09T12:46:00Z').getTime(),
        description: '王姐将「阿杰、王姐 胜 Chris、陈哥 · 每人 1 水」更正为每人 2 水',
      },
      {
        id: 'e15',
        rootEntryId: 'e15',
        eventType: 'transfer_recorded',
        category: 'direct',
        status: 'active',
        actorParticipantId: 'p3',
        actorNameSnapshot: 'Chris',
        rootCreatedByParticipantId: 'p3',
        createdAtMs: new Date('2026-08-09T12:44:00Z').getTime(),
        payload: { fromPlayerId: 'p3', toPlayerId: 'p1', units: 1 },
      },
    ],
    page: { nextBeforeSeq: 15, latestSeq: 16, hasMore: true },
    ...overrides,
  };
}

test('approved B structure keeps the previous green water palette', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const js = read('miniprogram/pages/water/index.js');

  assert.match(wxml, />总账<\/button>[\s\S]*>流水<\/button>[\s\S]*>球友<\/button>/);
  assert.match(wxml, /class="water-latest-receipt"/);
  assert.match(wxml, /class="water-audit-track"/);
  assert.match(wxml, /water-feed-node[\s\S]*item\.isAuditEvent/);
  assert.match(wxml, /class="water-action-dock\b/);
  assert.match(wxml, />记一局<\/button>/);
  assert.match(wxml, />单独记水<\/button>/);
  assert.match(wxml, /加入后一起记水/);
  assert.equal((wxml.match(/open-type="share"/g) || []).length, 1);
  assert.doesNotMatch(wxml, /总账差|WATER BOARD|撤销上一条/);

  assert.match(js, /activeTab:\s*'ledger'/);
  assert.match(wxss, /--water-page:\s*#edf3f1/i);
  assert.match(wxss, /--water-surface:\s*#fbfdfc/i);
  assert.match(wxss, /--water-ink:\s*#15241f/i);
  assert.match(wxss, /--water-muted:\s*#5f6f69/i);
  assert.match(wxss, /--water-control-line:\s*#7d8e87/i);
  assert.match(wxss, /--water-line:\s*#d7e2de/i);
  assert.match(wxss, /--water-accent:\s*#087a56/i);
  assert.match(wxss, /--water-warning:\s*#a8622f/i);
  assert.match(wxss, /--water-danger:\s*#b8443f/i);
  assert.match(wxss, /--water-dock:\s*#103f35/i);
  assert.doesNotMatch(wxss, /#(?:f7f4f6|2a2026|7b3555|612640|482437)/i);
  assert.match(wxss, /\.water-action-dock\s*\{[^}]*position:\s*fixed/s);
  assert.match(wxss, /env\(safe-area-inset-bottom\)/);
  assert.match(wxss, /\.water-feed-node\.is-audit[^}]*background:\s*#fbfdfc/s);
  assert.match(wxss, /@media\s*\(max-width:\s*374px\)[\s\S]*grid-template-columns:\s*repeat\(3,/);
  assert.match(wxss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(wxss, /font-size:\s*(?:1\d|2[0-3])rpx/);
  assert.match(wxss, /\.water-sheet\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(wxml, /textarea[^>]*cursor-spacing="160"/);

  const narrowStart = wxss.indexOf('@media (max-width: 374px)');
  const narrowEnd = wxss.indexOf('@media (min-width: 420px)', narrowStart);
  const narrow = wxss.slice(narrowStart, narrowEnd);
  assert.ok(narrowStart >= 0 && narrowEnd > narrowStart, '320/374 narrow layout must be explicit');
  assert.match(narrow, /water-ledger-row[\s\S]*minmax\(130rpx, 1fr\) max-content 220rpx/);
  assert.match(narrow, /water-ledger-adjust[\s\S]*gap:\s*6rpx/);
  assert.match(narrow, /water-adjust-button[\s\S]*width:\s*44px/);

  const pageConfig = JSON.parse(read('miniprogram/pages/water/index.json'));
  assert.deepEqual(pageConfig.usingComponents, {
    'van-popup': '@vant/weapp/popup/index',
  });
});

test('feed display keeps each per-player water amount atomic without changing canonical descriptions', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const description = '阿杰、王姐 胜 Chris、陈哥 · 每人 3 水，更正为每人 1 水';

  const [item] = ctx.decorateFeedEntries([{
    id: 'e_atomic_water',
    category: 'game',
    description,
    actorNameSnapshot: '王姐',
  }], { names: {}, viewerParticipantId: '', isOwner: false, isArchived: false });

  assert.equal(item.description, description);
  assert.equal(item.displayDescription, '阿杰、王姐 胜 Chris、陈哥 · 每\u2060人\u00a03\u00a0水，更正为每\u2060人\u00a01\u00a0水');
  assert.match(item.detailAriaLabel, new RegExp(description));
});

test('round sequence compacts above 999 without losing the full event count', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const base = payload();

  ctx.applyRoomData(payload({
    round: { ...base.round, eventCount: 1000 },
  }));
  assert.equal(ctx.data.roundSeqText, '#999+');
  assert.equal(ctx.data.eventCount, 1000);
  assert.match(ctx.data.latestReceipt.text, /流水 #1000 ·/);

  ctx.applyRoomData(payload({
    room: { ...base.room, syncVersion: 17 },
    round: { ...base.round, revision: 9, eventCount: 999 },
    entries: [],
  }));
  assert.equal(ctx.data.roundSeqText, '#999');

  const wxml = read('miniprogram/pages/water/index.wxml');
  assert.match(wxml, /class="water-round-seal" aria-label="当前流水 \{\{eventCount\}\} 条"/);
  assert.match(wxml, /\{\{eventCount\}\} 条流水/);
});

test('decorated feed entries expose a complete accessible detail summary', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);

  ctx.applyRoomData(payload());
  assert.ok(ctx.data.feedItems.length >= 2);
  ctx.data.feedItems.forEach((item) => {
    assert.equal(
      item.detailAriaLabel,
      ['查看记录详情', item.kindText, item.description, item.metaText, item.statusText].filter(Boolean).join('，'),
    );
  });
  assert.match(ctx.data.feedItems[0].detailAriaLabel, /更正/);
  assert.match(ctx.data.feedItems[0].detailAriaLabel, /王姐/);
});

test('manual add derives validity while retaining its blank-submit guard', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    async addParticipantsV2(...args) {
      calls.push(args);
      return payload();
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true },
  }));

  ctx.openManualSheet();
  assert.equal(ctx.data.manualNamesValid, false);
  ctx.onManualInput({ detail: { value: '   ' } });
  assert.equal(ctx.data.manualNamesValid, false);
  await ctx.submitManual();
  assert.equal(calls.length, 0, 'blank text must still be rejected inside submitManual');
  ctx.onManualInput({ detail: { value: ' 小陈 ' } });
  assert.equal(ctx.data.manualNamesValid, true);
  ctx.onSelectAddMode({ currentTarget: { dataset: { mode: 'relay' } } });
  ctx.onSelectAddMode({ currentTarget: { dataset: { mode: 'manual' } } });
  assert.equal(ctx.data.manualNames, ' 小陈 ');
  assert.equal(ctx.data.manualNamesValid, true);

  const wxml = read('miniprogram/pages/water/index.wxml');
  assert.match(wxml, /disabled="\{\{!!sheetBlockedReason \|\| !manualNamesValid\}\}"[^>]*bindtap="submitManual"/);
});

test('game sheet exposes inline validity, full summaries, and long-name density without waiting for submit', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const participants = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '周末限定超长昵称球友' },
  ];

  ctx.setData({
    roomId: 'water_1',
    roundId: 'round_3',
    canWrite: true,
    participantCount: participants.length,
    participants,
  });
  ctx.openGameSheet();

  assert.equal(ctx.data.gameSelectionValid, false);
  assert.equal(ctx.data.gameValidationMessage, '至少各选 1 人');
  assert.equal(ctx.data.hasLongGameNames, true);

  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  assert.equal(ctx.data.gameSelectionValid, false);
  assert.equal(ctx.data.gameValidationMessage, '还需选择 1 位负方');

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p2' } } });
  assert.equal(ctx.data.gameSelectionValid, true);
  assert.equal(ctx.data.gameValidationMessage, '双方人数相同，可提交');
  assert.equal(ctx.data.winnerFullSummary, '阿杰');
  assert.equal(ctx.data.loserFullSummary, '周末限定超长昵称球友');

  assert.equal(ctx.data.gameSummaryExpanded, false);
  ctx.toggleGameSummary();
  assert.equal(ctx.data.gameSummaryExpanded, true);
});

test('game sheet reorders only on side changes and search keeps the stable display order', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const participants = [
    { id: 'p1', name: '胜方甲' },
    { id: 'p2', name: '胜方乙' },
    { id: 'p3', name: '候选甲' },
    { id: 'p4', name: '候选乙' },
    { id: 'p5', name: '负方甲' },
    { id: 'p6', name: '负方乙' },
    { id: 'p7', name: '负方候选' },
  ];

  ctx.setData({
    roomId: 'water_1',
    roundId: 'round_3',
    canWrite: true,
    participantCount: participants.length,
    participants,
  });
  ctx.openGameSheet();
  assert.equal(ctx.data.gameBodyScrollTop, 0);
  ctx.refreshGameParticipants(['p1', 'p2', 'p3'], []);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'winner' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 0, 'selecting the already active side must not reset scroll again');

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 1);
  assert.deepEqual(
    ctx.data.gameParticipants.map((item) => item.id),
    ['p4', 'p5', 'p6', 'p7', 'p1', 'p2', 'p3'],
    'an empty current side must show unassigned players before the opposite side',
  );
  const orderAfterSideChange = ctx.data.gameParticipants.map((item) => item.id);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 1, 'same-side taps must preserve the current reset signal');
  assert.deepEqual(ctx.data.gameParticipants.map((item) => item.id), orderAfterSideChange);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'winner' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 0);
  assert.deepEqual(ctx.data.gameParticipants.slice(0, 3).map((item) => item.id), ['p1', 'p2', 'p3']);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 1);
  ['p5', 'p6', 'p7'].forEach((id) => {
    ctx.onToggleGamePlayer({ currentTarget: { dataset: { id } } });
  });
  assert.deepEqual(
    ctx.data.gameParticipants.map((item) => item.id),
    orderAfterSideChange,
    'individual toggles must not move the tapped chips',
  );

  ctx.onGameSearchInput({ detail: { value: '负方' } });
  assert.deepEqual(ctx.data.gameParticipants.map((item) => item.id), ['p5', 'p6', 'p7']);
  ctx.clearGameSearch();
  assert.deepEqual(ctx.data.gameParticipants.map((item) => item.id), orderAfterSideChange);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'winner' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 0);
  assert.deepEqual(ctx.data.gameParticipants.map((item) => item.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);

  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  assert.equal(ctx.data.gameBodyScrollTop, 1);
  assert.deepEqual(
    ctx.data.gameParticipants.map((item) => item.id),
    ['p5', 'p6', 'p7', 'p4', 'p1', 'p2', 'p3'],
    'the display order must be current side, unassigned, then opposite side',
  );

  ctx.closeSheets();
  assert.equal(ctx.data.gameBodyScrollTop, 0);
});

test('editing a game initializes the winner-first display order before any new toggle', async () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const participants = [
    { id: 'p1', name: '甲' },
    { id: 'p2', name: '乙' },
    { id: 'p3', name: '丙' },
    { id: 'p4', name: '丁' },
  ];
  const entry = {
    rootEntryId: 'root_1',
    expectedEntryId: 'entry_1',
    category: 'game',
    canEdit: true,
    payload: { winnerIds: ['p3', 'p4'], loserIds: ['p1', 'p2'], unitsPerPlayer: 2 },
  };

  ctx.setData({ participants, feedItems: [entry], gameBodyScrollTop: 1 });
  await ctx.openCorrectEntry({ currentTarget: { dataset: { root: 'root_1', expected: 'entry_1' } } });

  assert.equal(ctx.data.gameActiveSide, 'winner');
  assert.equal(ctx.data.gameBodyScrollTop, 0);
  assert.deepEqual(ctx.data.gameParticipantOrder.slice(0, 2), ['p3', 'p4']);
  assert.equal(ctx.data.gameParticipants.slice(0, 2).every((item) => item.winnerSelected), true);
});

test('collapsed game summaries use at most two names and no repeated population suffix', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const participants = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '王姐' },
    { id: 'p3', name: 'Chris' },
    { id: 'p4', name: '陈哥' },
    { id: 'p5', name: '小林' },
    { id: 'p6', name: 'Mia' },
  ];

  ctx.setData({ participants, gameParticipantOrder: participants.map((item) => item.id) });
  ctx.refreshGameParticipants(['p1', 'p2', 'p3', 'p4'], ['p5', 'p6']);

  assert.equal(ctx.data.winnerSummary, '阿杰、王姐…');
  assert.doesNotMatch(ctx.data.winnerSummary, /等|人|\d/);
  assert.equal(ctx.data.loserSummary, '小林、Mia');
  assert.equal(ctx.data.winnerFullSummary, '阿杰、王姐、Chris、陈哥');
});

test('24-player 12v12 selection puts the active loser side first through real page methods', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const participants = Array.from({ length: 24 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `球友${index + 1}`,
    claimed: true,
  }));

  ctx.setData({ roomId: 'water_1', participants, canWrite: true });
  ctx.openGameSheet();
  participants.slice(0, 12).forEach((participant) => {
    ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: participant.id } } });
  });
  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  participants.slice(12).forEach((participant) => {
    ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: participant.id } } });
  });
  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'winner' } } });
  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });

  assert.equal(ctx.data.gameActiveSide, 'loser');
  assert.equal(ctx.data.gameSelectionValid, true);
  assert.equal(ctx.data.winnerIds.length, 12);
  assert.equal(ctx.data.loserIds.length, 12);
  assert.equal(ctx.data.gameParticipants.slice(0, 3).every((item) => item.loserSelected), true);
});

test('direct water validity explains each incomplete state before enabling its action', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());

  ctx.openDirectSheet();
  assert.equal(ctx.data.directSelectionValid, false);
  assert.equal(ctx.data.directValidationMessage, '请选择请水方和赢水方');
  assert.equal(ctx.data.directPreview, '请水方 → 赢水方');

  ctx.onDirectFromChange({ detail: { value: 1 } });
  assert.equal(ctx.data.directSelectionValid, false);
  assert.equal(ctx.data.directValidationMessage, '请选择赢水方');

  ctx.onDirectToChange({ detail: { value: 1 } });
  assert.equal(ctx.data.directSelectionValid, false);
  assert.equal(ctx.data.directValidationMessage, '请水方和赢水方不能是同一人');

  ctx.onDirectToChange({ detail: { value: 2 } });
  assert.equal(ctx.data.directSelectionValid, true);
  assert.equal(ctx.data.directValidationMessage, '双方不同，可以记水');
  assert.equal(ctx.data.directPreview, '阿杰 请 王姐 · 1 水');
});

test('direct validity resets on close and recomputes for edit and conflict refresh', async () => {
  const directEntry = {
    id: 'e10', rootEntryId: 'e10', seq: 10,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p1', toPlayerId: 'p3', units: 2 },
  };
  const definition = loadPageDefinition({
    async getEntry() {
      return { rootEntryId: 'e10', currentEntry: directEntry, history: [directEntry] };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({ entries: [directEntry], page: { latestSeq: 10, hasMore: false } }));

  ctx.openDirectSheet();
  ctx.onDirectFromChange({ detail: { value: 1 } });
  ctx.onDirectToChange({ detail: { value: 2 } });
  assert.equal(ctx.data.directSelectionValid, true);
  ctx.closeSheets();
  assert.equal(ctx.data.directSelectionValid, false);
  assert.equal(ctx.data.directValidationMessage, '请选择请水方和赢水方');

  await ctx.openCorrectEntry({ currentTarget: { dataset: { root: 'e10', expected: 'e10' } } });
  assert.equal(ctx.data.directSelectionValid, true);
  assert.equal(ctx.data.directPreview, '阿杰 请 Chris · 2 水');

  ctx.setData({ directFromIndex: 0, directToIndex: 0 });
  ctx.refreshDirectPreview();
  assert.equal(ctx.data.directSelectionValid, false);
  await ctx.refreshCorrectionEntry('e10');
  assert.equal(ctx.data.directSelectionValid, true);
  assert.equal(ctx.data.directPreview, '阿杰 请 Chris · 2 水');
});

test('ledger projection marks large net values for responsive type without changing the amount', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    round: {
      ...payload().round,
      ledger: [
        { participantId: 'p1', won: 999, treat: 0, net: 999 },
        { participantId: 'p2', won: 9999, treat: 0, net: 9999 },
        { participantId: 'p3', won: 0, treat: 99000, net: -99000 },
      ],
    },
  }));

  assert.deepEqual(ctx.data.ledger.map((row) => [row.netText, row.netSizeClass]), [
    ['+9999', 'is-net-lg'],
    ['+999', ''],
    ['-99000', 'is-net-xl'],
  ]);
});

test('V2 room projection derives member controls, server ledger rows and the latest receipt', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);

  assert.equal(ctx.data.activeTab, 'ledger');
  ctx.applyRoomData(payload());

  assert.equal(ctx.data.roomId, 'water_1');
  assert.equal(ctx.data.roundId, 'round_3');
  assert.equal(ctx.data.isMember, true);
  assert.equal(ctx.data.isOwner, false);
  assert.equal(ctx.data.isVisitor, false);
  assert.equal(ctx.data.canWrite, true);
  assert.deepEqual(ctx.data.ledger.map((row) => [row.name, row.netText]), [
    ['阿杰', '+6'],
    ['王姐', '+3'],
    ['Chris', '+1'],
  ]);
  assert.match(ctx.data.latestReceipt.text, /#016/);
  assert.equal(ctx.data.feedItems[0].isAuditEvent, true);
  assert.equal(ctx.data.feedItems[0].canEdit, true);
  assert.equal(ctx.data.feedItems[1].canEdit, false);
});

test('feed filters isolate pagination and append unique older entries', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    async listEntries(...args) {
      calls.push(args);
      return {
        entries: [
          {
            id: 'e14', rootEntryId: 'e14', eventType: 'game_recorded', category: 'game', status: 'active',
            actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2', description: '阿杰 胜 Chris · 每人 1 水',
          },
        ],
        page: { nextBeforeSeq: 14, latestSeq: 16, hasMore: false },
      };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());
  ctx.onSelectTab({ currentTarget: { dataset: { tab: 'feed' } } });
  await ctx.onSelectFeedFilter({ currentTarget: { dataset: { filter: 'game' } } });

  assert.equal(ctx.data.activeTab, 'feed');
  assert.equal(ctx.data.feedFilter, 'game');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'water_1');
  assert.equal(calls[0][1], 'round_3');
  assert.deepEqual(calls[0][2], { category: 'game', limit: 20 });
  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e14']);
  assert.equal(ctx.data.feedExhausted, true);

  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 17 },
    round: { ...payload().round, revision: 9, eventCount: 17 },
    entries: [{
      id: 'e17', rootEntryId: 'e17', seq: 17,
      eventType: 'game_recorded', category: 'game', status: 'active',
      actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
      payload: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 1 },
    }],
    page: { nextBeforeSeq: 999, latestSeq: 17, hasMore: true },
  }), { fromRefresh: true });
  assert.equal(ctx.data.feedNextBeforeSeq, 14, 'global get cursor must not replace the game-category cursor');
});

test('silent refresh merges the newest page without dropping already loaded entries', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const entry = (seq) => ({
    id: `e${seq}`, rootEntryId: `e${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  });
  ctx.applyRoomData(payload({
    entries: [entry(20), entry(19), entry(18)],
    page: { nextBeforeSeq: 18, latestSeq: 20, hasMore: true },
  }));
  ctx._feedRawEntries = [entry(20), entry(19), entry(18), entry(17), entry(16)];
  ctx.setData({
    feedItems: ctx.decorateFeedEntries(ctx._feedRawEntries),
    feedNextBeforeSeq: 16,
    feedHasMore: true,
  });

  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 17 },
    round: { ...payload().round, revision: 9, eventCount: 22 },
    entries: [entry(22), entry(21), entry(20)],
    page: { nextBeforeSeq: 20, latestSeq: 22, hasMore: true },
  }), { fromRefresh: true });

  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e22', 'e21', 'e20', 'e19', 'e18', 'e17', 'e16']);
  assert.equal(ctx.data.feedNextBeforeSeq, 16);
  assert.equal(ctx.data.feedLatestSeq, 22);
});

test('silent refresh buffers new entries after loadMore until returnToLatest resets', async () => {
  const entry = (seq) => ({
    id: `e${seq}`, rootEntryId: `e${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  });
  const definition = loadPageDefinition({
    async listEntries(roomId, roundId, options) {
      if (options.beforeSeq) {
        return { entries: [entry(18), entry(17)], page: { nextBeforeSeq: 17, latestSeq: 20, hasMore: true } };
      }
      return { entries: [entry(22), entry(21), entry(20)], page: { nextBeforeSeq: 20, latestSeq: 22, hasMore: true } };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    entries: [entry(20), entry(19)],
    page: { nextBeforeSeq: 19, latestSeq: 20, hasMore: true },
  }));
  await ctx.loadMoreEntries();
  assert.equal(ctx.data.feedHasLoadedOlder, true);

  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 17 },
    round: { ...payload().round, revision: 9, eventCount: 22 },
    entries: [entry(22), entry(21), entry(20)],
    page: { nextBeforeSeq: 20, latestSeq: 22, hasMore: true },
  }), { fromRefresh: true });

  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e20', 'e19', 'e18', 'e17']);
  assert.equal(ctx.data.newEventCount, 2);
  assert.equal(ctx.data.feedNextBeforeSeq, 17);

  await ctx.returnToLatest();
  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e22', 'e21', 'e20']);
  assert.equal(ctx.data.newEventCount, 0);
  assert.equal(ctx.data.feedHasLoadedOlder, false);
});

test('repeated polling keeps a buffered event pending without resetting loaded older pages', async () => {
  const listCalls = [];
  const entry = (seq) => ({
    id: `e${seq}`, rootEntryId: `e${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  });
  const refresh = payload({
    room: { ...payload().room, syncVersion: 21 },
    round: { ...payload().round, revision: 21, eventCount: 21 },
    entries: [entry(21), entry(20)],
    page: { nextBeforeSeq: 20, latestSeq: 21, hasMore: true },
  });
  const definition = loadPageDefinition({
    async getV2() { return refresh; },
    async listEntries(roomId, roundId, options) {
      listCalls.push([roomId, roundId, options]);
      return { entries: [entry(21), entry(20)], page: { nextBeforeSeq: 20, latestSeq: 21, hasMore: true } };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 20 },
    round: { ...payload().round, revision: 20, eventCount: 20 },
    entries: [entry(20), entry(19), entry(18), entry(17)],
    page: { nextBeforeSeq: 17, latestSeq: 20, hasMore: true },
  }));
  ctx.setData({ feedHasLoadedOlder: true });

  await ctx.loadRoom({ silent: true });
  await ctx.loadRoom({ silent: true });

  assert.deepEqual(listCalls, [], 'seeing the same buffered event twice must not fabricate a sequence gap');
  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e20', 'e19', 'e18', 'e17']);
  assert.equal(ctx.data.feedNextBeforeSeq, 17);
  assert.equal(ctx.data.feedLatestSeq, 21, 'the observed server watermark must advance while the row stays buffered');
  assert.equal(ctx.data.newEventCount, 1);
  assert.deepEqual(Array.from(ctx._pendingFeedEntryIds), ['e21']);
});

test('filtered polling keeps its pending banner after the server watermark advances', async () => {
  const entry = (seq) => ({
    id: `g${seq}`, rootEntryId: `g${seq}`, seq,
    eventType: 'game_recorded', category: 'game', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 1 },
  });
  const definition = loadPageDefinition({
    async listEntries(roomId, roundId, options) {
      return options.afterSeq < 11
        ? { entries: [entry(11)], page: { latestSeq: 11, hasMore: false } }
        : { entries: [], page: { latestSeq: 11, hasMore: false } };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    entries: [entry(10), entry(9)],
    page: { nextBeforeSeq: 9, latestSeq: 10, hasMore: true },
  }));
  ctx._feedRawEntries = [entry(10), entry(9)];
  ctx.setData({
    feedFilter: 'game',
    feedItems: ctx.decorateFeedEntries(ctx._feedRawEntries),
    feedLatestSeq: 10,
    feedNextBeforeSeq: 9,
    feedHasLoadedOlder: true,
  });

  await ctx.syncFilteredEntries({ roomId: 'water_1', roundId: 'round_3', filter: 'game', afterSeq: 10 });
  await ctx.syncFilteredEntries({ roomId: 'water_1', roundId: 'round_3', filter: 'game', afterSeq: 11 });

  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['g10', 'g9']);
  assert.equal(ctx.data.feedLatestSeq, 11);
  assert.equal(ctx.data.newEventCount, 1);
  assert.deepEqual(Array.from(ctx._pendingFeedEntryIds), ['g11']);
});

test('polling backs off 8/16/30 seconds, recovers to 8, and bursts 3 seconds five times', async () => {
  const timers = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let attempts = 0;
  global.setInterval = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  global.clearInterval = () => {};
  const definition = loadPageDefinition({
    async getV2() {
      attempts += 1;
      if (attempts <= 2) throw new Error('offline');
      return payload({ room: { ...payload().room, syncVersion: 16 + attempts } });
    },
  });
  const ctx = createContext(definition);
  ctx._isVisible = true;

  try {
    ctx.applyRoomData(payload());
    assert.equal(timers[0].delay, 8000);
    await timers[0].callback();
    assert.equal(timers[1].delay, 16000);
    await timers[1].callback();
    assert.equal(timers[2].delay, 30000);
    await timers[2].callback();
    assert.equal(timers[3].delay, 8000);

    ctx.beginBurstPolling();
    const burstStart = timers.length - 1;
    for (let index = 0; index < 5; index += 1) {
      assert.equal(timers[burstStart + index].delay, 3000);
      await timers[burstStart + index].callback();
    }
    assert.equal(timers[burstStart + 5].delay, 8000);
  } finally {
    ctx.onHide();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('visitor/member/owner capabilities control writing and concrete entry actions', () => {
  const definition = loadPageDefinition();
  const visitor = createContext(definition);
  visitor.applyRoomData(payload({
    viewer: { participantId: '', role: 'visitor' },
    capabilities: { v2Read: true, canMemberWrite: false, canCorrect: false, canReverse: false },
  }));
  assert.equal(visitor.data.isVisitor, true);
  assert.equal(visitor.data.canWrite, false);
  assert.equal(visitor.data.bottomActionMode, 'join');

  const owner = createContext(definition);
  owner.applyRoomData(payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: {
      v2Read: true, canManageRoster: true, canOwnerWrite: true, canMemberWrite: true,
      canCorrect: true, canReverse: true, canCreateRound: true,
    },
  }));
  assert.equal(owner.data.isOwner, true);
  assert.equal(owner.data.canManageRoster, true);
  assert.equal(owner.data.canCreateRound, true);
  assert.equal(owner.data.feedItems.every((item) => item.canReverse), true);
});

test('malformed feed entries without a root creator fail closed even for owner', () => {
  const definition = loadPageDefinition();
  const owner = createContext(definition);
  owner.applyRoomData(payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: {
      v2Read: true, canManageRoster: true, canOwnerWrite: true,
      canCorrect: true, canReverse: true,
    },
    entries: [{
      id: 'malformed', rootEntryId: 'malformed', seq: 1,
      eventType: 'transfer_recorded', category: 'direct', status: 'active',
      actorParticipantId: 'p2', actorNameSnapshot: '王姐',
      payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
    }],
  }));

  assert.equal(owner.data.feedItems[0].canEdit, false);
  assert.equal(owner.data.feedItems[0].canReverse, false);
});

test('role and roster capabilities fail closed for malformed, read-only, and full projections', () => {
  const definition = loadPageDefinition();
  const malformed = createContext(definition);
  malformed.applyRoomData(payload({
    viewer: { participantId: 'p2' },
    capabilities: { v2Read: true, canMemberWrite: true },
  }));
  assert.equal(malformed.data.isMember, false);
  assert.equal(malformed.data.isVisitor, false);
  assert.equal(malformed.data.canWrite, false);
  assert.equal(malformed.data.bottomActionMode, 'read-only');

  const fullParticipants = Array.from({ length: 24 }, (_, index) => ({
    id: `p${index + 1}`, name: `球友${index + 1}`, claimed: true,
  }));
  const owner = createContext(definition);
  owner.applyRoomData(payload({
    room: { ...payload().room, participants: fullParticipants },
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: {
      v2Read: true,
      canOwnerWrite: true,
      canManageRoster: true,
      emergencyReadOnly: true,
    },
  }));
  assert.equal(owner.data.canWrite, false);
  assert.equal(owner.data.canManageRoster, true);
  assert.equal(owner.data.canAddParticipants, false);
});

test('a refresh audit event updates the already loaded target lifecycle', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const root = {
    id: 'e10', rootEntryId: 'e10', seq: 10,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  };
  ctx.applyRoomData(payload({ entries: [root], page: { latestSeq: 10, nextBeforeSeq: 10, hasMore: true } }));
  ctx.setData({ receiptFeedback: { rootEntryId: 'e10', expectedEntryId: 'e10', text: '已记入流水' } });
  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 17 },
    round: { ...payload().round, revision: 9, eventCount: 11 },
    entries: [{
      id: 'e11', rootEntryId: 'e10', targetEntryId: 'e10', seq: 11,
      eventType: 'entry_reversed', category: 'direct', status: 'applied',
      actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    }],
    page: { latestSeq: 11, nextBeforeSeq: 11, hasMore: true },
  }), { fromRefresh: true });

  const refreshedRoot = ctx.data.feedItems.find((item) => item.id === 'e10');
  assert.equal(refreshedRoot.statusText, '已撤销');
  assert.equal(refreshedRoot.canEdit, false);
  assert.equal(refreshedRoot.canReverse, false);
  assert.equal(ctx.data.receiptFeedback, null);
});

test('native share menu follows the server-derived member capability', () => {
  const definition = loadPageDefinition();
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    showShareMenu() { calls.push('show'); },
    hideShareMenu() { calls.push('hide'); },
  };
  try {
    const visitor = createContext(definition);
    visitor.applyRoomData(payload({
      viewer: { participantId: '', role: 'visitor' },
      capabilities: { v2Read: true },
    }));
    const member = createContext(definition);
    member.applyRoomData(payload());
    member.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 17 },
      round: { ...payload().round, revision: 9 },
      capabilities: { ...payload().capabilities, emergencyReadOnly: true },
    }));
  } finally {
    global.wx = originalWx;
  }
  assert.deepEqual(calls, ['hide', 'show', 'hide']);
});

test('audit entries without fixture descriptions use specific correction and reversal copy', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    entries: [{
      id: 'e20', rootEntryId: 'e10', targetEntryId: 'e19', seq: 20,
      eventType: 'entry_reversed', category: 'direct', status: 'applied', payload: null,
      actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    }],
  }));
  assert.equal(ctx.data.feedItems[0].description, '王姐撤销了这条单记');
});

test('specific correction/reversal and same-page round actions use V2 wrappers', async () => {
  const calls = [];
  const ownerPayload = () => payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true, canCorrect: true, canReverse: true, canCreateRound: true },
  });
  const definition = loadPageDefinition({
    async correctEntry(...args) {
      calls.push(['correct', ...args]);
      return ownerPayload();
    },
    async reverseEntry(...args) {
      calls.push(['reverse', ...args]);
      return ownerPayload();
    },
    async listRounds(...args) {
      calls.push(['rounds', ...args]);
      return { rounds: [{ id: 'round_2', number: 2, title: '8月8日打水局', status: 'archived' }], page: { hasMore: false } };
    },
    async createRound(...args) {
      calls.push(['new-round', ...args]);
      const current = ownerPayload();
      return { ...current, round: { ...current.round, id: 'round_4', number: 4, recordCount: 0, eventCount: 0 } };
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = {
    showToast() {},
    showModal(options) { options.success({ confirm: true, cancel: false }); },
  };
  ctx.applyRoomData(payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canOwnerWrite: true, canCorrect: true, canReverse: true, canCreateRound: true },
  }));

  try {
    await ctx.submitCorrection({
      rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game',
      replacement: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 2 },
    });
    await ctx.confirmReverseEntry({ rootEntryId: 'e15', expectedEntryId: 'e15', description: 'Chris 请 阿杰 · 1 水' });
    await ctx.openHistorySheet();
    await ctx.onCreateRound();
  } finally {
    global.wx = originalWx;
  }

  assert.equal(calls[0][0], 'correct');
  assert.deepEqual(calls[0].slice(1, 6), ['water_1', 'round_3', 'e10', 'e16', { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 2 }]);
  assert.equal(calls[1][0], 'reverse');
  assert.deepEqual(calls[1].slice(1, 5), ['water_1', 'round_3', 'e15', 'e15']);
  assert.equal(calls[2][0], 'rounds');
  assert.equal(ctx.data.historySheetOpen, false);
  assert.equal(ctx.data.roundId, 'round_4');
  assert.equal(calls[3][0], 'new-round');
});

test('history paginates rounds with start time and renders archived entries from snapshots', async () => {
  const calls = [];
  const firstStartedAt = new Date(2026, 7, 8, 10, 30).getTime();
  const definition = loadPageDefinition({
    async listRounds(roomId, options) {
      calls.push(['rounds', roomId, options]);
      if (options.beforeNumber) {
        return {
          rounds: [{ id: 'round_1', number: 1, title: '8月7日打水局', createdAtMs: firstStartedAt - 86400000, recordCount: 2, participantCount: 2 }],
          page: { nextBeforeNumber: 1, hasMore: false },
        };
      }
      return {
        rounds: [{ id: 'round_2', number: 2, title: '8月8日打水局', createdAtMs: firstStartedAt, recordCount: 3, participantCount: 2 }],
        page: { nextBeforeNumber: 2, hasMore: true },
      };
    },
    async getRound(roomId, roundId) {
      calls.push(['round', roomId, roundId]);
      return {
        round: {
          id: roundId, number: 1, title: '8月7日打水局', status: 'archived',
          participantSnapshot: [{ id: 'p1', name: '旧阿杰' }, { id: 'p2', name: '旧王姐' }],
          ledger: [{ participantId: 'p2', won: 2, treat: 0, net: 2 }],
          recordCount: 1, eventCount: 1,
        },
        entries: [{
          id: 'old_e1', rootEntryId: 'old_e1', seq: 1,
          eventType: 'transfer_recorded', category: 'direct', status: 'active',
          actorParticipantId: 'p2', actorNameSnapshot: '旧王姐', rootCreatedByParticipantId: 'p2',
          payload: { fromPlayerId: 'p1', toPlayerId: 'p2', units: 2 },
        }],
        page: { hasMore: false, latestSeq: 1 },
      };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canOwnerWrite: true, canCreateRound: true },
  }));

  await ctx.openHistorySheet();
  assert.match(ctx.data.historyRounds[0].timeText, /8月8日\s+10:30/);
  assert.equal(ctx.data.historyHasMore, true);
  await ctx.loadMoreHistoryRounds();
  assert.equal(ctx.data.historyRounds.length, 2);
  assert.deepEqual(calls[1][2], { beforeNumber: 2, limit: 20 });

  await ctx.openHistoryRound({ currentTarget: { dataset: { id: 'round_1' } } });
  assert.equal(ctx.data.historyRoundLedger[0].name, '旧王姐');
  assert.equal(ctx.data.historyRoundFeed[0].description, '旧阿杰 请 旧王姐 · 2 水');
  assert.equal(ctx.data.historyRoundFeed[0].canEdit, false);
});

test('detail load failures remain visible with an in-sheet retry target', async () => {
  const definition = loadPageDefinition({
    async getEntry() {
      throw new Error('网络不稳定');
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());
  await ctx.openEntryDetail({ currentTarget: { dataset: { root: 'e15' } } });

  assert.equal(ctx.data.detailSheetOpen, true);
  assert.equal(ctx.data.detailLoading, false);
  assert.equal(ctx.data.detailRootEntryId, 'e15');
  assert.equal(ctx.data.detailError, '网络不稳定');
  assert.match(read('miniprogram/pages/water/index.wxml'), /detailError[\s\S]*retryEntryDetail/);
});

test('new-round confirmation snapshots the round before modal wait', async () => {
  const calls = [];
  let modalOptions;
  const ownerProjection = (roundId, roomVersion, syncVersion) => payload({
    room: { ...payload().room, roomVersion, syncVersion },
    round: { ...payload().round, id: roundId, revision: syncVersion, recordCount: 2, eventCount: 2 },
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canOwnerWrite: true, canCreateRound: true },
  });
  const definition = loadPageDefinition({
    async createRound(...args) { calls.push(args); return ownerProjection('round_5', 6, 20); },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = {
    showModal(options) { modalOptions = options; },
    showToast() {},
  };
  ctx.applyRoomData(ownerProjection('round_3', 4, 16));

  try {
    const creating = ctx.onCreateRound();
    ctx.applyRoomData(ownerProjection('round_4', 5, 18), { fromRefresh: true });
    modalOptions.success({ confirm: true, cancel: false });
    await creating;
  } finally {
    global.wx = originalWx;
  }

  assert.equal(calls.length, 0);
  assert.match(ctx.data.syncMessage, /当前轮已更新/);
});

test('invalid room stays on an explicit error state and returns to launch', async () => {
  const definition = loadPageDefinition({
    async getV2() {
      throw Object.assign(new Error('打水房不存在'), { code: 'WATER_ROOM_NOT_FOUND', state: 'not_found' });
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  let switchedTo = '';
  global.wx = { switchTab({ url }) { switchedTo = url; } };
  ctx.setData({ roomId: 'missing', sessionId: 'missing' });

  try {
    await ctx.loadRoom();
    assert.equal(ctx.data.invalidRoom, true);
    assert.equal(ctx.data.loadError, '打水房不存在或链接不完整');
    ctx.returnToLaunch();
    assert.equal(switchedTo, '/pages/launch/index');
  } finally {
    global.wx = originalWx;
  }
});

test('join/add V2 signatures keep version and explicit request id inside options', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    async joinV2(...args) {
      calls.push(['join', ...args]);
      return payload();
    },
    async addParticipantsV2(...args) {
      calls.push(['add', ...args]);
      return payload({
        viewer: { participantId: 'p1', role: 'owner' },
        capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true },
      });
    },
  });
  const originalWx = global.wx;
  global.wx = { showToast() {} };

  try {
    const visitor = createContext(definition);
    visitor.applyRoomData(payload({
      viewer: { participantId: '', role: 'visitor' },
      capabilities: { v2Read: true, canMemberWrite: false },
    }));
    visitor.setData({ joinNickname: '王姐 2' });
    await visitor.onJoin();

    const owner = createContext(definition);
    owner.applyRoomData(payload({
      viewer: { participantId: 'p1', role: 'owner' },
      capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true },
    }));
    owner.openManualSheet();
    owner.onManualInput({ detail: { value: '小陈' } });
    await owner.submitManual();
  } finally {
    global.wx = originalWx;
  }

  assert.equal(calls[0][0], 'join');
  assert.equal(calls[0][1], 'water_1');
  assert.equal(calls[0][2], '王姐 2');
  assert.equal(calls[0][3].claimParticipantId, '');
  assert.equal(calls[0][3].expectedRoomVersion, 4);
  assert.match(calls[0][3].clientRequestId, /^water_join_v2_/);
  assert.equal(calls[1][0], 'add');
  assert.equal(calls[1][1], 'water_1');
  assert.equal(calls[1][2], '小陈');
  assert.equal(calls[1][3].expectedRoomVersion, 4);
  assert.match(calls[1][3].clientRequestId, /^water_add_manual_/);
});

test('join gate recommends an exact unclaimed name and blocks a claimed-name duplicate', async () => {
  const joinCalls = [];
  const profile = {
    async ensureProfileForAction() {
      return { ok: true, profile: { nickName: '王姐' } };
    },
  };
  const definition = loadPageDefinition({
    async joinV2(...args) {
      joinCalls.push(args);
      return payload({ viewer: { participantId: 'p2', role: 'member' } });
    },
  }, profile);
  const projection = (participants) => payload({
    room: { ...payload().room, participants },
    viewer: { participantId: '', role: 'visitor' },
    capabilities: { v2Read: true, canMemberWrite: false },
    entries: [],
  });
  const originalWx = global.wx;
  global.wx = { showToast() {} };

  try {
    const exact = createContext(definition);
    exact.applyRoomData(projection([
      { id: 'p1', name: '阿杰', claimed: true },
      { id: 'p2', name: '王姐', claimed: false },
      { id: 'p3', name: 'Chris', claimed: true },
    ]));
    await exact.openJoinSheet();
    assert.equal(exact.data.joinSheetOpen, true);
    assert.equal(exact.data.joinChoices[exact.data.joinIndex].id, 'p2');
    assert.equal(exact.data.joinNickname, '王姐');
    assert.equal(exact.data.joinNeedsDistinctName, false);

    const duplicate = createContext(definition);
    duplicate.applyRoomData(projection([
      { id: 'p1', name: '阿杰', claimed: true },
      { id: 'p2', name: '王姐', claimed: true },
    ]));
    await duplicate.openJoinSheet();
    assert.equal(duplicate.data.joinChoices[duplicate.data.joinIndex].id, '');
    assert.equal(duplicate.data.joinNeedsDistinctName, true);
    assert.match(duplicate.data.joinNameError, /换一个本局称呼/);
    await duplicate.onJoin();
    assert.equal(joinCalls.length, 0);

    duplicate.onJoinNicknameInput({ detail: { value: '王姐 2' } });
    assert.equal(duplicate.data.joinNameError, '');
    await duplicate.onJoin();
    assert.equal(joinCalls.length, 1);
    assert.deepEqual(joinCalls[0].slice(0, 2), ['water_1', '王姐 2']);
  } finally {
    global.wx = originalWx;
  }
});

test('roster conflict refresh rotates request id when expectedRoomVersion changes', async () => {
  const calls = [];
  let attempt = 0;
  const ownerProjection = (roomVersion) => payload({
    room: { ...payload().room, roomVersion },
    viewer: { participantId: 'p1', role: 'owner' },
    capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true },
  });
  const definition = loadPageDefinition({
    async addParticipantsV2(...args) {
      calls.push(args);
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('名单已更新'), { state: 'conflict' });
      return ownerProjection(6);
    },
    async getV2() {
      return ownerProjection(5);
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  ctx.applyRoomData(ownerProjection(4));
  ctx.openManualSheet();
  ctx.onManualInput({ detail: { value: '小陈' } });

  try {
    await ctx.submitManual();
    await ctx.submitManual();
  } finally {
    global.wx = originalWx;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].expectedRoomVersion, 4);
  assert.equal(calls[1][2].expectedRoomVersion, 5);
  assert.notEqual(calls[0][2].clientRequestId, calls[1][2].clientRequestId);
});

test('join conflict refresh rotates request id when expectedRoomVersion changes', async () => {
  const calls = [];
  let attempt = 0;
  const projection = (roomVersion, syncVersion, role = 'visitor') => payload({
    room: { ...payload().room, roomVersion, syncVersion },
    viewer: role === 'member' ? { participantId: 'p2', role } : { participantId: '', role },
    capabilities: {
      v2Read: true,
      canManageRoster: false,
      canOwnerWrite: false,
      canMemberWrite: role === 'member',
    },
    entries: [],
  });
  const definition = loadPageDefinition({
    async joinV2(...args) {
      calls.push(args);
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('名单已更新'), { state: 'conflict' });
      return projection(6, 18, 'member');
    },
    async getV2() {
      return projection(5, 17);
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  ctx.applyRoomData(projection(4, 16));
  ctx.setData({ joinNickname: '新球友' });

  try {
    await ctx.onJoin();
    await ctx.onJoin();
  } finally {
    global.wx = originalWx;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].expectedRoomVersion, 4);
  assert.equal(calls[1][2].expectedRoomVersion, 5);
  assert.match(calls[0][2].clientRequestId, /^water_join_v2_/);
  assert.notEqual(calls[0][2].clientRequestId, calls[1][2].clientRequestId);
});

test('legacy fallback is owner-write through V1 while members stay read-only', async () => {
  const v1Calls = [];
  const definition = loadPageDefinition({
    async recordGameV2() {
      throw new Error('legacy must not call V2 recordGame');
    },
    async recordGame(...args) {
      v1Calls.push(args);
      return { session: legacySession(true, 'p1', 4) };
    },
  });
  function legacySession(isOwner, viewerParticipantId, version = 3) {
    return {
      id: 'water_legacy', title: '旧打水局', status: 'active', version,
      participants: [
        { id: 'p1', name: '阿杰', claimed: true },
        { id: 'p2', name: '王姐', claimed: true },
      ],
      entries: [], isOwner, viewerParticipantId,
    };
  }
  const originalWx = global.wx;
  global.wx = { showToast() {} };

  try {
    const owner = createContext(definition);
    owner.applyApiResponse({
      legacySession: legacySession(true, 'p1'),
      capabilities: { legacyRead: true, legacyOwnerWrite: true },
    });
    assert.equal(owner.data.legacyMode, true);
    assert.equal(owner.data.canWrite, true);
    assert.match(owner.data.syncMessage, /账本正在升级/);
    owner.openGameSheet();
    owner.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
    owner.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
    owner.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p2' } } });
    await owner.submitGame();

    const member = createContext(definition);
    member.applyApiResponse({
      legacySession: legacySession(false, 'p2'),
      capabilities: { legacyRead: true, legacyOwnerWrite: false },
    });
    assert.equal(member.data.isMember, true);
    assert.equal(member.data.canWrite, false);
    assert.equal(member.data.bottomActionMode, 'read-only');
    assert.match(member.data.syncMessage, /暂时由发起人记水/);
  } finally {
    global.wx = originalWx;
  }

  assert.equal(v1Calls.length, 1);
  assert.deepEqual(v1Calls[0].slice(0, 5), ['water_legacy', 3, ['p1'], ['p2'], 1]);
  assert.match(v1Calls[0][5].clientRequestId, /^water_game_/);
});

test('legacy member and visitor capability mapping fails closed', () => {
  const definition = loadPageDefinition();
  const legacy = (viewerParticipantId, role) => ({
    legacySession: {
      id: 'water_legacy', title: '旧打水局', status: 'active', version: 3,
      participants: [
        { id: 'p1', name: '阿杰', claimed: true },
        { id: 'p2', name: '王姐', claimed: true },
      ],
      entries: [], isOwner: role === 'owner', viewerParticipantId,
    },
    capabilities: { legacyRead: true, legacyOwnerWrite: false },
  });
  const member = createContext(definition);
  member.applyApiResponse(legacy('p2', 'member'));
  const visitor = createContext(definition);
  visitor.applyApiResponse(legacy('', 'visitor'));

  assert.equal(member.data.canWrite, false);
  assert.equal(member.data.canManageRoster, false);
  assert.equal(member.data.canShare, false);
  assert.equal(member.data.bottomActionMode, 'read-only');
  assert.equal(visitor.data.canShare, false);
  assert.equal(visitor.data.bottomActionMode, 'read-only');
});

test('createRound delta atomically clears the archived round feed state', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  const owner = payload({
    viewer: { participantId: 'p1', role: 'owner', isMember: true, isOwner: true },
    capabilities: { v2Read: true, canOwnerWrite: true, canCreateRound: true },
  });
  ctx.applyRoomData(owner);
  ctx._pendingFeedEntryIds = new Set(['e17']);
  ctx._feedAwayFromLatest = true;
  ctx.setData({
    activeTab: 'feed',
    feedFilter: 'game',
    feedLatestSeq: 16,
    feedNextBeforeSeq: 4,
    feedHasMore: true,
    feedHasLoadedOlder: true,
    feedExhausted: false,
    feedError: '旧错误',
    newEventCount: 3,
    receiptFeedback: { rootEntryId: 'e15', expectedEntryId: 'e15', text: '旧回执' },
  });

  const applied = ctx.applyMutationResponse({
    room: { ...owner.room, roomVersion: 5, syncVersion: 17 },
    round: {
      ...owner.round,
      id: 'round_4',
      number: 4,
      revision: 1,
      recordCount: 0,
      activeRecordCount: 0,
      eventCount: 0,
      ledger: [],
    },
    archivedRoundId: 'round_3',
  }, { newRound: true });

  assert.equal(applied, true);
  assert.equal(ctx.data.roundId, 'round_4');
  assert.equal(ctx.data.activeTab, 'ledger');
  assert.equal(ctx.data.feedFilter, 'all');
  assert.deepEqual(ctx.data.feedItems, []);
  assert.equal(ctx.data.feedLatestSeq, 0);
  assert.equal(ctx.data.feedNextBeforeSeq, null);
  assert.equal(ctx.data.feedHasMore, false);
  assert.equal(ctx.data.feedHasLoadedOlder, false);
  assert.equal(ctx.data.feedExhausted, true);
  assert.equal(ctx.data.feedError, '');
  assert.equal(ctx.data.newEventCount, 0);
  assert.deepEqual(ctx.data.latestReceipt, { visible: false, text: '' });
  assert.equal(ctx.data.receiptFeedback, null);
  assert.deepEqual(ctx._feedRawEntries, []);
  assert.equal(ctx._pendingFeedEntryIds.size, 0);
  assert.equal(ctx._feedAwayFromLatest, false);
});

test('filtered polling uses category afterSeq so a mixed 21-event burst cannot hide a match', async () => {
  const calls = [];
  const gameEntry = (seq) => ({
    id: `g${seq}`, rootEntryId: `g${seq}`, seq,
    eventType: 'game_recorded', category: 'game', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 1 },
  });
  const directEntry = (seq) => ({
    id: `d${seq}`, rootEntryId: `d${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  });
  const definition = loadPageDefinition({
    async getV2() {
      return payload({
        room: { ...payload().room, syncVersion: 31 },
        round: { ...payload().round, revision: 31, eventCount: 31 },
        entries: Array.from({ length: 20 }, (_, index) => directEntry(31 - index)),
        page: { nextBeforeSeq: 12, latestSeq: 31, hasMore: true },
      });
    },
    async listEntries(roomId, roundId, options) {
      calls.push([roomId, roundId, options]);
      return {
        entries: [gameEntry(11)],
        page: { nextBeforeSeq: 11, latestSeq: 31, hasMore: false },
      };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    round: { ...payload().round, eventCount: 10, revision: 10 },
    entries: [gameEntry(10)],
    page: { nextBeforeSeq: 10, latestSeq: 10, hasMore: true },
  }));
  ctx._feedRawEntries = [gameEntry(10)];
  ctx.setData({
    feedFilter: 'game',
    feedItems: ctx.decorateFeedEntries(ctx._feedRawEntries),
    feedLatestSeq: 10,
    feedNextBeforeSeq: 10,
  });

  await ctx.loadRoom({ silent: true });

  assert.deepEqual(calls, [['water_1', 'round_3', { category: 'game', afterSeq: 10, limit: 20 }]]);
  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['g11', 'g10']);
  assert.equal(ctx.data.feedLatestSeq, 31);
  assert.equal(ctx.data.feedNextBeforeSeq, 10, 'incremental polling must preserve the older-page cursor');
});

test('polling sequence gaps reset only the current feed scope', async () => {
  const calls = [];
  const entry = (seq) => ({
    id: `e${seq}`, rootEntryId: `e${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  });
  const newest = Array.from({ length: 20 }, (_, index) => entry(25 - index));
  const definition = loadPageDefinition({
    async getV2() {
      return payload({
        room: { ...payload().room, syncVersion: 25 },
        round: { ...payload().round, revision: 25, eventCount: 25 },
        entries: newest,
        page: { nextBeforeSeq: 6, latestSeq: 25, hasMore: true },
      });
    },
    async listEntries(roomId, roundId, options) {
      calls.push([roomId, roundId, options]);
      return { entries: newest, page: { nextBeforeSeq: 6, latestSeq: 25, hasMore: true } };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    round: { ...payload().round, revision: 1, eventCount: 1 },
    entries: [entry(1)],
    page: { nextBeforeSeq: 1, latestSeq: 1, hasMore: false },
  }));

  await ctx.loadRoom({ silent: true });

  assert.deepEqual(calls, [['water_1', 'round_3', { limit: 20 }]]);
  assert.deepEqual(ctx.data.feedItems.map((item) => item.id), newest.map((item) => item.id));
  assert.equal(ctx.data.newEventCount, 0);
  assert.equal(ctx.data.feedLatestSeq, 25);
});

test('record success reconciles the filter, merges the cloud entry and highlights it', async () => {
  const direct = {
    id: 'e17', rootEntryId: 'e17', seq: 17,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  };
  const definition = loadPageDefinition({
    async recordDirectV2() {
      return {
        roomSyncVersion: 17,
        round: { ...payload().round, revision: 9, eventCount: 17, recordCount: 13 },
        entry: direct,
      };
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  let scrollCount = 0;
  global.wx = {
    showToast() {},
    pageScrollTo() { scrollCount += 1; },
  };
  ctx.applyRoomData(payload());
  ctx.setData({ feedFilter: 'game', feedItems: [], feedLatestSeq: 16 });
  ctx._feedRawEntries = [];
  ctx.openDirectSheet();
  ctx.setData({ directFromIndex: 2, directToIndex: 1 });

  try {
    await ctx.submitDirect();
    assert.equal(ctx.data.activeTab, 'feed');
    assert.equal(ctx.data.feedFilter, 'direct');
    assert.deepEqual(ctx.data.feedItems.map((item) => item.id), ['e17']);
    assert.equal(ctx.data.highlightedEntryId, 'e17');
    assert.equal(scrollCount, 1);
  } finally {
    ctx.onUnload();
    global.wx = originalWx;
  }
});

test('archived round entries paginate with getRound, dedupe, and expose retry in-sheet', async () => {
  const calls = [];
  let olderAttempt = 0;
  const archivedEntry = (seq) => ({
    id: `old_${seq}`, rootEntryId: `old_${seq}`, seq,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '旧王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p1', toPlayerId: 'p2', units: 1 },
  });
  const archivedRound = {
    id: 'round_1', number: 1, title: '旧轮', status: 'archived', recordCount: 22, eventCount: 22,
    participantSnapshot: [{ id: 'p1', name: '旧阿杰' }, { id: 'p2', name: '旧王姐' }],
    ledger: [],
  };
  const definition = loadPageDefinition({
    async getRound(roomId, roundId, options) {
      calls.push([roomId, roundId, options]);
      if (options && options.beforeSeq) {
        olderAttempt += 1;
        if (olderAttempt === 1) throw new Error('往期网络失败');
        return {
          round: archivedRound,
          entries: [archivedEntry(3), archivedEntry(2), archivedEntry(1)],
          page: { nextBeforeSeq: 1, latestSeq: 22, hasMore: false },
        };
      }
      return {
        round: archivedRound,
        entries: Array.from({ length: 20 }, (_, index) => archivedEntry(22 - index)),
        page: { nextBeforeSeq: 3, latestSeq: 22, hasMore: true },
      };
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());
  ctx.setData({ historySheetOpen: true });

  await ctx.openHistoryRound({ currentTarget: { dataset: { id: 'round_1' } } });
  assert.deepEqual(calls[0], ['water_1', 'round_1', { limit: 20 }]);
  assert.equal(ctx.data.historyRoundFeed.length, 20);
  assert.equal(ctx.data.historyRoundFeedHasMore, true);

  await ctx.loadMoreHistoryRoundEntries();
  assert.equal(ctx.data.historyRoundFeedError, '往期网络失败');
  assert.equal(ctx.data.historyRoundFeed.length, 20);
  await ctx.retryHistoryRoundEntries();
  assert.deepEqual(calls[2], ['water_1', 'round_1', { beforeSeq: 3, limit: 20 }]);
  assert.equal(ctx.data.historyRoundFeed.length, 22, 'the duplicate seq 3 entry must not be appended twice');
  assert.equal(ctx.data.historyRoundFeedHasMore, false);
  assert.equal(ctx.data.historyRoundFeedError, '');
  assert.match(read('miniprogram/pages/water/index.wxml'), /historyRoundFeedError[\s\S]*retryHistoryRoundEntries/);
});

test('entry detail and archived-round requests ignore responses after close or scope switch', async () => {
  const detailWait = deferred();
  const roundOneWait = deferred();
  const definition = loadPageDefinition({
    getEntry() { return detailWait.promise; },
    getRound(roomId, roundId) {
      if (roundId === 'round_1') return roundOneWait.promise;
      return Promise.resolve({
        round: { id: 'round_2', number: 2, title: '新选择', status: 'archived', participantSnapshot: [], ledger: [] },
        entries: [],
        page: { hasMore: false, latestSeq: 0 },
      });
    },
  });
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());

  const detailLoading = ctx.openEntryDetail({ currentTarget: { dataset: { root: 'e15' } } });
  ctx.closeSheets();
  detailWait.resolve({ currentEntry: payload().entries[1], history: [] });
  await detailLoading;
  assert.equal(ctx.data.detailSheetOpen, false);
  assert.equal(ctx.data.entryDetail, null);

  ctx.setData({ historySheetOpen: true });
  const oldRoundLoading = ctx.openHistoryRound({ currentTarget: { dataset: { id: 'round_1' } } });
  await ctx.openHistoryRound({ currentTarget: { dataset: { id: 'round_2' } } });
  roundOneWait.resolve({
    round: { id: 'round_1', number: 1, title: '旧响应', status: 'archived', participantSnapshot: [], ledger: [] },
    entries: [],
    page: { hasMore: false, latestSeq: 0 },
  });
  await oldRoundLoading;
  assert.equal(ctx.data.historyRound.id, 'round_2');
  assert.equal(ctx.data.historyRound.title, '新选择');
});

test('a resolved entry detail closes and clears when the active round changes', () => {
  const definition = loadPageDefinition();
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());
  const loadedDetail = ctx.data.feedItems[0];
  ctx.setData({
    detailSheetOpen: true,
    detailLoading: false,
    detailRootEntryId: loadedDetail.rootEntryId,
    entryDetail: loadedDetail,
    entryHistory: [loadedDetail],
  });

  ctx.applyRoomData(payload({
    room: { ...payload().room, activeRoundId: 'round_4', syncVersion: 17 },
    round: {
      ...payload().round,
      id: 'round_4',
      number: 4,
      revision: 1,
      recordCount: 0,
      activeRecordCount: 0,
      eventCount: 0,
      ledger: [],
    },
    entries: [],
    page: { nextBeforeSeq: null, latestSeq: 0, hasMore: false },
  }), { fromRefresh: true });

  assert.equal(ctx.data.roundId, 'round_4');
  assert.equal(ctx.data.detailSheetOpen, false);
  assert.equal(ctx.data.detailLoading, false);
  assert.equal(ctx.data.detailRootEntryId, '');
  assert.equal(ctx.data.entryDetail, null);
  assert.deepEqual(ctx.data.entryHistory, []);
});

test('an open same-round detail is invalidated when correction or reversal lifecycle arrives', () => {
  const root = {
    id: 'e10', rootEntryId: 'e10', seq: 10,
    eventType: 'transfer_recorded', category: 'direct', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
  };

  ['entry_corrected', 'entry_reversed'].forEach((eventType, index) => {
    const definition = loadPageDefinition();
    const ctx = createContext(definition);
    ctx.applyRoomData(payload({
      entries: [root],
      page: { nextBeforeSeq: 10, latestSeq: 10, hasMore: true },
    }));
    const loadedDetail = ctx.data.feedItems[0];
    assert.equal(loadedDetail.canEdit, true);
    assert.equal(loadedDetail.canReverse, true);
    ctx.setData({
      detailSheetOpen: true,
      detailLoading: false,
      detailRootEntryId: loadedDetail.rootEntryId,
      entryDetail: loadedDetail,
      entryHistory: [loadedDetail],
    });

    const lifecycle = {
      id: `e${11 + index}`,
      rootEntryId: 'e10',
      targetEntryId: 'e10',
      seq: 11 + index,
      eventType,
      category: 'direct',
      status: 'active',
      actorParticipantId: 'p1',
      actorNameSnapshot: '阿杰',
      rootCreatedByParticipantId: 'p2',
      payload: root.payload,
    };
    ctx.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 17 + index },
      round: { ...payload().round, revision: 9 + index, eventCount: 11 + index },
      entries: [lifecycle],
      page: { nextBeforeSeq: 11 + index, latestSeq: 11 + index, hasMore: true },
    }), { fromRefresh: true });

    assert.equal(ctx.data.detailSheetOpen, false, `${eventType} must invalidate the stale detail`);
    assert.equal(ctx.data.detailRootEntryId, '');
    assert.equal(ctx.data.entryDetail, null);
    assert.deepEqual(ctx.data.entryHistory, []);
  });
});

test('v2Read false overrides advertised V2 write, management, join, detail, history, and share capabilities', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    async getEntry() { calls.push('detail'); return {}; },
    async listRounds() { calls.push('history'); return { rounds: [], page: { hasMore: false } }; },
    async listEntries() { calls.push('filter'); return { entries: [], page: { hasMore: false } }; },
    async joinV2() { calls.push('join'); return {}; },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {}, hideShareMenu() {}, showShareMenu() {} };
  try {
    ctx.applyRoomData(payload({
      viewer: { participantId: 'p1', role: 'owner' },
      capabilities: {
        v2Read: true,
        canManageRoster: true,
        canOwnerWrite: true,
        canMemberWrite: true,
        canCorrect: true,
        canReverse: true,
        canCreateRound: true,
      },
    }));
    ctx.setData({
      historySheetOpen: true,
      detailSheetOpen: true,
      detailRootEntryId: 'e10',
      entryDetail: { rootEntryId: 'e10', expectedEntryId: 'e16', canEdit: true, canReverse: true },
      entryHistory: [{ id: 'e16' }],
    });
    ctx.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 17 },
      round: { ...payload().round, revision: 9 },
      viewer: { participantId: 'p1', role: 'owner' },
      capabilities: {
        v2Read: false,
        canManageRoster: true,
        canOwnerWrite: true,
        canMemberWrite: true,
        canCorrect: true,
        canReverse: true,
        canCreateRound: true,
      },
    }));

    assert.equal(ctx.data.canUseV2Features, false);
    assert.equal(ctx.data.canWrite, false);
    assert.equal(ctx.data.canManageRoster, false);
    assert.equal(ctx.data.canAddParticipants, false);
    assert.equal(ctx.data.canCreateRound, false);
    assert.equal(ctx.data.canShare, false);
    assert.equal(ctx.data.bottomActionMode, 'read-only');
    assert.equal(ctx.data.historySheetOpen, false);
    assert.equal(ctx.data.detailSheetOpen, false);
    assert.equal(ctx.onShareAppMessage(), null);

    ctx.openAdjustSheet({ currentTarget: { dataset: { id: 'p1', direction: 'plus' } } });
    await ctx.openEntryDetail({ currentTarget: { dataset: { root: 'e15' } } });
    await ctx.openHistorySheet();
    await ctx.onSelectFeedFilter({ currentTarget: { dataset: { filter: 'game' } } });
    await ctx.syncFilteredEntries({ roomId: 'water_1', roundId: 'round_3', filter: 'game', afterSeq: 16 });
    assert.equal(ctx.data.directSheetOpen, false);
    assert.equal(ctx.data.detailSheetOpen, false);
    assert.equal(ctx.data.historySheetOpen, false);
    assert.equal(ctx.data.feedFilter, 'all');
    assert.deepEqual(calls, []);
  } finally {
    global.wx = originalWx;
  }
});

test('legacy fallback exposes no V2 history, filters, or entry-detail targets', async () => {
  const calls = [];
  const definition = loadPageDefinition({
    async getEntry() { calls.push('detail'); return {}; },
    async listRounds() { calls.push('history'); return { rounds: [], page: { hasMore: false } }; },
    async listEntries() { calls.push('filter'); return { entries: [], page: { hasMore: false } }; },
  });
  const ctx = createContext(definition);
  ctx.applyApiResponse({
    legacySession: {
      id: 'water_legacy', title: '旧打水局', status: 'active', version: 3,
      participants: [
        { id: 'p1', name: '阿杰', claimed: true },
        { id: 'p2', name: '王姐', claimed: true },
      ],
      entries: [], isOwner: true, viewerParticipantId: 'p1',
    },
    capabilities: { v2Read: false, legacyRead: true, legacyOwnerWrite: true },
  });

  await ctx.openEntryDetail({ currentTarget: { dataset: { root: 'legacy-entry' } } });
  await ctx.openHistorySheet();
  await ctx.onSelectFeedFilter({ currentTarget: { dataset: { filter: 'game' } } });

  assert.equal(ctx.data.canUseV2Features, false);
  assert.equal(ctx.data.detailSheetOpen, false);
  assert.equal(ctx.data.historySheetOpen, false);
  assert.equal(ctx.data.feedFilter, 'all');
  assert.deepEqual(calls, []);
  const wxml = read('miniprogram/pages/water/index.wxml');
  assert.match(wxml, /water-history-link" wx:if="\{\{canUseV2Features && isMember\}\}"/);
  assert.match(wxml, /water-feed-filters" wx:if="\{\{canUseV2Features\}\}"/);
  assert.match(wxml, /water-detail-popup" show="\{\{canUseV2Features && detailSheetOpen\}\}"/);
});

test('V2 viewer booleans must agree, and a live capability change blocks an open draft', async () => {
  const recordCalls = [];
  const definition = loadPageDefinition({
    async recordGameV2(...args) { recordCalls.push(args); return payload(); },
  });
  const malformed = createContext(definition);
  malformed.applyRoomData(payload({
    viewer: { participantId: 'p2', role: 'member', isMember: false, isOwner: false },
  }));
  assert.equal(malformed.data.isMember, false);
  assert.equal(malformed.data.isVisitor, false);
  assert.equal(malformed.data.canWrite, false);
  assert.equal(malformed.data.bottomActionMode, 'read-only');

  const ctx = createContext(definition);
  ctx.applyRoomData(payload({
    viewer: { participantId: 'p2', role: 'member', isMember: true, isOwner: false },
  }));
  ctx.openGameSheet();
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p1' } } });
  ctx.onSelectGameSide({ currentTarget: { dataset: { side: 'loser' } } });
  ctx.onToggleGamePlayer({ currentTarget: { dataset: { id: 'p3' } } });
  const winnerDraft = ctx.data.winnerIds.slice();
  const loserDraft = ctx.data.loserIds.slice();

  ctx.applyRoomData(payload({
    room: { ...payload().room, syncVersion: 17 },
    round: { ...payload().round, revision: 9 },
    viewer: { participantId: 'p2', role: 'member', isMember: true, isOwner: false },
    capabilities: { ...payload().capabilities, emergencyReadOnly: true },
  }), { fromRefresh: true });

  assert.equal(ctx.data.gameSheetOpen, true);
  assert.deepEqual(ctx.data.winnerIds, winnerDraft);
  assert.deepEqual(ctx.data.loserIds, loserDraft);
  assert.match(ctx.data.sheetBlockedReason, /草稿已保留|暂时只读/);
  await ctx.submitGame();
  assert.equal(recordCalls.length, 0);
  assert.match(read('miniprogram/pages/water/index.wxml'), /sheetBlockedReason[\s\S]*disabled="\{\{[^}]*sheetBlockedReason/);
});

test('correction and reversal recheck their action capability and round before submitting', async () => {
  const correctCalls = [];
  const reverseCalls = [];
  let modalOptions;
  const definition = loadPageDefinition({
    async correctEntry(...args) { correctCalls.push(args); return payload(); },
    async reverseEntry(...args) { reverseCalls.push(args); return payload(); },
  });
  const originalWx = global.wx;
  global.wx = {
    showToast() {},
    showModal(options) { modalOptions = options; },
  };
  const ctx = createContext(definition);
  ctx.applyRoomData(payload());
  ctx.setData({
    gameSheetOpen: true,
    editingEntry: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
    correctionDraft: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
    winnerIds: ['p1'],
    loserIds: ['p3'],
    gameUnitIndex: 1,
  });
  ctx._sheetDraftRoundId = 'round_3';

  try {
    ctx.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 17 },
      round: { ...payload().round, revision: 9 },
      capabilities: { ...payload().capabilities, canCorrect: false },
    }), { fromRefresh: true });
    await ctx.submitGame();
    assert.equal(correctCalls.length, 0);
    assert.match(ctx.data.sheetBlockedReason, /修改权限|权限已更新/);

    ctx.closeSheets();
    ctx.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 18 },
      round: { ...payload().round, revision: 10 },
    }), { fromRefresh: true });
    const reversing = ctx.confirmReverseEntry({ rootEntryId: 'e15', expectedEntryId: 'e15', description: '旧记录' });
    ctx.applyRoomData(payload({
      room: { ...payload().room, syncVersion: 19 },
      round: { ...payload().round, revision: 11 },
      capabilities: { ...payload().capabilities, canReverse: false },
    }), { fromRefresh: true });
    modalOptions.success({ confirm: true, cancel: false });
    await reversing;
    assert.equal(reverseCalls.length, 0);
    assert.match(ctx.data.syncMessage, /撤销权限|权限已更新/);

    ctx.setData({
      gameSheetOpen: true,
      editingEntry: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
      correctionDraft: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
      winnerIds: ['p1'],
      loserIds: ['p3'],
      gameUnitIndex: 1,
    });
    ctx._sheetDraftRoundId = 'round_3';
    ctx.applyRoomData(payload({
      room: { ...payload().room, activeRoundId: 'round_4', syncVersion: 20 },
      round: { ...payload().round, id: 'round_4', number: 4, revision: 1 },
      capabilities: payload().capabilities,
    }), { fromRefresh: true });
    await ctx.submitGame();
    assert.equal(correctCalls.length, 0);
    assert.match(ctx.data.sheetBlockedReason, /当前轮已更新/);
  } finally {
    ctx.onUnload();
    global.wx = originalWx;
  }
});

test('correction uses the live replacement fingerprint and reloads the latest root on conflict', async () => {
  const firstWrite = deferred();
  const calls = [];
  let writeAttempt = 0;
  const latest = {
    id: 'e17', currentEntryId: 'e17', expectedEntryId: 'e17', rootEntryId: 'e10', seq: 17,
    eventType: 'game_recorded', category: 'game', status: 'active',
    actorParticipantId: 'p2', actorNameSnapshot: '王姐', rootCreatedByParticipantId: 'p2',
    payload: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 3 },
  };
  const definition = loadPageDefinition({
    async correctEntry(...args) {
      calls.push(args);
      writeAttempt += 1;
      if (writeAttempt === 1) return firstWrite.promise;
      throw Object.assign(new Error('这条记录已更新'), { state: 'conflict', code: 'WATER_ENTRY_NOT_ACTIVE' });
    },
    async getV2() {
      return payload({ room: { ...payload().room, syncVersion: 17 }, round: { ...payload().round, revision: 9 } });
    },
    async getEntry(roomId, roundId, rootEntryId) {
      assert.deepEqual([roomId, roundId, rootEntryId], ['water_1', 'round_3', 'e10']);
      return { rootEntryId: 'e10', currentEntry: latest, history: [] };
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  ctx.applyRoomData(payload());
  ctx.setData({
    gameSheetOpen: true,
    editingEntry: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game' },
    correctionDraft: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game' },
    winnerIds: ['p1'],
    loserIds: ['p3'],
    gameUnitIndex: 1,
  });

  try {
    const first = ctx.submitGame();
    ctx.setData({ gameUnitIndex: 2 });
    firstWrite.resolve({
      roomSyncVersion: 17,
      round: { ...payload().round, revision: 9, eventCount: 17 },
      entry: latest,
    });
    await first;
    assert.equal(ctx.data.gameSheetOpen, true, 'changing the draft while saving must keep the sheet open');

    await ctx.submitGame();
    assert.notEqual(calls[0][5].clientRequestId, calls[1][5].clientRequestId);
    assert.equal(ctx.data.editingEntry.expectedEntryId, 'e17');
    assert.equal(ctx.data.gameUnitIndex, 2);
    assert.match(ctx.data.sheetError, /已载入最新|确认后重试/);
  } finally {
    ctx.onUnload();
    global.wx = originalWx;
  }
});

test('a correction conflict that reloads a reversal stays blocked with an inline explanation', async () => {
  const calls = [];
  const reversal = {
    id: 'e17', rootEntryId: 'e10', targetEntryId: 'e16', seq: 17,
    eventType: 'entry_reversed', category: 'game', status: 'active',
    actorParticipantId: 'p1', actorNameSnapshot: '阿杰', rootCreatedByParticipantId: 'p2',
    payload: { winnerIds: ['p1'], loserIds: ['p3'], unitsPerPlayer: 2 },
  };
  const definition = loadPageDefinition({
    async correctEntry(...args) {
      calls.push(args);
      throw Object.assign(new Error('这条记录已更新'), { state: 'conflict', code: 'WATER_ENTRY_NOT_ACTIVE' });
    },
    async getV2() {
      return payload({ room: { ...payload().room, syncVersion: 17 }, round: { ...payload().round, revision: 9 } });
    },
    async getEntry() {
      return { rootEntryId: 'e10', currentEntry: reversal, history: [reversal] };
    },
  });
  const ctx = createContext(definition);
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  ctx.applyRoomData(payload());
  ctx.setData({
    gameSheetOpen: true,
    editingEntry: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
    correctionDraft: { rootEntryId: 'e10', expectedEntryId: 'e16', category: 'game', canEdit: true },
    winnerIds: ['p1'],
    loserIds: ['p3'],
    gameUnitIndex: 1,
  });
  ctx._sheetDraftRoundId = 'round_3';

  try {
    await ctx.submitGame();
    assert.equal(calls.length, 1);
    assert.equal(ctx.data.editingEntry.canEdit, false);
    assert.match(ctx.data.sheetBlockedReason || ctx.data.sheetError, /撤销/);
    await ctx.submitGame();
    assert.equal(calls.length, 1, 'a terminal latest version must not be submitted again');
  } finally {
    ctx.onUnload();
    global.wx = originalWx;
  }
});

test('record, roster, and join failures remain visible inside their open sheet', async () => {
  const failure = () => Promise.reject(new Error('网络开小差'));
  const definition = loadPageDefinition({
    recordGameV2: failure,
    addParticipantsV2: failure,
    joinV2: failure,
  });
  const originalWx = global.wx;
  global.wx = { showToast() {} };
  try {
    const member = createContext(definition);
    member.applyRoomData(payload());
    member.openGameSheet();
    member.setData({ winnerIds: ['p1'], loserIds: ['p3'] });
    await member.submitGame();
    assert.equal(member.data.gameSheetOpen, true);
    assert.equal(member.data.sheetError, '网络开小差');

    const owner = createContext(definition);
    owner.applyRoomData(payload({
      viewer: { participantId: 'p1', role: 'owner' },
      capabilities: { v2Read: true, canManageRoster: true, canOwnerWrite: true },
    }));
    owner.openManualSheet();
    owner.onManualInput({ detail: { value: '小陈' } });
    await owner.submitManual();
    assert.equal(owner.data.manualSheetOpen, true);
    assert.equal(owner.data.sheetError, '网络开小差');

    const visitor = createContext(definition);
    visitor.applyRoomData(payload({
      viewer: { participantId: '', role: 'visitor' },
      capabilities: { v2Read: true, canMemberWrite: false },
    }));
    visitor.setData({ joinSheetOpen: true, joinNickname: '新球友' });
    await visitor.onJoin();
    assert.equal(visitor.data.joinSheetOpen, true);
    assert.equal(visitor.data.sheetError, '网络开小差');
    assert.match(read('miniprogram/pages/water/index.wxml'), /sheetError/);
  } finally {
    global.wx = originalWx;
  }
});
