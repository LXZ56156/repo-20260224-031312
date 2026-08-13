'use strict';

const WATER_ROOM_ID = 'water_v2_demo';
const ACTIVE_ROUND_ID = 'water_round_3';

const names = [
  '阿杰', '王姐', 'Chris', '陈哥', '小林', 'Mia', '阿岚', '胜高远',
  '老谢', '周末限定超长昵称球友', 'Zoe', '羽球新手小陈同学', '小宇', '小许',
  '小梅', '梁姐', '赵哥', '安安', '文博', '苏苏', 'Eason', '小唐', '林夕', '佳佳',
];

function buildParticipants(count = 24) {
  return names.slice(0, count).map((name, index) => ({
    id: `p${index + 1}`,
    name,
    source: index === 0 ? 'owner' : index < 18 ? 'invite' : 'manual',
    claimed: index < 18,
    isViewer: false,
  }));
}

function buildLedger(participants, values) {
  return participants.map((participant, index) => {
    const net = Number(values[index] || 0);
    const won = net >= 0 ? net + 2 : 2;
    const treat = net >= 0 ? 2 : 2 - net;
    return {
      participantId: participant.id,
      won,
      treat,
      net,
    };
  });
}

function capabilities(role) {
  const isOwner = role === 'owner';
  const isMember = role === 'member' || isOwner;
  return {
    v2Read: true,
    canManageRoster: isOwner,
    canOwnerWrite: isOwner,
    canMemberWrite: isMember,
    canCorrect: isMember,
    canReverse: isMember,
    canCreateRound: isOwner,
    emergencyReadOnly: false,
    revision: 12,
  };
}

function roomData(options = {}) {
  const participants = options.participants || buildParticipants(4);
  const viewerParticipantId = String(options.viewerParticipantId || '');
  const viewerRole = String(options.viewerRole || 'visitor');
  const participantSnapshot = participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
  }));
  return {
    room: {
      id: WATER_ROOM_ID,
      ownerParticipantId: 'p1',
      activeRoundId: ACTIVE_ROUND_ID,
      roundCount: 3,
      roomVersion: Number(options.roomVersion ?? 9),
      syncVersion: Number(options.syncVersion ?? (900000 + Number(options.latestSeq ?? options.eventCount ?? 0))),
      participants: participants.map((participant) => ({
        ...participant,
        isViewer: participant.id === viewerParticipantId,
      })),
    },
    round: {
      id: ACTIVE_ROUND_ID,
      number: 3,
      title: '8月9日打水局',
      status: options.roundStatus || 'active',
      participantIds: participantSnapshot.map((participant) => participant.id),
      participantSnapshot,
      ledger: options.ledger || buildLedger(participants, []),
      recordCount: Number(options.recordCount ?? 0),
      activeRecordCount: Number(options.activeRecordCount ?? 0),
      eventCount: Number(options.eventCount ?? 0),
      nextSeq: Number(options.latestSeq ?? options.eventCount ?? 0) + 1,
      revision: Number(options.roundRevision ?? (800000 + Number(options.latestSeq ?? options.eventCount ?? 0))),
    },
    viewer: {
      participantId: viewerParticipantId,
      role: viewerRole,
      isMember: viewerRole === 'member' || viewerRole === 'owner',
      isOwner: viewerRole === 'owner',
    },
    capabilities: capabilities(viewerRole),
    entries: Array.isArray(options.entries) ? options.entries : [],
    page: {
      nextBeforeSeq: options.nextBeforeSeq === undefined ? null : options.nextBeforeSeq,
      latestSeq: Number(options.latestSeq ?? options.eventCount ?? 0),
      hasMore: options.hasMore === true,
    },
  };
}

