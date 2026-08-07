const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const waterSession = require('../miniprogram/core/waterSession');

test('water client forwards an explicit clientRequestId for every write action', async () => {
  const originalCall = cloud.call;
  const calls = [];
  cloud.call = async (_name, payload) => {
    calls.push(payload);
    return { ok: true, session: { id: 'water_1', version: 2 } };
  };

  try {
    await waterSession.create('阿杰', { clientRequestId: 'req_create' });
    await waterSession.join('water_1', 1, '小林', 'p2', { clientRequestId: 'req_join' });
    await waterSession.addParticipants('water_1', 1, 'Chris', { clientRequestId: 'req_add' });
    await waterSession.recordGame('water_1', 1, ['p1'], ['p2'], 1, { clientRequestId: 'req_game' });
    await waterSession.recordDirect('water_1', 1, 'p1', 'p2', 'plus', 1, { clientRequestId: 'req_direct' });
    await waterSession.undoLast('water_1', 1, { clientRequestId: 'req_undo' });
    await waterSession.get('water_1');
    await waterSession.getMineActive();
  } finally {
    cloud.call = originalCall;
  }

  assert.deepEqual(calls.map((payload) => payload.clientRequestId), [
    'req_create',
    'req_join',
    'req_add',
    'req_game',
    'req_direct',
    'req_undo',
    undefined,
    undefined,
  ]);
});
