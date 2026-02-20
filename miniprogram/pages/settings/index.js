const cloud = require('../../core/cloud');
const watchUtil = require('../../sync/watch');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    isAdmin: false,

    // 姣旇禌鍙傛暟
    editM: 0,
    editC: 1,

    // 鎬诲満娆★細浼樺厛鐢?selector锛堢姝㈣秴鍑烘渶澶у€硷級锛涘綋鏈€澶у€艰繃澶ф椂閫€鍖栦负鏁板瓧婊氳疆
    useSimpleMPicker: true,
    mOptions: [],
    mIndex: 0,

    mDigitRange: [],
    mDigitValue: [],

    // 骞惰鍦哄湴锛?~10
    courtOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    courtIndex: 0,

    refereeOptions: [],
    refereeId: '',
    refereeIndex: 0,
    refereeName: '鏈缃?',

    addNamesText: '',
    maxMatches: 0,
    recommendations: []
  },

  _buildDigitRange(len) {
    const digits = ['0','1','2','3','4','5','6','7','8','9'];
    return Array.from({ length: len }, () => digits);
  },

  _valueToDigitValue(value, len) {
    const v = Math.max(0, Math.floor(Number(value) || 0));
    const s = String(v).padStart(len, '0');
    return s.split('').map(ch => Number(ch));
  },

  _digitValueToNumber(digitValue) {
    const s = (digitValue || []).map(i => String(i)).join('');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid });
    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onUnload() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onShow() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
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
    const isAdmin = perm.isAdmin(t, this.openid);

    const players = Array.isArray(t.players) ? t.players : [];
    const n = players.length;
    const maxMatches = this.calcMaxMatches(n);
    const recommendations = this.buildRecommendations(n, maxMatches);

    const refereeOptions = [{ id: '', name: '鏈缃?' }].concat(players.map(p => ({ id: p.id, name: p.name })));
    const refereeId = t.refereeId || '';
    const referee = refereeOptions.find(x => x.id === refereeId);
    const refereeIndex = Math.max(0, refereeOptions.findIndex(x => x.id === refereeId));

    let editM = Number(t.totalMatches) || 0;
    if (maxMatches > 0) {
      if (editM < 1) editM = 1;
      if (editM > maxMatches) editM = maxMatches;
    } else {
      editM = 0;
    }

    const editC = Math.max(1, Math.min(10, Number(t.courts) || 1));

    // 鎬诲満娆?picker锛氭渶澶у€间笉澶ф椂鐢?selector锛屽交搴曠姝㈣秺鐣?    const useSimpleMPicker = maxMatches > 0 && maxMatches <= 200;
    const mOptions = useSimpleMPicker ? Array.from({ length: maxMatches }, (_, i) => i + 1) : [];
    const mIndex = useSimpleMPicker && editM >= 1 ? (editM - 1) : 0;

    // 閫€鍖栦负鏁板瓧婊氳疆鏃讹紝鍔ㄦ€佷綅鏁?= maxMatches 浣嶆暟锛堣嚦灏?2 浣嶏級
    const digitLen = Math.max(2, String(maxMatches > 0 ? maxMatches : 999).length);
    const mDigitRange = this._buildDigitRange(digitLen);
    const mDigitValue = this._valueToDigitValue(editM, digitLen);

    this.setData({
      tournament: t,
      isAdmin,
      maxMatches,
      recommendations,

      editM,
      editC,

      useSimpleMPicker,
      mOptions,
      mIndex,
      mDigitRange,
      mDigitValue,

      courtIndex: Math.max(0, Math.min(9, editC - 1)),
      refereeOptions,
      refereeId,
      refereeIndex,
      refereeName: referee ? referee.name : '未设置'
    });
  },

  // MaxMatches = C(n,4) * 3
  calcMaxMatches(n) {
    const nn = Number(n) || 0;
    if (nn < 4) return 0;
    const comb4 = (nn * (nn - 1) * (nn - 2) * (nn - 3)) / 24;
    return Math.floor(comb4 * 3);
  },

  buildRecommendations(n, maxMatches) {
    const nn = Number(n) || 0;
    if (nn < 4) return [];
    const clamp = (m) => {
      const mm = Math.max(1, Math.floor(m));
      return maxMatches > 0 ? Math.min(mm, maxMatches) : mm;
    };
    // 姣忓満 4 浜轰笂鍦猴細鐩爣鈥滄瘡浜哄钩鍧囦笂鍦烘鏁扳€? 2/3/4
    const relax = clamp(Math.ceil((nn * 2) / 4));
    const standard = clamp(Math.ceil((nn * 3) / 4));
    const intense = clamp(Math.ceil((nn * 4) / 4));

    const uniq = [];
    const push = (key, label, m) => {
      if (m >= 1 && !uniq.some(x => x.m === m)) uniq.push({ key, label, m });
    };
    push('relax', '杞绘澗', relax);
    push('standard', '鏍囧噯', standard);
    push('intense', '寮哄害', intense);
    return uniq;
  },

  applyRecommend(e) {
    const m = Number(e.currentTarget.dataset.m);
    if (!m) return;
    if (this.data.useSimpleMPicker) {
      this.setData({ editM: m, mIndex: Math.max(0, m - 1) });
    } else {
      const len = (this.data.mDigitRange || []).length || Math.max(2, String(this.data.maxMatches || 999).length);
      this.setData({ editM: m, mDigitValue: this._valueToDigitValue(m, len) });
    }
  },

  onPickTotalMatchesSimple(e) {
    const idx = Number(e.detail.value);
    const m = (this.data.mOptions || [])[idx] || 1;
    this.setData({ editM: m, mIndex: idx });
  },

  onPickTotalMatches(e) {
    const digitValue = e.detail.value || [];
    let m = this._digitValueToNumber(digitValue);
    if (m < 1) m = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && m > maxMatches) {
      m = maxMatches;
      wx.showToast({ title: `已限制为最大可选 ${maxMatches} 场`, icon: 'none' });
    }
    const len = (this.data.mDigitRange || []).length || digitValue.length;
    this.setData({ editM: m, mDigitValue: this._valueToDigitValue(m, len) });
  },

  onPickCourts(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.courtOptions || [])[idx] || 1;
    this.setData({ editC: courts, courtIndex: idx });
  },

  async saveSettings() {
    if (!this.data.isAdmin) return;
    if (!this.data.tournament || this.data.tournament.status !== 'draft') {
      wx.showToast({ title: '闈炶崏绋块樁娈典笉鍙慨鏀?', icon: 'none' });
      return;
    }
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches <= 0) {
      wx.showToast({ title: '璇峰厛娣诲姞鑷冲皯 4 鍚嶅弬璧涜€?', icon: 'none' });
      return;
    }
    const M = Number(this.data.editM) || 1;
    const C = Math.max(1, Math.min(10, Number(this.data.editC) || 1));
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次不能超过最大可选 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '淇濆瓨涓?..' });
    try {
      await cloud.call('updateSettings', {
        tournamentId: this.data.tournamentId,
        totalMatches: M,
        courts: C
      });
      wx.hideLoading();
      wx.showToast({ title: '宸蹭繚瀛?', icon: 'success' });
      // 涓诲姩鍒锋柊锛堢湡鏈虹洃鍚笉绋冲畾鏃朵繚璇?UI 绔嬪嵆鏇存柊锛?      this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      const msg = String((e && (e.message || e.errMsg)) || '淇濆瓨澶辫触');
      wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
    }
  },

  // 鍙傝禌鑰呮坊鍔狅紙绠＄悊鍛樺湪鑽夌闃舵鎵嬪姩褰曞叆锛?
  onAddNamesInput(e) {
    this.setData({ addNamesText: e.detail.value });
  },

  clearAddNames() {
    this.setData({ addNamesText: '' });
  },

  parseNamesText(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    // 鏀寔锛氭崲琛?/ 绌烘牸 / 閫楀彿 / 鍒嗗彿
    return raw
      .split(/[\n,锛?锛沑t ]+/)
      .map(s => String(s || '').trim())
      .filter(Boolean);
  },

  async addPlayers() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '鏃犳潈闄?', icon: 'none' });
      return;
    }
    if (!this.data.tournament || this.data.tournament.status !== 'draft') {
      wx.showToast({ title: '浠呰崏绋块樁娈靛彲娣诲姞', icon: 'none' });
      return;
    }
    const names = this.parseNamesText(this.data.addNamesText);
    if (names.length === 0) {
      wx.showToast({ title: '璇疯緭鍏ュ弬璧涜€呭悕瀛?', icon: 'none' });
      return;
    }
    if (names.length > 60) {
      wx.showToast({ title: '涓€娆℃渶澶氭坊鍔?60 浜?', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '娣诲姞涓?..' });
    try {
      const res = await cloud.call('addPlayers', {
        tournamentId: this.data.tournamentId,
        names
      });
      await this.fetchTournament(this.data.tournamentId);
      this.setData({ addNamesText: '' });
      wx.hideLoading();
      const added = (res && res.added) || 0;
      wx.showToast({ title: added > 0 ? `已添加 ${added} 人` : '没有新增（可能重复）', icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '娣诲姞澶辫触', icon: 'none' });
    }
  },

  onPickReferee(e) {
    const idx = Number(e.detail.value);
    const opt = (this.data.refereeOptions || [])[idx];
    if (!opt) return;
    const rollbackState = {
      refereeIndex: this.data.refereeIndex,
      refereeId: this.data.refereeId,
      refereeName: this.data.refereeName
    };
    // 绔嬪嵆鏇存柊 UI锛堢湡鏈?onSnapshot/缃戠粶寤惰繜鏃朵篃鑳界珛鍒荤湅鍒板彉鍖栵級
    this.setData({
      refereeIndex: idx,
      refereeId: opt.id,
      refereeName: opt.id ? (opt.name || '已设置') : '未设置'
    });
    this.setReferee(opt.id, rollbackState);
  },

  async clearReferee() {
    this.setReferee('');
  },

  async setReferee(refereeId, rollbackState = null) {
    if (!this.data.isAdmin) return;
    wx.showLoading({ title: '璁剧疆涓?..' });
    try {
      await cloud.call('setReferee', {
        tournamentId: this.data.tournamentId,
        refereeId
      });
      wx.hideLoading();
      wx.showToast({ title: '宸叉洿鏂?', icon: 'success' });
      await this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      if (rollbackState) this.setData(rollbackState);
      const msg = String((e && (e.message || e.errMsg)) || '璁剧疆澶辫触');
      wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
    }
  },

  async removePlayer(e) {
    const playerId = e.currentTarget.dataset.player;
    wx.showModal({
      title: '纭绉婚櫎锛?',
      content: '浠呰崏绋块樁娈靛彲绉婚櫎锛屽垱寤鸿€呬笉鍙Щ闄ゃ€?',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '绉婚櫎涓?..' });
        try {
          await cloud.call('removePlayer', {
            tournamentId: this.data.tournamentId,
            playerId
          });
          wx.hideLoading();
          wx.showToast({ title: '宸茬Щ闄?', icon: 'success' });
          this.fetchTournament(this.data.tournamentId);
        } catch (err) {
          wx.hideLoading();
          const msg = String((err && (err.message || err.errMsg)) || '绉婚櫎澶辫触');
          wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
        }
      }
    });
  },

  async resetTournament() {
    wx.showModal({
      title: '纭閲嶇疆锛?',
      content: '灏嗘竻绌鸿禌绋?姣斿垎/鎺掑悕骞跺洖鍒拌崏绋跨姸鎬併€?',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '閲嶇疆涓?..' });
        try {
          await cloud.call('resetTournament', { tournamentId: this.data.tournamentId });
          wx.hideLoading();
          wx.showToast({ title: '宸查噸缃?', icon: 'success' });
          this.fetchTournament(this.data.tournamentId);
        } catch (e) {
      wx.hideLoading();
          const msg = String((e && (e.message || e.errMsg)) || '閲嶇疆澶辫触');
          wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
        }
      }
    });
  }
});




