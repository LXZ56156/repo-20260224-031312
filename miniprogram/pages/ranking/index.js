const watchUtil = require('../../sync/watch');
const normalize = require('../../core/normalize');

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
    rankings: []
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onShow() {
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onUnload() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  startWatch(tid) {
    if (!tid) return;
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = watchUtil.watchTournament(tid, (doc) => {
      this.applyTournament(doc);
    });
  },

  async fetchTournament(tid) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('tournaments').doc(tid).get();
      this.applyTournament(res.data);
    } catch (e) {
      console.error('fetchTournament failed', e);
    }
  },

  applyTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);
    this.setData({ tournament: t, rankings: normalizeRankings(t) });
  }
});
