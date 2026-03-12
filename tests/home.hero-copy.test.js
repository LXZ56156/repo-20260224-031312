const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const homeWxml = fs.readFileSync('miniprogram/pages/home/index.wxml', 'utf8');

test('home hero copy is action-oriented', () => {
  assert.equal(homeWxml.includes('{{heroCard.title}}'), true);
  assert.equal(homeWxml.includes('先继续正在进行中的，再处理草稿和结果。'), false);
  assert.equal(homeWxml.includes('{{heroCard.actionText}}'), true);
  assert.equal(homeWxml.includes('hero-stat-row'), false);
  assert.equal(homeWxml.includes('hero-stat-pill'), false);
  assert.equal(homeWxml.includes('赛事中枢'), false);
  assert.equal(homeWxml.includes('创建、分享、录分，流程更清晰。'), false);
  assert.equal(homeWxml.includes('昵称和性别完整后'), false);
  assert.equal(homeWxml.includes('当前没有进行中的比赛'), false);
});
