const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('schedule page hero uses a focused progress layout without adding a share CTA', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /class="hero"/);
  assert.match(wxml, /class="hero-progress-card"/);
  assert.match(wxml, /class="hero-actions-panel"/);
  assert.match(wxml, /\{\{heroMatchText\}\}/);
  assert.match(wxml, /\{\{heroPendingText\}\}/);
  assert.match(wxml, /\{\{heroProgressPercent >= 0\}\}/);
  assert.match(wxml, /bindtap="onHeroActionTap"/);
  assert.doesNotMatch(wxml, /class="hero-stats"/);
  assert.doesNotMatch(wxml, /class="hero-stat"/);
  assert.doesNotMatch(wxml, /open-type="share"/);
});
