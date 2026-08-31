const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('stage 1 copy states local-data and ranking evidence precisely', () => {
  const preferencesJs = read('miniprogram/pages/preferences/index.js');
  const preferencesWxml = read('miniprogram/pages/preferences/index.wxml');
  const rankingWxml = read('miniprogram/pages/ranking/index.wxml');
  const analyticsWxml = read('miniprogram/pages/analytics/index.wxml');
  const mineWxml = read('miniprogram/pages/mine/index.wxml');

  assert.match(preferencesJs, /重置本地数据？/);
  assert.match(preferencesJs, /个人资料、最近赛事、本地战绩、偏好、录分草稿和登录缓存/);
  assert.match(preferencesJs, /wx\.clearStorageSync\(\)/);
  assert.match(preferencesWxml, />重置本地数据<\/button>/);
  assert.match(rankingWxml, /排序：胜场 → 净胜分 → 总得分 → 名称/);
  assert.match(analyticsWxml, /统计样本：\{\{summary\.finishedMatches\}\} 场已完成比赛/);
  assert.match(analyticsWxml, /样本较少，仅供参考/);
  assert.match(mineWxml, /仅统计本机保留的已完成参赛记录/);
});
