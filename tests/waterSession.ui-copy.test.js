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
  assert.match(wxml, /添加球友/);
  assert.match(wxml, /邀请加入/);
  assert.match(wxml, /open-type="share"/);
  assert.equal((wxml.match(/open-type="share"/g) || []).length, 1);
  assert.match(wxml, /mode="selector"/);
  assert.match(wxml, /data-direction="plus"/);
  assert.match(wxml, /data-direction="minus"/);
  assert.doesNotMatch(wxml, /至少\s*4\s*人|满\s*4\s*人/);
  assert.match(wxml, /placeholder="例如：小林、Chris、王姐"/);
  assert.doesNotMatch(wxml, /&#10;/);
});

test('approved B add sheet combines manual and relay import with preview before writing', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const js = read('miniprogram/pages/water/index.js');
  const addSheetShow = wxml.indexOf('show="{{manualSheetOpen}}"');
  const addSheetStart = wxml.lastIndexOf('<van-popup', addSheetShow);
  const addSheetEnd = wxml.indexOf('show="{{gameSheetOpen}}"');
  const addSheet = wxml.slice(addSheetStart, addSheetEnd);

  assert.match(addSheet, /手动添加/);
  assert.match(addSheet, /导入接龙/);
  assert.match(addSheet, /data-mode="manual"/);
  assert.match(addSheet, /data-mode="relay"/);
  assert.match(addSheet, /bindinput="onRelayInput"/);
  assert.match(addSheet, /maxlength="2000"/);
  assert.match(addSheet, /wx:for="{{relayPreviewNames}}"/);
  assert.match(addSheet, /添加 \{\{relayNewNames\.length\}\} 位新球友/);
  assert.match(wxss, /\.water-add-mode-switch\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /\.water-add-mode-tab\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*min-height:\s*44px[^}]*justify-self:\s*stretch[^}]*box-sizing:\s*border-box/s);
  assert.match(js, /addMode:\s*'manual'/);
  assert.match(js, /onSelectAddMode\(e\)/);
  assert.match(js, /onRelayInput\(e\)/);
  assert.match(js, /submitRelay\(\)/);
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
  const manualAt = wxml.indexOf('openManualSheet');
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

