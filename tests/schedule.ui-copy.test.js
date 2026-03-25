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
  assert.match(wxml, /class="match-team-name-line ellipsis"/);
  assert.match(wxml, /\{\{heroMatchText\}\}/);
  assert.match(wxml, /\{\{heroPendingText\}\}/);
  assert.match(wxml, /\{\{heroProgressPercent >= 0\}\}/);
  assert.match(wxml, /bindtap="onHeroActionTap"/);
  assert.doesNotMatch(wxml, /class="hero-stats"/);
  assert.doesNotMatch(wxml, /class="hero-stat"/);
  assert.doesNotMatch(wxml, /open-type="share"/);
  assert.match(wxml, /<block wx:if="\{\{tournament\}\}">/);
});

test('schedule page keeps team member names on one centered line beneath each avatar group', () => {
  const wxss = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxss'),
    'utf8'
  );
  const nameLineRule = getCssRuleBody(wxss, '.match-team-name-line');

  assert.match(nameLineRule, /width:\s*100%/);
  assert.match(nameLineRule, /text-align:\s*center/);
  assert.match(nameLineRule, /white-space:\s*nowrap/);
});
