const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('share-entry landing page uses compact facts instead of verbose info rows', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /快速了解/);
  assert.match(wxml, /share-facts/);
  assert.doesNotMatch(wxml, /加入说明/);
  assert.doesNotMatch(wxml, /比赛开始后仍可通过分享链接查看排名、赛况和已完成轮次/);
});
