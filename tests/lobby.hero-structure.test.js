const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readLobbyFile(name) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby', name),
    'utf8'
  );
}

test('lobby index includes split partials and keeps hero/admin sections in their own files', () => {
  const wxml = readLobbyFile('index.wxml');
  const hero = readLobbyFile('lobby-hero.wxml');
  const joinSheet = readLobbyFile('lobby-join-sheet.wxml');
  const admin = readLobbyFile('lobby-admin-panel.wxml');

  assert.match(wxml, /<include src="\.\/lobby-hero\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-state-panel\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-join-sheet\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-player-grid\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-admin-panel\.wxml"\/>/);
  assert.doesNotMatch(wxml, /lobby-share-bar/);
  assert.doesNotMatch(wxml, /<import /);
  assert.doesNotMatch(wxml, /<template is=/);
  assert.match(hero, /class="tag \{\{statusClass\}\} hero-status-tag"/);
  assert.match(admin, /class="quick-custom-match-head" catchtap="toggleQuickAdvancedMatchPicker"/);
  assert.match(admin, /class="btn btn-danger admin-cancel-btn" bindtap="cancelTournament"/);
  assert.match(admin, /class="btn-mini danger fixed-team-delete"[^>]*bindtap="deletePairTeam"/);
  assert.match(joinSheet, /class="icon-btn join-sheet-close" aria-label="关闭加入比赛" bindtap="closeJoinSheet"/);
  assert.doesNotMatch(admin, /class="quick-custom-match-title" catchtap=/);
  assert.doesNotMatch(admin, /class="quick-custom-match-action" catchtap=/);
  assert.equal((wxml.match(/bindtap="goEditTournament"/g) || []).length, 0);
  assert.equal((admin.match(/bindtap="goEditTournament"/g) || []).length, 0);
});

test('lobby join sheet exposes a visible 44px close action', () => {
  const wxss = readLobbyFile('index.wxss');

  assert.match(wxss, /\.join-sheet-close\s*\{[^}]*width:\s*44px\s*!important/);
  assert.match(wxss, /\.join-sheet-close\s*\{[^}]*height:\s*44px\s*!important/);
});

test('lobby index goes from state panel directly to sheet, roster and admin tools', () => {
  const wxml = readLobbyFile('index.wxml');
  const stateIndex = wxml.indexOf('<include src="./lobby-state-panel.wxml"/>');
  const sheetIndex = wxml.indexOf('<include src="./lobby-join-sheet.wxml"/>');
  const playerIndex = wxml.indexOf('<include src="./lobby-player-grid.wxml"/>');
  const adminIndex = wxml.indexOf('<include src="./lobby-admin-panel.wxml"/>');
  const infoIndex = wxml.indexOf('class="card panel panel-soft info-panel');

  assert.notEqual(stateIndex, -1);
  assert.notEqual(sheetIndex, -1);
  assert.notEqual(playerIndex, -1);
  assert.notEqual(adminIndex, -1);
  assert.notEqual(infoIndex, -1);
  assert.equal(wxml.indexOf('class="lobby-action-layer"'), -1);
  assert.ok(stateIndex < sheetIndex);
  assert.ok(sheetIndex < playerIndex);
  assert.ok(playerIndex < adminIndex);
  assert.ok(adminIndex < infoIndex);
});

test('lobby share entry point is the single primary state action', () => {
  const statePanel = readLobbyFile('lobby-state-panel.wxml');
  const wxss = readLobbyFile('index.wxss');

  assert.equal((statePanel.match(/open-type="share"/g) || []).length, 1);
  assert.doesNotMatch(statePanel, /state-checklist/);
  assert.doesNotMatch(statePanel, /state-actions-sticky/);
  assert.doesNotMatch(wxss, /\.state-actions-sticky\s*\{/);
  assert.match(wxss, /\.state-primary-btn\s*\{[^}]*background:\s*var\(--brand-700\)\s*!important/);
  assert.match(wxss, /\.profile-actions-center \.profile-quick-btn\s*\{[^}]*background:\s*var\(--brand-700\)/);
  assert.match(wxss, /\.growth-guide-head \.muted\s*\{[^}]*color:\s*var\(--neutral-700\)/);
  assert.equal((statePanel.match(/id="share-invite"/g) || []).length, 0);
  assert.equal((statePanel.match(/class="share-bar\b/g) || []).length, 0);
});
