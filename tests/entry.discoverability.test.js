const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  return fs.readFileSync(abs, 'utf8');
}

function count(text, pattern) {
  const m = text.match(pattern);
  return Array.isArray(m) ? m.length : 0;
}

test('mine page keeps a single settings entry', () => {
  const mine = read('miniprogram/pages/mine/index.wxml');
  assert.equal(count(mine, /bindtap="goSettings"/g), 1);
});

test('mine page promotes profile and settings into the service grid', () => {
  const mine = read('miniprogram/pages/mine/index.wxml');
  const mineCss = read('miniprogram/pages/mine/index.wxss');

  assert.equal(count(mine, /bindtap="goProfile"/g), 1);
  assert.equal(count(mine, /bindtap="goHome"/g), 0);
  assert.equal(count(mine, /bindtap="goMyTournaments"/g), 0);
  assert.equal(mine.includes('我的比赛'), false);
  assert.equal(count(mine, /bindtap="onFeedback"/g), 1);
  assert.equal(mine.includes('mine-action-row'), false);
  assert.match(mine, /class="service-btn" bindtap="goProfile"/);
  assert.match(mine, /class="service-btn" bindtap="goSettings"/);
  assert.match(mine, /class="service-btn" bindtap="onFeedback"/);
  assert.match(mineCss, /\.service-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
});

test('preferences page removes unimplemented theme mode controls', () => {
  const pref = read('miniprogram/pages/preferences/index.wxml');
  const prefJs = read('miniprogram/pages/preferences/index.js');

  assert.equal(pref.includes('bindtap="goProfile"'), false);
  assert.equal(pref.includes('bindtap="goFeedback"'), false);
  assert.equal(pref.includes('主题模式'), false);
  assert.equal(prefJs.includes('THEME_MODE_KEY'), false);
  assert.equal(prefJs.includes('themeMode:'), false);
  assert.equal(prefJs.includes('setThemeMode('), false);
});

test('home page collapses create fallback into the hero action', () => {
  const home = read('miniprogram/pages/home/index.wxml');
  assert.equal(count(home, /bindtap="goCreate"/g), 0);
  assert.equal(home.includes('bindtap="onHeroPrimaryTap"'), true);
  assert.equal(home.includes('btn-create'), false);
  assert.equal(home.includes('empty-link'), false);
});
