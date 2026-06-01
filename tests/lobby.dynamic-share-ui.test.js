const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readStatePanel() {
  return fs.readFileSync(path.join(__dirname, '../miniprogram/pages/lobby/lobby-state-panel.wxml'), 'utf8');
}

test('lobby share buttons stay gated until dynamic share resolves and expose fallback state', () => {
  const wxml = readStatePanel();
  const disabledExpression = /disabled="\{\{dynamicSharePreparing \|\| \(!dynamicShareReady && !dynamicShareError && !dynamicShareUnavailableReason\)\}\}"/g;

  assert.equal((wxml.match(/open-type="share"/g) || []).length, 3);
  assert.equal((wxml.match(disabledExpression) || []).length, 3);
  assert.match(wxml, /dynamicSharePreparing/);
  assert.match(wxml, /dynamicShareReady/);
  assert.match(wxml, /dynamicShareError/);
  assert.match(wxml, /dynamicShareUnavailableReason/);
  assert.match(wxml, /正在准备动态分享/);
  assert.match(wxml, /动态分享已准备好/);
  assert.match(wxml, /动态分享不可用，使用普通分享/);
  assert.match(wxml, /普通分享/);
});