function buildFeedEntries(startSeq = 20, count = 20) {
  const baseTime = Date.UTC(2026, 7, 9, 12, 46, 0);
  return Array.from({ length: count }, (_, index) => {
    const seq = startSeq - index;
    const actorIndex = index % 18;
    const actorId = `p${actorIndex + 1}`;
    const actorNameSnapshot = names[actorIndex];
    const isCorrection = index === 0 || index === 7 || index === 14;
    const isReversal = index === 4 || index === 12;
    const isGame = index % 3 !== 1;
    const category = isGame ? 'game' : 'direct';
    const rootEntryId = `root_${Math.floor(seq / 2)}`;
    if (isCorrection) {
      return {
        id: `event_${seq}`,
        seq,
        rootEntryId,
        targetEntryId: `event_${Math.max(1, seq - 1)}`,
        previousEntryId: `event_${Math.max(1, seq - 1)}`,
        eventType: 'entry_corrected',
        category,
        status: 'active',
        payload: isGame
          ? { winnerIds: ['p1', 'p2'], loserIds: ['p3', 'p4'], unitsPerPlayer: 2 + (index % 2) }
          : { fromPlayerId: 'p5', toPlayerId: 'p6', units: 2 },
        actorParticipantId: actorId,
        actorNameSnapshot,
        rootCreatedByParticipantId: actorId,
        createdAtMs: baseTime - index * 60000,
      };
    }
    if (isReversal) {
      return {
        id: `event_${seq}`,
        seq,
        rootEntryId,
        targetEntryId: `event_${Math.max(1, seq - 1)}`,
        previousEntryId: `event_${Math.max(1, seq - 1)}`,
        eventType: 'entry_reversed',
        category,
        status: 'applied',
        actorParticipantId: actorId,
        actorNameSnapshot,
        rootCreatedByParticipantId: actorId,
        createdAtMs: baseTime - index * 60000,
      };
    }
    return {
      id: `event_${seq}`,
      seq,
      rootEntryId: `event_${seq}`,
      previousEntryId: '',
      eventType: isGame ? 'game_recorded' : 'transfer_recorded',
      category,
      status: index === 3 ? 'corrected' : index === 9 ? 'reversed' : 'active',
      payload: isGame
        ? { winnerIds: ['p1', 'p2'], loserIds: ['p3', 'p4'], unitsPerPlayer: 1 + (index % 3) }
        : { fromPlayerId: `p${(index % 10) + 1}`, toPlayerId: `p${(index % 10) + 11}`, units: 1 + (index % 4) },
      actorParticipantId: actorId,
      actorNameSnapshot,
      rootCreatedByParticipantId: actorId,
      createdAtMs: baseTime - index * 60000,
    };
  });
}

const ownerParticipants = buildParticipants(2);
const memberParticipants = buildParticipants(24);
const memberNet = [6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, -6, -5, -4, -3, -2, -1, -1, -1, -1, -1, -1, -1];
const memberEntries = buildFeedEntries(16, 2);
const longEntries = buildFeedEntries(1248, 20);

const ownerEmpty = {
  roomData: roomData({
    participants: ownerParticipants,
    viewerParticipantId: 'p1',
    viewerRole: 'owner',
  }),
  pageData: { activeTab: 'ledger' },
};

const member24 = {
  roomData: roomData({
    participants: memberParticipants,
    viewerParticipantId: 'p2',
    viewerRole: 'member',
    ledger: buildLedger(memberParticipants, memberNet),
    recordCount: 12,
    activeRecordCount: 11,
    eventCount: 16,
    latestSeq: 16,
    entries: memberEntries,
    nextBeforeSeq: 15,
    hasMore: true,
  }),
  pageData: { activeTab: 'ledger' },
};

