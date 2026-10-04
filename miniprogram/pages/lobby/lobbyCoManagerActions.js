const permission = require('../../permission/permission');
const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const nav = require('../../core/nav');

module.exports = {
  syncCoManagerActionState() {
    const tournamentId = String(this.data.tournamentId || '').trim();
    const busy = actionGuard.isBusy(`lobby:coManagers:${tournamentId}`);
    if (this.data.coManagerBusy !== busy) this.setData({ coManagerBusy: busy });
    const completed = this._successfulCoManagerRetry;
    this._successfulCoManagerRetry = null;
    if (completed && completed.tournamentId === tournamentId && completed.entry === this._lastFailedAction) {
      this.clearLastFailedAction();
    }
  },

  async onToggleCoManager(event, options = {}) {
    const tournament = this._latestTournament || this.data.tournament;
    if (!permission.isAdmin(tournament, this.openid) || !['draft', 'running'].includes(tournament.status)) return false;
    if (this.data.coManagerBusy) return false;
    const tournamentId = String(this.data.tournamentId || '').trim();
    const playerId = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.player || '').trim();
    const payload = options.payload || {
      tournamentId, playerId,
      action: permission.getCoManagerIds(tournament).includes(playerId) ? 'revoke' : 'grant',
      clientRequestId: clientRequest.buildClientRequestId('co_manager')
    };
    if (payload.tournamentId !== tournamentId || !payload.playerId || payload.playerId === tournament.creatorId) return false;
    if (payload.action === 'grant' && !permission.getBoundPlayerIds(tournament).includes(payload.playerId)) return false;
    const key = `lobby:coManagers:${tournamentId}`;
    const generation = Number(this._lifecycleGeneration || 0);
    if (actionGuard.isBusy(key)) return false;
    let failedEntry = options.failedEntry;
    if (!options.payload && this._lastFailedAction && this._lastFailedAction.actionKey === `retry:${key}`) {
      failedEntry = this._lastFailedAction;
    }
    this.setData({ coManagerBusy: true });
    return actionGuard.runCriticalWrite(key, async () => {
      try {
        cloud.assertWriteResult(await cloud.call('manageCoManagers', payload), '协管操作失败');
        if (failedEntry && failedEntry === this._lastFailedAction && tournamentId === this.data.tournamentId) {
          this._successfulCoManagerRetry = { tournamentId, entry: failedEntry };
        }
        if (generation !== Number(this._lifecycleGeneration || 0) || tournamentId !== this.data.tournamentId) return false;
        this.syncCoManagerActionState();
        nav.markRefreshFlag(tournamentId);
        wx.showToast({ title: payload.action === 'grant' ? '已设为协管' : '已撤销协管', icon: 'none' });
        await this.fetchTournament(tournamentId);
        return true;
      } catch (err) {
        if (generation !== Number(this._lifecycleGeneration || 0) || tournamentId !== this.data.tournamentId) return false;
        let failedEntry;
        this.setLastFailedAction('协管操作', () => this.onToggleCoManager(null, { payload, failedEntry }), { actionKey: key });
        failedEntry = this._lastFailedAction;
        this.handleWriteError(err, '协管操作失败，请重试', () => this.fetchTournament(tournamentId));
        return false;
      }
    }, {
      onRelease: () => {
        if (tournamentId !== this.data.tournamentId || this._coManagerActionVisible === false) return;
        if (generation === Number(this._lifecycleGeneration || 0) || this._coManagerActionVisible === true) {
          this.syncCoManagerActionState();
        }
      }
    });
  }
};
