const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('lobby, share-entry, and settings keep secondary actions scoped to recovery states', () => {
  const lobby = read('miniprogram/pages/lobby/index.wxml');
  const shareEntry = read('miniprogram/pages/share-entry/index.wxml');
  const settings = read('miniprogram/pages/settings/index.wxml');

  assert.doesNotMatch(lobby, /stateSecondaryActions/);
  assert.doesNotMatch(lobby, /bindtap="onStateSecondaryTap"/);
  assert.doesNotMatch(lobby, /bindtap="focusQuickImportArea"/);
  assert.doesNotMatch(lobby, /share-invite-meta/);
  assert.match(shareEntry, /preview\.viewMode==='invalid-match'/);
  assert.match(shareEntry, /preview\.viewMode==='retryable-error'/);
  assert.match(settings, /bindtap="goHome" wx:if="\{\{showLoadErrorHome\}\}"/);
});
