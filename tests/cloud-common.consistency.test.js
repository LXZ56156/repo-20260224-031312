const test = require('node:test');
const assert = require('node:assert/strict');

const cloudCommon = require('../cloudfunctions/submitScore/lib/common');
const clientCloud = require('../miniprogram/core/cloud');

test('cloud-common isConflictError consistent with client parseCloudError conflict detection', () => {
  const conflictInputs = [
    { message: '写入冲突，请刷新赛事后重试' },
    { message: 'version conflict detected' },
    { message: '并发冲突' },
    { message: 'CONFLICT in operation' }
  ];
  for (const input of conflictInputs) {
    const cloudResult = cloudCommon.isConflictError(input);
    const clientResult = clientCloud.parseCloudError(input, '').isConflict;
    assert.equal(cloudResult, clientResult,
      `conflict detection mismatch for "${input.message}": cloud=${cloudResult}, client=${clientResult}`);
  }

  const nonConflictInputs = [
    { message: 'network error' },
    { message: '权限不足' },
    { message: 'timeout' },
    { message: '' }
  ];
  for (const input of nonConflictInputs) {
    const cloudResult = cloudCommon.isConflictError(input);
    const clientResult = clientCloud.parseCloudError(input, '').isConflict;
    assert.equal(cloudResult, clientResult,
      `non-conflict detection mismatch for "${input.message}": cloud=${cloudResult}, client=${clientResult}`);
  }
});

test('cloud-common okResult and failResult produce valid structured results', () => {
  const ok = cloudCommon.okResult('TEST_OK', '测试成功', { extra: 'data' });
  assert.equal(ok.ok, true);
  assert.equal(ok.code, 'TEST_OK');
  assert.equal(ok.message, '测试成功');

  const fail = cloudCommon.failResult('TEST_FAIL', '测试失败', { detail: 'info' });
  assert.equal(fail.ok, false);
  assert.equal(fail.code, 'TEST_FAIL');
  assert.equal(fail.message, '测试失败');

  // client can parse cloud results
  const parsedOk = clientCloud.normalizeCloudResult(ok);
  assert.equal(parsedOk.ok, true);
  assert.equal(parsedOk.code, 'TEST_OK');

  const parsedFail = clientCloud.normalizeCloudResult(fail);
  assert.equal(parsedFail.ok, false);
  assert.equal(parsedFail.code, 'TEST_FAIL');
});

test('cloud-common assertOptimisticUpdate throws on zero updates', () => {
  assert.throws(
    () => cloudCommon.assertOptimisticUpdate({ stats: { updated: 0 } }),
    /写入冲突/
  );
  assert.throws(
    () => cloudCommon.assertOptimisticUpdate(null),
    /写入冲突/
  );
  // should not throw on successful update
  cloudCommon.assertOptimisticUpdate({ stats: { updated: 1 } });
});

test('cloud-common withWriteResult preserves extra fields in data', () => {
  const result = cloudCommon.withWriteResult(
    { ok: true, tournamentId: 't_1', extra: 'val' },
    { code: 'CREATE_OK', message: '已创建' }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, 'CREATE_OK');
  assert.equal(result.data.tournamentId, 't_1');
  assert.equal(result.data.extra, 'val');
});

test('cloud-common assertNoReservedRootKeys rejects _id in data', () => {
  assert.throws(
    () => cloudCommon.assertNoReservedRootKeys({ _id: '123', name: 'test' }),
    /保留字段/
  );
  // should not throw without _id
  cloudCommon.assertNoReservedRootKeys({ name: 'test' });
});
