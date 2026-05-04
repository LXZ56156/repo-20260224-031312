const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function getCssRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

test('shared list press feedback stays lightweight and non-looping', () => {
  const appWxss = read('miniprogram/app.wxss');
  const pressRule = getCssRuleBody(appWxss, '.list-card-press');

  assert.match(pressRule, /filter:\s*brightness\(0\.985\)/);
  assert.match(pressRule, /transform:\s*scale\(0\.992\)/);
  assert.doesNotMatch(pressRule, /animation:/);
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
  const skeletonWrapRule = getCssRuleBody(wxss, '.skeleton-card-wrap');
  const skeletonCardRule = getCssRuleBody(wxss, '.skeleton-card-wrap .skeleton-card');

  assert.match(wxml, /class="swipe-row card reveal"/);
  assert.match(wxml, /animation-delay:\s*\{\{index < 6 \? 60 \+ index \* 24 : 204\}\}ms/);
  assert.match(wxml, /hover-class="list-card-press"/);
  assert.match(wxml, /class="swipe-actions \{\{item\._offset < 0 \? 'is-open' : ''\}\}"/);

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
  assert.match(skeletonWrapRule, /margin-top:\s*var\(--space-tight\)/);
  assert.match(skeletonCardRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
});

test('schedule rounds reveal while match cards keep compact press feedback', () => {
  const wxml = read('miniprogram/pages/schedule/index.wxml');
  const wxss = read('miniprogram/pages/schedule/index.wxss');
  const roundRule = getCssRuleBody(wxss, '.round-card');
  const matchRule = getCssRuleBody(wxss, '.match-card');
  const footRule = getCssRuleBody(wxss, '.match-card-foot');
  const skeletonRule = getCssRuleBody(wxss, '.skeleton-match-block');

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
  const skeletonRule = getCssRuleBody(wxss, '.ranking-skeleton-list .skeleton-card');

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
  assert.match(skeletonRule, /padding:\s*var\(--space-panel-pad\) var\(--space-card-pad\)/);
});
