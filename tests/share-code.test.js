const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const shareCode = require('../miniprogram/core/shareCode');

test('shareCode returns an empty url without calling cloud for an empty tournament id', async () => {
  const originalCall = cloud.call;
  let calls = 0;
  cloud.call = async () => {
    calls += 1;
    return {};
  };
  shareCode._private.clearCache();

  try {
    assert.equal(await shareCode.getTournamentShareCode(''), '');
    assert.equal(calls, 0);
  } finally {
    cloud.call = originalCall;
    shareCode._private.clearCache();
  }
});

test('shareCode forwards the runtime env and reuses an in-flight code request', async () => {
  const originalCall = cloud.call;
  const originalGetRuntimeEnv = cloud.getRuntimeEnv;
  const calls = [];
  let resolveCall;
  cloud.getRuntimeEnv = () => ({ envVersion: 'trial' });
  cloud.call = (name, data) => {
    calls.push({ name, data });
    return new Promise((resolve) => {
      resolveCall = resolve;
    });
  };
  shareCode._private.clearCache();

  try {
    const first = shareCode.getTournamentShareCode('tid_123');
    const second = shareCode.getTournamentShareCode('tid_123');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      name: 'generateShareCode',
      data: { tournamentId: 'tid_123', envVersion: 'trial' }
    });

    resolveCall({
      ok: true,
      data: { fileID: 'cloud://test/share-codes/code.png' }
    });
    assert.equal(await first, 'cloud://test/share-codes/code.png');
    assert.equal(await second, 'cloud://test/share-codes/code.png');
    assert.equal(await shareCode.getTournamentShareCode('tid_123'), 'cloud://test/share-codes/code.png');
    assert.equal(calls.length, 1);
  } finally {
    cloud.call = originalCall;
    cloud.getRuntimeEnv = originalGetRuntimeEnv;
    shareCode._private.clearCache();
  }
});
