const auth = require('../../core/auth');
const normalize = require('../../core/normalize');
const nav = require('../../core/nav');
const pageTitle = require('../../core/pageTitle');
const pageTournamentSync = require('../../core/pageTournamentSync');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const avatarDisplay = require('../../core/avatarDisplay');
const uiPreferences = require('../../core/uiPreferences');
const shareCardStats = require('../../core/shareCardStats');
const sharePageMixin = require('../../core/sharePageMixin');
const tournamentEntry = require('../../core/tournamentEntry');
const growthTracker = require('../../core/growthTracker');

const rankingSyncController = pageTournamentSync.createTournamentSyncMethods({
  loadErrorMessages: {
    notFoundMessage: '链接可能已失效，或比赛已被删除。'
  },
  buildRemoteState() {
    return {
      loadError: false,
      showStaleSyncHint: false,
      loadErrorTitle: '加载失败',
      loadErrorMessage: '请检查网络后重试。',
      showLoadErrorHome: false
    };
  }
});

function buildFallbackPlayer(id, name) {
  return {
    id: String(id || name || '').trim(),
    name: String(name || id || '').trim() || '球员'
  };
}

function buildPlayerMap(players) {
  const map = {};
  for (const player of (Array.isArray(players) ? players : [])) {
    const id = String((player && player.id) || '').trim();
    if (!id) continue;
    map[id] = player;
  }
  return map;
}

function buildRankingAvatarItems(row, mode, pairTeams, playerMap, avatarCache = {}) {
  const entityType = String((row && row.entityType) || '').trim().toLowerCase();
  const entityId = String((row && (row.entityId || row.playerId)) || '').trim();
  if (!entityId) return [];
  if (entityType !== 'team') {
    return [avatarDisplay.buildAvatarDisplay(playerMap[entityId] || buildFallbackPlayer(entityId, row && row.name), avatarCache)];
  }
  if (mode !== flow.MODE_FIXED_PAIR_RR) return [];
  const pair = (Array.isArray(pairTeams) ? pairTeams : []).find((item) => String(item && item.id || '').trim() === entityId);
  const pairIds = Array.isArray(pair && pair.playerIds) ? pair.playerIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  return pairIds
    .slice(0, 2)
    .map((playerId) => avatarDisplay.buildAvatarDisplay(playerMap[playerId] || buildFallbackPlayer(playerId, playerId), avatarCache));
}

var shareMixin = sharePageMixin.createSharePageMixin({
  canvasSelector: '#shareCardCanvas',
  posterCanvasSelector: '#posterCanvas',
  buildShareCardData: function (tournament) {
    var openid = this.openid || (getApp().globalData.openid || '');
    var rankings = this.data.rankings || [];
    var currentRow = this._posterTargetRow || null;
    if (!currentRow) currentRow = shareCardStats.findViewerRankingRow(tournament, rankings, openid);
    if (!currentRow) {
      if (rankings.length) currentRow = rankings[0];
      else throw new Error('no ranking data');
    }
    var players = Array.isArray(tournament.players) ? tournament.players : [];
    var playerRecord = players.find(function (p) { return String(p.id || '') === String(currentRow.playerId || currentRow.entityId || ''); }) || {};
    var cardStats = shareCardStats.buildShareCardStats(tournament, currentRow);
    var modeLabel = flow.getModeDisplayLabel(tournament.mode || flow.MODE_MULTI_ROTATE, tournament.presetKey);
    var statusText = String(tournament.status || '').trim() === 'finished' ? '最终排名出炉' : '实时排名更新中';
    return {
      userName: currentRow.displayName || currentRow.name || '球员',
      eventName: tournament.name || '羽毛球比赛',
      mode: modeLabel ? modeLabel + ' · ' + statusText : statusText,
      wins: currentRow.wins || 0,
      losses: currentRow.losses || 0,
      winRate: cardStats.winRate,
      totalMatches: cardStats.totalMatches,
      maxWinStreak: cardStats.maxWinStreak,
      avgScore: cardStats.avgScore,
      rank: Number(currentRow.rank) || 1,
      avatarUrl: String(playerRecord.avatar || playerRecord.avatarUrl || ''),
      appName: '羽球轮转助手'
    };
  }
});

function findRankingRowByRank(rankings, rank) {
  var targetRank = Number(rank);
  if (!Number.isFinite(targetRank) || targetRank <= 0) return null;
  var list = Array.isArray(rankings) ? rankings : [];
  for (var i = 0; i < list.length; i++) {
    if (Number(list[i] && list[i].rank) === targetRank) return list[i];
  }
  return null;
}

function buildPosterButtonText(isCurrentUserInRanking) {
  return isCurrentUserInRanking ? '生成我的战绩卡' : '生成榜首战绩卡';
}

function buildRankingShareBanner(tournament) {
  return String(tournament && tournament.status || '').trim() === 'finished' ? '最终排名已出炉' : '';
}

