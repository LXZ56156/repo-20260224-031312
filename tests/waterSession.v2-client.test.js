const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const waterSession = require('../miniprogram/core/waterSession');
const waterLedger = require('../miniprogram/core/waterLedger');

async function captureCalls(run) {
  const originalCall = cloud.call;
  const calls = [];
  cloud.call = async (name, payload, options) => {
    calls.push({ name, payload, options });
    return {
      ok: true,
      code: 'WATER_ROOM_LOADED',
      state: 'loaded',
      data: {}
    };
  };

  try {
    await run();
    return calls;
  } finally {
    cloud.call = originalCall;
  }
}

test('V2 read wrappers send apiVersion 2, stable cursors and retry as reads', async () => {
  const calls = await captureCalls(async () => {
    await waterSession.getV2('water_1');
    await waterSession.listEntries('water_1', 'round_3', {
      category: 'game',
      beforeSeq: 81,
      limit: 20
    });
    await waterSession.getEntry('water_1', 'round_3', 'entry_root');
    await waterSession.listRounds('water_1', { beforeNumber: 3, limit: 20 });
    await waterSession.getRound('water_1', 'round_2');
  });

  assert.deepEqual(calls.map((item) => item.name), Array(5).fill('waterSession'));
  assert.deepEqual(calls.map((item) => item.payload), [
    { action: 'get', apiVersion: 2, roomId: 'water_1' },
    {
      action: 'listEntries',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      category: 'game',
      beforeSeq: 81,
      limit: 20
    },
    {
      action: 'getEntry',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      rootEntryId: 'entry_root'
    },
    {
      action: 'listRounds',
      apiVersion: 2,
      roomId: 'water_1',
      beforeNumber: 3,
      limit: 20
    },
    {
      action: 'getRound',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_2'
    }
  ]);
  calls.forEach((item) => {
    assert.deepEqual(item.options, { retry: true });
    assert.equal(item.payload.clientRequestId, undefined);
  });
});

test('V2 listEntries supports afterSeq without mixing the older-page cursor', async () => {
  const calls = await captureCalls(async () => {
    await waterSession.listEntries('water_1', 'round_3', {
      category: 'all',
      afterSeq: 90
    });
  });

  assert.deepEqual(calls[0].payload, {
    action: 'listEntries',
    apiVersion: 2,
    roomId: 'water_1',
    roundId: 'round_3',
    category: 'all',
    afterSeq: 90
  });
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].payload, 'beforeSeq'), false);
});

test('V2 mutation wrappers preserve explicit idempotency IDs and contract payloads', async () => {
  const calls = await captureCalls(async () => {
    await waterSession.createV2('阿杰', { clientRequestId: 'req_create' });
    await waterSession.joinV2('water_1', '小林', {
      claimParticipantId: 'p2',
      expectedRoomVersion: 4,
      clientRequestId: 'req_join'
    });
    await waterSession.addParticipantsV2('water_1', ['Chris', '王姐'], {
      expectedRoomVersion: 5,
      clientRequestId: 'req_add'
    });
    await waterSession.recordGameV2('water_1', 'round_3', ['p1'], ['p2'], 2, {
      clientRequestId: 'req_game'
    });
    await waterSession.recordDirectV2('water_1', 'round_3', 'p2', 'p1', 3, {
      clientRequestId: 'req_direct'
    });
    await waterSession.correctEntry(
      'water_1',
      'round_3',
      'entry_root',
      'entry_current',
      { winnerIds: ['p1'], loserIds: ['p2'], unitsPerPlayer: 4 },
      { clientRequestId: 'req_correct' }
    );
    await waterSession.reverseEntry(
      'water_1',
      'round_3',
      'entry_root',
      'entry_corrected',
      { clientRequestId: 'req_reverse' }
    );
    await waterSession.createRound('water_1', 'round_3', 6, {
      clientRequestId: 'req_round'
    });
  });

  assert.deepEqual(calls.map((item) => item.payload), [
    {
      action: 'create',
      apiVersion: 2,
      ownerName: '阿杰',
      clientRequestId: 'req_create'
    },
    {
      action: 'join',
      apiVersion: 2,
      roomId: 'water_1',
      nickname: '小林',
      claimParticipantId: 'p2',
      expectedRoomVersion: 4,
      clientRequestId: 'req_join'
    },
    {
      action: 'addParticipants',
      apiVersion: 2,
      roomId: 'water_1',
      names: ['Chris', '王姐'],
      expectedRoomVersion: 5,
      clientRequestId: 'req_add'
    },
    {
      action: 'recordGame',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      winnerIds: ['p1'],
      loserIds: ['p2'],
      unitsPerPlayer: 2,
      clientRequestId: 'req_game'
    },
    {
      action: 'recordDirect',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      fromPlayerId: 'p2',
      toPlayerId: 'p1',
      units: 3,
      clientRequestId: 'req_direct'
    },
    {
      action: 'correctEntry',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      rootEntryId: 'entry_root',
      expectedEntryId: 'entry_current',
      replacement: { winnerIds: ['p1'], loserIds: ['p2'], unitsPerPlayer: 4 },
      clientRequestId: 'req_correct'
    },
    {
      action: 'reverseEntry',
      apiVersion: 2,
      roomId: 'water_1',
      roundId: 'round_3',
      rootEntryId: 'entry_root',
      expectedEntryId: 'entry_corrected',
      clientRequestId: 'req_reverse'
    },
    {
      action: 'createRound',
      apiVersion: 2,
      roomId: 'water_1',
      expectedActiveRoundId: 'round_3',
      expectedRoomVersion: 6,
      clientRequestId: 'req_round'
    }
  ]);
  calls.forEach((item) => assert.deepEqual(item.options, {}));
});

