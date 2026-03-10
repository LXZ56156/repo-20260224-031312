const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('schedule page hero focuses on current tournament state', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /当前赛程/);
  assert.match(wxml, /heroRoundText/);
  assert.match(wxml, /heroPendingText/);
  assert.doesNotMatch(wxml, /<view class="hero-title">赛程<\/view>/);
});
