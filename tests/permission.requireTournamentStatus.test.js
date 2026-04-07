const test = require('node:test');
const assert = require('node:assert/strict');

const permission = require('../miniprogram/permission/permission');

test('requireTournamentStatus 允许白名单状态', () => {
  const t = { status: 'draft' };
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, ['draft']));
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, ['draft', 'running']));
});

test('requireTournamentStatus 标准化 allowedStatuses 的大小写和空白', () => {
  const t = { status: 'draft' };
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, ['DRAFT']));
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, [' draft ']));
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, ['running', ' DRAFT ']));
});

test('requireTournamentStatus 拒绝非白名单状态并抛出明确错误', () => {
  const t = { status: 'running' };
  assert.throws(
    () => permission.requireTournamentStatus(t, ['draft']),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.length > 0, '错误消息不应为空');
      return true;
    }
  );
});

test('requireTournamentStatus 状态为 finished 时拒绝', () => {
  const t = { status: 'finished' };
  assert.throws(() => permission.requireTournamentStatus(t, ['draft', 'running']));
});

test('requireTournamentStatus tournament 为 null 时抛出错误', () => {
  assert.throws(() => permission.requireTournamentStatus(null, ['draft']));
});

test('requireTournamentStatus allowedStatuses 为空数组时拒绝所有状态', () => {
  const t = { status: 'draft' };
  assert.throws(() => permission.requireTournamentStatus(t, []));
});

test('requireTournamentStatus 忽略 allowedStatuses 中的空白项', () => {
  const t = { status: 'draft' };
  assert.doesNotThrow(() => permission.requireTournamentStatus(t, [' ', 'draft', '']));
  assert.throws(() => permission.requireTournamentStatus(t, [' ', '']));
});

test('requireTournamentStatus 状态字段缺失时等同 unknown 状态被拒', () => {
  const t = {};
  assert.throws(() => permission.requireTournamentStatus(t, ['draft', 'running']));
});
