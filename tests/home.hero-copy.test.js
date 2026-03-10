const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const homeWxml = fs.readFileSync('miniprogram/pages/home/index.wxml', 'utf8');

test('home hero copy is action-oriented', () => {
  assert.equal(homeWxml.includes('赛事中枢'), true);
  assert.equal(homeWxml.includes('发起、继续、看结果'), true);
  assert.equal(homeWxml.includes('进行中 {{statusCountRunning}}'), true);
  assert.equal(homeWxml.includes('草稿 {{statusCountDraft}}'), true);
  assert.equal(homeWxml.includes('已结束 {{statusCountFinished}}'), true);
  assert.equal(homeWxml.includes('发起在底部「发起」'), false);
  assert.equal(homeWxml.includes('进行中 {{heroRunningCount}} 场'), false);
  assert.equal(homeWxml.includes('待录分 {{heroPendingCount}} 场'), false);
  assert.equal(homeWxml.includes('创建、分享、录分，流程更清晰。'), false);
});