test('V2 mutations generate action-scoped request IDs when the caller has no intent yet', async () => {
  const calls = await captureCalls(async () => {
    await waterSession.recordGameV2('water_1', 'round_3', ['p1'], ['p2'], 1);
    await waterSession.reverseEntry('water_1', 'round_3', 'root_1', 'entry_1');
  });

  assert.match(calls[0].payload.clientRequestId, /^water_v2_recordGame_/);
  assert.match(calls[1].payload.clientRequestId, /^water_v2_reverseEntry_/);
});

test('V2 ledger rows use the authoritative round ledger and stable name snapshot', () => {
  const rows = waterLedger.buildV2LedgerRows({
    participantSnapshot: [
      { id: 'p1', name: '阿杰' },
      { id: 'p2', name: '小林' },
      { id: 'p3', name: 'Chris' }
    ],
    ledger: [
      { participantId: 'p1', won: 3, treat: 1, net: 2 },
      { participantId: 'p2', won: 1, treat: 3, net: -2 },
      { participantId: 'p3', won: 2, treat: 2, net: 0 }
    ]
  }, [
    { id: 'p1', claimed: true },
    { id: 'p2', claimed: false },
    { id: 'p3', claimed: true }
  ]);

  assert.deepEqual(rows.map((row) => [
    row.id,
    row.name,
    row.won,
    row.treat,
    row.net,
    row.netText,
    row.netClass,
    row.claimed
  ]), [
    ['p1', '阿杰', 3, 1, 2, '+2', 'is-positive', true],
    ['p3', 'Chris', 2, 2, 0, '0', 'is-even', true],
    ['p2', '小林', 1, 3, -2, '-2', 'is-negative', false]
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.net, 0), 0);
});

test('V2 feed helpers describe audit events, dedupe entry IDs and keep newest seq first', () => {
  const snapshot = [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '小林' }
  ];
  const current = [{
    id: 'game_1',
    seq: 10,
    eventType: 'game_recorded',
    category: 'game',
    status: 'active',
    payload: { winnerIds: ['p1'], loserIds: ['p2'], unitsPerPlayer: 2 },
    actorNameSnapshot: '阿杰',
    rootCreatedByParticipantId: 'p1'
  }];
  const incoming = [
    {
      id: 'correction_1',
      seq: 11,
      eventType: 'entry_corrected',
      category: 'game',
      status: 'active',
      payload: { winnerIds: ['p1'], loserIds: ['p2'], unitsPerPlayer: 3 },
      actorNameSnapshot: '阿杰',
      rootCreatedByParticipantId: 'p1'
    },
    { ...current[0], status: 'corrected' }
  ];

  const merged = waterLedger.mergeV2FeedEntries(current, incoming);
  const items = waterLedger.buildV2FeedItems(merged, snapshot, {
    viewer: { participantId: 'p1', isOwner: false },
    capabilities: { canCorrect: true, canReverse: true },
    roundStatus: 'active'
  });

  assert.deepEqual(merged.map((entry) => [entry.id, entry.seq, entry.status]), [
    ['correction_1', 11, 'active'],
    ['game_1', 10, 'corrected']
  ]);
  assert.equal(items[0].typeLabel, '对局');
  assert.equal(items[0].description, '阿杰更正为：阿杰 胜 小林 · 每人 3 水');
  assert.equal(items[0].canModify, true);
  assert.equal(items[0].canReverse, true);
  assert.equal(items[1].description, '阿杰 胜 小林 · 每人 2 水');
  assert.equal(items[1].statusLabel, '已更正');
  assert.equal(items[1].canModify, false);
});

