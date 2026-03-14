const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const flow = require('../../core/uxFlow');
const viewModel = require('./lobbyViewModel');

function buildClientRequestId(prefix = 'pair_team') {
  return `${String(prefix || 'pair_team').trim() || 'pair_team'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  onPairTeamNameInput(e) {
    const value = String((e && e.detail && e.detail.value) || '').trim();
    this.setData({ pairTeamName: value });
  },

  onPickPairFirst(e) {
    const idx = Number(e && e.detail && e.detail.value);
    if (!Number.isFinite(idx)) return;
    const candidates = this.data.pairTeamCandidates || [];
    let second = Number(this.data.pairTeamSecondIndex) || 0;
    if (candidates.length > 1 && idx === second) {
      second = (idx + 1) % candidates.length;
    }
    this.setData({
      pairTeamFirstIndex: Math.max(0, idx),
      pairTeamSecondIndex: Math.max(0, second)
    });
  },

  onPickPairSecond(e) {
    const idx = Number(e && e.detail && e.detail.value);
    if (!Number.isFinite(idx)) return;
    const candidates = this.data.pairTeamCandidates || [];
    let first = Number(this.data.pairTeamFirstIndex) || 0;
    if (candidates.length > 1 && idx === first) {
      first = (idx + 1) % candidates.length;
    }
    this.setData({
      pairTeamFirstIndex: Math.max(0, first),
      pairTeamSecondIndex: Math.max(0, idx)
    });
  },

  async autoGeneratePairTeams() {
    if (this.data.pairTeamBusy) return;
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    const actionKey = `lobby:managePairTeams:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'pairTeamBusy', actionKey, async () => {
      wx.showLoading({ title: '自动组队中...' });
      try {
        const res = await cloud.call('managePairTeams', {
          tournamentId: this.data.tournamentId,
          action: 'auto_generate',
          clientRequestId: buildClientRequestId('pair_auto')
        });
        if (!res || res.ok === false) {
          wx.hideLoading();
          wx.showToast({ title: viewModel.getPairTeamErrorMessage(res && res.code, res && res.message), icon: 'none' });
          return;
        }
        wx.hideLoading();
        const warnings = Array.isArray(res && res.warnings) ? res.warnings : [];
        wx.showToast({ title: String(warnings[0] || '已自动组队'), icon: warnings.length ? 'none' : 'success' });
        await this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.handleWriteError(err, '自动组队失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async createPairTeam() {
    if (this.data.pairTeamBusy) return;
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    const candidates = this.data.pairTeamCandidates || [];
    if (candidates.length < 2) {
      wx.showToast({ title: '可组队成员不足', icon: 'none' });
      return;
    }
    const first = candidates[Number(this.data.pairTeamFirstIndex) || 0];
    const second = candidates[Number(this.data.pairTeamSecondIndex) || 0];
    if (!first || !second || first.id === second.id) {
      wx.showToast({ title: '请选择两名不同成员', icon: 'none' });
      return;
    }
    const actionKey = `lobby:managePairTeams:${this.data.tournamentId}`;
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'pairTeamBusy', actionKey, async () => {
      wx.showLoading({ title: '创建队伍...' });
      try {
        const res = await cloud.call('managePairTeams', {
          tournamentId: this.data.tournamentId,
          action: 'create',
          name: String(this.data.pairTeamName || '').trim(),
          playerIds: [first.id, second.id],
          clientRequestId: buildClientRequestId('pair_create')
        });
        if (!res || res.ok === false) {
          wx.hideLoading();
          wx.showToast({ title: viewModel.getPairTeamErrorMessage(res && res.code, res && res.message), icon: 'none' });
          return;
        }
        wx.hideLoading();
        wx.showToast({ title: '队伍已创建', icon: 'success' });
        this.setData({ pairTeamName: '' });
        await this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.hideLoading();
        this.handleWriteError(err, '创建队伍失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  },

  async deletePairTeam(e) {
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    const teamId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.team) || '').trim();
    if (!teamId) return;
    wx.showModal({
      title: '删除队伍？',
      content: '删除后可重新组队。',
      success: async (res) => {
        if (!res.confirm) return;
        const actionKey = `lobby:managePairTeams:${this.data.tournamentId}`;
        if (actionGuard.isBusy(actionKey)) return;
        await actionGuard.runWithPageBusy(this, 'pairTeamBusy', actionKey, async () => {
          wx.showLoading({ title: '删除中...' });
          try {
            const result = await cloud.call('managePairTeams', {
              tournamentId: this.data.tournamentId,
              action: 'delete',
              teamId,
              clientRequestId: buildClientRequestId('pair_delete')
            });
            if (!result || result.ok === false) {
              wx.hideLoading();
              wx.showToast({ title: viewModel.getPairTeamErrorMessage(result && result.code, result && result.message), icon: 'none' });
              return;
            }
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            await this.fetchTournament(this.data.tournamentId);
          } catch (err) {
            wx.hideLoading();
            this.handleWriteError(err, '删除队伍失败', () => this.fetchTournament(this.data.tournamentId));
          }
        });
      }
    });
  }
};
