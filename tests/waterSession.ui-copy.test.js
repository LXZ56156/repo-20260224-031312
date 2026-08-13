const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const relativeLuminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrastRatio = (foreground, background) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

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
  const addSheetEnd = wxml.indexOf('show="{{joinSheetOpen}}"', addSheetShow);
  const addSheet = wxml.slice(addSheetStart, addSheetEnd);

  assert.match(addSheet, /手动添加/);
  assert.match(addSheet, /导入接龙/);
  assert.match(addSheet, /data-mode="manual"/);
  assert.match(addSheet, /data-mode="relay"/);
  assert.match(addSheet, /bindinput="onRelayInput"/);
  assert.match(addSheet, /maxlength="2000"/);
  assert.match(addSheet, /wx:for="{{relayPreviewNames}}"/);
  assert.match(addSheet, /添加 \{\{relayNewNames\.length\}\} 位新球友/);
  assert.match(wxss, /\.water-side-switch,\s*\.water-add-switch\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /\.water-side-switch button,\s*\.water-add-switch button\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*44px/s);
  assert.match(js, /addMode:\s*'manual'/);
  assert.match(js, /onSelectAddMode\(e\)/);
  assert.match(js, /onRelayInput\(e\)/);
  assert.match(js, /submitRelay\(\)/);
});

test('standalone V2 B uses the approved ledger and audit-receipt hierarchy', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const js = read('miniprogram/pages/water/index.js');

  assert.match(wxml, /class="water-round-head"/);
  assert.match(wxml, /class="water-tabs"/);
  assert.match(wxml, /class="water-latest-receipt"/);
  assert.match(wxml, /class="water-ledger-table"/);
  assert.match(wxml, /class="water-audit-track"/);
  assert.match(wxml, /class="water-action-dock\b/);
  assert.match(js, /activeTab:\s*'ledger'/);
  assert.doesNotMatch(wxml, /water-scoreboard|water-hero|water-command-board/);
});

test('B audit rail and receipt nodes share one exact horizontal axis', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');
  const trackPadding = Number(wxss.match(/\.water-audit-track\s*\{[^}]*padding-left:\s*([\d.]+)rpx/s)[1]);
  const rail = wxss.match(/\.water-audit-track::before\s*\{[^}]*left:\s*([\d.]+)rpx[^}]*width:\s*([\d.]+)rpx/s);
  const node = wxss.match(/\.water-feed-node\s*\{[^}]*left:\s*(-?[\d.]+)rpx[^}]*width:\s*([\d.]+)rpx/s);
  const railCenter = Number(rail[1]) + Number(rail[2]) / 2;
  const nodeCenter = trackPadding + Number(node[1]) + Number(node[2]) / 2;

  assert.equal(nodeCenter, railCenter);
});

test('entry detail history contains the shared audit-track padding within its sheet width', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(
    wxss,
    /\.water-detail-history\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/s,
  );
});

test('V2 ledger protects both adjust controls while letting large net values size safely', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');
  const wxml = read('miniprogram/pages/water/index.wxml');

  assert.match(wxss, /\.water-ledger-row\s*\{[^}]*grid-template-columns:\s*minmax\(160rpx, 1fr\) max-content 212rpx/s);
  assert.match(wxss, /\.water-ledger-adjust\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(44px, 1fr\)\)/s);
  assert.match(wxss, /\.water-adjust-button\s*\{[^}]*width:\s*48px\s*!important[^}]*min-width:\s*44px[^}]*max-width:\s*48px\s*!important[^}]*height:\s*48px\s*!important[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-ledger-net\.is-net-lg\s*\{[^}]*font-size:\s*34rpx/s);
  assert.match(wxss, /\.water-ledger-net\.is-net-xl\s*\{[^}]*font-size:\s*28rpx/s);
  assert.match(wxml, /water-ledger-net \{\{item\.netClass\}\} \{\{item\.netSizeClass\}\}/);
  assert.match(wxss, /@media \(max-width:\s*374px\)[\s\S]*?\.water-ledger-row\s*\{[^}]*grid-template-columns:\s*minmax\(130rpx, 1fr\) max-content 220rpx/s);
  assert.match(wxss, /@media \(max-width:\s*374px\)[\s\S]*?\.water-adjust-button\s*\{[^}]*width:\s*44px\s*!important[^}]*max-width:\s*44px\s*!important[^}]*height:\s*44px\s*!important/s);
});

