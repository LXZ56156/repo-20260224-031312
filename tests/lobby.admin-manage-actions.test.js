const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lobby admin area exposes modify and cancel actions and removes reset draft entry', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );

  assert.match(wxml, /修改比赛/);
  assert.match(wxml, /取消比赛/);
  assert.doesNotMatch(wxml, /重置回草稿/);
});
