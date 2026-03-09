const tournamentSync = require('../../core/tournamentSync');

function buildLoadErrorState(result) {
  let loadErrorTitle = '加载失败';
  let loadErrorMessage = '请检查网络后重试。';
  let showLoadErrorHome = false;
  if (result && result.errorType === 'not_found') {
    loadErrorTitle = '比赛不存在或已关闭';
    loadErrorMessage = '分享链接可能已失效，或比赛已被删除。';
    showLoadErrorHome = true;
  } else if (result && result.errorType === 'param') {
    loadErrorTitle = '链接无效';
    loadErrorMessage = '请确认比赛链接是否完整。';
    showLoadErrorHome = true;
  }
  return {
    loadError: true,
    showStaleSyncHint: false,
    loadErrorTitle,
    loadErrorMessage,
    showLoadErrorHome
  };
}

module.exports = {
  nextFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
    return this._fetchSeq;
  },

  isLatestFetchSeq(requestSeq) {
    return Number(requestSeq) === Number(this._fetchSeq || 0);
  },

  invalidateFetchSeq() {
    this._fetchSeq = Number(this._fetchSeq || 0) + 1;
  },

  nextWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
    return this._watchGen;
  },

  isActiveWatchGen(watchGen) {
    return Number(watchGen) === Number(this._watchGen || 0);
  },

  invalidateWatchGen() {
    this._watchGen = Number(this._watchGen || 0) + 1;
  },

  startWatch(tid) {
    const watchGen = this.nextWatchGen();
    tournamentSync.startWatch(this, tid, (doc) => {
      if (!this.isActiveWatchGen(watchGen)) return;
      this.setData({ showStaleSyncHint: false });
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const requestSeq = this.nextFetchSeq();
    const result = await tournamentSync.fetchTournament(tid);
    if (!this.isLatestFetchSeq(requestSeq)) return null;
    if (result && result.ok && result.doc) {
      this.setData({
        showStaleSyncHint: false,
        loadErrorTitle: '加载失败',
        loadErrorMessage: '请检查网络后重试。',
        showLoadErrorHome: false
      });
      this.applyTournament(result.doc);
      return result.doc;
    }
    if (result && result.cachedDoc) {
      this.setData({ showStaleSyncHint: true, loadError: false });
      this.applyTournament(result.cachedDoc);
      return result.cachedDoc;
    }
    this.setData(buildLoadErrorState(result));
    return null;
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  }
};
