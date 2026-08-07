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
  create(ownerName) { return call('create', { ownerName }); },
  get(sessionId) { return call('get', { sessionId }); },
  getMineActive() { return call('getMineActive'); },
  join(sessionId, expectedVersion, nickname, claimParticipantId = '') {
    return call('join', { sessionId, expectedVersion, nickname, claimParticipantId });
  },
  addParticipants(sessionId, expectedVersion, names) {
    return call('addParticipants', { sessionId, expectedVersion, names });
  },
  recordGame(sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer) {
    return call('recordGame', { sessionId, expectedVersion, winnerIds, loserIds, unitsPerPlayer });
  },
  recordDirect(sessionId, expectedVersion, playerId, counterpartyId, direction, units) {
    return call('recordDirect', { sessionId, expectedVersion, playerId, counterpartyId, direction, units });
  },
  undoLast(sessionId, expectedVersion) {
    return call('undoLast', { sessionId, expectedVersion });
  }
};
