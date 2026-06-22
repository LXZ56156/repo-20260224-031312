const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('shared card system uses fresh surface tokens instead of the old dark hero base', () => {
  const appWxss = read('miniprogram/app.wxss');

  assert.match(appWxss, /--surface-hero:/);
  assert.match(appWxss, /--surface-card:/);
  assert.match(appWxss, /\.hero\s*\{[\s\S]*color:\s*var\(--neutral-950\);/);
  assert.match(appWxss, /\.card\s*\{[\s\S]*linear-gradient\(180deg,/);
  assert.match(appWxss, /\.panel-soft\s*\{[\s\S]*linear-gradient\(180deg,/);
});

test('representative page cards align to the fresh surface card language', () => {
  const homeWxss = read('miniprogram/pages/home/index.wxss');
  const lobbyWxss = read('miniprogram/pages/lobby/index.wxss');
  const rankingWxss = read('miniprogram/pages/ranking/index.wxss');
  const mineWxss = read('miniprogram/pages/mine/index.wxss');

  assert.match(homeWxss, /\.hero-card\s*\{[\s\S]*background:\s*var\(--surface-card\);/);
  assert.match(homeWxss, /\.hero-task-strip\s*\{[\s\S]*border-top:\s*1rpx solid var\(--neutral-200\);/);
  assert.doesNotMatch(homeWxss, /\.hero-task-strip\s*\{[^}]*box-shadow:/);

  assert.match(lobbyWxss, /\.lobby-page \.hero\s*\{[\s\S]*background:\s*var\(--surface-card\);/);
  assert.match(lobbyWxss, /\.lobby-next\s*\{[\s\S]*border-top:\s*1rpx solid var\(--neutral-200\);/);
  assert.doesNotMatch(lobbyWxss, /\.kpi-chip\s*\{/);
  assert.doesNotMatch(lobbyWxss, /linear-gradient\(135deg, #475569 0%, #64748b 55%, #7d8fa3 100%\)/);

  assert.match(rankingWxss, /\.ranking-card-1st\s*\{[\s\S]*background:\s*linear-gradient\(180deg,/);
  assert.match(rankingWxss, /\.ranking-more-menu\s*\{[\s\S]*border-top:\s*1rpx solid var\(--neutral-200\);/);

  assert.match(mineWxss, /\.mine-nickname\s*\{[\s\S]*color:\s*var\(--neutral-950\);/);
  assert.match(mineWxss, /\.mine-hero\s*\{[\s\S]*linear-gradient\(180deg,/);
});
