const cloud = require('./cloud');
const clientRequest = require('./clientRequest');

const API_VERSION_V2 = 2;
const V1_READ_ACTIONS = new Set(['get', 'getMineActive']);
const V2_READ_ACTIONS = new Set(['get', 'listEntries', 'getEntry', 'listRounds', 'getRound']);

function compactPayload(payload) {
  return Object.keys(payload || {}).reduce((result, key) => {
    if (payload[key] !== undefined) result[key] = payload[key];
    return result;
  }, {});
}

function normalizeOptions(options) {
  return options && typeof options === 'object' ? options : {};
}

async function callV1(action, data = {}) {
  const isRead = V1_READ_ACTIONS.has(action);
  const payload = { action, ...(data && typeof data === 'object' ? data : {}) };
  if (!isRead) {
    payload.clientRequestId = clientRequest.resolveClientRequestId(payload.clientRequestId, `water_${action}`);
  }
  const response = await cloud.call('waterSession', payload, isRead ? { retry: true } : {});
  return cloud.assertWriteResult(response, '打水操作失败');
}

async function callV2(action, data = {}, options = {}) {
  const isRead = V2_READ_ACTIONS.has(action);
  const requestOptions = normalizeOptions(options);
  const payload = compactPayload({
    action,
    apiVersion: API_VERSION_V2,
    ...(data && typeof data === 'object' ? data : {})
  });
  if (!isRead) {
    payload.clientRequestId = clientRequest.resolveClientRequestId(
      requestOptions.clientRequestId || payload.clientRequestId,
      `water_v2_${action}`
    );
  } else {
    delete payload.clientRequestId;
  }
  const response = await cloud.call('waterSession', payload, isRead ? { retry: true } : {});
  return cloud.assertWriteResult(response, '打水操作失败');
}

function readPageOptions(options, fields) {
  const source = normalizeOptions(options);
  return fields.reduce((result, key) => {
    if (source[key] !== undefined) result[key] = source[key];
    return result;
  }, {});
}

function assertSingleEntryCursor(options) {
  const source = normalizeOptions(options);
  if (source.beforeSeq !== undefined && source.afterSeq !== undefined) {
    throw new TypeError('beforeSeq 和 afterSeq 不能同时使用');
  }
}

module.exports = {
  API_VERSION_V2,

  // V1 compatibility exports. Keep their signatures stable until the legacy
  // client window is explicitly retired.
  create(ownerName, options = {}) {
    return callV1('create', { ownerName, clientRequestId: options.clientRequestId });
  },
  get(sessionId) { return callV1('get', { sessionId }); },
  getMineActive() { return callV1('getMineActive'); },
  join(sessionId, expectedVersion, nickname, claimParticipantId = '', options = {}) {
    return callV1('join', { sessionId, expectedVersion, nickname, claimParticipantId, clientRequestId: options.clientRequestId });
  },
  addParticipants(sessionId, expectedVersion, names, options = {}) {
    return callV1('addParticipants', { sessionId, expectedVersion, names, clientRequestId: options.clientRequestId });
  },
  recordGame(sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer, options = {}) {
    return callV1('recordGame', { sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer, clientRequestId: options.clientRequestId });
  },
  recordDirect(sessionId, expectedVersion, playerId, counterpartyId, direction, units, options = {}) {
    return callV1('recordDirect', { sessionId, expectedVersion, playerId, counterpartyId, direction, units, clientRequestId: options.clientRequestId });
  },
  undoLast(sessionId, expectedVersion, options = {}) {
    return callV1('undoLast', { sessionId, expectedVersion, clientRequestId: options.clientRequestId });
  },

  createV2(ownerName, options = {}) {
    return callV2('create', { ownerName }, options);
  },
  getV2(roomId) {
    return callV2('get', { roomId });
  },
  listEntries(roomId, roundId, options = {}) {
    assertSingleEntryCursor(options);
    return callV2('listEntries', {
      roomId,
      roundId,
      ...readPageOptions(options, ['category', 'beforeSeq', 'afterSeq', 'limit'])
    });
  },
  getEntry(roomId, roundId, rootEntryId) {
    return callV2('getEntry', { roomId, roundId, rootEntryId });
  },
  listRounds(roomId, options = {}) {
    return callV2('listRounds', {
      roomId,
      ...readPageOptions(options, ['beforeNumber', 'limit'])
    });
  },
  getRound(roomId, roundId, options = {}) {
    assertSingleEntryCursor(options);
    return callV2('getRound', {
      roomId,
      roundId,
      ...readPageOptions(options, ['category', 'beforeSeq', 'afterSeq', 'limit'])
    });
  },
  joinV2(roomId, nickname, options = {}) {
    const requestOptions = normalizeOptions(options);
    return callV2('join', {
      roomId,
      nickname,
      claimParticipantId: requestOptions.claimParticipantId,
      expectedRoomVersion: requestOptions.expectedRoomVersion
    }, requestOptions);
  },
  addParticipantsV2(roomId, names, options = {}) {
    const requestOptions = normalizeOptions(options);
    return callV2('addParticipants', {
      roomId,
      names,
      expectedRoomVersion: requestOptions.expectedRoomVersion
    }, requestOptions);
  },
  recordGameV2(roomId, roundId, winnerIds, loserIds, unitsPerPlayer, options = {}) {
    return callV2('recordGame', {
      roomId,
      roundId,
      winnerIds,
      loserIds,
      unitsPerPlayer
    }, options);
  },
  recordDirectV2(roomId, roundId, fromPlayerId, toPlayerId, units, options = {}) {
    return callV2('recordDirect', {
      roomId,
      roundId,
      fromPlayerId,
      toPlayerId,
      units
    }, options);
  },
  correctEntry(roomId, roundId, rootEntryId, expectedEntryId, replacement, options = {}) {
    return callV2('correctEntry', {
      roomId,
      roundId,
      rootEntryId,
      expectedEntryId,
      replacement
    }, options);
  },
  reverseEntry(roomId, roundId, rootEntryId, expectedEntryId, options = {}) {
    return callV2('reverseEntry', {
      roomId,
      roundId,
      rootEntryId,
      expectedEntryId
    }, options);
  },
  createRound(roomId, expectedActiveRoundId, expectedRoomVersion, options = {}) {
    return callV2('createRound', {
      roomId,
      expectedActiveRoundId,
      expectedRoomVersion
    }, options);
  }
};
