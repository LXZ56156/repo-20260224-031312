const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');

test('pickNextAction selects join for draft users not joined', () => {
  const out = flow.pickNextAction({ status: 'draft', myJoined: false });
  assert.equal(out.key, 'join');
});

test('pickNextAction selects settings for draft admin without settings', () => {
  const out = flow.pickNextAction({
    status: 'draft',
    isAdmin: true,
    myJoined: true,
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
