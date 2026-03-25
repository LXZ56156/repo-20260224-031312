const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lobby hero uses shared status tag and keeps edit entry only in admin panel', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );

  const editMatches = wxml.match(/bindtap="goEditTournament"/g) || [];

  assert.equal(editMatches.length, 1);
  assert.match(wxml, /class="tag \{\{statusClass\}\} hero-status-tag"/);
  assert.match(wxml, /class="hero-stats"/);
  assert.doesNotMatch(wxml, /kpi-settings/);
});
