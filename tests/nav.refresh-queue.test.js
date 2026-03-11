const test = require('node:test');
const assert = require('node:assert/strict');

const nav = require('../miniprogram/core/nav');

test('nav refresh flags support multiple tournament ids without overwriting older ones', () => {
  const originalGetApp = global.getApp;
  const app = {
    globalData: {
      needRefreshTournament: '',
      needRefreshTournamentQueue: []
    }
  };

  global.getApp = () => app;

  try {
    nav.markRefreshFlag('t_1');
    nav.markRefreshFlag('t_2');

    assert.deepEqual(app.globalData.needRefreshTournamentQueue, ['t_1', 't_2']);
    assert.equal(nav.consumeRefreshFlag('t_1'), true);
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, ['t_2']);
    assert.equal(nav.consumeRefreshFlag('t_2'), true);
    assert.deepEqual(app.globalData.needRefreshTournamentQueue, []);
  } finally {
    global.getApp = originalGetApp;
  }
});
