const normalize = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');

function normalizeRankings(t) {
  const players = (t.players || []).reduce((m, p) => {
    m[p.id] = p.name;
    return m;
  }, {});

  const list = Array.isArray(t.rankings) ? t.rankings : [];
  const norm = list.map((r, idx) => {
    const pid = String(r.playerId || r.id || '').trim();
    const stableId = pid || `legacy_${idx}`;
    return {
      playerId: stableId,
      rankKey: stableId,
      name: players[pid] || r.name || '未知',
      wins: r.wins || 0,
      losses: r.losses || 0,
      played: r.played || 0,
      pointsFor: r.pointsFor || 0,
      pointsAgainst: r.pointsAgainst || 0,
      pointDiff: r.pointDiff || 0
    };
  });

  norm.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsFor - a.pointsFor;
  });
  return norm;
}

Page({
  data: {
    tournamentId: '',
    tournament: null,
    rankings: [],
    loadError: false
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onShow() {
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const doc = await tournamentSync.fetchTournament(tid, (doc) => {
      this.applyTournament(doc);
    });
    if (!doc) this.setData({ loadError: true });
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);
    this.setData({ loadError: false, tournament: t, rankings: normalizeRankings(t) });
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  }
});
