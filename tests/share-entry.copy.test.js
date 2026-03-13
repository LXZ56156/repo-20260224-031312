const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('share-entry page uses user-facing labels instead of raw internal view mode keys', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /\{\{preview\.viewModeLabel\}\}/);
  assert.doesNotMatch(wxml, /\{\{preview\.viewMode\}\}/);
  assert.match(wxml, /\{\{preview\.primaryAction\.text\}\}/);
  assert.match(wxml, /\{\{preview\.availabilityText\}\}/);
  assert.match(wxml, /\{\{preview\.secondaryAction\.text\}\}/);
});
