function trimText(value) {
  return String(value || '').trim();
}

const TAB_BAR_PATHS = {
  '/pages/home/index': true,
  '/pages/launch/index': true,
  '/pages/mine/index': true
};

function pathOfUrl(url) {
  return trimText(url).split('?')[0].split('#')[0];
}

function getTabBarTarget(url) {
  const path = pathOfUrl(url);
  return TAB_BAR_PATHS[path] ? path : '';
}

function buildUrl(path, query = {}) {
  const target = trimText(path);
  if (!target) return '';
  const entries = Object.entries(query && typeof query === 'object' ? query : {})
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
  if (!entries.length) return target;
  const queryString = entries
    .map(([key, value]) => `${encodeURIComponent(String(key))}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${target}${target.includes('?') ? '&' : '?'}${queryString}`;
}

function buildTournamentUrl(path, tournamentId, query = {}) {
  const tid = trimText(tournamentId);
  return buildUrl(path, {
    tournamentId: tid,
    ...(query && typeof query === 'object' ? query : {})
  });
}

function readApp() {
  try {
    return getApp();
  } catch (_) {
    return null;
  }
}

function readRefreshQueue(globalData) {
  const queue = globalData && Array.isArray(globalData.needRefreshTournamentQueue)
    ? globalData.needRefreshTournamentQueue
    : [];
  return queue.map((item) => trimText(item)).filter(Boolean);
}

function writeRefreshQueue(globalData, queue) {
  if (!globalData) return;
  const next = Array.isArray(queue) ? queue.map((item) => trimText(item)).filter(Boolean) : [];
  globalData.needRefreshTournamentQueue = next;
}

function consumeRefreshFlag(tournamentId) {
  const tid = trimText(tournamentId);
  if (!tid) return false;
  const app = readApp();
  if (!app || !app.globalData) return false;
  const queue = readRefreshQueue(app.globalData);
  const queueIndex = queue.indexOf(tid);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
    writeRefreshQueue(app.globalData, queue);
    if (trimText(app.globalData.needRefreshTournament) === tid) {
      app.globalData.needRefreshTournament = queue[0] || '';
    }
    return true;
  }
  const need = trimText(app.globalData.needRefreshTournament);
  if (!need || need !== tid) return false;
  app.globalData.needRefreshTournament = '';
  return true;
}

function markRefreshFlag(tournamentId) {
  const tid = trimText(tournamentId);
  if (!tid) return;
  const app = readApp();
  if (!app || !app.globalData) return;
  const queue = readRefreshQueue(app.globalData);
  if (!queue.includes(tid)) queue.push(tid);
  writeRefreshQueue(app.globalData, queue);
  app.globalData.needRefreshTournament = tid;
}

function setLobbyIntent(tournamentId, actionKey) {
  const tid = trimText(tournamentId);
  const action = trimText(actionKey);
  if (!tid || !action) return;
  const app = readApp();
  if (!app || !app.globalData) return;
  app.globalData.lobbyIntentTournamentId = tid;
  app.globalData.lobbyIntentAction = action;
}

function consumeLobbyIntent(tournamentId) {
  const tid = trimText(tournamentId);
  if (!tid) return '';
  const app = readApp();
  if (!app || !app.globalData) return '';
  const intentTid = trimText(app.globalData.lobbyIntentTournamentId);
  const intentAction = trimText(app.globalData.lobbyIntentAction);
  if (!intentTid || !intentAction || intentTid !== tid) return '';
  app.globalData.lobbyIntentTournamentId = '';
  app.globalData.lobbyIntentAction = '';
  return intentAction;
}

function setLaunchIntent(selection = {}) {
  const mode = trimText(selection.mode);
  const presetKey = trimText(selection.presetKey);
  if (!mode && !presetKey) return;
  const app = readApp();
  if (!app || !app.globalData) return;
  app.globalData.launchIntent = { mode, presetKey };
}

function consumeLaunchIntent() {
  const app = readApp();
  if (!app || !app.globalData) return null;
  const raw = app.globalData.launchIntent;
  app.globalData.launchIntent = null;
  if (!raw || typeof raw !== 'object') return null;
  const mode = trimText(raw.mode);
  const presetKey = trimText(raw.presetKey);
  return mode || presetKey ? { mode, presetKey } : null;
}

