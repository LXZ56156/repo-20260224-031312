const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'miniprogram', file), 'utf8');
const rule = (source, selector) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, name]) => name.trim() === selector).map(([, , body]) => body).join('\n');

test('choice surfaces are neutral until selected and retain accessible touch height', () => {
  const chip = rule(read('app.wxss'), '.chip');
  assert.match(chip, /min-height:\s*44px/);
  assert.match(chip, /border-radius:\s*16rpx/);
  assert.match(chip, /background:\s*var\(--neutral-50\)/);
  const shortcut = rule(read('pages/match/index.wxss'), '.quick-score-chip');
  assert.match(shortcut, /min-height:\s*44px/);
  assert.match(shortcut, /border-radius:\s*16rpx/);
  assert.match(shortcut, /background:\s*var\(--neutral-50\)/);
});

test('preference and squad selections have equal-width groups and a visible selected mark', () => {
  const preferences = read('pages/preferences/index.wxml');
  assert.equal((preferences.match(/class="selection-check"/g) || []).length, 8);
  assert.match(rule(read('pages/preferences/index.wxss'), '.pref-page .chip'), /flex:\s*1 1 0/);
  for (const [markup, stylesheet] of [
    ['pages/lobby/lobby-join-sheet.wxml', 'pages/lobby/index.wxss'],
    ['pages/share-entry/index.wxml', 'pages/share-entry/index.wxss']
  ]) {
    const source = read(markup);
    assert.equal((source.match(/class="selection-check"/g) || []).length, 2);
    assert.match(source, /wx:if="\{\{joinSquadChoice==='A'\s*\}\}"/);
    assert.match(source, /wx:if="\{\{joinSquadChoice==='B'\s*\}\}"/);
    assert.match(rule(read(stylesheet), '.squad-chooser .chip'), /flex:\s*1 1 0/);
  }
});

test('match-count shortcuts reserve a separate selected mark without changing the label', () => {
  for (const [file, condition] of [
    ['pages/settings/index.wxml', 'editM===item.value'],
    ['pages/lobby/lobby-admin-panel.wxml', 'quickConfigM===item.value']
  ]) {
    const source = read(file);
    assert.ok(source.includes('class="selection-check" wx:if="{{' + condition + '}}"'));
    assert.match(source, /<text class="shortcut-label">\{\{item.label\}\}<\/text>/);
  }
});