Page({
  data: {
    tournamentId: '',
    tournament: null,
    rankings: [],
    rankingTypeLabel: '个人榜',
    loadingSkeletonRows: [1, 2, 3, 4, 5],
    networkOffline: false,
    showStaleSyncHint: false,
    loadError: false,
    loadErrorTitle: '加载失败',
    loadErrorMessage: '请检查网络后重试。',
    showLoadErrorHome: false,
    syncRefreshing: false,
    syncUsingCache: false,
    syncPollingFallback: false,
    syncCachedAt: 0,
    syncLastUpdatedAt: 0,
    syncStatusVisible: false,
    syncStatusTone: 'info',
    syncStatusText: '',
    syncStatusMeta: '',
    syncStatusActionText: '刷新',
    motionLevel: 'standard',
    listDensity: 'comfortable',
    uiMotionClass: 'motion-standard',
    uiDensityClass: 'density-comfortable',
    uiPreferenceClass: 'motion-standard density-comfortable',
    primaryNavCurrent: 'ranking',
    primaryNavItems: [],
    posterImageUrl: '',
    showPosterPreview: false,
    posterButtonText: '生成战绩卡',
    rankingShareBannerText: ''
  },

  ...rankingSyncController,
  ...shareMixin,

  onLoad(options) {
    this._pageActive = true;
    const tid = tournamentEntry.parseTournamentIdFromPageOptions(options || {});
    this._autoPosterRequested = String((options && options.autoPoster) || '') === '1' ||
      String((options && options.shareIntent) || '').trim() === 'poster';
    this._trackedRankingView = false;
    this.ensureAvatarRuntime();
    pageTournamentSync.initTournamentSync(this);
    this.openid = (getApp().globalData.openid || '');
    this.primeViewerIdentity();
    this.setData({
      tournamentId: tid,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', tid),
      ...uiPreferences.readUiPreferencePatch()
    });

    const app = getApp();
    const initialOffline = !!(app && app.globalData && app.globalData.networkOffline);
    this.setData(pageTournamentSync.composePageSyncPatch(this, { networkOffline: initialOffline }));
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.handleNetworkChange(offline);
      });
    }

    if (!tid) {
      this.setData({
        loadError: true,
        loadErrorTitle: '链接无效',
        loadErrorMessage: '请确认比赛链接是否完整。',
        showLoadErrorHome: true
      });
      return;
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
    this._ensureShareMenu();
  },

  onHide() {
    this._pageActive = false;
    pageTournamentSync.pauseTournamentSync(this);
  },

  onShow() {
    const shouldRefreshIdentity = this._pageActive === false;
    this._pageActive = true;
    if (shouldRefreshIdentity) this.primeViewerIdentity();
    this.refreshUiPreferences();
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  refreshUiPreferences() {
    this.setData(uiPreferences.readUiPreferencePatch());
  },

  onUnload() {
    this._pageActive = false;
    pageTournamentSync.teardownTournamentSync(this);
    this._clearShareCache();
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
    this._avatarResolveGen = Number(this._avatarResolveGen || 0) + 1;
  },

  async primeViewerIdentity() {
    try {
      const openid = String(await auth.login() || '').trim();
      if (!openid || this._pageActive === false) return;
      const changed = openid !== String(this.openid || '').trim();
      this.openid = openid;
      if (!changed) return;
      const tournament = this._latestTournament || this.data.tournament;
      if (tournament) this.applyTournament(tournament);
    } catch (_) {
      return;
    }
  },

  applyTournament(t) {
    if (!t) return;
    this.ensureAvatarRuntime();
    t = normalize.normalizeTournament(t);
    const tournamentName = flow.getTournamentDisplayName(t, '未命名赛事');
    if (tournamentName !== String(t.name || '').trim()) {
      t = { ...t, name: tournamentName };
    }
    pageTitle.setTournamentPageTitle(this, '赛事排名', t);
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const isTeamMode = mode === flow.MODE_SQUAD_DOUBLES || mode === flow.MODE_FIXED_PAIR_RR;
    const rankingTypeLabel = isTeamMode ? '队伍榜' : '个人榜';
    const rawRankings = rankingCore.buildRankingWithTrend(t);

    // decorate: 队伍模式增加成员副标题, played < 2 弱化 trend
    const players = Array.isArray(t.players) ? t.players : [];
    const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
    const playerMap = buildPlayerMap(players);
    const playerNameMap = {};
    for (const p of players) {
      const pid = String((p && p.id) || '').trim();
      if (pid) playerNameMap[pid] = String((p && (p.nickName || p.nickname || p.name)) || '').trim() || pid;
    }
    const decoratedRankings = rawRankings.map((row, idx) => {
      let displayName = String(row && row.name || '').trim();
      let subtitle = '';
      if (isTeamMode) {
        const eid = String(row.entityId || row.playerId || '').trim();
        // fixed_pair_rr: 从 pairTeams 查成员
        const pair = pairTeams.find((pt) => String(pt && pt.id || '') === eid);
        if (pair && Array.isArray(pair.playerIds)) {
          subtitle = pair.playerIds.map((id) => playerNameMap[String(id || '')] || String(id || '')).join(' / ');
        }
        // squad_doubles: 对于 A/B 队, 从 players 按 squad 汇聚
        if (!subtitle && (eid === 'A' || eid === 'B')) {
          const members = players
            .filter((p) => String((p && p.squad) || '').toUpperCase() === eid)
            .map((p) => String((p && (p.nickName || p.nickname || p.name)) || '').trim() || '球员');
          if (members.length) subtitle = members.join(' / ');
        }
        if (mode === flow.MODE_FIXED_PAIR_RR && subtitle) {
          displayName = subtitle;
          subtitle = displayName !== String(row && row.name || '').trim()
            ? String(row && row.name || '').trim()
            : '';
        }
      }
      const showTrend = Number(row.played) >= 2;
      return {
        ...row,
        rank: idx + 1,
        displayName: displayName || String(row && row.name || '').trim() || '队伍',
        subtitle,
        showTrend,
        topShareText: idx < 3 ? '分享' : '',
        avatarItems: buildRankingAvatarItems(row, mode, pairTeams, playerMap, this.avatarCache || {})
      };
    });

    const currentOpenid = String(this.openid || '').trim();
    const isCurrentUserInRanking = !!shareCardStats.findViewerRankingRow(t, decoratedRankings, currentOpenid);

    this.setData({
      loadError: false,
      tournament: t,
      rankings: decoratedRankings,
      rankingTypeLabel,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', this.data.tournamentId),
      posterButtonText: buildPosterButtonText(isCurrentUserInRanking),
      rankingShareBannerText: buildRankingShareBanner(t)
    });
    this.refreshAvatarDisplays();
    this._preheatShareWhenReady(t);
    this.trackRankingView(t);
    this.maybeFireAutoPoster(t._id || this.data.tournamentId);
  },

  trackRankingView(tournament) {
    if (this._trackedRankingView) return;
    this._trackedRankingView = true;
    growthTracker.track('ranking_view', growthTracker.fromTournament(tournament || this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'view'
    }));
  },

  ensureAvatarRuntime() {
    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
    if (!Number.isFinite(this._avatarResolveGen)) this._avatarResolveGen = 0;
  },

  async refreshAvatarDisplays() {
    this.ensureAvatarRuntime();
    const pending = avatarDisplay.collectCloudAvatarFileIds(this.data.rankings, this.avatarCache);
    if (!pending.length) return;
    const result = await avatarDisplay.resolveCloudAvatarFileIds(pending, this.avatarCache);
    if (!result.updated) return;
    const latestTournament = this._latestTournament || this.data.tournament;
    if (latestTournament) this.applyTournament(latestTournament);
  },

  onAvatarImageError(e) {
    this.ensureAvatarRuntime();
    const raw = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.avatarRaw || '').trim();
    if (avatarDisplay.isCloudAvatar(raw)) {
      avatarDisplay.markAvatarUrlFailed(this.avatarCache, raw);
      const tournament = this._latestTournament || this.data.tournament;
      if (tournament) this.applyTournament(tournament);
    }
  },

  onPrimaryNavTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    matchPrimaryNav.navigateToPrimary(key, this.data.tournamentId, 'ranking');
  },

  goHome() {
    nav.goHome();
  },

  onGeneratePoster() {
    this._posterTargetRow = null;
    growthTracker.track('ranking_generate_poster_click', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'generate_poster'
    }));
    return shareMixin.onGeneratePoster.call(this);
  },

  onShareRankingRow(e) {
    const rank = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.rank);
    const row = findRankingRowByRank(this.data.rankings, rank);
    if (!row) return this.onGeneratePoster();
    this._posterTargetRow = row;
    growthTracker.track('ranking_generate_poster_click', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'top_rank'
    }));
    return shareMixin.onGeneratePoster.call(this);
  },

  onPosterGenerated() {
    growthTracker.track('ranking_generate_poster_success', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'generate_poster',
      r: 'success'
    }));
  },

  onPosterSaved() {
    growthTracker.track('ranking_save_poster_success', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'save_poster',
      r: 'success'
    }));
  },

  onShareTextCopied() {
    growthTracker.track('ranking_copy_share_text', growthTracker.fromTournament(this.data.tournament, {
      tournamentId: this.data.tournamentId,
      src: 'ranking',
      a: 'copy'
    }));
  },

  maybeFireAutoPoster(tournamentId) {
    const tid = String(tournamentId || '').trim();
    if (!tid || !this._autoPosterRequested || this._autoPosterFiredInPage) return;
    this._autoPosterFiredInPage = true;
    setTimeout(async () => {
      await this.primeViewerIdentity();
      if (this._pageActive === false) {
        this._autoPosterFiredInPage = false;
        return;
      }
      try {
        this.onGeneratePoster();
      } catch (err) {
        console.warn('[ranking] auto poster failed', err);
      }
    }, 120);
  },

});
