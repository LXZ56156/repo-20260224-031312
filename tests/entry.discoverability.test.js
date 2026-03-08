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

test('preferences page no longer duplicates profile/feedback entry buttons', () => {
  const pref = read('miniprogram/pages/preferences/index.wxml');
  assert.equal(pref.includes('bindtap="goProfile"'), false);
  assert.equal(pref.includes('bindtap="goFeedback"'), false);
});

test('home page has only one fallback create entry and no hero create button', () => {
  const home = read('miniprogram/pages/home/index.wxml');
  assert.equal(count(home, /bindtap="goCreate"/g), 1);
  assert.equal(home.includes('btn-create'), false);
});
