const cloud = require('./cloud');
const clientRequest = require('./clientRequest');

async function call(action, data = {}) {
  const isRead = action === 'get' || action === 'getMineActive';
  const payload = { action, ...(data && typeof data === 'object' ? data : {}) };
  if (!isRead) {
    payload.clientRequestId = clientRequest.resolveClientRequestId(payload.clientRequestId, `water_${action}`);
  }
  const response = await cloud.call('waterSession', payload, isRead ? { retry: true } : {});
  return cloud.assertWriteResult(response, '打水操作失败');
}

module.exports = {
  create(ownerName, options = {}) {
    return call('create', { ownerName, clientRequestId: options.clientRequestId });
  },
  get(sessionId) { return call('get', { sessionId }); },
  getMineActive() { return call('getMineActive'); },
  join(sessionId, expectedVersion, nickname, claimParticipantId = '', options = {}) {
    return call('join', { sessionId, expectedVersion, nickname, claimParticipantId, clientRequestId: options.clientRequestId });
  },
  addParticipants(sessionId, expectedVersion, names, options = {}) {
    return call('addParticipants', { sessionId, expectedVersion, names, clientRequestId: options.clientRequestId });
  },
  recordGame(sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer, options = {}) {
    return call('recordGame', { sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer, clientRequestId: options.clientRequestId });
  },
  recordDirect(sessionId, expectedVersion, playerId, counterpartyId, direction, units, options = {}) {
    return call('recordDirect', { sessionId, expectedVersion, playerId, counterpartyId, direction, units, clientRequestId: options.clientRequestId });
  },
  undoLast(sessionId, expectedVersion, options = {}) {
    return call('undoLast', { sessionId, expectedVersion, clientRequestId: options.clientRequestId });
  }
};
