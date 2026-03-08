const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const trace = require('../miniprogram/core/trace');

test('trace.createTraceId builds short operation ids', () => {
  const traceId = trace.createTraceId('submitScore');
  assert.match(traceId, /^submitScore_\d+_[a-z0-9]{6}$/);
});

test('cloud.call injects __traceId when missing and preserves explicit traceId', async () => {
  const originalWx = global.wx;
  const payloads = [];
  global.wx = {
    cloud: {
      callFunction: async ({ name, data }) => {
        payloads.push({ name, data });
        return { result: { ok: true } };
      }
    },
    showModal() {}
  };

  try {
    await cloud.call('submitScore', { tournamentId: 't_1' });
    await cloud.call('joinTournament', { tournamentId: 't_2', __traceId: 'manual_trace' });

    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].name, 'submitScore');
    assert.match(String(payloads[0].data.__traceId || ''), /^submitScore_/);
    assert.equal(payloads[1].data.__traceId, 'manual_trace');
  } finally {
    global.wx = originalWx;
  }
});
