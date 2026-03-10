const pageTournamentSync = require('../../core/pageTournamentSync');

module.exports = pageTournamentSync.createTournamentSyncMethods({
  loadErrorMessages: {
    notFoundMessage: '分享链接可能已失效，或比赛已被删除。'
  },
  buildRemoteState() {
    return {
      loadError: false,
      showStaleSyncHint: false,
      loadErrorTitle: '加载失败',
      loadErrorMessage: '请检查网络后重试。',
      showLoadErrorHome: false
    };
  }
});
