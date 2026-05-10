const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shareMeta = require('../miniprogram/core/shareMeta');

test('share-entry page uses user-facing labels instead of raw internal view mode keys', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /\{\{preview\.viewModeLabel\}\}/);
  assert.doesNotMatch(wxml, /\{\{preview\.viewMode\}\}/);
  assert.match(wxml, /\{\{preview\.primaryAction\.text\}\}/);
  assert.match(wxml, /\{\{preview\.availabilityText\}\}/);
  assert.match(wxml, /\{\{preview\.secondaryAction\.text\}\}/);
});

test('share-entry view model displays fixed rotation label and quota status', () => {
  const preview = shareMeta.buildShareEntryViewModel({
    tournament: {
      _id: 't_rotation_6',
      name: '周末自定义赛',
      status: 'draft',
      mode: 'multi_rotate',
      presetKey: 'rotation_6',
      playerLimit: 6,
      players: Array.from({ length: 5 }, (_, index) => ({
        id: `u_${index}`,
        name: `球友${index}`
      }))
    },
    openid: 'u_viewer'
  });

  assert.equal(preview.modeLabel, '6人转');
  assert.equal(preview.tournamentName, '6人转');
  assert.equal(preview.playersCountText, '已报名 5/6 人');
  assert.equal(preview.joinAllowed, true);
  assert.match(preview.availabilityText, /还剩 1 个名额/);

  const full = shareMeta.buildShareEntryViewModel({
    tournament: {
      _id: 't_rotation_6_full',
      name: '6人转练习',
      status: 'draft',
      mode: 'multi_rotate',
      presetKey: 'rotation_6',
      playerLimit: 6,
      players: Array.from({ length: 6 }, (_, index) => ({
        id: `u_${index}`,
        name: `球友${index}`
      }))
    },
    openid: 'u_viewer'
  });

  assert.equal(full.playersCountText, '已报名 6/6 人');
  assert.equal(full.joinAllowed, false);
  assert.equal(full.primaryAction.key, 'view');
  assert.match(full.availabilityText, /名额已满/);
});
