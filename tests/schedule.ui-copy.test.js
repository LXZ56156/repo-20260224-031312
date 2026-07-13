const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getCssRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

test('schedule page hero uses a focused progress layout without adding a share CTA', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /class="hero"/);
  assert.match(wxml, /class="hero-progress-card"/);
  assert.match(wxml, /class="hero-actions-panel"/);
  assert.match(wxml, /class="match-card-head"/);
  assert.match(wxml, /class="match-card-result" wx:if="\{\{!m\.showScore\}\}"/);
  assert.match(wxml, /class="match-center \{\{m\.showScore \? 'match-center-score' : ''\}\}"/);
  assert.match(wxml, /class="match-score-row match-score-row-center" wx:if="\{\{m\.showScore\}\}"/);
  assert.match(wxml, /class="match-team-name-line"/);
  assert.doesNotMatch(wxml, /match-team-name-line ellipsis|match-side-rail/);
  assert.match(wxml, /class="match-card [^"]*"[^>]*bindtap="openMatch"/);
  assert.match(wxml, /class="match-avatar [^"]*"[^>]*catchtap="onMatchPlayerAvatarTap"/);
  assert.match(wxml, /\{\{heroMatchText\}\}/);
  assert.match(wxml, /\{\{heroPendingText\}\}/);
  assert.match(wxml, /\{\{heroProgressPercent >= 0\}\}/);
  assert.match(wxml, /bindtap="onHeroActionTap"/);
  assert.doesNotMatch(wxml, /class="hero-stats"/);
  assert.doesNotMatch(wxml, /class="hero-stat"/);
  assert.doesNotMatch(wxml, /open-type="share"/);
  assert.match(wxml, /<block wx:if="\{\{tournament\}\}">/);
});

test('schedule page keeps long team names centered and bounded to two lines', () => {
  const wxss = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxss'),
    'utf8'
  );
  const nameLineRule = getCssRuleBody(wxss, '.match-team-name-line');

  assert.match(nameLineRule, /width:\s*100%/);
  assert.match(nameLineRule, /text-align:\s*center/);
  assert.match(nameLineRule, /white-space:\s*normal/);
  assert.match(nameLineRule, /-webkit-line-clamp:\s*2/);
  assert.match(nameLineRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(wxss, /\.match-side-rail\s*\{[^}]*width:\s*132rpx/s);
});
