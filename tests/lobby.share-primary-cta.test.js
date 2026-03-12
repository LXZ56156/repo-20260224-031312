const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const draftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

test('lobby draft UI keeps share invite ahead of admin import area without extra share shortcuts', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );
  const shareIndex = wxml.indexOf('id="share-invite"');
  const importIndex = wxml.indexOf('备用：导入名单');
  assert.notEqual(shareIndex, -1);
  assert.notEqual(importIndex, -1);
  assert.ok(shareIndex < importIndex);
  assert.match(wxml, /open-type="share">\{\{shareButtonText\}\}<\/button>/);
  assert.doesNotMatch(wxml, /bindtap="focusQuickImportArea"/);
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
