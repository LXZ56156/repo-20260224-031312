const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const mineWxml = fs.readFileSync('miniprogram/pages/mine/index.wxml', 'utf8');

test('mine page removes meaningless status metrics', () => {
  assert.equal(mineWxml.includes('进行中'), false);
  assert.equal(mineWxml.includes('草稿'), false);
  assert.equal(mineWxml.includes('已结束率'), false);
});

test('mine page includes performance-oriented metrics', () => {
  assert.equal(mineWxml.includes('我的战绩'), true);
  assert.equal(mineWxml.includes('已完成参赛'), true);
  assert.equal(mineWxml.includes('参赛场次'), true);
  assert.equal(mineWxml.includes('胜场'), true);
  assert.equal(mineWxml.includes('胜率'), true);
});
