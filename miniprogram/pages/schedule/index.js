const watchUtil = require('../../sync/watch');
const normalize = require('../../core/normalize');

function asName(p) {
  if (!p) return '鏈煡';
  if (typeof p === 'string') return p;
  return (p.name || p.nickname || p.id || '鏈煡');
}

function pickScoreVal(v) {
  if (v === 0) return 0;
  if (v === '0') return 0;
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractScore(m) {
  const a = pickScoreVal(
    m.scoreA ?? m.teamAScore ?? m.teamA_score ?? (m.score && m.score.teamA) ?? (m.result && m.result.teamA) ?? m.teamA
  );
  const b = pickScoreVal(
    m.scoreB ?? m.teamBScore ?? m.teamB_score ?? (m.score && m.score.teamB) ?? (m.result && m.result.teamB) ?? m.teamB
  );
  return { a, b };
}

function decorateRounds(t) {
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  return rounds.map((r) => {
    const matches = Array.isArray(r.matches) ? r.matches : [];
    const rest = Array.isArray(r.restPlayers) ? r.restPlayers : [];

    const matchesUi = matches.map((m, idx) => {
      const teamA = Array.isArray(m.teamA) ? m.teamA : [];
      const teamB = Array.isArray(m.teamB) ? m.teamB : [];
      const left = teamA.map(asName).join(' / ') || '寰呭畾';
      const right = teamB.map(asName).join(' / ') || '寰呭畾';

      const status = m.status || 'pending';
      const finished = status === 'finished';
      const score = extractScore(m);
      const scoreText = (score.a !== null && score.b !== null) ? `${score.a} - ${score.b}` : '';

      return {
        key: `${r.roundIndex || 0}-${m.matchIndex ?? idx}`,
        roundIndex: r.roundIndex || 0,
        matchIndex: (m.matchIndex ?? idx),
        title: `第 ${(m.matchIndex ?? idx) + 1} 场`,
        left,
        right,
        statusText: finished ? '宸插畬璧?' : '寰呭綍鍒?',
        statusClass: finished ? 'green' : 'gray',
        scoreText: finished ? (scoreText || '--') : ''
      };
    });

    return {
      roundIndex: r.roundIndex || 0,
      matchesUi,
      restText: rest.length ? `轮空：${rest.map(asName).join(' / ')}` : ''
    };
  });
}

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',
    roundsUi: []
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
    // 鍏滃簳鍒锋柊锛氫粠褰曞叆姣斿垎椤佃繑鍥炴椂锛岀‘淇濈姸鎬佷笌姣斿垎鏄渶鏂扮殑
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

    const status = t.status || 'draft';
    let statusText = '鑽夌';
    let statusClass = 'tag-draft';
    if (status === 'running') { statusText = '杩涜涓?'; statusClass = 'tag-running'; }
    if (status === 'finished') { statusText = '宸茬粨鏉?'; statusClass = 'tag-finished'; }

    const roundsUi = decorateRounds(t);

    this.setData({
      tournament: t,
      statusText,
      statusClass,
      roundsUi
    });
  },

  openMatch(e) {
    const roundIndex = e.currentTarget.dataset.round;
    const matchIndex = e.currentTarget.dataset.match;
    wx.navigateTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${roundIndex}&matchIndex=${matchIndex}`
    });
  }
});


