const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('lobby draft exposes one primary share CTA', () => {
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
  assert.equal((statePanelWxml.match(/open-type="share"/g) || []).length, 1);
  assert.equal((statePanelWxml.match(/bindtouchstart="onShareButtonTouchStart"/g) || []).length, 1);
  assert.doesNotMatch(statePanelWxml, /state-checklist|prep-share-action/);
  assert.match(adminWxml, /id="quick-import"/);
  assert.doesNotMatch(scheduleWxml, /open-type="share"/);
  assert.doesNotMatch(analyticsWxml, /open-type="share"/);
});
