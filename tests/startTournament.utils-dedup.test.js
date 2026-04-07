/**
 * startTournament 工具函数去重测试
 * 验证 utils.js 中提取的公共函数与各引擎行为一致
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../cloudfunctions/startTournament/utils');

test('pairKey 对称性：a_b 与 b_a 生成相同的 key', () => {
  assert.equal(utils.pairKey('alice', 'bob'), utils.pairKey('bob', 'alice'));
});

test('pairKey 按字典序排序：小的在前', () => {
  assert.equal(utils.pairKey('a', 'b'), 'a_b');
  assert.equal(utils.pairKey('z', 'a'), 'a_z');
  assert.equal(utils.pairKey('P1', 'P2'), 'P1_P2');
  assert.equal(utils.pairKey('P2', 'P1'), 'P1_P2');
});

test('pairKey 相同玩家返回确定性结果', () => {
  assert.equal(utils.pairKey('x', 'x'), 'x_x');
});

test('stableSortIds 过滤空值并排序', () => {
  const result = utils.stableSortIds(['c', '', 'a', null, 'b', undefined]);
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('stableSortIds 对非数组输入返回空数组', () => {
  assert.deepEqual(utils.stableSortIds(null), []);
  assert.deepEqual(utils.stableSortIds(undefined), []);
  assert.deepEqual(utils.stableSortIds('abc'), []);
});
