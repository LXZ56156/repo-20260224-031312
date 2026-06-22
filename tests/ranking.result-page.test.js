const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('ranking is the single result page with one primary poster entry and full rows', () => {
  const wxml = read('miniprogram/pages/ranking/index.wxml');
  const posterEntries = wxml.match(/bindtap="onGeneratePoster"/g) || [];

  assert.equal(posterEntries.length, 1);
  assert.match(wxml, />\{\{posterButtonText\}\}<\/button>/);
  assert.match(wxml, /wx:for="\{\{rankings\}\}"/);
  assert.match(wxml, /bindtap="toggleMoreActions"/);
  assert.match(wxml, /bindtap="cloneCurrentTournament"/);
  assert.doesNotMatch(wxml, /ranking-share-banner/);
  assert.doesNotMatch(wxml, /onShareRankingRow/);
  assert.doesNotMatch(wxml, /onShareTimelineGuide/);
});

test('migrated analytics ad slot stays after ranking content', () => {
  const wxml = read('miniprogram/pages/ranking/index.wxml');
  const rankingRowsAt = wxml.indexOf('wx:for="{{rankings}}"');
  const adSlotAt = wxml.indexOf('wx:if="{{showResultAdSlot}}"');

  assert.ok(rankingRowsAt >= 0);
  assert.ok(adSlotAt > rankingRowsAt);
  assert.match(wxml, /class="ad-badge">广告<\/view>/);
});
