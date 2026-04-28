const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const pageTimers = require('../../core/pageTimers');
const storage = require('../../core/storage');
const viewModel = require('./lobbyViewModel');
const quickSettingsActions = require('./lobbyQuickSettingsActions');
const importActions = require('./lobbyImportActions');
const lifecycleActions = require('./lobbyLifecycleActions');

const PLAYER_LONGPRESS_TAP_SUPPRESS_MS = 700;

function resolveOpenId(ctx) {
  const direct = String((ctx && ctx.openid) || '').trim();
  if (direct) return direct;
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    const value = String((app && app.globalData && app.globalData.openid) || '').trim();
    if (value) return value;
  } catch (_) {
    // ignore
  }
  return String(storage.get('openid', '') || '').trim();
}

function findPlayerName(ctx, playerId, fallback = '') {
  const pid = String(playerId || '').trim();
  const fromDisplay = (ctx.data.displayPlayers || []).find((item) => String(item && item.id || '').trim() === pid);
  if (fromDisplay && String(fromDisplay.name || '').trim()) return String(fromDisplay.name || '').trim();
  const tournament = ctx.data.tournament || {};
  const fromTournament = (Array.isArray(tournament.players) ? tournament.players : [])
    .find((item) => String(item && item.id || '').trim() === pid);
  return String((fromTournament && fromTournament.name) || fallback || '').trim() || '该成员';
}

async function executeRemovePlayer(ctx, options = {}) {
  const playerId = String(options.playerId || '').trim();
  if (!playerId) return;
  const tournamentId = String(ctx.data.tournamentId || '').trim();
  if (!tournamentId) return;

  const isSelfRemove = options.isSelfRemove === true;
  const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'remove_player');
  const actionKey = `lobby:removePlayer:${tournamentId}:${playerId}`;
  if (actionGuard.isBusy(actionKey)) return;

  return actionGuard.runCriticalWrite(actionKey, async () => {
    wx.showLoading({ title: isSelfRemove ? '退出中...' : '移除中...' });
    try {
      cloud.assertWriteResult(await cloud.call('removePlayer', {
        tournamentId,
        playerId,
        clientRequestId
      }), isSelfRemove ? '退出失败' : '移除失败');
      wx.hideLoading();
      ctx.clearLastFailedAction();
      wx.showToast({ title: isSelfRemove ? '已退出参赛' : '已移除', icon: 'success' });
      await ctx.fetchTournament(tournamentId);
      nav.markRefreshFlag(tournamentId);
    } catch (err) {
      wx.hideLoading();
      ctx.setLastFailedAction(isSelfRemove ? '退出参赛' : '移除参赛成员', () => executeRemovePlayer(ctx, {
        playerId,
        isSelfRemove,
        clientRequestId
      }), { actionKey });
      ctx.handleWriteError(err, isSelfRemove ? '退出失败' : '移除失败', () => ctx.fetchTournament(tournamentId));
    }
  });
}