const member24Game = {
  roomData: member24.roomData,
  pageData: { activeTab: 'ledger' },
  methods: [
    { name: 'openGameSheet', args: [] },
    ...Array.from({ length: 12 }, (_, index) => ({
      name: 'onToggleGamePlayer',
      args: [{ currentTarget: { dataset: { id: `p${index + 1}` } } }],
    })),
    { name: 'onSelectGameSide', args: [{ currentTarget: { dataset: { side: 'loser' } } }] },
    ...Array.from({ length: 12 }, (_, index) => ({
      name: 'onToggleGamePlayer',
      args: [{ currentTarget: { dataset: { id: `p${index + 13}` } } }],
    })),
    { name: 'onSelectGameSide', args: [{ currentTarget: { dataset: { side: 'winner' } } }] },
    { name: 'onSelectGameSide', args: [{ currentTarget: { dataset: { side: 'loser' } } }] },
  ],
  postData: {
    winnerFullSummary: names.slice(0, 12).join('、'),
    loserFullSummary: names.slice(12, 24).join('、'),
    gameSelectionValid: true,
    gameValidationMessage: '双方人数相同，可提交',
    gameSummaryExpanded: false,
    hasLongGameNames: names.some((name) => Array.from(name).length > 8),
  },
};

const visitorLong = {
  roomData: roomData({
    participants: memberParticipants,
    viewerRole: 'visitor',
    ledger: buildLedger(memberParticipants, memberNet),
    recordCount: 1000,
    activeRecordCount: 936,
    eventCount: 1248,
    latestSeq: 1248,
    entries: longEntries,
    nextBeforeSeq: 1229,
    hasMore: true,
  }),
  pageData: { activeTab: 'feed', feedFilter: 'all' },
};

const memberSmallParticipants = buildParticipants(4);
const memberDirect = {
  roomData: roomData({
    participants: memberSmallParticipants,
    viewerParticipantId: 'p2',
    viewerRole: 'member',
  }),
  pageData: {
    activeTab: 'ledger',
    directSheetOpen: true,
    adjustSheetOpen: true,
    directFromIndex: 2,
    directToIndex: 1,
    directUnitIndex: 2,
    directPreview: '王姐 请 阿杰 · 3 水',
  },
};

const memberCorrectionEntry = {
  id: 'event_7',
  seq: 7,
  rootEntryId: 'event_7',
  eventType: 'transfer_recorded',
  category: 'direct',
  status: 'active',
  payload: { fromPlayerId: 'p2', toPlayerId: 'p1', units: 2 },
  actorParticipantId: 'p2',
  actorNameSnapshot: '王姐',
  rootCreatedByParticipantId: 'p2',
  createdAtMs: Date.UTC(2026, 7, 9, 12, 30, 0),
};

const memberCorrection = {
  roomData: roomData({
    participants: memberSmallParticipants,
    viewerParticipantId: 'p2',
    viewerRole: 'member',
    ledger: buildLedger(memberSmallParticipants, [2, 2, -2, -2]),
    recordCount: 7,
    activeRecordCount: 7,
    eventCount: 7,
    latestSeq: 7,
    entries: [memberCorrectionEntry],
    nextBeforeSeq: 7,
    hasMore: true,
  }),
  pageData: { activeTab: 'feed', feedFilter: 'all' },
  methods: [{
    name: 'openCorrectEntry',
    args: [{ currentTarget: { dataset: { root: 'event_7', expected: 'event_7' } } }],
  }],
};

const ownerLongEntry = {
  id: 'event_48',
  seq: 48,
  rootEntryId: 'event_48',
  eventType: 'game_recorded',
  category: 'game',
  status: 'active',
  payload: {
    winnerIds: Array.from({ length: 12 }, (_, index) => `p${index + 1}`),
    loserIds: Array.from({ length: 12 }, (_, index) => `p${index + 13}`),
    unitsPerPlayer: 99,
  },
  actorParticipantId: 'p18',
  actorNameSnapshot: '超长昵称球友发起的十二人对十二人记录',
  rootCreatedByParticipantId: 'p18',
  createdAtMs: Date.UTC(2026, 7, 9, 12, 40, 0),
};

const ownerCorrectionLong = {
  roomData: roomData({
    participants: memberParticipants,
    viewerParticipantId: 'p1',
    viewerRole: 'owner',
    ledger: buildLedger(memberParticipants, memberNet),
    recordCount: 24,
    activeRecordCount: 24,
    eventCount: 48,
    latestSeq: 48,
    entries: [ownerLongEntry],
    nextBeforeSeq: 48,
    hasMore: true,
  }),
  pageData: { activeTab: 'feed', feedFilter: 'all' },
  methods: [{
    name: 'openCorrectEntry',
    args: [{ currentTarget: { dataset: { root: 'event_48', expected: 'event_48' } } }],
  }],
};