test('V2 feed merge never lets a stale active snapshot revive a terminal entry', () => {
  const current = [
    {
      id: 'game_corrected',
      seq: 8,
      status: 'corrected',
      successorEntryId: 'correction_1'
    },
    {
      id: 'direct_reversed',
      seq: 7,
      status: 'reversed',
      successorEntryId: 'reversal_1'
    }
  ];
  const stale = current.map((entry) => ({
    ...entry,
    status: 'active',
    successorEntryId: ''
  }));

  const merged = waterLedger.mergeV2FeedEntries(current, stale);

  assert.deepEqual(merged.map((entry) => [entry.id, entry.status, entry.successorEntryId]), [
    ['game_corrected', 'corrected', 'correction_1'],
    ['direct_reversed', 'reversed', 'reversal_1']
  ]);
});

test('V2 feed permissions stay read-only for other members and archived rounds', () => {
  const entry = {
    id: 'direct_1',
    seq: 5,
    eventType: 'transfer_recorded',
    category: 'direct',
    status: 'active',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 1 },
    actorNameSnapshot: '阿杰',
    rootCreatedByParticipantId: 'p1'
  };

  const memberItem = waterLedger.buildV2FeedItems([entry], [
    { id: 'p1', name: '阿杰' },
    { id: 'p2', name: '小林' }
  ], {
    viewer: { participantId: 'p2', isOwner: false },
    capabilities: { canCorrect: true, canReverse: true },
    roundStatus: 'active'
  })[0];
  const archivedOwnerItem = waterLedger.buildV2FeedItems([entry], [], {
    viewer: { participantId: 'p1', isOwner: true },
    capabilities: { canCorrect: true, canReverse: true },
    roundStatus: 'archived'
  })[0];
  const activeOwnerItem = waterLedger.buildV2FeedItems([entry], [], {
    viewer: { participantId: 'p2', role: 'owner' },
    capabilities: { canCorrect: true, canReverse: true },
    roundStatus: 'active'
  })[0];

  assert.equal(memberItem.description, '小林 请 阿杰 · 1 水');
  assert.equal(memberItem.typeLabel, '单记');
  assert.equal(memberItem.canModify, false);
  assert.equal(memberItem.canReverse, false);
  assert.equal(archivedOwnerItem.canModify, false);
  assert.equal(archivedOwnerItem.canReverse, false);
  assert.equal(activeOwnerItem.canModify, true);
  assert.equal(activeOwnerItem.canReverse, true);
});

test('V2 feed permissions fail closed when the root creator snapshot is missing', () => {
  const malformedEntry = {
    id: 'correction_1',
    seq: 6,
    eventType: 'entry_corrected',
    category: 'direct',
    status: 'active',
    payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 2 },
    actorParticipantId: 'p2',
    actorNameSnapshot: '小林'
  };
  const contexts = [
    { participantId: 'p2', role: 'member' },
    { participantId: 'p1', role: 'owner', isOwner: true }
  ];

  contexts.forEach((viewer) => {
    const item = waterLedger.buildV2FeedItems([malformedEntry], [], {
      viewer,
      capabilities: { canCorrect: true, canReverse: true },
      roundStatus: 'active'
    })[0];
    assert.equal(item.canModify, false);
    assert.equal(item.canReverse, false);
  });
});
