const test = require('node:test');
const assert = require('node:assert/strict');

const { cases } = require('../scripts/dev/weapp-ui-screenshot');

test('real UI screenshot matrix covers every required simplified flow state', () => {
  assert.deepEqual(Object.keys(cases), [
    'launch',
    'launchCreating',
    'createCompat',
    'lobbyEmpty',
    'lobbyWaiting',
    'lobbyReady',
    'scheduleRunning',
    'matchIdle',
    'matchEditing',
    'rankingRunning',
    'rankingFinished',
    'home',
    'shareDraft',
    'shareRunning',
    'shareFinished'
  ]);

  for (const [name, item] of Object.entries(cases)) {
    assert.ok(String(item.path || '').startsWith('/pages/'), `${name} needs a real page route`);
    assert.ok(Array.isArray(item.selectors) && item.selectors.length > 0, `${name} needs rendered selectors`);
    assert.ok(item.data && typeof item.data === 'object', `${name} needs a stable runtime fixture`);
  }
});
