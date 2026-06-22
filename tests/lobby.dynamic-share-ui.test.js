const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readStatePanel() {
  return fs.readFileSync(path.join(__dirname, '../miniprogram/pages/lobby/lobby-state-panel.wxml'), 'utf8');
}

test('lobby keeps one primary share button gated until dynamic share resolves', () => {
  const wxml = readStatePanel();
  const disabledExpression = /disabled="\{\{dynamicSharePreparing \|\| \(!dynamicShareReady && !dynamicShareError && !dynamicShareUnavailableReason\)\}\}"/g;

  assert.equal((wxml.match(/open-type="share"/g) || []).length, 1);
  assert.equal((wxml.match(disabledExpression) || []).length, 1);
  assert.match(wxml, /dynamicSharePreparing/);
  assert.match(wxml, /dynamicShareReady/);
  assert.match(wxml, /dynamicShareError/);
  assert.match(wxml, /dynamicShareUnavailableReason/);
  assert.match(wxml, /\{\{primaryTaskTitle \|\| statePrimaryActionText\}\}/);
  assert.doesNotMatch(wxml, /普通分享|动态分享|准备中|正在准备分享/);
});
