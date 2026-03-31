const test = require('node:test');
const assert = require('node:assert/strict');

const nav = require('../miniprogram/core/nav');

test('nav target helpers route to the expected pages', () => {
  const originalWx = global.wx;
  const calls = [];

  global.wx = {
    navigateTo(options = {}) {
      calls.push({ type: 'navigateTo', url: String(options.url || '') });
    },
    switchTab(options = {}) {
      calls.push({ type: 'switchTab', url: String(options.url || '') });
    }
  };

  try {
    nav.goLobby('t_lobby', { entry: 'view_only' });
    nav.goSchedule('t_schedule', { filter: 'pending' });
    nav.goMatch('t_match', { roundIndex: 1, matchIndex: 2, batch: 1 });
    nav.goRanking('t_rank');
    nav.goAnalytics('t_analytics');
    nav.goLaunch();
    nav.goProfile({ redirect: '/pages/home/index' });
    nav.goPreferences();
    nav.goFeedback();

    assert.deepEqual(calls, [
      { type: 'navigateTo', url: '/pages/lobby/index?tournamentId=t_lobby&entry=view_only' },
      { type: 'navigateTo', url: '/pages/schedule/index?tournamentId=t_schedule&filter=pending' },
      { type: 'navigateTo', url: '/pages/match/index?tournamentId=t_match&roundIndex=1&matchIndex=2&batch=1' },
      { type: 'navigateTo', url: '/pages/ranking/index?tournamentId=t_rank' },
      { type: 'navigateTo', url: '/pages/analytics/index?tournamentId=t_analytics' },
      { type: 'switchTab', url: '/pages/launch/index' },
      { type: 'navigateTo', url: '/pages/profile/index?redirect=%2Fpages%2Fhome%2Findex' },
      { type: 'navigateTo', url: '/pages/preferences/index' },
      { type: 'navigateTo', url: '/pages/feedback/index' }
    ]);
  } finally {
    global.wx = originalWx;
  }
});