const detailHistoryEntry = {
  id: 'event_8',
  seq: 8,
  rootEntryId: 'event_7',
  expectedEntryId: 'event_8',
  eventType: 'entry_corrected',
  category: 'direct',
  kindText: '更正',
  description: '王姐将「王姐 请 阿杰 · 1 水」更正为 2 水',
  displayDescription: '王姐将「王姐 请 阿杰 · 1 水」更正为 2 水',
  actorName: '王姐',
  metaText: '王姐 · 20:31',
  statusText: '已更正',
  isAuditEvent: true,
  canEdit: false,
  canReverse: false,
};

const entryDetail = {
  roomData: memberCorrection.roomData,
  pageData: {
    activeTab: 'feed',
    detailSheetOpen: true,
    detailLoading: false,
    detailError: '',
    detailRootEntryId: 'event_7',
    entryDetail: {
      ...memberCorrectionEntry,
      expectedEntryId: 'event_7',
      kindText: '单记',
      description: '王姐 请 阿杰 · 2 水',
      displayDescription: '王姐 请 阿杰 · 2 水',
      actorName: '王姐',
      metaText: '王姐 · 20:30',
      statusText: '',
      canEdit: true,
      canReverse: true,
    },
    entryHistory: [detailHistoryEntry, {
      ...memberCorrectionEntry,
      expectedEntryId: 'event_7',
      kindText: '单记',
      description: '王姐 请 阿杰 · 1 水',
      displayDescription: '王姐 请 阿杰 · 1 水',
      actorName: '王姐',
      metaText: '王姐 · 20:30',
      statusText: '已更正',
      canEdit: false,
      canReverse: false,
    }],
  },
};

const archivedEntry = {
  ...memberCorrectionEntry,
  id: 'archived_event_4',
  seq: 4,
  rootEntryId: 'archived_event_4',
  expectedEntryId: 'archived_event_4',
  kindText: '单记',
  description: '旧王姐 请 旧阿杰 · 2 水',
  displayDescription: '旧王姐 请 旧阿杰 · 2 水',
  actorName: '旧王姐',
  metaText: '旧王姐 · 19:20',
  canEdit: false,
  canReverse: false,
};

const archivedRound = {
  roomData: memberCorrection.roomData,
  pageData: {
    activeTab: 'ledger',
    historySheetOpen: true,
    historyRoundTargetId: 'water_round_2',
    historyRoundLoading: false,
    historyRoundError: '',
    historyRound: {
      id: 'water_round_2', number: 2, title: '8月8日打水局', status: 'archived',
      recordCount: 4, eventCount: 4,
    },
    historyRoundLedger: [
      { id: 'p1', participantId: 'p1', name: '旧阿杰', won: 0, treat: 2, net: -2, netText: '-2', netClass: 'is-negative' },
      { id: 'p2', participantId: 'p2', name: '旧王姐', won: 2, treat: 0, net: 2, netText: '+2', netClass: 'is-positive' },
    ],
    historyRoundFeed: [archivedEntry],
    historyRoundFeedNextBeforeSeq: 4,
    historyRoundFeedHasMore: true,
    historyRoundFeedLoadingMore: false,
    historyRoundFeedError: '',
  },
};

const sheetError = {
  roomData: memberDirect.roomData,
  pageData: {
    ...memberDirect.pageData,
    sheetError: '网络开小差，草稿仍在，可直接重试',
  },
};

module.exports = {
  WATER_ROOM_ID,
  ownerEmpty,
  member24,
  member24Game,
  visitorLong,
  memberDirect,
  memberCorrection,
  ownerCorrectionLong,
  entryDetail,
  archivedRound,
  sheetError,
};
