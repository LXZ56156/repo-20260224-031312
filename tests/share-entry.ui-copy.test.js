const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('share-entry landing page puts primary CTA ahead of compact summary facts', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  const actionIndex = wxml.indexOf('class="card panel panel-soft share-decision"');
  const summaryIndex = wxml.indexOf('class="card panel share-info"');
  assert.notEqual(actionIndex, -1);
  assert.notEqual(summaryIndex, -1);
  assert.ok(actionIndex < summaryIndex);
  assert.match(wxml, /share-facts/);
  assert.match(wxml, /share-actions/);
  assert.match(wxml, /class="share-availability/);
  assert.match(wxml, /\{\{preview\.availabilityText\}\}/);
  assert.match(wxml, /bindtap="goSchedule"/);
  assert.match(wxml, /bindtap="goRanking"/);
  assert.match(wxml, /preview\.viewMode==='invalid-match'/);
  assert.match(wxml, /preview\.viewMode==='retryable-error'/);
});