test('selected V2 B keeps its structure with the previous green palette', () => {
  const pageConfig = JSON.parse(read('miniprogram/pages/water/index.json'));
  const js = read('miniprogram/pages/water/index.js');
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const waterSources = [js, wxml, wxss].join('\n');

  assert.equal(pageConfig.usingComponents['van-popup'], '@vant/weapp/popup/index');
  assert.deepEqual(Object.keys(pageConfig.usingComponents), ['van-popup']);
  assert.match(wxml, /class="water-action-dock[^"]*"[\s\S]*?>记一局<\/button>[\s\S]*?>单独记水<\/button>/);
  assert.equal((wxml.match(/open-type="share"/g) || []).length, 1);
  assert.doesNotMatch(wxml, /<van-icon/);
  assert.match(wxml, /<van-popup[^>]*position="bottom"/s);
  assert.match(wxss, /--water-page:\s*#edf3f1/i);
  assert.match(wxss, /--water-surface:\s*#fbfdfc/i);
  assert.match(wxss, /--water-ink:\s*#15241f/i);
  assert.match(wxss, /--water-accent:\s*#087a56/i);
  assert.match(wxss, /--water-warning:\s*#a8622f/i);
  assert.match(wxss, /--water-danger:\s*#b8443f/i);
  assert.match(wxss, /--water-dock:\s*#103f35/i);
  assert.doesNotMatch(waterSources, /#(?:f7f4f6|2a2026|7b3555|612640|482437|9c4051)/i);
  assert.equal((js.match(/confirmColor:\s*'#b8443f'/gi) || []).length, 2);
  assert.equal((js.match(/confirmColor:\s*'#103f35'/gi) || []).length, 1);
  assert.match(wxss, /\.water-action-dock\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(wxml, /撤销上一条|总账差|结束这次打水/);
});

test('approved screenshot fixes keep display atoms, dock modes and popup safe-area ownership explicit', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxml, /class="water-action-dock \{\{bottomActionMode === 'write' \? '' : 'is-single'\}\}"/);
  assert.match(wxss, /\.water-action-dock\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*background:\s*var\(--water-surface\)/s);
  assert.match(wxss, /\.water-action-dock\.is-single\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(wxss, /\.water-dock-button\s*\{[^}]*width:\s*auto\s*!important[^}]*max-width:\s*none\s*!important[^}]*align-self:\s*stretch[^}]*justify-self:\s*stretch[^}]*margin:\s*0\s*!important/s);
  assert.doesNotMatch(wxss, /\.water-action-dock\s*\{[^}]*background:\s*rgba\(/s);

  assert.equal((wxml.match(/\{\{item\.displayDescription\}\}/g) || []).length, 3);
  assert.match(wxml, /class="water-detail-description">\{\{entryDetail\.displayDescription\}\}<\/text>/);
  assert.match(wxml, /data-description="\{\{item\.description\}\}"/);
  assert.match(wxml, /data-description="\{\{entryDetail\.description\}\}"/);

  assert.match(wxss, /\.water-game-sheet\s*\{[^}]*max-height:\s*calc\(92vh - env\(safe-area-inset-bottom\)\)/s);
  assert.doesNotMatch(wxss, /\.water-sheet-bottom\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
});

test('approved B game selector renders one compact roster with explicit side assignment', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const js = read('miniprogram/pages/water/index.js');
  const gameSheetShow = wxml.indexOf('show="{{gameSheetOpen}}"');
  const gameSheetStart = wxml.lastIndexOf('<van-popup', gameSheetShow);
  const gameSheetEnd = wxml.indexOf('show="{{directSheetOpen}}"', gameSheetShow);
  const gameSheet = wxml.slice(gameSheetStart, gameSheetEnd);

  assert.match(gameSheet, /class="water-side-switch water-game-side-switch"/);
  assert.match(gameSheet, /bindtap="onSelectGameSide"/);
  assert.match(gameSheet, /双方人数相同即可，1 对 1 也能记/);
  assert.match(gameSheet, /class="water-match-summary/);
  assert.match(gameSheet, /bindtap="toggleGameSummary"/);
  assert.match(gameSheet, /aria-expanded="{{gameSummaryExpanded}}"/);
  assert.match(gameSheet, /wx:if="{{winnerIds\.length > 2 \|\| loserIds\.length > 2}}"/);
  assert.match(gameSheet, /winnerFullSummary/);
  assert.match(gameSheet, /loserFullSummary/);
  assert.match(gameSheet, /class="water-team-summary" aria-label="胜方 {{winnerIds\.length}} 人，{{winnerFullSummary}}"/);
  assert.match(gameSheet, /class="water-team-summary is-loser" aria-label="负方 {{loserIds\.length}} 人，{{loserFullSummary}}"/);
  assert.match(gameSheet, /class="water-roster-label"/);
  assert.match(gameSheet, /custom-class="water-popup water-game-popup"/);
  assert.match(gameSheet, /wx:if="{{participantCount > 8}}"/);
  assert.match(gameSheet, /class="water-game-body"[^>]*scroll-y[^>]*show-scrollbar="{{true}}"/s);
  assert.match(gameSheet, /class="water-game-body"[^>]*scroll-top="{{gameBodyScrollTop}}"/s);
  assert.doesNotMatch(gameSheet, /show-scrollbar="{{false}}"/);
  assert.doesNotMatch(gameSheet, /scroll-into-view/);
  assert.match(gameSheet, /上下滑动 · 点姓名移入{{gameActiveSide === 'loser' \? '负方' : '胜方'}}/);
  assert.match(gameSheet, /bindinput="onGameSearchInput"/);
  assert.match(gameSheet, /placeholder-class="water-game-search-placeholder"/);
  assert.match(gameSheet, /bindtap="clearGameSearch"/);
  assert.match(gameSheet, /aria-label="清除搜索"/);
  assert.match(gameSheet, /aria-label="清除搜索"[^>]*bindtap="clearGameSearch">[\s\S]*?×[\s\S]*?<\/button>/);
  assert.match(gameSheet, /class="water-game-close water-sheet-close"[^>]*aria-label="关闭记一局"[^>]*bindtap="closeSheets"/);
  assert.match(gameSheet, /class="water-side-switch water-game-side-switch"[^>]*role="tablist"[^>]*aria-label="选择对局一方"/);
  assert.equal((gameSheet.match(/class="water-game-side-tab[^>]*role="tab"/g) || []).length, 2);
  assert.match(gameSheet, /data-id="{{item.id}}"[^>]*bindtap="onToggleGamePlayer"/s);
  assert.equal((gameSheet.match(/wx:for="{{gameParticipants}}"/g) || []).length, 1);
  assert.match(gameSheet, /item\.winnerSelected \? 'is-winner'/);
  assert.match(gameSheet, /item\.loserSelected \? 'is-loser'/);
  assert.match(gameSheet, /class="water-player-chip-state"/);
  assert.match(gameSheet, /class="water-player-chip-name"/);
  assert.match(gameSheet, /hasLongGameNames \? 'has-long-names'/);
  assert.match(gameSheet, /disabled="{{!!sheetBlockedReason \|\| !gameSelectionValid}}"/);
  assert.match(gameSheet, />{{editingEntry \? '保存修改' : '确认记一局'}}<\/button>/);
  assert.doesNotMatch(gameSheet, /确认记一局[^<]*·\s*胜/);
  assert.match(wxss, /\.water-player-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /\.water-player-grid\.has-long-names\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /@media \(max-width:\s*374px\)[\s\S]*?\.water-player-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(wxss, /\.water-player-chip\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-sheet-close\s*\{[^}]*width:\s*44px[^}]*min-width:\s*44px[^}]*height:\s*44px[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-side-switch button,\s*\.water-add-switch button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-search\s*\{[^}]*min-height:\s*48px/s);
  assert.match(wxss, /\.water-popup\s*\{[^}]*max-height:\s*92vh/s);
  assert.doesNotMatch(wxss, /\.water-game-sheet\s*\{[^}]*height:\s*88vh/s);
  assert.doesNotMatch(wxss, /\.water-player-chip\.is-(?:winner|loser)::before/);
  assert.match(wxss, /\.water-confirm-button\s*\{[^}]*width:\s*auto\s*!important[^}]*max-width:\s*none\s*!important[^}]*align-self:\s*stretch[^}]*white-space:\s*nowrap/s);
  assert.match(wxss, /\.water-sheet\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(wxss, /\.water-sheet-bottom\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.doesNotMatch(wxss, /\.(?:water-sheet|water-sheet-bottom)\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
  assert.match(wxss, /\.water-game-sheet\s*\{[^}]*--water-game-strong-muted:\s*#5f6f69/s);
  assert.match(wxss, /\.water-game-sheet \.water-sheet-count,[\s\S]*?\.water-game-sheet \.water-game-validation\s*\{[^}]*color:\s*var\(--water-game-strong-muted\)/s);
  assert.match(wxss, /\.water-game-search-placeholder\s*\{[^}]*color:\s*var\(--water-game-strong-muted\)/s);
  assert.match(wxss, /\.water-game-sheet \.water-game-side-tab:not\(\.is-active\)\s*\{[^}]*color:\s*var\(--water-game-strong-muted\)\s*!important/s);
  assert.match(js, /gameActiveSide:\s*'winner'/);
  assert.match(js, /gameBodyScrollTop:\s*0/);
  assert.match(js, /gameParticipantOrder:\s*\[\]/);
  assert.match(js, /function buildGameParticipantOrder\(/);
  assert.match(js, /gameSelectionValid:\s*false/);
  assert.match(js, /toggleGameSummary\(\)/);
  assert.match(js, /hasLongGameNames/);
  assert.match(js, /onSelectGameSide\(e\)/);
  assert.match(js, /onGameSearchInput\(e\)/);
});

test('game selection counts appear once in tabs while summaries and ready footer stay concise', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const gameSheetShow = wxml.indexOf('show="{{gameSheetOpen}}"');
  const gameSheetStart = wxml.lastIndexOf('<van-popup', gameSheetShow);
  const gameSheetEnd = wxml.indexOf('show="{{directSheetOpen}}"', gameSheetShow);
  const gameSheet = wxml.slice(gameSheetStart, gameSheetEnd);

  assert.match(gameSheet, />选胜方 <text>{{winnerIds\.length}}<\/text><\/button>/);
  assert.match(gameSheet, />选负方 <text>{{loserIds\.length}}<\/text><\/button>/);
  assert.match(gameSheet, /aria-label="胜方 {{winnerIds\.length}} 人，{{winnerFullSummary}}"/);
  assert.match(gameSheet, /aria-label="负方 {{loserIds\.length}} 人，{{loserFullSummary}}"/);
  assert.match(gameSheet, /class="water-team-label">胜方<\/text>/);
  assert.match(gameSheet, /class="water-team-label">负方<\/text>/);
  assert.doesNotMatch(gameSheet, /class="water-team-label">(?:胜方 {{winnerIds\.length}} 人|负方 {{loserIds\.length}} 人)<\/text>/);
  assert.match(gameSheet, /<block wx:if="{{gameSelectionValid}}">双方人数相同 · 每人 {{unitOptions\[gameUnitIndex\]}} 水<\/block><block wx:else>{{gameValidationMessage}}<\/block>/);
});

test('an empty game search replaces the roster hint with a visible 44px clear action', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const gameSheetShow = wxml.indexOf('show="{{gameSheetOpen}}"');
  const gameSheetStart = wxml.lastIndexOf('<van-popup', gameSheetShow);
  const gameSheetEnd = wxml.indexOf('show="{{directSheetOpen}}"', gameSheetShow);
  const gameSheet = wxml.slice(gameSheetStart, gameSheetEnd);

  assert.match(gameSheet, /class="water-roster-label" wx:if="{{gameParticipants\.length}}"/);
  assert.match(gameSheet, /class="water-search-empty water-roster-search-empty" wx:if="{{gameSearchQuery && !gameParticipants\.length}}"[\s\S]*没有找到“{{gameSearchQuery}}”[\s\S]*class="water-search-empty-clear"[^>]*bindtap="clearGameSearch"[^>]*>清除搜索<\/button>/);
  assert.match(wxss, /\.water-search-empty-clear\s*\{[^}]*min-height:\s*44px/s);
});

test('disabled primary actions keep neutral styling with WCAG AA text contrast', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');
  const rule = wxss.match(/\.water-primary-button\[disabled\],\s*\.water-confirm-button\[disabled\]\s*\{([^}]*)\}/s);
  assert.ok(rule, 'disabled primary-action rule should exist');
  const foreground = rule[1].match(/color:\s*(#[0-9a-f]{6})\s*!important/i)?.[1];
  const background = rule[1].match(/background:\s*(#[0-9a-f]{6})\s*!important/i)?.[1];
  const accent = wxss.match(/--water-accent:\s*(#[0-9a-f]{6})/i)?.[1];

  assert.equal(background?.toLowerCase(), '#e4ece8');
  assert.notEqual(foreground?.toLowerCase(), accent?.toLowerCase(), 'disabled text must not use the primary accent');
  assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
});

test('round identity keeps every round number outside truncating title text', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxml, /class="water-round-title-line"[\s\S]*class="water-round-title-text"[\s\S]*class="water-round-number">第\{\{round\.number \|\| 1\}\}轮/);
  assert.match(wxml, /class="water-history-round-heading"[\s\S]*class="water-history-round-title">[^<]*historyRound\.title[^<]*<\/text>[\s\S]*class="water-history-round-number"[^>]*>第\{\{historyRound\.number\}\}轮/);
  assert.match(wxml, /class="water-round-row-heading"[\s\S]*class="water-round-row-title">\{\{item\.title\}\}[\s\S]*class="water-round-row-number">第\{\{item\.number\}\}轮/);
  assert.doesNotMatch(wxml, /round\.title[^<]*· 第\{\{round\.number/);
  assert.doesNotMatch(wxml, /historyRound\.title \+ ' · 第'/);
  assert.match(wxss, /\.water-round-number,[\s\S]*?\.water-round-row-number\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s);
});

test('every top-level water sheet has an explicit 44px accessible close action', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const labels = ['关闭记一局', '关闭单独记水', '关闭添加球友', '关闭加入打水', '关闭记录详情', '关闭往期'];

  labels.forEach((label) => assert.match(wxml, new RegExp(`class="[^"]*water-sheet-close[^"]*"[^>]*aria-label="${label}"`)));
  assert.match(wxml, /class="water-sheet-back"[^>]*aria-label="返回往期列表"/);
  assert.match(wxss, /\.water-sheet-close\s*\{[^}]*width:\s*44px[^}]*min-width:\s*44px[^}]*height:\s*44px[^}]*min-height:\s*44px/s);
});

test('direct water exposes inline validity and disables its CTA before a legal transfer exists', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const js = read('miniprogram/pages/water/index.js');
  const directStart = wxml.indexOf('show="{{directSheetOpen}}"');
  const directEnd = wxml.indexOf('show="{{manualSheetOpen}}"', directStart);
  const directSheet = wxml.slice(directStart, directEnd);

  assert.match(directSheet, /water-direct-preview \{\{directSelectionValid \? 'is-ready' : ''\}\}/);
  assert.match(directSheet, /class="water-direct-validation \{\{directSelectionValid \? 'is-ready' : ''\}\}"[^>]*role="status">\{\{directValidationMessage\}\}/);
  assert.match(directSheet, /disabled="\{\{!!sheetBlockedReason \|\| !directSelectionValid\}\}"/);
  assert.match(js, /directSelectionValid:\s*false/);
  assert.match(js, /function directSelectionState\(/);
  assert.match(wxss, /\.water-direct-preview\.is-ready\s*\{[^}]*border-left-color:\s*var\(--water-accent\)/s);
});

test('feed detail is a standalone semantic action with sibling edit controls', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const feedStart = wxml.indexOf('id="water-feed-{{item.id}}"');
  const feedEnd = wxml.indexOf('<view class="water-feed-tail">', feedStart);
  const feedItem = wxml.slice(feedStart, feedEnd);
  const detailStart = feedItem.indexOf('class="water-feed-open"');
  const detailButton = feedItem.slice(detailStart, feedItem.indexOf('</button>', detailStart) + 9);

  assert.match(feedItem, /class="water-feed-open"[^>]*data-root="\{\{item\.rootEntryId\}\}"[^>]*aria-label="\{\{item\.detailAriaLabel\}\}"[^>]*bindtap="openEntryDetail"/s);
  assert.doesNotMatch(feedItem, /class="water-feed-item[^>]*bindtap="openEntryDetail"/);
  assert.match(feedItem, /<\/button>[\s\S]*class="water-feed-actions"/);
  assert.match(feedItem, /class="water-feed-meta"[^>]*wx:if="\{\{item\.canEdit \|\| item\.canReverse\}\}"/);
  assert.doesNotMatch(detailButton, /water-feed-actions/);
});

test('roster keeps a long player name separate from the self badge', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxml, /class="water-player-name">\s*<text class="water-player-name-text">\{\{item\.name\}\}<\/text>\s*<text class="water-player-self" wx:if="\{\{item\.isSelf\}\}">我<\/text>\s*<\/view>/s);
  assert.match(wxss, /\.water-player-name\s*\{[^}]*display:\s*flex[^}]*min-width:\s*0[^}]*align-items:\s*center[^}]*gap:/s);
  assert.match(wxss, /\.water-player-name-text\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(wxss, /\.water-player-self\s*\{[^}]*flex:\s*0 0 auto/s);
});

test('direct add and join sheets each use one scroll body between fixed chrome', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');
  const popup = (show) => {
    const start = wxml.indexOf(`show="{{${show}}}"`);
    const popupStart = wxml.lastIndexOf('<van-popup', start);
    const nextPopup = wxml.indexOf('<van-popup', start);
    return wxml.slice(popupStart, nextPopup);
  };
  const sheets = [
    popup('directSheetOpen'),
    popup('manualSheetOpen'),
    popup('joinSheetOpen'),
  ];

  sheets.forEach((sheet) => {
    assert.match(sheet, /class="water-sheet water-form-sheet"/);
    assert.match(sheet, /class="water-form-sheet-header"[\s\S]*class="water-form-sheet-body"[\s\S]*class="water-form-sheet-footer"/);
    assert.equal((sheet.match(/\sscroll-y(?:\s|>)/g) || []).length, 0);
    assert.doesNotMatch(sheet, /<scroll-view[^>]*water-form-sheet-body/);
    const footerAt = sheet.indexOf('class="water-form-sheet-footer"');
    assert.match(sheet.slice(footerAt), /class="water-confirm-button"/);
  });
  assert.match(wxss, /\.water-form-sheet\s*\{[^}]*overflow:\s*hidden[^}]*padding:\s*0/s);
  assert.match(wxss, /\.water-form-sheet-header\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(wxss, /\.water-form-sheet-body\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto/s);
  assert.match(wxss, /\.water-form-sheet-footer\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.doesNotMatch(wxss, /\.water-form-sheet(?:-header|-body|-footer)?\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
});

test('a full roster add control has an explicit stable disabled treatment', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxss, /\.water-player-tool\[disabled\]\s*\{[^}]*border-color:\s*var\(--water-line\)\s*!important[^}]*color:\s*var\(--water-muted\)\s*!important[^}]*background:\s*#e4ece8\s*!important[^}]*opacity:\s*1/s);
});

test('water pickers and bulk-name inputs expose purpose and current state', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');

  assert.match(wxml, /<picker[^>]*value="\{\{gameUnitIndex\}\}"[^>]*aria-label="选择每人水数，当前 \{\{unitOptions\[gameUnitIndex\]\}\} 水"/);
  assert.match(wxml, /<picker[^>]*value="\{\{directFromIndex\}\}"[^>]*aria-label="选择请水方，当前 \{\{directChoices\[directFromIndex\]\.name\}\}"/);
  assert.match(wxml, /<picker[^>]*value="\{\{directToIndex\}\}"[^>]*aria-label="选择赢水方，当前 \{\{directChoices\[directToIndex\]\.name\}\}"/);
  assert.match(wxml, /<picker[^>]*value="\{\{directUnitIndex\}\}"[^>]*aria-label="选择水的数量，当前 \{\{unitOptions\[directUnitIndex\]\}\} 水"/);
  assert.match(wxml, /<picker[^>]*value="\{\{joinIndex\}\}"[^>]*aria-label="选择加入身份，当前 \{\{joinChoices\[joinIndex\]\.name\}\}"/);
  assert.match(wxml, /<textarea[^>]*value="\{\{manualNames\}\}"[^>]*aria-label="手动添加球友姓名，当前 \{\{manualNames \|\| '未输入'\}\}"/);
  assert.match(wxml, /<textarea[^>]*value="\{\{relayText\}\}"[^>]*aria-label="导入接龙文本，当前 \{\{relayText \|\| '未输入'\}\}"/);
});

test('secondary controls cover search emptiness, tab semantics and stable full-width history paging', () => {
  const wxml = read('miniprogram/pages/water/index.wxml');
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.match(wxml, /rosterSearchQuery && !rosterParticipants\.length[\s\S]*没有找到“\{\{rosterSearchQuery\}\}”/);
  assert.match(wxml, /class="[^"]*water-roster-search-empty[^"]*"[\s\S]*class="water-search-empty-clear"[^>]*bindtap="clearRosterSearch"[^>]*>清除搜索<\/button>/);
  assert.equal((wxml.match(/class="water-feed-filter[^>]*role="tab"/g) || []).length, 3);
  assert.match(wxml, /class="water-add-switch"[^>]*role="tablist"[^>]*aria-label="添加方式"/);
  assert.equal((wxml.match(/data-mode="(?:manual|relay)"[^>]*role="tab"[^>]*aria-selected=/g) || []).length, 2);
  assert.match(wxss, /\.water-history-more\s*\{[^}]*width:\s*100%[^}]*min-height:\s*44px/s);
  assert.match(wxss, /\.water-history-tail\s*\{[^}]*min-height:\s*44px[^}]*align-items:\s*center/s);
  assert.match(wxss, /\.water-search-empty-clear\s*\{[^}]*min-height:\s*44px/s);
});

test('water typography weights and component radii use the compact approved scale', () => {
  const wxss = read('miniprogram/pages/water/index.wxss');

  assert.doesNotMatch(wxss, /font-weight:\s*(?:650|660|680|720|740|760|780|790)/);
  assert.doesNotMatch(wxss, /border-radius:\s*(?:8|15|16|20|22)rpx/);
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
