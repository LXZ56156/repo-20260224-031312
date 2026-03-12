const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('share-entry landing page puts primary CTA ahead of compact summary facts', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  const actionIndex = wxml.indexOf('现在可以做什么');
  const summaryIndex = wxml.indexOf('比赛摘要');
  assert.notEqual(actionIndex, -1);
  assert.notEqual(summaryIndex, -1);
  assert.ok(actionIndex < summaryIndex);
  assert.match(wxml, /share-facts/);
  assert.match(wxml, /share-actions/);
  assert.match(wxml, /preview\.viewMode==='invalid-match'/);
  assert.match(wxml, /preview\.viewMode==='retryable-error'/);
  assert.doesNotMatch(wxml, /share-note/);
  assert.doesNotMatch(wxml, /share-subtitle/);
  assert.doesNotMatch(wxml, /加入说明/);
  assert.doesNotMatch(wxml, /小队转需要先选 A\/B 队/);
  assert.doesNotMatch(wxml, /比赛开始后仍可通过分享链接查看排名、赛况和已完成轮次/);
});
