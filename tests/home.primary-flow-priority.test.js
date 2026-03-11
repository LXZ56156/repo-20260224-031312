const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('home page keeps tournament list ahead of profile and onboarding nudges', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/home/index.wxml'),
    'utf8'
  );

  const listIndex = wxml.indexOf('我的赛事');
  const profileIndex = wxml.indexOf('先补资料');
  const onboardingIndex = wxml.indexOf('三步开赛');
  assert.notEqual(listIndex, -1);
  assert.notEqual(profileIndex, -1);
  assert.notEqual(onboardingIndex, -1);
  assert.ok(listIndex < profileIndex);
  assert.ok(listIndex < onboardingIndex);
  assert.match(wxml, /继续最近比赛/);
});