function navigateBackOrRedirect(url, delay = 0) {
  const target = trimText(url);
  if (!target) return;
  const run = () => {
    if (getTabBarTarget(target)) {
      switchTabUrl(target);
      return;
    }
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: target,
          fail: () => wx.navigateTo({ url: target })
        });
      }
    });
  };
  if (delay > 0) {
    setTimeout(run, delay);
    return;
  }
  run();
}

function redirectOrBack(url, delay = 0) {
  const target = trimText(url);
  if (!target) return;
  const run = () => {
    if (getTabBarTarget(target)) {
      switchTabUrl(target);
      return;
    }
    wx.redirectTo({
      url: target,
      fail: () => {
        wx.navigateBack({
          delta: 1,
          fail: () => wx.navigateTo({ url: target })
        });
      }
    });
  };
  if (delay > 0) {
    setTimeout(run, delay);
    return;
  }
  run();
}

function redirectOrNavigate(url, delay = 0) {
  const target = trimText(url);
  if (!target) return;
  const run = () => {
    if (getTabBarTarget(target)) {
      switchTabUrl(target);
      return;
    }
    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({
        url: target,
        fail: () => {
          if (typeof wx.navigateTo === 'function') wx.navigateTo({ url: target });
        }
      });
      return;
    }
    if (typeof wx.navigateTo === 'function') wx.navigateTo({ url: target });
  };
  if (delay > 0) {
    setTimeout(run, delay);
    return;
  }
  run();
}

function goHome() {
  switchTabUrl('/pages/home/index');
}

function navigateToUrl(url) {
  const target = trimText(url);
  if (!target) return;
  if (getTabBarTarget(target)) {
    switchTabUrl(target);
    return;
  }
  if (typeof wx.navigateTo !== 'function') return;
  wx.navigateTo({ url: target });
}

function switchTabUrl(url) {
  const target = trimText(url);
  if (!target) return;
  const tabTarget = getTabBarTarget(target);
  if (tabTarget) {
    if (typeof wx.switchTab === 'function') {
      wx.switchTab({
        url: tabTarget,
        fail: () => {
          if (typeof wx.reLaunch === 'function') wx.reLaunch({ url: tabTarget });
        }
      });
      return;
    }
    if (typeof wx.reLaunch === 'function') wx.reLaunch({ url: tabTarget });
    return;
  }
  if (typeof wx.switchTab === 'function') {
    wx.switchTab({
      url: target,
      fail: () => {
        if (typeof wx.reLaunch === 'function') {
          wx.reLaunch({
            url: target,
            fail: () => navigateToUrl(target)
          });
          return;
        }
        navigateToUrl(target);
      }
    });
    return;
  }
  if (typeof wx.reLaunch === 'function') {
    wx.reLaunch({
      url: target,
      fail: () => navigateToUrl(target)
    });
    return;
  }
  navigateToUrl(target);
}

function goLobby(tournamentId, query = {}) {
  navigateToUrl(buildTournamentUrl('/pages/lobby/index', tournamentId, query));
}

function goSchedule(tournamentId, query = {}) {
  navigateToUrl(buildTournamentUrl('/pages/schedule/index', tournamentId, query));
}

function goMatch(tournamentId, query = {}) {
  navigateToUrl(buildTournamentUrl('/pages/match/index', tournamentId, query));
}

function goRanking(tournamentId, query = {}) {
  navigateToUrl(buildTournamentUrl('/pages/ranking/index', tournamentId, query));
}

function goAnalytics(tournamentId, query = {}) {
  goRanking(tournamentId, query);
}

function goLaunch() {
  switchTabUrl('/pages/launch/index');
}

function goProfile(query = {}) {
  navigateToUrl(buildUrl('/pages/profile/index', query));
}

function goPreferences(query = {}) {
  navigateToUrl(buildUrl('/pages/preferences/index', query));
}

function goFeedback(query = {}) {
  navigateToUrl(buildUrl('/pages/feedback/index', query));
}

module.exports = {
  buildUrl,
  buildTournamentUrl,
  consumeRefreshFlag,
  markRefreshFlag,
  setLobbyIntent,
  consumeLobbyIntent,
  setLaunchIntent,
  consumeLaunchIntent,
  navigateBackOrRedirect,
  redirectOrBack,
  redirectOrNavigate,
  goHome,
  goLobby,
  goSchedule,
  goMatch,
  goRanking,
  goAnalytics,
  goLaunch,
  goProfile,
  goPreferences,
  goFeedback
};
