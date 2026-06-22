const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('share-entry landing page keeps state preview and one primary CTA', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /share-decision/);
  assert.match(wxml, /share-actions/);
  assert.match(wxml, /share-identity-status/);
  assert.doesNotMatch(wxml, /share-guidance|share-facts|share-info/);
  assert.match(wxml, /class="participant-avatar-img"/);
  assert.match(wxml, /binderror="onParticipantAvatarError"/);
  assert.equal((wxml.match(/class="btn btn-primary share-primary-btn"/g) || []).length, 1);
  assert.match(wxml, /class="share-error-actions"/);
  assert.match(wxml, /preview\.viewMode==='invalid-match'/);
  assert.match(wxml, /preview\.viewMode==='retryable-error'/);
});
