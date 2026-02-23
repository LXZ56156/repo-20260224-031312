const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const tournamentSync = require('../../core/tournamentSync');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    isAdmin: false,

    // 比赛参数
    editM: 0,
    editC: 1,

    // 总场次：优先用 selector（禁止超过最大值）；最大值过大时退化为数字滚轮
    useSimpleMPicker: true,
    mOptions: [],
    mIndex: 0,

    mDigitRange: [],
    mDigitValue: [],

    // 并行场地：1~10
    courtOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    courtIndex: 0,

    refereeOptions: [],
    refereeId: '',
    refereeIndex: 0,
    refereeName: '未设置',

    addNamesText: '',
    maxMatches: 0,
    recommendations: [],
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: '',
    loadError: false
  },

  _buildDigitRange(len) {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return Array.from({ length: len }, () => digits);
  },

  _valueToDigitValue(value, len) {
    const v = Math.max(0, Math.floor(Number(value) || 0));
    const s = String(v).padStart(len, '0');
    return s.split('').map((ch) => Number(ch));
  },

  _digitValueToNumber(digitValue) {
    const s = (digitValue || []).map((i) => String(i)).join('');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  },

  onLoad(options) {
    const tid = options.tournamentId;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    this.setData({ tournamentId: tid });

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
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
    const isAdmin = perm.isAdmin(t, this.openid);

    const players = Array.isArray(t.players) ? t.players : [];
    const n = players.length;
    const maxMatches = this.calcMaxMatches(n);
    const recommendations = this.buildRecommendations(n, maxMatches);

    const refereeOptions = [{ id: '', name: '未设置' }].concat(players.map((p) => ({ id: p.id, name: p.name })));
    const refereeId = t.refereeId || '';
    const referee = refereeOptions.find((x) => x.id === refereeId);
    const refereeIndex = Math.max(0, refereeOptions.findIndex((x) => x.id === refereeId));

    let editM = Number(t.totalMatches) || 8;
    if (editM < 1) editM = 1;
    if (maxMatches > 0 && editM > maxMatches) editM = maxMatches;

    const editC = Math.max(1, Math.min(10, Number(t.courts) || 1));

    // 总场次 picker：最大值不大时用 selector，彻底禁止越界
    const useSimpleMPicker = maxMatches > 0 && maxMatches <= 200;
    const mOptions = useSimpleMPicker ? Array.from({ length: maxMatches }, (_, i) => i + 1) : [];
    const mIndex = useSimpleMPicker && editM >= 1 ? (editM - 1) : 0;

    // 退化为数字滚轮时，动态位数 = maxMatches 位数（至少 2 位）
    const digitLen = Math.max(2, String(maxMatches > 0 ? maxMatches : 999).length);
    const mDigitRange = this._buildDigitRange(digitLen);
    const mDigitValue = this._valueToDigitValue(editM, digitLen);

    this.setData({
      loadError: false,
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
    this.clearLastFailedAction();
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    const parsed = cloud.parseCloudError(err, fallbackMessage);
    if (parsed.isConflict) {
      wx.showModal({
        title: '写入冲突',
        content: '数据已被其他人更新，是否立即刷新当前赛事？',
        confirmText: '刷新',
        success: (res) => {
          if (res.confirm && typeof onRefresh === 'function') onRefresh();
        }
      });
      return;
    }
    wx.showToast({ title: parsed.userMessage || fallbackMessage, icon: 'none' });
  },

  setLastFailedAction(text, fn) {
    this._lastFailedAction = typeof fn === 'function' ? fn : null;
    this.setData({
      canRetryAction: !!this._lastFailedAction,
      lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
    });
  },

  clearLastFailedAction() {
    this._lastFailedAction = null;
    this.setData({ canRetryAction: false, lastFailedActionText: '' });
  },

  retryLastAction() {
    if (typeof this._lastFailedAction === 'function') this._lastFailedAction();
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
    // 每场 4 人上场：目标“每人平均上场次数”= 2/3/4
    const relax = clamp(Math.ceil((nn * 2) / 4));
    const standard = clamp(Math.ceil((nn * 3) / 4));
    const intense = clamp(Math.ceil((nn * 4) / 4));

    const uniq = [];
    const push = (key, label, m) => {
      if (m >= 1 && !uniq.some((x) => x.m === m)) uniq.push({ key, label, m });
    };
    push('relax', '轻松', relax);
    push('standard', '标准', standard);
    push('intense', '强度', intense);
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
      wx.showToast({ title: '非草稿阶段不可修改', icon: 'none' });
      return;
    }
    const maxMatches = Number(this.data.maxMatches) || 0;
    const M = Number(this.data.editM) || 1;
    const C = Math.max(1, Math.min(10, Number(this.data.editC) || 1));
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次不能超过最大可选 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      await cloud.call('updateSettings', {
        tournamentId: this.data.tournamentId,
        totalMatches: M,
        courts: C
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: maxMatches > 0 ? '已保存' : '已预配置', icon: 'success' });
      // 主动刷新（真机监听不稳定时也能立即更新 UI）
      this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('保存参数', () => this.saveSettings());
      this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  // 参赛者添加（管理员在草稿阶段手动录入）
  onAddNamesInput(e) {
    this.setData({ addNamesText: e.detail.value });
  },

  clearAddNames() {
    this.setData({ addNamesText: '' });
  },

  parseNamesText(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    // 支持：换行 / 空格 / 逗号 / 分号
    return raw
      .split(/[\n,，;；\t ]+/)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  },

  async addPlayers() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    if (!this.data.tournament || this.data.tournament.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可添加', icon: 'none' });
      return;
    }
    const names = this.parseNamesText(this.data.addNamesText);
    if (names.length === 0) {
      wx.showToast({ title: '请输入参赛者名字', icon: 'none' });
      return;
    }
    if (names.length > 60) {
      wx.showToast({ title: '一次最多添加 60 人', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '添加中...' });
    try {
      const res = await cloud.call('addPlayers', {
        tournamentId: this.data.tournamentId,
        names
      });
      await this.fetchTournament(this.data.tournamentId);
      this.setData({ addNamesText: '' });
      wx.hideLoading();
      this.clearLastFailedAction();
      const added = (res && res.added) || 0;
      wx.showToast({ title: added > 0 ? `已添加 ${added} 人` : '没有新增（可能重复）', icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('添加参赛者', () => this.addPlayers());
      this.handleWriteError(e, '添加失败', () => this.fetchTournament(this.data.tournamentId));
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
    // 立即更新 UI（真机 onSnapshot/网络延迟时也能立刻看到变化）
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
    wx.showLoading({ title: '设置中...' });
    try {
      await cloud.call('setReferee', {
        tournamentId: this.data.tournamentId,
        refereeId
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已更新', icon: 'success' });
      await this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      if (rollbackState) this.setData(rollbackState);
      this.setLastFailedAction('设置裁判', () => this.setReferee(refereeId));
      this.handleWriteError(e, '设置失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  async removePlayer(e) {
    const playerId = e.currentTarget.dataset.player;
    wx.showModal({
      title: '确认移除？',
      content: '仅草稿阶段可移除，创建者不可移除。',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '移除中...' });
        try {
          await cloud.call('removePlayer', {
            tournamentId: this.data.tournamentId,
            playerId
          });
          wx.hideLoading();
          this.clearLastFailedAction();
          wx.showToast({ title: '已移除', icon: 'success' });
          this.fetchTournament(this.data.tournamentId);
        } catch (err) {
          wx.hideLoading();
          this.setLastFailedAction('移除参赛者', () => this.removePlayer({ currentTarget: { dataset: { player: playerId } } }));
          this.handleWriteError(err, '移除失败', () => this.fetchTournament(this.data.tournamentId));
        }
      }
    });
  },

  async resetTournament() {
    wx.showModal({
      title: '确认重置？',
      content: '将清空赛程、比分和排名并回到草稿状态。',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '重置中...' });
        try {
          await cloud.call('resetTournament', { tournamentId: this.data.tournamentId });
          wx.hideLoading();
          this.clearLastFailedAction();
          wx.showToast({ title: '已重置', icon: 'success' });
          this.fetchTournament(this.data.tournamentId);
        } catch (e) {
          wx.hideLoading();
          this.setLastFailedAction('重置赛事', () => this.resetTournament());
          this.handleWriteError(e, '重置失败', () => this.fetchTournament(this.data.tournamentId));
        }
      }
    });
  }
});
