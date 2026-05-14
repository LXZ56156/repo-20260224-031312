const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const draftActions = require('../miniprogram/pages/lobby/lobbyDraftActions');

test('lobby showJoin path keeps only one join CTA trigger', () => {
  const sheetWxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/lobby-join-sheet.wxml'),
    'utf8'
  );
  const indexWxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );
  const legacyMatches = sheetWxml.match(/bindtap="handleJoin"/g) || [];
  const submitProfileMatches = sheetWxml.match(/bindtap="submitProfile"/g) || [];
  assert.equal(legacyMatches.length, 0);
  assert.equal(submitProfileMatches.length, 1);
  assert.doesNotMatch(indexWxml, /lobby-action-layer/);
  assert.doesNotMatch(indexWxml, /bindtap="openJoinSheet"/);
  assert.doesNotMatch(indexWxml, /bindtap="enterJoinFromViewOnly"/);
});

test('lobby profile flow actions open the sheet instead of writing immediately', () => {
  let openSheetCalls = 0;
  let submitProfileCalls = 0;
  let handleJoinCalls = 0;
  let saveMyProfileCalls = 0;
  const ctx = {
    openJoinSheet() {
      openSheetCalls += 1;
    },
    submitProfile() {
      submitProfileCalls += 1;
    },
    handleJoin() {
      handleJoinCalls += 1;
    },
    saveMyProfile() {
      saveMyProfileCalls += 1;
    }
  };

  draftActions.runFlowAction.call(ctx, 'join');
  draftActions.runFlowAction.call(ctx, 'profile_join');
  draftActions.runFlowAction.call(ctx, 'profile_save');

  assert.equal(openSheetCalls, 3);
  assert.equal(submitProfileCalls, 0);
  assert.equal(handleJoinCalls, 0);
  assert.equal(saveMyProfileCalls, 0);
});
