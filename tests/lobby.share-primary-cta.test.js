const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const draftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('lobby draft share CTAs open the native share panel directly', () => {
  const indexWxml = readPage('miniprogram/pages/lobby/index.wxml');
  const statePanelWxml = readPage('miniprogram/pages/lobby/lobby-state-panel.wxml');
  const adminWxml = readPage('miniprogram/pages/lobby/lobby-admin-panel.wxml');
  const scheduleWxml = readPage('miniprogram/pages/schedule/index.wxml');
  const analyticsWxml = readPage('miniprogram/pages/analytics/index.wxml');
  const importIndex = indexWxml.indexOf('<include src="./lobby-admin-panel.wxml"');
  assert.notEqual(importIndex, -1);
  assert.doesNotMatch(indexWxml, /lobby-share-bar/);
  assert.match(statePanelWxml, /primaryTaskKey==='share' && primaryTaskTitle==='转发比赛'/);
  assert.match(statePanelWxml, /class="btn btn-primary state-primary-btn"[\s\S]*open-type="share"[\s\S]*\{\{primaryTaskTitle \|\| statePrimaryActionText\}\}<\/button>/);
  assert.match(statePanelWxml, /featuredChecklistItem\.key==='players' && !featuredChecklistItem\.done/);
  assert.match(statePanelWxml, /item\.key==='players' && !item\.done/);
  assert.match(adminWxml, /id="quick-import"/);
  assert.doesNotMatch(scheduleWxml, /open-type="share"/);
  assert.doesNotMatch(analyticsWxml, /open-type="share"/);
});

test('lobby checklist routes completed player preparation to the roster instead of a share bar', () => {
  let focusRosterCalled = 0;
  let focusImportCalled = 0;
  const ctx = {
    data: {
      checkSettingsOk: true,
      checkStartReady: false,
      checkPlayersOk: true
    },
    focusQuickConfigArea() {},
    focusPlayerRosterArea() {
      focusRosterCalled += 1;
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

  assert.equal(focusRosterCalled, 1);
  assert.equal(focusImportCalled, 0);
});
