const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const retryAction = require('../../core/retryAction');
const storage = require('../../core/storage');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const viewModel = require('./lobbyViewModel');

module.exports = {
  runFlowAction(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const handlers = {
      join: () => this.handleJoin(),
      profile_join: () => this.submitProfile(),
      profile_save: () => this.submitProfile(),
      view_only_join: () => this.enterJoinFromViewOnly(),
      settings: () => this.focusQuickConfigArea(),
      quickImport: () => this.focusQuickImportArea(),
      start: () => this.handleStart(),
      batch: () => this.goBatchScoring(),
      analytics: () => this.goAnalytics(),
      schedule: () => this.goSchedule(),
      ranking: () => this.goRanking(),
      clone: () => this.cloneCurrentTournament(),
      share: () => this.focusShareInviteArea()
    };
    const fn = handlers[key];
    if (typeof fn === 'function') return fn();
  },

  onRoleActionTap(e) {
    const enabled = !!(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.enabled);
    if (!enabled) return;
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.action) || '').trim();
    if (!key) return;
    return this.runFlowAction(key);
  },

  onStateSecondaryTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.action) || '').trim();
    if (!key) return;
    return this.runFlowAction(key);
  },

  parseImportPlayers(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const tokens = raw
      .split(/[\n,，;；\t ]+/)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const out = [];
    for (const token of tokens) {
      const matched = /^(.+?)[\/|](男|女|m|f)$/i.exec(token)
        || /^(.+?)[\(（](男|女|m|f)[\)）]$/i.exec(token)
        || /^(.+?)-(男|女|m|f)$/i.exec(token);
      if (!matched) {
        out.push({ name: token, gender: 'unknown' });
        continue;
      }
      const name = String(matched[1] || '').trim();
      const mark = String(matched[2] || '').trim().toLowerCase();
      let gender = 'unknown';
      if (mark === '男' || mark === 'm') gender = 'male';
      if (mark === '女' || mark === 'f') gender = 'female';
      out.push({ name, gender });
    }
    return out;
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  },

  goSettings(section = '') {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    const key = String(section || '').trim();
    const suffix = key ? `&section=${encodeURIComponent(key)}` : '';
    wx.navigateTo({ url: `/pages/settings/index?tournamentId=${tid}${suffix}` });
  },

  goRanking() {
    wx.navigateTo({ url: `/pages/ranking/index?tournamentId=${this.data.tournamentId}` });
  },

  goAnalytics() {
    wx.navigateTo({ url: `/pages/analytics/index?tournamentId=${this.data.tournamentId}` });
  },

  focusQuickConfigArea() {
    try {
      wx.pageScrollTo({ selector: '#quick-config', duration: 220 });
    } catch (_) {
      // ignore
    }
  },

  focusShareInviteArea() {
    try {
      wx.pageScrollTo({ selector: '#share-invite', duration: 220 });
    } catch (_) {
      // ignore
    }
    this.pulseShareHint(2200);
  },

  onPickQuickConfigMSimple(e) {
    const idx = Number(e.detail.value);
    const value = (this.data.quickConfigMOptions || [])[idx] || 1;
    this.setData({ quickConfigM: value, quickConfigMIndex: idx });
  },

  onPickQuickConfigMDigit(e) {
    const digitValue = e.detail.value || [];
    let matchCount = viewModel.digitValueToNumber(digitValue);
    if (matchCount < 1) matchCount = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && matchCount > maxMatches) {
      matchCount = maxMatches;
      wx.showToast({ title: `已限制为最大可选 ${maxMatches} 场`, icon: 'none' });
    }
    const len = (this.data.quickConfigMDigitRange || []).length || digitValue.length;
    this.setData({
      quickConfigM: matchCount,
      quickConfigMDigitValue: viewModel.valueToDigitValue(matchCount, len)
    });
  },

  onPickQuickConfigC(e) {
    const idx = Number(e.detail.value);
    const courts = (this.data.quickConfigCOptions || [])[idx] || 1;
    this.setData({ quickConfigC: courts, quickConfigCIndex: idx }, () => {
      this.refreshQuickRecommendations();
    });
  },

  onPickSessionMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.sessionMinuteOptions || flow.SESSION_MINUTE_OPTIONS;
    const sessionMinutes = Number(options[idx] || flow.DEFAULT_SESSION_MINUTES);
    storage.setSessionMinutesPref(sessionMinutes);
    this.setData({ sessionMinutes, sessionMinuteIndex: idx }, () => this.refreshQuickRecommendations());
  },

  onPickSlotMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.slotMinuteOptions || flow.SLOT_MINUTE_OPTIONS;
    const slotMinutes = Number(options[idx] || flow.DEFAULT_SLOT_MINUTES);
    storage.setSlotMinutesPref(slotMinutes);
    this.setData({ slotMinutes, slotMinuteIndex: idx }, () => this.refreshQuickRecommendations());
  },

  refreshQuickRecommendations() {
    const tournament = this.data.tournament || {};
    const players = Array.isArray(tournament.players) ? tournament.players : [];
    const playersCount = players.length;
    const mode = flow.normalizeMode(tournament.mode || flow.MODE_MULTI_ROTATE);
    const genderCount = flow.countGenderPlayers(players);
    const recommendation = flow.buildMatchCountRecommendations({
      mode,
      maleCount: genderCount.maleCount,
      femaleCount: genderCount.femaleCount,
      unknownCount: genderCount.unknownCount,
      allowOpenTeam: false,
      playersCount,
      courts: this.data.quickConfigC,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    this.setData({
      quickSuggestedMatches: Number(recommendation.suggestedMatches) || 1,
      quickCapacityMax: Number(recommendation.capacityMax) || 1,
      quickCapacityHintShort: String(recommendation.capacityHintShort || ''),
      quickCapacityReason: String(recommendation.capacityReason || 'time'),
      quickRosterHint: String(recommendation.rosterHint || '')
    });
  },

  focusQuickImportArea() {
    try {
      wx.pageScrollTo({ selector: '#quick-import', duration: 220 });
    } catch (_) {
      // ignore
    }
    this.setData({ focusQuickImport: true });
    setTimeout(() => this.setData({ focusQuickImport: false }), 220);
  },

  onQuickImportInput(e) {
    this.setData({ quickImportText: e.detail.value, importResultText: '', importResultDetail: '' });
  },

  async saveQuickSettings() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可保存参数', icon: 'none' });
      return;
    }
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可修改', icon: 'none' });
      return;
    }

    const matchCount = flow.parsePositiveInt(this.data.quickConfigM, 1);
    const courts = flow.parsePositiveInt(this.data.quickConfigC, 1, 10);
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && matchCount > maxMatches) {
      wx.showToast({ title: `总场次最多 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    const actionKey = `lobby:updateSettings:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '保存中...' });
      try {
        cloud.assertWriteResult(await cloud.call('updateSettings', {
          tournamentId: this.data.tournamentId,
          totalMatches: matchCount,
          courts,
          allowOpenTeam: this.data.allowOpenTeam
        }), '保存失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '参数已保存', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);
        await this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('保存比赛参数', () => this.saveQuickSettings());
        this.handleWriteError(err, '保存失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async quickImportPlayers() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可导入', icon: 'none' });
      return;
    }
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可导入', icon: 'none' });
      return;
    }
    const players = this.parseImportPlayers(this.data.quickImportText);
    if (players.length === 0) {
      wx.showToast({ title: '请输入参赛者名字', icon: 'none' });
      return;
    }
    if (players.length > 60) {
      wx.showToast({ title: '一次最多添加 60 人', icon: 'none' });
      return;
    }

    const actionKey = `lobby:addPlayers:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '导入中...' });
      try {
        const res = await cloud.call('addPlayers', {
          tournamentId: this.data.tournamentId,
          players
        });
        wx.hideLoading();
        this.clearLastFailedAction();
        await this.fetchTournament(this.data.tournamentId);
        this.setData({ quickImportText: '' });
        nav.markRefreshFlag(this.data.tournamentId);
        const added = Number((res && (res.addedCount ?? res.added)) || 0);
        const duplicateCount = Number((res && res.duplicateCount) || 0);
        const invalidCount = Number((res && res.invalidCount) || 0);
        const maleCount = Number((res && res.maleCount) || 0);
        const femaleCount = Number((res && res.femaleCount) || 0);
        const unknownCount = Number((res && res.unknownCount) || 0);
        const parts = [];
        if (added > 0) parts.push(`新增 ${added}`);
        if (duplicateCount > 0) parts.push(`重复 ${duplicateCount}`);
        if (invalidCount > 0) parts.push(`无效 ${invalidCount}`);
        if (added > 0) parts.push(`男 ${maleCount}/女 ${femaleCount}/未设 ${unknownCount}`);
        const importResultText = parts.length ? parts.join(' · ') : '未发生变更';
        const duplicateNames = Array.isArray(res && res.duplicateNames) ? res.duplicateNames : [];
        const invalidNames = Array.isArray(res && res.invalidNames) ? res.invalidNames : [];
        const detailParts = [];
        if (duplicateNames.length) detailParts.push(`重复：${duplicateNames.slice(0, 4).join('、')}${duplicateNames.length > 4 ? '…' : ''}`);
        if (invalidNames.length) {
          const validDisplay = invalidNames.filter(Boolean);
          if (validDisplay.length) detailParts.push(`无效：${validDisplay.slice(0, 4).join('、')}${validDisplay.length > 4 ? '…' : ''}`);
        }
        this.setData({
          importResultText,
          importResultDetail: detailParts.join('；')
        });
        wx.showToast({ title: importResultText, icon: 'none' });
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('快速导入参赛者', () => this.quickImportPlayers());
        this.handleWriteError(err, '导入失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async cloneCurrentTournament() {
    const actionKey = `lobby:cloneTournament:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '复制中...' });
      try {
        const res = await cloud.call('cloneTournament', { sourceTournamentId: this.data.tournamentId });
        const nextId = String((res && res.tournamentId) || '').trim();
        if (!nextId) throw new Error('复制失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        storage.addRecentTournamentId(nextId);
        wx.showToast({ title: '已生成副本', icon: 'success' });
        wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${nextId}` });
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament());
        this.handleWriteError(err, '复制失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  onChecklistTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    if (key === 'settings') {
      if (this.data.checkSettingsOk) this.goSettings('params');
      else this.focusQuickConfigArea();
      return;
    }
    if (key === 'players') {
      this.focusShareInviteArea();
      return;
    }
    if (key === 'start') {
      if (this.data.checkStartReady) {
        this.handleStart();
        return;
      }
      if (!this.data.checkSettingsOk) this.focusQuickConfigArea();
      else this.focusShareInviteArea();
    }
  },

  onPickJoinSquad(e) {
    const squad = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.squad) || '').trim().toUpperCase();
    if (squad !== 'A' && squad !== 'B') return;
    this.setData({ joinSquadChoice: squad });
  },

  async onTogglePlayerSquad(e) {
    if (!this.data.isAdmin) return;
    if (String((this.data.tournament && this.data.tournament.status) || '') !== 'draft') return;
    if (this.data.mode !== flow.MODE_SQUAD_DOUBLES) return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    if (!playerId) return;
    const item = (this.data.displayPlayers || []).find((x) => String(x.id || '') === playerId);
    const current = String(item && item.squad || '').toUpperCase();
    const next = current === 'A' ? 'B' : 'A';
    const actionKey = `lobby:setPlayerSquad:${this.data.tournamentId}:${playerId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      try {
        await cloud.call('setPlayerSquad', {
          tournamentId: this.data.tournamentId,
          playerId,
          squad: next
        });
        wx.showToast({ title: `已调整到${next}队`, icon: 'none' });
        this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '调整分队失败'), icon: 'none' });
      }
    });
  },

  onNextActionTap() {
    return this.runFlowAction(this.data.nextActionKey);
  },

  goBatchScoring() {
    const tournament = this.data.tournament;
    if (!tournament || !this.data.canEditScore) return;
    const next = viewModel.findFirstPendingPosition(tournament.rounds);
    if (!next) {
      wx.showToast({ title: '当前没有待录分比赛', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${next.roundIndex}&matchIndex=${next.matchIndex}&batch=1`
    });
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    retryAction.presentWriteError(this, err, fallbackMessage, {
      conflictContent: '数据已被其他人更新，刷新后可继续当前操作。',
      onRefresh
    });
  },

  async handleStart() {
    const tournament = this.data.tournament;
    if (!tournament || !this.data.isAdmin) return;
    if (tournament.status !== 'draft') {
      wx.showToast({ title: '赛事已开赛', icon: 'none' });
      return;
    }
    if (!this.data.checkPlayersOk) {
      wx.showToast({ title: '当前名单暂不可排赛，请补全参赛信息', icon: 'none' });
      return;
    }
    if (!this.data.checkSettingsOk) {
      wx.showToast({ title: '请先保存比赛参数', icon: 'none' });
      return;
    }

    const actionKey = `lobby:startTournament:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.run(actionKey, async () => {
      wx.showLoading({ title: '生成赛程...' });
      try {
        const schedulerProfile = storage.getSchedulerProfile();
        cloud.assertWriteResult(await cloud.call('startTournament', {
          tournamentId: this.data.tournamentId,
          schedulerProfile
        }), '开赛失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已开赛', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);
        setTimeout(() => {
          wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
        }, 280);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('开赛并锁定赛程', () => this.handleStart());
        this.handleWriteError(err, '开赛失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async handleReset() {
    wx.showModal({
      title: '确认重置？',
      content: '将清空赛程与比分，回到草稿状态。',
      success: async (res) => {
        if (!res.confirm) return;
        const actionKey = `lobby:resetTournament:${this.data.tournamentId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.run(actionKey, async () => {
          wx.showLoading({ title: '重置中...' });
          try {
            await cloud.call('resetTournament', { tournamentId: this.data.tournamentId });
            wx.hideLoading();
            this.clearLastFailedAction();
            wx.showToast({ title: '已重置', icon: 'success' });
            nav.markRefreshFlag(this.data.tournamentId);
          } catch (err) {
            wx.hideLoading();
            this.setLastFailedAction('重置赛事', () => this.handleReset());
            this.handleWriteError(err, '重置失败', () => this.fetchTournament(this.data.tournamentId));
          }
        });
      }
    });
  }
};
