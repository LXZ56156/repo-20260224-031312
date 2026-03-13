const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('schedule page hero binds live tournament summary metrics without adding a share CTA', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/schedule/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /class="hero"/);
  assert.match(wxml, /\{\{heroRoundText\}\}/);
  assert.match(wxml, /\{\{heroMatchText\}\}/);
  assert.match(wxml, /\{\{heroPendingText\}\}/);
  assert.match(wxml, /bindtap="onHeroActionTap"/);
  assert.doesNotMatch(wxml, /open-type="share"/);
});
