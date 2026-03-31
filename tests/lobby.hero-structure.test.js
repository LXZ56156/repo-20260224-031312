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
  const admin = readLobbyFile('lobby-admin-panel.wxml');

  assert.match(wxml, /<include src="\.\/lobby-hero\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-state-panel\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-join-sheet\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-player-grid\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-share-bar\.wxml"\/>/);
  assert.match(wxml, /<include src="\.\/lobby-admin-panel\.wxml"\/>/);
  assert.doesNotMatch(wxml, /<import /);
  assert.doesNotMatch(wxml, /<template is=/);
  assert.match(hero, /class="tag \{\{statusClass\}\} hero-status-tag"/);
  assert.equal((wxml.match(/bindtap="goEditTournament"/g) || []).length, 0);
  assert.equal((admin.match(/bindtap="goEditTournament"/g) || []).length, 1);
});

test('lobby share partial keeps a single shared invite bar contract', () => {
  const share = readLobbyFile('lobby-share-bar.wxml');

  assert.doesNotMatch(share, /<template name=/);
  assert.equal((share.match(/open-type="share"/g) || []).length, 1);
  assert.equal((share.match(/id="share-invite" class="share-bar\b/g) || []).length, 1);
});
