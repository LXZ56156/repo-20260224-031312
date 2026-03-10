const test = require('node:test');
const assert = require('node:assert/strict');

const common = require('../scripts/cloud-common.template.js');

test('assertNoReservedRootKeys throws when root _id is present', () => {
  assert.throws(
    () => common.assertNoReservedRootKeys({ _id: 'abc', name: '比赛' }, ['_id'], '赛事写入数据'),
    /赛事写入数据包含保留字段 _id/
  );
});

test('assertNoReservedRootKeys allows normal root fields', () => {
  const payload = { name: '比赛', version: 1 };
  assert.equal(common.assertNoReservedRootKeys(payload, ['_id'], '赛事写入数据'), payload);
});

test('assertNoReservedRootKeys ignores nested _id fields', () => {
  const payload = {
    players: [{ id: 'u_1', profile: { _id: 'nested_ok' } }],
    snapshot: { meta: { _id: 'nested_ok' } }
  };
  assert.equal(common.assertNoReservedRootKeys(payload, ['_id'], '赛事写入数据'), payload);
});