const draftActions = {
  runFlowAction(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const handlers = {
      join: () => this.handleJoin(),
      profile_join: () => this.submitProfile(),
      profile_save: () => this.submitProfile(),
      view_only_join: () => this.enterJoinFromViewOnly(),
      settings: () => this.goEditTournament(),
      quickImport: () => this.focusQuickImportArea(),
      import_players: () => this.focusQuickImportArea(),
      build_pair_teams: () => this.scrollToPairTeamSection(),
      assign_squads: () => this.focusShareInviteArea(),
      focus_start: () => this.focusStartAction(),
      sync_settings: () => this.saveAndStart(),
      start: () => this.handleStart(),
      batch: () => this.goBatchScoring(),
      analytics: () => this.goAnalytics(),
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

  goSettings(section = '') {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    nav.setLobbyIntent(tid, String(section || '').trim() === 'params' ? 'settings' : 'settings');
    nav.goLobby(tid);
  },

  goEditTournament() {
    if (!this.data.canConfigureSettings) {
      wx.showToast({ title: '满 4 人后再设置参数', icon: 'none' });
      this.focusShareInviteArea();
      return;
    }
    if (!this.data.adminPanelExpanded) {
      this.setData({ adminPanelExpanded: true });
    }
    setTimeout(() => {
      try {
        wx.pageScrollTo({ selector: '#quick-settings', duration: 220 });
      } catch (_) {
        // ignore
      }
    }, 100);
  },

  goAnalytics() {
    nav.redirectOrNavigate(nav.buildTournamentUrl('/pages/analytics/index', this.data.tournamentId));
  },

  focusShareInviteArea() {
    try {
      wx.pageScrollTo({ selector: '#share-invite', duration: 220 });
    } catch (_) {
      // ignore
    }
    this.pulseShareHint(2200);
  },

  focusStartAction() {
    if (!this.data.checkStartReady) return;
    pageTimers.setNamedTimer(this, 'focusStartAction', () => {
      try {
        wx.pageScrollTo({ selector: '#state-primary-action', duration: 220 });
      } catch (_) {
        // ignore
      }
    }, 90);
  },

  onChecklistTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    if (key === 'settings') {
      this.goEditTournament();
      return;
    }
    if (key === 'players') {
      this.focusShareInviteArea();
      return;
    }
    if (key === 'start') {
      if (this.data.checkStartReady) return;
      if (!this.data.checkSettingsOk) this.goEditTournament();
      else this.focusShareInviteArea();
    }
  },

  onPickJoinSquad(e) {
    const squad = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.squad) || '').trim().toUpperCase();
    if (squad !== 'A' && squad !== 'B') return;
    this.setData({ joinSquadChoice: squad });
  },

  async onTogglePlayerSquad(e, options = {}) {
    if (Number(this._ignorePlayerTapUntil || 0) > Date.now()) return;
    if (!this.data.isAdmin) return;
    if (String((this.data.tournament && this.data.tournament.status) || '') !== 'draft') return;
    if (this.data.mode !== flow.MODE_SQUAD_DOUBLES) return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    if (!playerId) return;
    const item = (this.data.displayPlayers || []).find((x) => String(x.id || '') === playerId);
    const current = String(item && item.squad || '').toUpperCase();
    const next = current === 'A' ? 'B' : 'A';
    const actionKey = `lobby:setPlayerSquad:${this.data.tournamentId}:${playerId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'set_squad');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      try {
        cloud.assertWriteResult(await cloud.call('setPlayerSquad', {
          tournamentId: this.data.tournamentId,
          playerId,
          squad: next,
          clientRequestId
        }), '调整分队失败');
        wx.showToast({ title: `已调整到${next}队`, icon: 'none' });
        this.fetchTournament(this.data.tournamentId);
      } catch (err) {
        wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '调整分队失败'), icon: 'none' });
      }
    });
  },

  async onPlayerLongPress(e, options = {}) {
    const tournament = this.data.tournament;
    if (!tournament || String(tournament.status || '').trim() !== 'draft') return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    if (!playerId) return;

    this._ignorePlayerTapUntil = Date.now() + PLAYER_LONGPRESS_TAP_SUPPRESS_MS;
    const openid = resolveOpenId(this);
    const isSelfRemove = !!openid && playerId === openid;
    if (!this.data.isAdmin && !isSelfRemove) return;

    const playerName = findPlayerName(this, playerId, e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.name);
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'remove_player');
    wx.showModal({
      title: isSelfRemove ? '退出参赛？' : `移除 ${playerName}？`,
      content: isSelfRemove
        ? '你会从参赛名单中移除，草稿阶段可重新加入。'
        : '该成员会从参赛名单中移除，草稿阶段可重新加入。',
      confirmText: isSelfRemove ? '退出' : '移除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        await executeRemovePlayer(this, { playerId, isSelfRemove, clientRequestId });
      }
    });
  },

  onNextActionTap() {
    // primaryTaskKey 优先 (赛制化单主任务流)
    const taskKey = String(this.data.primaryTaskKey || '').trim();
    if (taskKey) return this.runFlowAction(taskKey);
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
    nav.goMatch(this.data.tournamentId, {
      roundIndex: next.roundIndex,
      matchIndex: next.matchIndex,
      batch: 1
    });
  },

  scrollToPairTeamSection() {
    try {
      if (!this.data.adminPanelExpanded) {
        this.setData({ adminPanelExpanded: true });
      }
      setTimeout(() => {
        wx.pageScrollTo({ selector: '.fixed-team', duration: 220 });
      }, 100);
    } catch (_) {
      // ignore
    }
  }
};

module.exports = Object.assign(
  {},
  quickSettingsActions,
  importActions,
  lifecycleActions,
  draftActions
);
