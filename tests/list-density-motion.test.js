const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function getCssRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

test('shared list press feedback stays lightweight and non-looping', () => {
  const appWxss = read('miniprogram/app.wxss');
  const pressRule = getCssRuleBody(appWxss, '.list-card-press');
  const motionOffRevealRule = getCssRuleBody(appWxss, '.motion-off .reveal');
  const motionLightRevealRule = getCssRuleBody(appWxss, '.motion-light .reveal');

  assert.match(pressRule, /filter:\s*brightness\(0\.985\)/);
  assert.match(pressRule, /transform:\s*scale\(0\.992\)/);
  assert.doesNotMatch(pressRule, /animation:/);
  assert.match(motionOffRevealRule, /animation:\s*none !important/);
  assert.match(motionOffRevealRule, /opacity:\s*1/);
  assert.match(motionLightRevealRule, /animation-duration:\s*120ms/);
});

test('home tournament list uses reveal motion and compact list density', () => {
  const wxml = read('miniprogram/pages/home/index.wxml');
  const wxss = read('miniprogram/pages/home/index.wxss');
  const swipeRule = getCssRuleBody(wxss, '.swipe-row');
  const swipeCardRule = getCssRuleBody(wxss, '.swipe-row.card');
  const swipeActionsRule = getCssRuleBody(wxss, '.swipe-actions');
  const swipeActionsOpenRule = getCssRuleBody(wxss, '.swipe-actions.is-open');
  const swipeContentRule = getCssRuleBody(wxss, '.swipe-content');
  const tournamentCardRule = getCssRuleBody(wxss, '.t-card');
  const toolbarRule = getCssRuleBody(wxss, '.toolbar-row');
  const metaRowRule = getCssRuleBody(wxss, '.t-meta-row');
  const actionsRule = getCssRuleBody(wxss, '.t-actions');
  const comfortableCardRule = getCssRuleBody(wxss, '.home-page.density-comfortable .t-card,\n.home-page.density-comfortable .skeleton-card-wrap .skeleton-card');
  const skeletonWrapRule = getCssRuleBody(wxss, '.skeleton-card-wrap');
  const skeletonCardRule = getCssRuleBody(wxss, '.skeleton-card-wrap .skeleton-card');

  assert.match(wxml, /class="page home-page \{\{uiPreferenceClass\}\}"/);
  assert.match(wxml, /class="swipe-row card reveal"/);
  assert.match(wxml, /animation-delay:\s*\{\{index < 6 \? 60 \+ index \* 24 : 204\}\}ms/);
  assert.match(wxml, /hover-class="list-card-press"/);
  assert.match(wxml, /class="swipe-actions \{\{item\._offset < 0 \? 'is-open' : ''\}\}"/);
  assert.match(wxml, /class="t-meta-row"/);

  assert.match(toolbarRule, /padding:\s*var\(--space-tight\) var\(--space-panel-pad\)/);
  assert.match(swipeRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(swipeRule, /transition:\s*transform 100ms ease, filter 100ms ease/);
  assert.match(swipeCardRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(swipeActionsRule, /opacity:\s*0/);
  assert.match(swipeActionsRule, /pointer-events:\s*none/);
  assert.match(swipeActionsOpenRule, /opacity:\s*1/);
  assert.match(swipeActionsOpenRule, /pointer-events:\s*auto/);
  assert.match(swipeContentRule, /box-sizing:\s*border-box/);
  assert.match(swipeContentRule, /background:\s*linear-gradient\(180deg,\s*#FFFFFF 0%,\s*#F8FBF9 100%\)/);
  assert.match(tournamentCardRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
  assert.match(metaRowRule, /display:\s*flex/);
  assert.match(metaRowRule, /justify-content:\s*space-between/);
  assert.match(actionsRule, /max-width:\s*48%/);
  assert.match(actionsRule, /min-width:\s*0/);
  assert.doesNotMatch(actionsRule, /margin-top:/);
  assert.match(wxss, /\.t-copy-link,\n\.t-quick-action \{[\s\S]*box-sizing:\s*border-box/);
  assert.match(wxss, /\.t-copy-link,\n\.t-quick-action \{[\s\S]*overflow:\s*hidden/);
  assert.match(skeletonWrapRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(skeletonCardRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
  assert.match(comfortableCardRule, /padding:\s*var\(--space-card-pad-lg\)/);
});

test('schedule rounds reveal while match cards keep compact press feedback', () => {
  const wxml = read('miniprogram/pages/schedule/index.wxml');
  const wxss = read('miniprogram/pages/schedule/index.wxss');
  const roundRule = getCssRuleBody(wxss, '.round-card');
  const matchRule = getCssRuleBody(wxss, '.match-card');
  const footRule = getCssRuleBody(wxss, '.match-card-foot');
  const skeletonRule = getCssRuleBody(wxss, '.skeleton-match-block');
  const comfortableRoundRule = getCssRuleBody(wxss, '.schedule-page.density-comfortable .round-card');

  assert.match(wxml, /schedule-page \{\{uiPreferenceClass\}\}/);
  assert.match(wxml, /class="round-card panel reveal/);
  assert.match(wxml, /animation-delay:\s*\{\{index < 6 \? 60 \+ index \* 28 : 228\}\}ms/);
  assert.match(wxml, /class="match-card \{\{m\.isFirstPending/);
  assert.match(wxml, /hover-class="list-card-press"/);

  assert.match(roundRule, /padding:\s*var\(--space-card-pad\)/);
  assert.match(roundRule, /margin-top:\s*var\(--space-inline\)/);
  assert.match(roundRule, /transition:\s*transform 100ms ease, filter 100ms ease/);
  assert.match(matchRule, /padding:\s*var\(--space-panel-pad\)/);
  assert.match(matchRule, /margin-bottom:\s*var\(--space-tight\)/);
  assert.match(matchRule, /transition:\s*transform 100ms ease, filter 100ms ease/);
  assert.match(footRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(skeletonRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(comfortableRoundRule, /padding:\s*var\(--space-card-pad-lg\)/);
});

test('ranking content list uses reveal motion and compact ranking rows', () => {
  const wxml = read('miniprogram/pages/ranking/index.wxml');
  const wxss = read('miniprogram/pages/ranking/index.wxss');
  const cardRule = getCssRuleBody(wxss, '.ranking-card');
  const rowRule = getCssRuleBody(wxss, '.ranking-row');
  const leftRule = getCssRuleBody(wxss, '.ranking-left');
  const avatarRule = getCssRuleBody(wxss, '.ranking-avatar');
  const avatarImgRule = getCssRuleBody(wxss, '.ranking-avatar-img');
  const playerTitleRule = getCssRuleBody(wxss, '.player-title');
  const metricRule = getCssRuleBody(wxss, '.metric-title');
  const moreTriggerRule = getCssRuleBody(wxss, '.ranking-more-trigger');
  const skeletonRule = getCssRuleBody(wxss, '.ranking-skeleton-list .skeleton-card');
  const comfortableCardRule = getCssRuleBody(wxss, '.ranking-page.density-comfortable .ranking-card,\n.ranking-page.density-comfortable .ranking-skeleton-list .skeleton-card');

  assert.match(wxml, /ranking-page \{\{uiPreferenceClass\}\}/);
  assert.match(wxml, /class="hero reveal reveal-1"/);
  assert.match(wxml, /state-empty mt-md reveal reveal-2/);
  assert.match(wxml, /class="card panel ranking-card reveal/);
  assert.match(wxml, /animation-delay:\s*\{\{idx < 6 \? 60 \+ idx \* 24 : 204\}\}ms/);
  assert.match(wxml, /hover-class="list-card-press"/);

  assert.match(cardRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(cardRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
  assert.match(cardRule, /transition:\s*transform 100ms ease, filter 100ms ease/);
  assert.match(rowRule, /gap:\s*var\(--space-tight\)/);
  assert.match(leftRule, /gap:\s*var\(--space-tight\)/);
  assert.match(avatarRule, /width:\s*60rpx/);
  assert.match(avatarRule, /height:\s*60rpx/);
  assert.match(avatarImgRule, /width:\s*60rpx/);
  assert.match(playerTitleRule, /font-size:\s*28rpx/);
  assert.match(metricRule, /font-size:\s*26rpx/);
  assert.match(moreTriggerRule, /width:\s*144rpx\s*!important/);
  assert.match(moreTriggerRule, /padding:\s*0 16rpx/);
  assert.match(skeletonRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
  assert.match(comfortableCardRule, /padding:\s*var\(--space-card-pad-lg\)/);
});

test('lobby next action does not retain the legacy pulse treatment', () => {
  const wxml = read('miniprogram/pages/lobby/index.wxml');
  const statePanelWxml = read('miniprogram/pages/lobby/lobby-state-panel.wxml');
  const wxss = read('miniprogram/pages/lobby/index.wxss');
  const appWxss = read('miniprogram/app.wxss');

  assert.match(wxml, /lobby-page \{\{uiMotionClass\}\}/);
  assert.doesNotMatch(statePanelWxml, /start-pulse/);
  assert.doesNotMatch(wxss, /\.start-pulse/);
  assert.doesNotMatch(appWxss, /\.start-pulse/);
});

test('match score tools keep larger legacy controls with containment', () => {
  const wxss = read('miniprogram/pages/match/index.wxss');
  const toolbarRule = getCssRuleBody(wxss, '.score-toolbar');
  const toolRule = getCssRuleBody(wxss, '.score-tool');

  assert.match(toolbarRule, /display:\s*flex/);
  assert.match(toolbarRule, /flex-direction:\s*column/);
  assert.match(toolbarRule, /align-items:\s*stretch/);
  assert.match(toolRule, /height:\s*56rpx/);
  assert.match(toolRule, /font-size:\s*22rpx/);
  assert.match(toolRule, /overflow:\s*hidden/);
});

test('launch action row uses grouped alignment instead of full spread', () => {
  const wxss = read('miniprogram/pages/launch/index.wxss');
  const actionsRule = getCssRuleBody(wxss, '.launch-actions');
  const ruleLinkRule = getCssRuleBody(wxss, '.launch-rule-link');

  assert.match(actionsRule, /justify-content:\s*flex-end/);
  assert.doesNotMatch(actionsRule, /space-between/);
  assert.match(ruleLinkRule, /min-height:\s*64rpx/);
});

test('secondary pages use spacing tokens and share-entry clamps long title', () => {
  const settingsWxss = read('miniprogram/pages/settings/index.wxss');
  const profileWxss = read('miniprogram/pages/profile/index.wxss');
  const feedbackWxss = read('miniprogram/pages/feedback/index.wxss');
  const shareWxml = read('miniprogram/pages/share-entry/index.wxml');
  const shareWxss = read('miniprogram/pages/share-entry/index.wxss');

  assert.match(getCssRuleBody(settingsWxss, '.settings-page'), /padding-top:\s*var\(--space-page-y\)/);
  assert.match(getCssRuleBody(profileWxss, '.profile-page'), /gap:\s*var\(--space-section\)/);
  assert.match(getCssRuleBody(feedbackWxss, '.feedback-page'), /gap:\s*var\(--space-card-pad-lg\)/);
  assert.match(shareWxml, /class="share-title ellipsis"/);
  assert.match(getCssRuleBody(shareWxss, '.share-title'), /letter-spacing:\s*0/);
});
