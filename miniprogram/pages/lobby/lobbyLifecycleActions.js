const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const storage = require('../../core/storage');
const tournamentSync = require('../../core/tournamentSync');
const nav = require('../../core/nav');
const pageTimers = require('../../core/pageTimers');
const writeErrorUi = require('../../core/writeErrorUi');

function isStartedTournament(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (String(doc.status || '').trim() !== 'running') return false;
  return Array.isArray(doc.rounds) && doc.rounds.length > 0;
}

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

module.exports = {
  handleWriteError(err, fallbackMessage, onRefresh) {
    writeErrorUi.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续当前操作。',
      onRefresh
    });
  },

  async cloneCurrentTournament(options = {}) {
    const tournamentId = String(this.data.tournamentId || '').trim();
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    const actionKey = `lobby:cloneTournament:${tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'clone');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      wx.showLoading({ title: '复制中...' });
      try {
        const nextId = await cloneTournamentCore.cloneTournament(tournamentId, { clientRequestId });
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.clearLastFailedAction();
        wx.showToast({ title: '已生成副本', icon: 'success' });
        nav.goLobby(nextId);
      } catch (err) {
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament({ clientRequestId }), { actionKey });
        this.handleWriteError(err, '复制失败', () => this.fetchTournament(tournamentId));
      }
    });
  },

  async saveAndStart() {
    if (!this.data.isAdmin) return;
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') return;
    if (!this.data.checkPlayersOk) {
      wx.showToast({ title: '当前名单暂不可排赛', icon: 'none' });
      return;
    }

    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    try {
      const saved = await this.saveQuickSettings();
      if (saved !== true) return;
      if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
      await this.handleStart();
    } catch (_) {
      // saveQuickSettings 和 handleStart 内部已有错误处理
    }
  },

  async recoverStartedTournament() {
    const localDoc = this._latestTournament || (this.data && this.data.tournament) || null;
    if (isStartedTournament(localDoc)) return localDoc;

    const tournamentId = String(this.data && this.data.tournamentId || '').trim();
    if (!tournamentId) return null;

    const first = await tournamentSync.fetchTournament(tournamentId);
    if (first && first.ok && isStartedTournament(first.doc)) return first.doc;

    await wait(800);
    const second = await tournamentSync.fetchTournament(tournamentId);
    if (second && second.ok && isStartedTournament(second.doc)) return second.doc;

    return null;
  },

  applyRecoveredTournament(tournament) {
    if (!tournament || typeof tournament !== 'object') return;
    this._latestTournament = tournament;
    if (typeof this.setTournament === 'function') {
      this.setTournament(tournament);
      return;
    }
    this.setData({ tournament });
  },

  finalizeStartSuccess(tournament) {
    if (tournament) this.applyRecoveredTournament(tournament);
    this.clearLastFailedAction();
    wx.showToast({ title: '已开赛', icon: 'success' });
    nav.markRefreshFlag(this.data.tournamentId);
    pageTimers.setNamedTimer(this, 'startNavigation', () => {
      nav.goSchedule(this.data.tournamentId);
    }, 280);
  },

  async handleStart(options = {}) {
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
      wx.showToast({ title: '请先修改比赛信息', icon: 'none' });
      return;
    }

    const actionKey = `lobby:startTournament:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'start');
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      wx.showLoading({ title: '生成对阵...' });
      try {
        const schedulerProfile = storage.getSchedulerProfile();
        cloud.assertWriteResult(await cloud.call('startTournament', {
          tournamentId: this.data.tournamentId,
          schedulerProfile,
          clientRequestId
        }), '开赛失败');
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        this.finalizeStartSuccess();
      } catch (err) {
        wx.hideLoading();
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        const parsed = cloud.parseCloudError(err, '开赛失败');
        if (parsed.isTimeout || parsed.isNetwork) {
          const recoveredTournament = await this.recoverStartedTournament();
          if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
          if (isStartedTournament(recoveredTournament)) {
            this.finalizeStartSuccess(recoveredTournament);
            return;
          }
        }
        this.setLastFailedAction('开始比赛', () => this.handleStart({ clientRequestId }), { actionKey });
        this.handleWriteError(err, '开赛失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async cancelTournament(options = {}) {
    const tournament = this.data.tournament;
    if (!tournament || !this.data.isAdmin) return;
    if (String(tournament.status || '').trim() !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可取消', icon: 'none' });
      return;
    }
    const tournamentId = String(this.data.tournamentId || '').trim();
    const lifecycleGeneration = Number(this._lifecycleGeneration || 0);
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'delete');
    wx.showModal({
      title: '确认取消比赛？',
      content: '删除后转发失效、不可恢复。',
      confirmText: '取消比赛',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
        const actionKey = `lobby:cancelTournament:${tournamentId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.runCriticalWrite(actionKey, async () => {
          wx.showLoading({ title: '取消中...' });
          try {
            cloud.assertWriteResult(await cloud.call('deleteTournament', {
              tournamentId,
              clientRequestId
            }), '取消失败');
            wx.hideLoading();
            storage.removeRecentTournamentId(tournamentId);
            storage.removeLocalCompletedTournamentSnapshot(tournamentId);
            storage.removeLocalTournamentCache(tournamentId);
            nav.markRefreshFlag(tournamentId);
            if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
            this.clearLastFailedAction();
            wx.showToast({ title: '已取消', icon: 'success' });
            nav.goHome();
          } catch (err) {
            wx.hideLoading();
            if (Number(this._lifecycleGeneration || 0) !== lifecycleGeneration) return;
            this.setLastFailedAction('取消比赛', () => this.cancelTournament({ clientRequestId }), { actionKey });
            this.handleWriteError(err, '取消失败', () => this.fetchTournament(tournamentId));
          }
        });
      }
    });
  }
};
