const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');

test('launch modes expose fixed rotation presets before generic modes', () => {
  const cards = flow.getLaunchModes();

  assert.deepEqual(cards.map((item) => item.name), [
    '6人转',
    '7人转',
    '8人转',
    '多人转',
    '小队转',
    '固搭循环赛'
  ]);
  assert.deepEqual(cards.slice(0, 3).map((item) => ({
    mode: item.mode,
    presetKey: item.presetKey
  })), [
    { mode: flow.MODE_MULTI_ROTATE, presetKey: 'rotation_6' },
    { mode: flow.MODE_MULTI_ROTATE, presetKey: 'rotation_7' },
    { mode: flow.MODE_MULTI_ROTATE, presetKey: 'rotation_8' }
  ]);
});

test('flow labels and rule lines prefer fixed rotation preset keys', () => {
  assert.equal(flow.getModeDisplayLabel(flow.MODE_MULTI_ROTATE, 'rotation_6'), '6人转');
  assert.equal(flow.getModeLabel(flow.MODE_MULTI_ROTATE, 'rotation_8'), '8人转');
  assert.equal(flow.getModeDisplayLabel(flow.MODE_MULTI_ROTATE, 'bad_key'), '多人转');
  assert.equal(flow.getSynchronizedTournamentName('周末比赛', flow.MODE_MULTI_ROTATE, 'rotation_6'), '6人转');
  assert.equal(flow.getSynchronizedTournamentName('周末比赛', flow.MODE_MULTI_ROTATE, 'rotation_8'), '8人转');
  assert.equal(flow.getSynchronizedTournamentName('周末比赛', flow.MODE_MULTI_ROTATE, 'custom'), '周末比赛');
  assert.equal(flow.getTournamentDisplayName({
    name: '周末比赛',
    mode: flow.MODE_MULTI_ROTATE,
    presetKey: 'rotation_7'
  }), '7人转');
  assert.match(flow.getModeRuleLines(flow.MODE_MULTI_ROTATE, 'rotation_7').join('\n'), /默认 11 场/);
  assert.match(flow.getModeRuleLines(flow.MODE_MULTI_ROTATE, 'rotation_7').join('\n'), /正好 7 人/);
});

test('pickNextAction selects join for draft users not joined', () => {
  const out = flow.pickNextAction({ status: 'draft', myJoined: false });
  assert.equal(out.key, 'join');
});

test('pickNextAction selects settings for draft admin without settings', () => {
  const out = flow.pickNextAction({
    status: 'draft',
    isAdmin: true,
    myJoined: true,
    checkPlayersOk: true,
    checkSettingsOk: false
  });
  assert.equal(out.key, 'settings');
});

test('pickNextAction selects start when draft checks pass', () => {
  const out = flow.pickNextAction({
    status: 'draft',
    isAdmin: true,
    myJoined: true,
    checkPlayersOk: true,
    checkSettingsOk: true
  });
  assert.equal(out.key, 'start');
});

test('pickNextAction selects quickImport when admin still lacks players', () => {
  const out = flow.pickNextAction({
    status: 'draft',
    isAdmin: true,
    myJoined: true,
    checkPlayersOk: false,
    checkSettingsOk: true
  });
  assert.equal(out.key, 'quickImport');
});

test('pickNextAction selects batch in running editable tournaments', () => {
  const out = flow.pickNextAction({
    status: 'running',
    canEditScore: true,
    hasPending: true
  });
  assert.equal(out.key, 'batch');
});

test('pickNextAction selects analytics for finished tournaments', () => {
  const out = flow.pickNextAction({ status: 'finished' });
  assert.equal(out.key, 'analytics');
});

test('pickNextAction falls back to schedule for non-editor running users', () => {
  const out = flow.pickNextAction({
    status: 'running',
    canEditScore: false,
    hasPending: true
  });
  assert.equal(out.key, 'schedule');
});
