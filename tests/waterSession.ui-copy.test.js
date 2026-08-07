const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('launch puts standalone quick water before formal tournament modes', () => {
  const wxml = read('miniprogram/pages/launch/index.wxml');
  const waterAt = wxml.indexOf('快速打水');
  const modesAt = wxml.indexOf('wx:for="{{modeCards}}"');

  assert.match(wxml, /选择玩法/);
  assert.match(wxml, /不用建比赛/);
  assert.ok(waterAt >= 0 && modesAt > waterAt);
  assert.match(wxml, /bindtap="onStartWater"/);
});

test('standalone page keeps approved actions and native selector picker', () => {
  const app = JSON.parse(read('miniprogram/app.json'));
  const wxml = read('miniprogram/pages/water/index.wxml');

  assert.ok(app.pages.includes('pages/water/index'));
  assert.match(wxml, /记一局/);
  assert.match(wxml, /手动加人/);
  assert.match(wxml, /邀请加入/);
  assert.match(wxml, /open-type="share"/);
  assert.match(wxml, /mode="selector"/);
  assert.match(wxml, /data-direction="plus"/);
  assert.match(wxml, /data-direction="minus"/);
  assert.doesNotMatch(wxml, /至少\s*4\s*人|满\s*4\s*人/);
});

test('standalone page uses the approved B scoreboard information hierarchy', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');

  assert.match(wxml, /class="water-scoreboard"/);
  assert.match(wxml, /class="water-score-strip"/);
  assert.match(wxml, /class="water-command-board"/);
  assert.match(wxml, /class="water-column-head"/);
  assert.match(wxml, /class="water-record-type"/);
  assert.doesNotMatch(wxml, /class="water-summary"/);

  const gameAt = wxml.indexOf('class="water-game-cta"');
  const manualAt = wxml.indexOf('bindtap="openManualSheet"');
  const ledgerAt = wxml.indexOf('class="water-ledger-card"');
  assert.ok(gameAt >= 0 && manualAt > gameAt && ledgerAt > manualAt);
});

test('B ledger uses a fixed three-column grid so copy cannot drift into controls', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxss, /\.water-column-head\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 64rpx 192rpx/s);
  assert.match(wxss, /\.water-ledger-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 64rpx 192rpx/s);
  assert.match(wxss, /\.water-adjust-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, 88rpx\)/s);
  assert.match(wxss, /\.water-adjust-actions \.water-adjust\s*\{[^}]*width:\s*88rpx !important[^}]*min-height:\s*84rpx/s);
});

test('B command grid allows native buttons to shrink without horizontal overflow', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxss, /\.water-command-secondary\s*\{[^}]*min-width:\s*0/s);
  assert.match(wxss, /\.water-secondary\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(wxss, /\.water-secondary\s*\{[^}]*width:\s*calc\(100% - 24rpx\) !important[^}]*max-width:\s*100%[^}]*justify-self:\s*start/s);
});

test('water screenshot case targets the approved B scoreboard instead of the retired hero', () => {
  const screenshotScript = read('scripts/dev/weapp-ui-screenshot.js');

  assert.match(screenshotScript, /selectors:\s*\['\.water-scoreboard'/);
  assert.doesNotMatch(screenshotScript, /'\.water-hero'/);
});
