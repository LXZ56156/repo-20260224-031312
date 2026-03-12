const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const navModel = require('../miniprogram/core/matchPrimaryNav');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('match primary nav model exposes the three stable first-level pages', () => {
  const items = navModel.getPrimaryNavItems('ranking', 't_1');
  assert.deepEqual(
    items.map((item) => ({ key: item.key, text: item.text, active: item.active })),
    [
      { key: 'match', text: '比赛', active: false },
      { key: 'ranking', text: '排名', active: true },
      { key: 'schedule', text: '对阵', active: false }
    ]
  );
  assert.equal(items[0].url, '/pages/lobby/index?tournamentId=t_1');
  assert.equal(items[2].url, '/pages/schedule/index?tournamentId=t_1');
});

test('match, ranking, and schedule pages all render the shared first-level nav', () => {
  const lobby = readPage('miniprogram/pages/lobby/index.wxml');
  const ranking = readPage('miniprogram/pages/ranking/index.wxml');
  const schedule = readPage('miniprogram/pages/schedule/index.wxml');

  for (const wxml of [lobby, ranking, schedule]) {
    assert.match(wxml, /match-primary-nav/);
    assert.match(wxml, /\{\{item\.text\}\}/);
    assert.match(wxml, /bindtap="onPrimaryNavTap"/);
  }
});
