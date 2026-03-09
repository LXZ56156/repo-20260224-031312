const test = require('node:test');
const assert = require('node:assert/strict');

const profileCore = require('../miniprogram/core/profile');

test('normalizeQuickFillInput marks cancelled when avatar path is empty', () => {
  const out = profileCore.normalizeQuickFillInput(
    { nickname: '' },
    { nickName: '球友A' }
  );
  assert.equal(out.cancelled, true);
  assert.equal(out.avatarTempPath, '');
  assert.equal(out.nickName, '球友A');
  assert.equal(out.nickname, '球友A');
  assert.equal(out.nicknameFilled, true);
});

test('normalizeQuickFillInput keeps explicit nickname first', () => {
  const out = profileCore.normalizeQuickFillInput(
    { avatarTempPath: 'wxfile://avatar.png', nickname: '  张三  ' },
    { nickName: '球友B' }
  );
  assert.equal(out.cancelled, false);
  assert.equal(out.avatarTempPath, 'wxfile://avatar.png');
  assert.equal(out.nickName, '张三');
  assert.equal(out.nickname, '张三');
  assert.equal(out.nicknameFilled, true);
});

test('normalizeQuickFillInput falls back to profile nickname', () => {
  const out = profileCore.normalizeQuickFillInput(
    { avatarTempPath: 'wxfile://avatar.png', nickname: '' },
    { nickname: '  球友C  ' }
  );
  assert.equal(out.nickName, '球友C');
  assert.equal(out.nickname, '球友C');
  assert.equal(out.nicknameFilled, true);
});
