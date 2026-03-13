const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const draftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('only the match page keeps an explicit transfer button', () => {
  const wxml = readPage('miniprogram/pages/lobby/index.wxml');
  const scheduleWxml = readPage('miniprogram/pages/schedule/index.wxml');
  const analyticsWxml = readPage('miniprogram/pages/analytics/index.wxml');
  const shareIndex = wxml.indexOf('id="share-invite"');
  const importIndex = wxml.indexOf('id="quick-import"');
  assert.notEqual(shareIndex, -1);
  assert.notEqual(importIndex, -1);
  assert.ok(shareIndex < importIndex);
  assert.match(wxml, /open-type="share">\{\{shareButtonText\}\}<\/button>/);
  assert.doesNotMatch(scheduleWxml, /open-type="share"/);
  assert.doesNotMatch(analyticsWxml, /open-type="share"/);
});

test('lobby checklist routes player preparation to share invite area', () => {
  let focusShareCalled = 0;
  let focusImportCalled = 0;
  const ctx = {
    data: {
      checkSettingsOk: true,
      checkStartReady: false
    },
    focusQuickConfigArea() {},
    focusShareInviteArea() {
      focusShareCalled += 1;
    },
    focusQuickImportArea() {
      focusImportCalled += 1;
    },
    handleStart() {}
  };

  draftActions.onChecklistTap.call(ctx, {
    currentTarget: {
      dataset: { key: 'players' }
    }
  });

  assert.equal(focusShareCalled, 1);
  assert.equal(focusImportCalled, 0);
});
