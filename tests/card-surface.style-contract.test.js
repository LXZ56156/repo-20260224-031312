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
  const analyticsWxss = read('miniprogram/pages/analytics/index.wxss');
  const mineWxss = read('miniprogram/pages/mine/index.wxss');

  assert.match(homeWxss, /\.hero-card\s*\{[\s\S]*linear-gradient\(180deg,/);
  assert.match(homeWxss, /\.hero-task-strip\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.88\);/);

  assert.match(lobbyWxss, /\.hero-context\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(249, 255, 252, 0\.94\)/);
  assert.match(lobbyWxss, /\.hero-stat\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(255, 255, 255, 0\.96\)/);
  assert.match(lobbyWxss, /\.state-overview\s*\{[\s\S]*rgba\(240, 252, 245, 0\.99\)/);
  assert.doesNotMatch(lobbyWxss, /\.kpi-chip\s*\{/);
  assert.doesNotMatch(lobbyWxss, /linear-gradient\(135deg, #475569 0%, #64748b 55%, #7d8fa3 100%\)/);

  assert.match(analyticsWxss, /\.analytics-hero-headline\s*\{[\s\S]*color:\s*var\(--neutral-950\);/);
  assert.match(analyticsWxss, /\.analytics-hero-stat\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.88\);/);

  assert.match(mineWxss, /\.mine-nickname\s*\{[\s\S]*color:\s*var\(--neutral-950\);/);
  assert.match(mineWxss, /\.mine-hero\s*\{[\s\S]*linear-gradient\(180deg,/);
});
