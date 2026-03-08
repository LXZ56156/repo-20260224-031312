function trimText(value) {
  return String(value || '').trim();
}

function readApp() {
  try {
    return getApp();
  } catch (_) {
    return null;
  }
}

function consumeRefreshFlag(tournamentId) {
  const tid = trimText(tournamentId);
  if (!tid) return false;
  const app = readApp();
  if (!app || !app.globalData) return false;
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

function navigateBackOrRedirect(url, delay = 0) {
  const target = trimText(url);
  if (!target) return;
  const run = () => {
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

module.exports = {
  consumeRefreshFlag,
  markRefreshFlag,
  setLobbyIntent,
  consumeLobbyIntent,
  navigateBackOrRedirect,
  redirectOrBack
};
