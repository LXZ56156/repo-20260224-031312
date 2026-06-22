const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shareMeta = require('../miniprogram/core/shareMeta');

test('share-entry page keeps one state-driven action without guidance or duplicate facts', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/share-entry/index.wxml'),
    'utf8'
  );
  assert.match(wxml, /\{\{preview\.primaryAction\.text\}\}/);
  assert.equal((wxml.match(/class="btn btn-primary share-primary-btn"/g) || []).length, 1);
  assert.doesNotMatch(wxml, /现在可以做什么|操作提示|比赛摘要/);
  assert.doesNotMatch(wxml, /preview\.availabilityText|preview\.organizerName|preview\.timeText|preview\.venueText/);
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
  assert.equal(preview.secondaryAction, null);

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
  assert.equal(full.secondaryAction, null);
});
