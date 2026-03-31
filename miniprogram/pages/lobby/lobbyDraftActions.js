const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const pageTimers = require('../../core/pageTimers');
const viewModel = require('./lobbyViewModel');
const quickSettingsActions = require('./lobbyQuickSettingsActions');
const importActions = require('./lobbyImportActions');
const lifecycleActions = require('./lobbyLifecycleActions');

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
