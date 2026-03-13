const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('settings page keeps advanced configuration in a dedicated context and recovery layout', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/settings/index.wxml'),
    'utf8'
  );

  assert.match(wxml, /class="hero"/);
  assert.match(wxml, /\{\{pageTitle\}\}/);
  assert.match(wxml, /class="card panel panel-soft context-panel"/);
  assert.match(wxml, /\{\{contextTitle\}\}/);
  assert.match(wxml, /id="section-params"/);
  assert.match(wxml, /bindtap="saveSettings"/);
  assert.match(wxml, /bindtap="goHome" wx:if="\{\{showLoadErrorHome\}\}"/);
});
