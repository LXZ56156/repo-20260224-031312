const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('home prioritizes status tabs and preserves all direct sorting/filtering actions', () => {
  const source = read('miniprogram/pages/home/index.wxml');
  assert.ok(source.indexOf('class="filter-row"') < source.indexOf('class="sort-row"'));
  assert.equal((source.match(/bindtap="onChangeFilterStatus"/g) || []).length, 4);
  assert.equal((source.match(/bindtap="onChangeSortMode"/g) || []).length, 3);
  assert.equal((source.match(/class="filter-count"/g) || []).length, 4);
  assert.match(source, /aria-selected="\{\{filterStatus==='running'\}\}"/);
  assert.doesNotMatch(source, /<text class="(?:sort|filter)-chip/);
});

test('home toolbar separates visual hierarchy without shrinking touch targets', () => {
  const source = read('miniprogram/pages/home/index.wxss');
  const rule = selector => source.match(new RegExp(`\\n\\.${selector}\\s*\\{([^}]+)`))[1];
  assert.match(rule('filter-row'), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  for (const selector of ['filter-chip', 'sort-chip']) {
    assert.match(rule(selector), /min-height:\s*44px/);
    assert.match(rule(selector), /justify-content:\s*center/);
    assert.doesNotMatch(rule(selector), /999rpx/);
  }
});
