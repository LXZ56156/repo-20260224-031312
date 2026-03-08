const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const flow = require('../../core/uxFlow');

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

    mode: flow.MODE_MULTI_ROTATE,
    modeLabel: flow.getModeLabel(flow.MODE_MULTI_ROTATE),
    allowOpenTeam: false,
    genderOptions: ['未设', '男', '女'],

    maxMatches: 0,
    suggestedMatches: 1,
    capacityMax: 1,
    capacityHintShort: '',
    capacityReason: 'time',
    rosterHint: '',
    sessionMinuteOptions: flow.SESSION_MINUTE_OPTIONS,
    slotMinuteOptions: flow.SLOT_MINUTE_OPTIONS,
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES,
    sessionMinuteIndex: 2,
    slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(flow.DEFAULT_SLOT_MINUTES)),
    isDraft: false,
    settingsReady: false,
    playersReady: false,
    playersCount: 0,
    playersGap: 0,
    playersStatusText: '',
    mandatoryDone: 0,
    mandatoryTotal: 2,
    networkOffline: false,
    settingsBusy: false,
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
    const section = String((options && options.section) || '').trim().toLowerCase();
    this._initialSection = section;
    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    const sessionMinutes = flow.normalizeSessionMinutes(storage.getSessionMinutesPref(), flow.DEFAULT_SESSION_MINUTES);
    const slotMinutes = flow.normalizeSlotMinutes(storage.getSlotMinutesPref(), flow.DEFAULT_SLOT_MINUTES);
    this.setData({ tournamentId: tid });
    this.setData({
      sessionMinutes,
      slotMinutes,
      sessionMinuteIndex: Math.max(0, flow.SESSION_MINUTE_OPTIONS.indexOf(sessionMinutes)),
      slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(slotMinutes))
    });

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
    if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
    this._autoBackTimer = null;
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
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
    const isDraft = String(t.status || 'draft') === 'draft';

    const players = Array.isArray(t.players) ? t.players : [];
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const modeLabel = flow.getModeLabel(mode);
    const allowOpenTeam = false;
    const n = players.length;
    const playersCount = n;
    const playersGap = playersCount >= 4 ? 0 : (4 - playersCount);
    const genderCount = flow.countGenderPlayers(players);
    const aCount = players.filter((item) => String(item && item.squad || '').trim().toUpperCase() === 'A').length;
    const bCount = players.filter((item) => String(item && item.squad || '').trim().toUpperCase() === 'B').length;
    const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
    const pairTeamCount = pairTeams.filter((item) => Array.isArray(item && item.playerIds) && item.playerIds.length === 2).length;
    let playersReady = playersGap === 0;
    if (mode === flow.MODE_SQUAD_DOUBLES) {
      playersReady = playersReady && aCount >= 2 && bCount >= 2;
    } else if (mode === flow.MODE_FIXED_PAIR_RR) {
      playersReady = playersReady && pairTeamCount >= 2;
    }
    let maxMatches = flow.calcMaxMatchesByPlayers(n);
    if (mode === flow.MODE_FIXED_PAIR_RR) {
      maxMatches = pairTeamCount >= 2 ? Math.floor((pairTeamCount * (pairTeamCount - 1)) / 2) : 0;
    }

    let editM = Number(t.totalMatches) || 0;
    const recommendation = flow.buildMatchCountRecommendations({
      mode,
      maleCount: genderCount.maleCount,
      femaleCount: genderCount.femaleCount,
      unknownCount: genderCount.unknownCount,
      allowOpenTeam,
      playersCount,
      courts: Number(t.courts) || 1,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    if (editM < 1) editM = Number(recommendation.suggestedMatches || 8);
    if (editM < 1) editM = 1;
    if (maxMatches > 0 && editM > maxMatches) editM = maxMatches;

    const editC = Math.max(1, Math.min(10, Number(t.courts) || 1));
    const settingsReady = t.settingsConfigured === true || (editM >= 1 && editC >= 1);
    const mandatoryDone = (settingsReady ? 1 : 0) + (playersReady ? 1 : 0);

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
      mode,
      modeLabel,
      allowOpenTeam,
      isAdmin,
      isDraft,
      maxMatches,
      suggestedMatches: Number(recommendation.suggestedMatches) || 1,
      capacityMax: Number(recommendation.capacityMax) || 1,
      capacityHintShort: String(recommendation.capacityHintShort || ''),
      capacityReason: String(recommendation.capacityReason || 'time'),
      rosterHint: String(recommendation.rosterHint || ''),
      settingsReady,
      playersReady,
      playersCount,
      playersGap,
      playersStatusText: playersReady
        ? '已完成'
        : (playersGap > 0
          ? `还差 ${playersGap} 人`
          : (mode === flow.MODE_SQUAD_DOUBLES
            ? `A队 ${aCount} / B队 ${bCount}（至少各2人）`
            : (mode === flow.MODE_FIXED_PAIR_RR
              ? `需至少2支队伍（当前${pairTeamCount}）`
              : '请补全参赛信息'))),
      mandatoryDone,

      editM,
      editC,

      useSimpleMPicker,
      mOptions,
      mIndex,
      mDigitRange,
      mDigitValue,

      courtIndex: Math.max(0, Math.min(9, editC - 1))
    });

    if (this._initialSection) {
      const sectionMap = {
        params: '#section-params',
        players: '#section-players'
      };
      const selector = sectionMap[this._initialSection];
      this._initialSection = '';
      if (selector) {
        setTimeout(() => this.scrollToSection(selector), 90);
      }
    }

    this.clearLastFailedAction();
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    cloud.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续当前设置。',
      onRefresh
    });
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

  scrollToSection(selector) {
    if (!selector) return;
    try {
      wx.pageScrollTo({ selector, duration: 220 });
    } catch (_) {
      // ignore
    }
  },

  onPrepActionTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    if (key === 'params') {
      this.scrollToSection('#section-params');
      return;
    }
    if (key === 'players') {
      if (this.data.isAdmin && this.data.isDraft) {
        this.goLobbyManagePlayers();
        return;
      }
      this.scrollToSection('#section-players');
      return;
    }
  },

  goLobbyManagePlayers() {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    nav.setLobbyIntent(tid, 'quickImport');
    nav.navigateBackOrRedirect(`/pages/lobby/index?tournamentId=${tid}`);
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
    this.setData({ editC: courts, courtIndex: idx }, () => this.refreshRecommendations());
  },

  onPickSessionMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.sessionMinuteOptions || flow.SESSION_MINUTE_OPTIONS;
    const sessionMinutes = Number(options[idx] || flow.DEFAULT_SESSION_MINUTES);
    storage.setSessionMinutesPref(sessionMinutes);
    this.setData({ sessionMinutes, sessionMinuteIndex: idx }, () => this.refreshRecommendations());
  },

  onPickSlotMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.slotMinuteOptions || flow.SLOT_MINUTE_OPTIONS;
    const slotMinutes = Number(options[idx] || flow.DEFAULT_SLOT_MINUTES);
    storage.setSlotMinutesPref(slotMinutes);
    this.setData({ slotMinutes, slotMinuteIndex: idx }, () => this.refreshRecommendations());
  },

  refreshRecommendations() {
    const players = this.data.tournament && Array.isArray(this.data.tournament.players)
      ? this.data.tournament.players
      : [];
    const genderCount = flow.countGenderPlayers(players);
    const recommendation = flow.buildMatchCountRecommendations({
      mode: this.data.mode,
      maleCount: genderCount.maleCount,
      femaleCount: genderCount.femaleCount,
      unknownCount: genderCount.unknownCount,
      allowOpenTeam: this.data.allowOpenTeam,
      playersCount: Number(this.data.playersCount) || 0,
      courts: this.data.editC,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    this.setData({
      suggestedMatches: Number(recommendation.suggestedMatches) || 1,
      capacityMax: Number(recommendation.capacityMax) || 1,
      capacityHintShort: String(recommendation.capacityHintShort || ''),
      capacityReason: String(recommendation.capacityReason || 'time'),
      rosterHint: String(recommendation.rosterHint || '')
    });
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

    const actionKey = `settings:updateSettings:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runWithPageBusy(this, 'settingsBusy', actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          totalMatches: M,
          courts: C,
          allowOpenTeam: this.data.allowOpenTeam
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: maxMatches > 0 ? '已保存' : '已预配置', icon: 'success' });
        // 主动刷新（真机监听不稳定时也能立即更新 UI）
        await this.fetchTournament(this.data.tournamentId);
        nav.markRefreshFlag(this.data.tournamentId);
        if (this._autoBackTimer) clearTimeout(this._autoBackTimer);
        this._autoBackTimer = setTimeout(() => {
          nav.navigateBackOrRedirect(`/pages/lobby/index?tournamentId=${this.data.tournamentId}`);
        }, 420);
      } catch (e) {
        wx.hideLoading();
        this.setLastFailedAction('保存参数', () => this.saveSettings());
        this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  onAllowOpenChange(e) {
    const allowOpenTeam = !!(e && e.detail && e.detail.value);
    this.setData({ allowOpenTeam }, () => this.refreshRecommendations());
  },

  async onPickPlayerGender(e) {
    if (!this.data.isAdmin || !this.data.isDraft) return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    const idx = Number(e.detail.value);
    if (!playerId || Number.isNaN(idx)) return;
    const map = ['unknown', 'male', 'female'];
    const gender = map[idx] || 'unknown';
    return this.updatePlayerGender(playerId, gender);
  },

  async updatePlayerGender(playerId, gender) {
    const id = String(playerId || '').trim();
    if (!id) return;
    const actionKey = `settings:updatePlayerGender:${this.data.tournamentId}:${id}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          playerGenderPatch: { [id]: gender }
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        await this.fetchTournament(this.data.tournamentId);
        nav.markRefreshFlag(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('更新球员性别', () => this.updatePlayerGender(id, gender));
        this.handleWriteError(err, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async removePlayer(e) {
    const playerId = e.currentTarget.dataset.player;
    wx.showModal({
      title: '确认移除？',
      content: '仅草稿阶段可移除，创建者不可移除。',
      success: async (res) => {
        if (!res.confirm) return;
        const actionKey = `settings:removePlayer:${this.data.tournamentId}:${playerId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.run(actionKey, async () => {
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
        });
      }
    });
  }
});