test('selected A direction uses one full-width primary row and one secondary row', () => {
  const pageConfig = JSON.parse(read('miniprogram/pages/water/index.json'));
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const scoreboard = wxml.slice(wxml.indexOf('class="water-scoreboard"'), wxml.indexOf('class="card water-join-card"'));

  assert.equal(pageConfig.usingComponents['van-button'], '@vant/weapp/button/index');
  assert.equal(pageConfig.usingComponents['van-popup'], '@vant/weapp/popup/index');
  assert.equal(pageConfig.usingComponents['van-tag'], '@vant/weapp/tag/index');
  assert.match(wxml, /<van-button[^>]*class="water-game-cta"/s);
  assert.match(wxml, /<van-button[^>]*open-type="share"/s);
  assert.match(wxml, /class="water-action-icon add"/);
  assert.doesNotMatch(wxml, /<van-icon/);
  assert.match(wxml, /<van-popup[^>]*position="bottom"/s);
  assert.doesNotMatch(wxml, /water-court-mark|water-court-circle|water-court-net/);
  assert.doesNotMatch(wxml, /water-balance|平衡\s*\{\{totalNet\}\}/);
  assert.doesNotMatch(scoreboard, /邀请加入|open-type="share"/);
  assert.match(wxml, /class="water-game-arrow"/);
  assert.match(wxss, /#136957/i);
  assert.match(wxss, /#103f35/i);
  assert.doesNotMatch(wxss, /\.water-share-host|\.water-share\s*\{/);
  assert.doesNotMatch(wxss, /\.water-court-mark|\.water-court-circle|\.water-court-net/);
  assert.match(wxss, /\.water-command-board\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(wxss, /\.water-game-cta\s*\{[^}]*height:\s*132rpx/s);
  assert.match(wxss, /\.water-game-content\s*\{[^}]*position:\s*absolute[^}]*right:\s*32rpx[^}]*left:\s*32rpx/s);
  assert.match(wxss, /\.water-command-secondary\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*grid-template-rows:\s*100rpx/s);
  assert.match(wxss, /\.water-secondary\s*\{[^}]*width:\s*100% !important[^}]*min-width:\s*0/s);
  assert.doesNotMatch(wxss, /calc\(100% - 24rpx\)/);
});

test('approved B game selector renders one compact roster with explicit side assignment', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const js = read('miniprogram/pages/water/index.js');
  const gameSheetShow = wxml.indexOf('show="{{gameSheetOpen}}"');
  const gameSheetStart = wxml.lastIndexOf('<van-popup', gameSheetShow);
  const gameSheetEnd = wxml.indexOf('show="{{adjustSheetOpen}}"');
  const gameSheet = wxml.slice(gameSheetStart, gameSheetEnd);

  assert.match(gameSheet, /class="water-game-side-switch"/);
  assert.match(gameSheet, /bindtap="onSelectGameSide"/);
  assert.match(gameSheet, /class="water-game-match"/);
  assert.match(gameSheet, /class="water-game-roster-label"/);
  assert.match(gameSheet, /custom-class="water-popup water-game-popup"/);
  assert.match(gameSheet, /wx:if="{{participantCount > 8}}"/);
  assert.match(gameSheet, /bindinput="onGameSearchInput"/);
  assert.match(gameSheet, /bindtap="clearGameSearch"/);
  assert.match(gameSheet, /aria-label="清除搜索"/);
  assert.match(gameSheet, /class="water-game-search-clear-icon">×<\/text>/);
  assert.doesNotMatch(gameSheet, /class="water-game-search-clear"[^>]*>[^<]*<text[^>]*>×<\/text><text>清除<\/text>/s);
  assert.match(gameSheet, /data-id="{{item.id}}"[^>]*bindtap="onToggleGamePlayer"/s);
  assert.equal((gameSheet.match(/wx:for="{{gameParticipants}}"/g) || []).length, 1);
  assert.match(gameSheet, /water-chip-grid \{\{participantCount > 8 \? 'searchable' : ''\}\}/);
  assert.match(gameSheet, /item\.winnerSelected \? 'selected winner'/);
  assert.match(gameSheet, /item\.loserSelected \? 'selected loser'/);
  assert.match(wxss, /\.water-chip-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /\.water-chip\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-game-side-tab\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*justify-self:\s*stretch[^}]*box-sizing:\s*border-box/s);
  assert.match(wxss, /\.water-game-search\s*\{[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-game-search-clear\s*\{[^}]*width:\s*44px[^}]*min-width:\s*44px[^}]*height:\s*44px[^}]*flex:\s*0 0 44px[^}]*border:\s*0[^}]*background:\s*transparent/s);
  assert.match(wxss, /\.water-game-search-clear-icon\s*\{[^}]*display:\s*flex[^}]*width:\s*48rpx[^}]*height:\s*48rpx[^}]*border-radius:\s*50%[^}]*background:\s*#d5e5df/s);
  assert.match(wxss, /\.water-chip-grid\.searchable\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s);
  assert.match(wxss, /\.water-game-popup\s*\{[^}]*max-height:\s*92vh !important/s);
  assert.match(js, /gameActiveSide:\s*'winner'/);
  assert.match(js, /onSelectGameSide\(e\)/);
  assert.match(js, /onGameSearchInput\(e\)/);
});

test('Vant spike pins the reviewed component version and package output mapping', () => {
  const packageConfig = JSON.parse(read('miniprogram/package.json'));
  const projectConfig = JSON.parse(read('project.config.json'));

  assert.equal(packageConfig.dependencies['@vant/weapp'], '1.11.7');
  assert.equal(projectConfig.setting.packNpmManually, true);
  assert.deepEqual(projectConfig.setting.packNpmRelationList, [
    {
      packageJsonPath: './miniprogram/package.json',
      miniprogramNpmDistDir: './miniprogram',
    },
  ]);
});

test('water screenshot case targets the approved B scoreboard instead of the retired hero', () => {
  const screenshotScript = read('scripts/dev/weapp-ui-screenshot.js');

  assert.match(screenshotScript, /selectors:\s*\['\.water-scoreboard'/);
  assert.doesNotMatch(screenshotScript, /'\.water-hero'/);
});
