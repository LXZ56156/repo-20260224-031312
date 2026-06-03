const normalize = require('../../core/normalize');
const nav = require('../../core/nav');
const pageTitle = require('../../core/pageTitle');
const pageTournamentSync = require('../../core/pageTournamentSync');
const rankingCore = require('../../core/ranking');
const flow = require('../../core/uxFlow');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
const avatarDisplay = require('../../core/avatarDisplay');
const uiPreferences = require('../../core/uiPreferences');
const shareActivity = require('../../core/shareActivity');
const shareMeta = require('../../core/shareMeta');
const shareCard = require('../../core/shareCard');
const shareCardPreheat = require('../../core/shareCardPreheat');
const shareCardStats = require('../../core/shareCardStats');
const shareCode = require('../../core/shareCode');
const tournamentEntry = require('../../core/tournamentEntry');

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
    primaryNavItems: []
  },

  ...rankingSyncController,

  onLoad(options) {
    const tid = tournamentEntry.parseTournamentIdFromPageOptions(options || {});
    this.ensureAvatarRuntime();
    pageTournamentSync.initTournamentSync(this);
    this.openid = (getApp().globalData.openid || '');
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
    pageTournamentSync.pauseTournamentSync(this);
  },

  onShow() {
    this.refreshUiPreferences();
    const currentId = String(this.data.tournamentId || '').trim();
    nav.consumeRefreshFlag(currentId);
    // 兜底刷新：部分真机 onSnapshot 监听可能不稳定
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.hasActiveWatch(this.data.tournamentId)) this.startWatch(this.data.tournamentId);
  },

  onReady() {
    this._shareCardReady = true;
    this._preheatShareCardWhenReady(this.data.tournament);
  },

  refreshUiPreferences() {
    this.setData(uiPreferences.readUiPreferencePatch());
  },

  onUnload() {
    pageTournamentSync.teardownTournamentSync(this);
    shareCardPreheat.clearPreparedShareCard(this);
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
    this._avatarResolveGen = Number(this._avatarResolveGen || 0) + 1;
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
        avatarItems: buildRankingAvatarItems(row, mode, pairTeams, playerMap, this.avatarCache || {})
      };
    });

    this.setData({
      loadError: false,
      tournament: t,
      rankings: decoratedRankings,
      rankingTypeLabel,
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('ranking', this.data.tournamentId)
    });
    this.refreshAvatarDisplays();
    this._preheatShareCardWhenReady(t);
  },

  ensureAvatarRuntime() {
    this.avatarCache = avatarDisplay.getSharedAvatarCache(this.avatarCache);
    if (!Number.isFinite(this._avatarResolveGen)) this._avatarResolveGen = 0;
  },

  async refreshAvatarDisplays() {
    this.ensureAvatarRuntime();
    const sourceTournament = this._latestTournament || this.data.tournament;
    const pending = avatarDisplay.collectCloudAvatarFileIds(this.data.rankings, this.avatarCache);
    if (!pending.length) return;
    const result = await avatarDisplay.resolveCloudAvatarFileIds(pending, this.avatarCache);
    if (!result.updated) return;
    if (sourceTournament) this.applyTournament(sourceTournament);
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

  onShareAppMessage() {
    var meta = shareMeta.buildShareMessage(this.data.tournament);
    return {
      title: meta.title,
      path: meta.path
    };
  },

  onShareTimeline() {
    var tournament = this.data.tournament;
    if (!tournament) return { title: '羽球轮转助手' };
    var eventName = tournament.name || '羽毛球比赛';
    var defaultTitle = eventName + ' 赛事排名已出炉';
    var tid = String(tournament._id || '');
    var ctx = this;
    var promise = ctx._getPreparedShareCard(tournament).then(function (imageUrl) {
      return { title: eventName, query: 'tournamentId=' + tid, imageUrl: imageUrl };
    }).catch(function () {
      return { title: defaultTitle, query: 'tournamentId=' + tid };
    });
    return { title: defaultTitle, query: 'tournamentId=' + tid, promise: promise };
  },

  _buildShareCardData: function (tournament) {
    var openid = this.openid || (getApp().globalData.openid || '');
    var rankings = this.data.rankings || [];
    var currentRow = null;
    for (var i = 0; i < rankings.length; i++) {
      if (String(rankings[i].playerId || rankings[i].entityId || '') === openid) {
        currentRow = rankings[i];
        break;
      }
    }
    if (!currentRow) {
      if (rankings.length) currentRow = rankings[0];
      else throw new Error('no ranking data');
    }
    var players = Array.isArray(tournament.players) ? tournament.players : [];
    var playerRecord = players.find(function (p) { return String(p.id || '') === String(currentRow.playerId || currentRow.entityId || ''); }) || {};
    var cardStats = shareCardStats.buildShareCardStats(tournament, currentRow);
    return {
      userName: currentRow.displayName || currentRow.name || '球员',
      eventName: tournament.name || '羽毛球比赛',
      mode: this.data.rankingTypeLabel || '',
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
  },

  _buildShareCard: function (tournament, preparedData) {
    var ctx = this;
    var cardData = preparedData || ctx._buildShareCardData(tournament);
    var qrCodePromise = shareCard.getBgPath(cardData.rank)
      ? shareCode.getTournamentShareCode(tournament && tournament._id).catch(function () { return ''; })
      : Promise.resolve('');
    return Promise.all([ctx._getShareCardCanvas(), qrCodePromise]).then(function (values) {
      cardData.qrCodeUrl = values[1];
      return shareCard.drawShareCard(values[0], cardData);
    });
  },

  _getPreparedShareCard: function (tournament) {
    return shareCardPreheat.getPreparedShareCard(this, tournament);
  },

  _preheatShareCardWhenReady: function (tournament) {
    var ctx = this;
    if (!ctx._shareCardReady || !tournament) return;
    ctx._getShareCardCanvas().then(function (canvas) {
      if (canvas) shareCardPreheat.preheatShareCard(ctx, tournament);
    });
  },

  _getShareCardCanvas: function () {
    var ctx = this;
    if (ctx._shareCardCanvas) return Promise.resolve(ctx._shareCardCanvas);
    if (ctx._shareCardCanvasPromise) return ctx._shareCardCanvasPromise;
    if (typeof wx !== 'undefined' && typeof wx.createSelectorQuery === 'function') {
      ctx._shareCardCanvasPromise = new Promise(function (resolve) {
        try {
          wx.createSelectorQuery().select('#shareCardCanvas').fields({ node: true }).exec(function (res) {
            var canvas = res && res[0] && res[0].node;
            if (canvas) ctx._shareCardCanvas = canvas;
            resolve(canvas || null);
          });
        } catch (err) {
          resolve(null);
        }
      }).finally(function () {
        ctx._shareCardCanvasPromise = null;
      });
      return ctx._shareCardCanvasPromise;
    }
    return Promise.resolve(null);
  },

  _ensureShareMenu: function () {
    shareActivity.showShareMenuBestEffort({ menus: ['shareAppMessage', 'shareTimeline'] });
  }
});
