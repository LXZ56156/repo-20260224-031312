const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const cloneTournamentCore = require('../../core/cloneTournament');
const storage = require('../../core/storage');
const nav = require('../../core/nav');
const writeErrorUi = require('../../core/writeErrorUi');

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
    const actionKey = `lobby:cloneTournament:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'clone');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      wx.showLoading({ title: '复制中...' });
      try {
        const nextId = await cloneTournamentCore.cloneTournament(this.data.tournamentId, { clientRequestId });
        wx.hideLoading();
        this.clearLastFailedAction();
        wx.showToast({ title: '已生成副本', icon: 'success' });
        nav.goLobby(nextId);
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament({ clientRequestId }), { actionKey });
        this.handleWriteError(err, '复制失败', () => this.fetchTournament(this.data.tournamentId));
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

    try {
      await this.saveQuickSettings();
      await this.handleStart();
    } catch (_) {
      // saveQuickSettings 和 handleStart 内部已有错误处理
    }
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
        this.clearLastFailedAction();
        wx.showToast({ title: '已开赛', icon: 'success' });
        nav.markRefreshFlag(this.data.tournamentId);
        setTimeout(() => {
          nav.goSchedule(this.data.tournamentId);
        }, 280);
      } catch (err) {
        wx.hideLoading();
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
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'delete');
    wx.showModal({
      title: '确认取消比赛？',
      content: '删除后转发失效、不可恢复。',
      confirmText: '取消比赛',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        const actionKey = `lobby:cancelTournament:${this.data.tournamentId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.runCriticalWrite(actionKey, async () => {
          wx.showLoading({ title: '取消中...' });
          try {
            cloud.assertWriteResult(await cloud.call('deleteTournament', {
              tournamentId: this.data.tournamentId,
              clientRequestId
            }), '取消失败');
            wx.hideLoading();
            this.clearLastFailedAction();
            storage.removeRecentTournamentId(this.data.tournamentId);
            storage.removeLocalCompletedTournamentSnapshot(this.data.tournamentId);
            storage.removeLocalTournamentCache(this.data.tournamentId);
            wx.showToast({ title: '已取消', icon: 'success' });
            nav.markRefreshFlag(this.data.tournamentId);
            nav.goHome();
          } catch (err) {
            wx.hideLoading();
            this.setLastFailedAction('取消比赛', () => this.cancelTournament({ clientRequestId }), { actionKey });
            this.handleWriteError(err, '取消失败', () => this.fetchTournament(this.data.tournamentId));
          }
        });
      }
    });
  }
};
