const cloud = require('../../core/cloud');
const watchUtil = require('../../sync/watch');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const { normalizeTournament, safePlayerName } = require('../../core/normalize');

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    roundIndex: 0,
    matchIndex: 0,
    match: null,
    scoreA: '',
    scoreB: '',
    displayScoreA: '-',
    displayScoreB: '-',
    canEdit: false,
    pair1Text: '',
    pair2Text: ''
  },

  onLoad(options) {
    const tid = options.tournamentId;
    const roundIndex = Number(options.roundIndex) || 0;
    const matchIndex = Number(options.matchIndex) || 0;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid, roundIndex, matchIndex });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onShow() {
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

    // Normalize to support legacy stored rounds (team arrays may be ids/strings) and ensure names exist.
    const nt = normalizeTournament(t);
    const r = (nt.rounds || [])[this.data.roundIndex];
    const m0 = r && (r.matches || []).find(x => Number(x.matchIndex) === Number(this.data.matchIndex));
    const canEdit = perm.canEditScore(nt, this.openid);

    const extractScorePair = (obj) => {
      if (!obj) return { a: '', b: '' };
      const pick = (v) => {
        if (v === 0) return '0';
        if (v === null || v === undefined || v === '') return '';
        // 閬垮厤鎶?teamA/teamB 鏁扮粍 stringify 鎴?"[object Object]" 涔嬬被
        if (Array.isArray(v)) return '';
        const n = Number(v);
        return Number.isFinite(n) ? String(n) : '';
      };
      // 浼樺厛 legacy 椤跺眰瀛楁锛屽叾娆℃爣鍑?score 瀵硅薄瀛楁
      const aVal = (obj.teamAScore ?? obj.scoreA ?? obj.a ?? obj.left ?? obj.teamA);
      const bVal = (obj.teamBScore ?? obj.scoreB ?? obj.b ?? obj.right ?? obj.teamB);
      return { a: pick(aVal), b: pick(bVal) };
    };

    let match = m0 || null;
    let pair1Text = '';
    let pair2Text = '';

    if (match) {
      const teamA = (match.teamA || []).map(p => ({ ...p, name: safePlayerName(p) }));
      const teamB = (match.teamB || []).map(p => ({ ...p, name: safePlayerName(p) }));
      match = { ...match, teamA, teamB };
      const aNames = teamA.map(p => p.name).filter(Boolean);
      const bNames = teamB.map(p => p.name).filter(Boolean);
      pair1Text = aNames.length ? aNames.join(' / ') : '寰呭畾';
      pair2Text = bNames.length ? bNames.join(' / ') : '寰呭畾';
    }

    let scoreA = this.data.scoreA;
    let scoreB = this.data.scoreB;
    if (match) {
      // Backward鍏煎锛氬巻鍙叉暟鎹彲鑳芥妸姣斿垎鍐欏湪 match 椤跺眰瀛楁锛岃€屼笉鏄?match.score
      const sp = extractScorePair(match.score || match);
      const hasAnyScore = (sp.a !== '' || sp.b !== '');
      // Avoid showing literal 'undefined' and keep scores synced for viewers.
      const shouldSync = hasAnyScore && ((!canEdit) || (match.status === 'finished') || (scoreA === '' && scoreB === ''));
      if (shouldSync) {
        scoreA = sp.a;
        scoreB = sp.b;
      }
    }

    const displayScoreA = (scoreA === "" ? "-" : String(scoreA));
    const displayScoreB = (scoreB === "" ? "-" : String(scoreB));

    this.setData({
      tournamentName: nt.name,
      match,
      canEdit,
      scoreA,
      scoreB,
      displayScoreA,
      displayScoreB,
      pair1Text,
      pair2Text
    });
  },

  onScoreA(e) { this.setData({ scoreA: e.detail.value }); },
  onScoreB(e) { this.setData({ scoreB: e.detail.value }); },

  async submit() {
    const a = Number(this.data.scoreA);
    const b = Number(this.data.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      wx.showToast({ title: '璇疯緭鍏ュ悎娉曟瘮鍒?', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '鎻愪氦涓?..' });
    try {
      await cloud.call('submitScore', {
        tournamentId: this.data.tournamentId,
        roundIndex: this.data.roundIndex,
        matchIndex: this.data.matchIndex,
        scoreA: a,
        scoreB: b
      });
      // 涓€浜涘紑鍙戣€呭伐鍏?妯℃嫙鍣ㄤ笉鏀寔瀹炴椂 watch锛堟垨缃戠粶鎶栧姩锛夛紝鎻愪氦鎴愬姛鍚庡己鍒舵媺鍙栦竴娆★紝纭繚姣斿垎涓庣姸鎬佺珛鍗冲睍绀恒€?      await this.fetchTournament(this.data.tournamentId);
      wx.hideLoading();
      wx.showToast({ title: '宸叉彁浜?', icon: 'success' });
      getApp().globalData.needRefreshTournament = this.data.tournamentId;
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 600);

    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '鎻愪氦澶辫触', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});


