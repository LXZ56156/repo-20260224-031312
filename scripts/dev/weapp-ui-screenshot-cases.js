'use strict';

const waterV2Fixtures = require('./water-v2-screenshot-fixtures');
const { buildLobbyViewModel } = require('../../miniprogram/pages/lobby/lobbyViewModel');
const { buildSyncBannerState } = require('../../miniprogram/core/syncStatus');
const { buildTournamentViewState, buildLockHint } = require('../../miniprogram/pages/match/matchViewModel');
const { getPrimaryNavItems } = require('../../miniprogram/core/matchPrimaryNav');
const { buildShareEntryViewModel } = require('../../miniprogram/core/shareMeta');
const { buildSettingsViewState } = require('../../miniprogram/pages/settings/settingsViewModel');
const { computeRankings } = require('../../miniprogram/core/ranking');

const manualActions = [
  '原生 picker 展开态与滚轮选择',
  '系统确认 modal 的确认与取消',
  '键盘弹起时输入区、safe-area 与内部滚动',
];

const shared = {
  navSchedule: getPrimaryNavItems('schedule', 'demo'),
  navRanking: getPrimaryNavItems('ranking', 'demo'),
  rankings: [
    { rank: 1, rankKey: 'p1', displayName: '阿杰', name: '阿杰', entityType: 'player', played: 8, wins: 7, losses: 1, pointsFor: 168, pointsAgainst: 136, pointDiff: 32, trendText: '连胜 4', trendType: 'up', showTrend: true, topShareText: '分享', avatarItems: [] },
    { rank: 2, rankKey: 'p2', displayName: '小林', name: '小林', entityType: 'player', played: 8, wins: 6, losses: 2, pointsFor: 154, pointsAgainst: 136, pointDiff: 18, trendText: '连胜 2', trendType: 'up', showTrend: true, topShareText: '分享', avatarItems: [] },
    { rank: 3, rankKey: 'p3', displayName: 'Chris', name: 'Chris', entityType: 'player', played: 8, wins: 5, losses: 3, pointsFor: 148, pointsAgainst: 139, pointDiff: 9, trendText: '状态稳定', trendType: '', showTrend: true, topShareText: '分享', avatarItems: [] },
  ],
};

const localAvatar = '/assets/avatar-default.png';

const profileGateStorageFixture = {
  profileGate: true,
};

function buildShareTournament(id, status = 'draft', mode = 'multi_rotate') {
  const players = ['阿杰', '小林', 'Chris', '王姐', '李哥', '赵同学'].map((name, index) => ({
    id: `__ui_share_player_${index}`, name, type: 'user', avatar: localAvatar,
    ...(mode === 'squad_doubles' ? { squad: index < 3 ? 'A' : 'B' } : {}),
  }));
  const tournament = {
    _id: id, name: '周末羽毛球赛', creatorId: players[0].id, mode, status,
    version: status === 'finished' ? 2 : 1, players, playerIds: players.map(player => player.id),
    totalMatches: 6, courts: 1, settingsConfigured: true,
    rules: { gamesPerMatch: 1, pointsPerGame: 21, endConditionType: 'total_matches', endConditionTarget: 6 },
    scheduledAt: '2026-10-11T11:00:00.000Z', venue: '社区球馆', rounds: [], rankings: [],
  };
  if (status !== 'draft') {
    // Six local doubles matches: each player appears four times, with no same
    // round overlap. This is a display dataset, not scheduler acceptance proof.
    tournament.rounds = Array.from({ length: 6 }, (_, roundIndex) => {
      const completed = status === 'finished' || roundIndex < 3;
      return { roundIndex, matches: [{ matchIndex: 0,
        teamA: [players[roundIndex % 6], players[(roundIndex + 1) % 6]],
        teamB: [players[(roundIndex + 2) % 6], players[(roundIndex + 3) % 6]],
        status: completed ? 'finished' : 'pending',
        ...(completed ? { score: { teamA: 21, teamB: 17 + roundIndex % 3 },
          scorerId: players[0].id, scorerName: players[0].name } : {}),
      }] };
    });
    tournament.rankings = computeRankings(tournament);
  }
  return tournament;
}

const shareDraftTournament = buildShareTournament('__ui_share_draft');
const shareRunningTournament = buildShareTournament('__ui_share_running', 'running');
const shareFinishedTournament = buildShareTournament('__ui_share_finished', 'finished');
const shareSquadTournament = buildShareTournament('__ui_share_squad', 'draft', 'squad_doubles');
const shareViewerId = '__ui_share_viewer';

const cases = {
  waterLegacyOwnerFeed: {
    path: '/pages/water/index?id=water_legacy_demo',
    selectors: ['.water-page', '.water-legacy-undo', '.water-feed-item'],
    fixture: {
      methods: [{ name: 'applySession', args: [{
        id: 'water_legacy_demo', title: '周末打水局', status: 'active', version: 3,
        isOwner: true, viewerParticipantId: 'p1',
        participants: [{ id: 'p1', name: '阿杰' }, { id: 'p2', name: '王姐' }],
        entries: [{ id: 'legacy_1', type: 'transfer', fromPlayerId: 'p1', toPlayerId: 'p2', units: 2, createdAtMs: 1789191000000 }],
      }] }],
      postData: { activeTab: 'feed' },
    },
  },
  waterLegacyMemberFeed: {
    path: '/pages/water/index?id=water_legacy_demo',
    selectors: ['.water-page', '.water-feed-item', '.water-dock-readonly'],
    fixture: {
      methods: [{ name: 'applySession', args: [{
        id: 'water_legacy_demo', title: '周末打水局', status: 'active', version: 3,
        isOwner: false, viewerParticipantId: 'p2',
        participants: [{ id: 'p1', name: '阿杰' }, { id: 'p2', name: '王姐' }],
        entries: [{ id: 'legacy_1', type: 'transfer', fromPlayerId: 'p1', toPlayerId: 'p2', units: 2, createdAtMs: 1789191000000 }],
      }] }],
      postData: { activeTab: 'feed' },
    },
  },
  waterV2OwnerEmpty: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-ledger-table', '.water-action-dock'],
    fixture: waterV2Fixtures.ownerEmpty,
  },
  waterV2Member24: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-latest-receipt', '.water-ledger-row', '.water-action-dock'],
    fixture: waterV2Fixtures.member24,
  },
  waterV2Member24Game: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: [
      '.water-page', '.water-game-sheet', '.water-game-sheet .water-search',
      '.water-game-sheet .water-confirm-button', '.water-player-chip.is-winner', '.water-player-chip.is-loser',
      '.water-game-validation', '.water-action-dock',
    ],
    fixture: waterV2Fixtures.member24Game,
    selectorExpectations: {
      '.water-game-sheet': { expectedCount: 1, visible: true },
      '.water-game-sheet .water-confirm-button': { expectedCount: 1, visible: true },
    },
  },
  waterV2VisitorLong: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-audit-track', '.water-feed-item', '.water-action-dock'],
    fixture: waterV2Fixtures.visitorLong,
  },
  waterV2MemberDirect: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-direct-sheet', '.water-direct-sheet .water-direct-preview', '.water-direct-sheet .water-confirm-button'],
    selectorExpectations: {
      '.water-direct-sheet': { expectedCount: 1, visible: true },
      '.water-direct-sheet .water-confirm-button': { expectedCount: 1, visible: true },
    },
    fixture: waterV2Fixtures.memberDirect,
  },
  waterV2MemberCorrection: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-direct-sheet', '.water-direct-sheet .water-direct-preview', '.water-direct-sheet .water-sheet-title', '.water-direct-sheet .water-confirm-button'],
    selectorExpectations: {
      '.water-direct-sheet': { expectedCount: 1, visible: true },
      '.water-direct-sheet .water-sheet-title': { expectedCount: 1, visible: true },
      '.water-direct-sheet .water-confirm-button': { expectedCount: 1, visible: true },
    },
    fixture: waterV2Fixtures.memberCorrection,
  },
  waterV2OwnerCorrectionLong: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-game-sheet', '.water-match-summary', '.water-game-sheet .water-confirm-button'],
    selectorExpectations: {
      '.water-game-sheet': { expectedCount: 1, visible: true },
      '.water-game-sheet .water-confirm-button': { expectedCount: 1, visible: true },
    },
    fixture: waterV2Fixtures.ownerCorrectionLong,
  },
  waterV2EntryDetail: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-detail-sheet', '.water-detail-current', '.water-detail-history'],
    fixture: waterV2Fixtures.entryDetail,
  },
  waterV2ArchivedRound: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-history-sheet', '.water-archived-note', '.water-audit-track'],
    fixture: waterV2Fixtures.archivedRound,
  },
  waterV2SheetError: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-direct-sheet', '.water-direct-sheet .water-sheet-alert', '.water-direct-sheet .water-confirm-button'],
    selectorExpectations: {
      '.water-direct-sheet': { expectedCount: 1, visible: true },
      '.water-direct-sheet .water-sheet-alert': { expectedCount: 1, visible: true },
      '.water-direct-sheet .water-confirm-button': { expectedCount: 1, visible: true },
    },
    fixture: waterV2Fixtures.sheetError,
  },
  water: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-latest-receipt', '.water-ledger-row', '.water-action-dock'],
    fixture: waterV2Fixtures.member24,
  },
  launch: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-water-card', '.launch-water-btn', '.launch-card.is-default .launch-btn'],
    data: {},
  },
  mine: {
    path: '/pages/mine/index',
    route: 'switchTab',
    selectors: ['.mine-page', '.mine-profile-row', '.stats-grid', '.service-grid'],
    data: {
      nickname: '阿杰',
      avatar: '/assets/avatar-default.png',
      avatarRaw: '',
      tournamentsCompleted: 6,
      matchesPlayed: 42,
      wins: 28,
      winRateText: '67%',
      pointDiffText: '+36',
      last10Text: '最近10场：7胜3负',
      noPerformanceData: false,
    },
  },
  profile: {
    path: '/pages/profile/index',
    selectors: ['.profile-page', '.profile-form-card', '.gender-segment', '.profile-actions .btn'],
    data: {
      nickname: '阿杰',
      gender: 'male',
      avatar: '/assets/avatar-default.png',
      avatarRaw: '',
      avatarDisplay: '/assets/avatar-default.png',
      avatarLocalPreview: '',
      pendingAvatarTempPath: '__SCREENSHOT_FORM_DIRTY_GUARD__',
      avatarUploading: false,
      avatarUploadFailed: false,
      quickFillLoading: false,
      saving: false,
      fieldErrors: { nickname: '', gender: '', avatar: '' },
    },
  },
  feedback: {
    path: '/pages/feedback/index',
    selectors: ['.feedback-page', '.textarea', '.feedback-actions .btn'],
    storageFixture: profileGateStorageFixture,
    data: {
      blocked: false,
      blockNeedProfile: false,
      blockTitle: '',
      blockMessage: '',
      categoryOptions: ['功能问题', '体验建议', '排程问题', '其他'],
      categoryIndex: 1,
      content: '希望后续可以继续提升后台截图与调试效率。',
      contentLength: 20,
      submitting: false,
    },
  },
  create: {
    path: '/pages/create/index?mode=multi_rotate',
    selectors: ['.create-page', '.create-panel', '.create-flow', '.create-actions .btn'],
    storageFixture: profileGateStorageFixture,
    data: {
      name: '周末羽毛球赛',
      mode: 'multi_rotate',
      presetKey: 'custom',
      modeLabel: '多人转',
      canEditTournamentName: true,
      createFlowSteps: ['1. 先邀请成员或导入名单', '2. 满 4 人后在比赛大厅设置参数并开赛'],
      networkOffline: false,
      createBusy: false,
      canRetryAction: false,
      lastFailedActionText: '',
    },
  },
  home: {
    path: '/pages/home/index',
    route: 'switchTab',
    selectors: ['.home-page', '.swipe-row', '.finished-growth-markers'],
    data: {
      loadError: false,
      showHeroCard: false,
      syncStatusVisible: false,
      items: [{ _id: 'demo', name: '周末羽毛球赛', status: 'finished', statusClass: 'badge-success', statusLabel: '已结束', modeLabel: '多人转', playersCount: 7, matchProgressText: '21/21场', updatedAtText: '刚刚', _offset: 0 }],
      visibleCount: 1,
      filterStatus: 'all',
      statusCountRunning: 0,
      statusCountDraft: 0,
      statusCountFinished: 1,
      loading: false,
      showProfileNudge: false,
      showOnboarding: false,
      showHomeAdSlot: false,
      canRetryAction: false,
    },
  },
  shareDraft: {
    path: '/pages/share-entry/index?code=__ui_share_draft',
    selectors: ['.share-hero', '.share-actions .btn', '.participant-avatar-img', '.participant-avatar-row'],
    selectorExpectations: { '.share-hero': 1, '.share-actions .btn': 1,
      '.participant-avatar-img': 6, '.participant-avatar-row': 1 },
    data: {
      tournament: shareDraftTournament,
      tournamentId: shareDraftTournament._id,
      preview: buildShareEntryViewModel({ tournament: shareDraftTournament, openid: shareViewerId }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
      joinSquadChoice: 'A',
    },
  },
  shareRunning: {
    path: '/pages/share-entry/index?code=__ui_share_running',
    selectors: ['.share-hero', '.share-actions .btn', '.ranking-preview', '.ranking-preview-row'],
    selectorExpectations: { '.share-hero': 1, '.share-actions .btn': 2, '.ranking-preview': 1, '.ranking-preview-row': 3 },
    data: {
      tournament: shareRunningTournament,
      tournamentId: shareRunningTournament._id,
      preview: buildShareEntryViewModel({ tournament: shareRunningTournament, openid: shareViewerId }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
    },
  },
  shareFinished: {
    path: '/pages/share-entry/index?code=__ui_share_finished',
    selectors: ['.share-hero', '.share-actions .btn', '.ranking-preview', '.ranking-preview-row'],
    selectorExpectations: { '.share-hero': 1, '.share-actions .btn': 2, '.ranking-preview': 1, '.ranking-preview-row': 3 },
    data: {
      tournament: shareFinishedTournament,
      tournamentId: shareFinishedTournament._id,
      preview: buildShareEntryViewModel({ tournament: shareFinishedTournament, openid: shareViewerId }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
    },
  },
  lobbyGuide: {
    path: '/pages/lobby/index?id=demo',
    selectors: ['.growth-guide-card', '.growth-guide-step', '.growth-guide-done'],
    data: {
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'draft', mode: 'multi_rotate', players: [] },
      tournamentId: 'demo',
      showGrowthOnboardingGuide: true,
      growthOnboardingSteps: [
        { step: 1, title: '看看有谁参加', desc: '先熟悉参赛名单' },
        { step: 2, title: '了解赛制规则', desc: '确认轮转和计分方式' },
        { step: 3, title: '等待开赛 / 查看赛程', desc: '开赛后从这里进入赛程和录分' },
      ],
      syncStatusVisible: false,
      showJoinSheet: false,
      loadError: false,
    },
  },
  ranking: {
    path: '/pages/ranking/index?id=demo',
    selectors: ['.ranking-action-full', '.ranking-card', '.ranking-share-banner'],
    data: {
      tournamentId: 'demo',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished', mode: 'multi_rotate' },
      rankings: shared.rankings,
      rankingTypeLabel: '个人榜',
      posterButtonText: '生成我的战绩卡',
      rankingShareBannerText: '最终排名已出炉',
      loadError: false,
      syncStatusVisible: false,
      primaryNavItems: shared.navRanking,
    },
  },
  schedule: {
    path: '/pages/schedule/index?id=demo',
    selectors: ['.hero', '.hero-finished-share', '.hero-finished-actions .btn'],
    data: {
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished' },
      tournamentId: 'demo',
      primaryNavItems: shared.navSchedule,
      heroSummaryText: '7人轮转 · 21场',
      statusClass: 'hero-status-finished',
      statusText: '已结束',
      heroMatchText: '21 / 21 场',
      heroPendingText: '全部比赛已完成',
      heroProgressPercent: 100,
      nextActionText: '',
      showFinishedShareActions: true,
      roundsUi: [],
      syncStatusVisible: false,
      loadError: false,
    },
  },
  matchIdle: {
    path: '/pages/match/index?tournamentId=demo&roundIndex=0&matchIndex=0',
    selectors: ['.match-page', '.match-vs', '.score-stage', '.score-submit-tray', '.score-submit-status-main'],
    selectorExpectations: {
      '.match-page': 1,
      '.match-vs': 1,
      '.score-stage': 1,
      '.score-submit-tray': 1,
      '.score-submit-status-main': 1,
    },
    data: {
      tournamentId: 'demo',
      tournamentName: '周末羽毛球赛',
      roundIndex: 0,
      matchIndex: 0,
      match: { matchIndex: 0, status: 'pending' },
      pair1Text: '阿杰 / 小林',
      pair2Text: 'Chris / 小王',
      scoreA: 0,
      scoreB: 0,
      displayScoreA: '-',
      displayScoreB: '-',
      canEdit: false,
      userCanScore: true,
      canUseScoreLock: true,
      lockState: 'idle',
      lockHintText: '点击“开始录分”即可进入录分',
      lockActionText: '开始录分',
      lockBusy: false,
      submitBusy: false,
      hasScoreDraft: false,
      canRetryAction: false,
      matchStatusText: '待录分',
      pointsPerGame: 21,
      batchMode: false,
      syncStatusVisible: false,
    },
  },
  matchEditing: {
    path: '/pages/match/index?tournamentId=demo&roundIndex=0&matchIndex=0',
    selectors: ['.match-page', '.score-stage-editing', '.score-toolbar', '.quick-score-scroll', '.score-submit-tray'],
    selectorExpectations: {
      '.match-page': 1,
      '.score-stage-editing': 1,
      '.score-toolbar': 1,
      '.quick-score-scroll': 1,
      '.score-submit-tray': 1,
    },
    data: {
      tournamentId: 'demo',
      tournamentName: '周末羽毛球赛',
      roundIndex: 0,
      matchIndex: 0,
      match: { matchIndex: 0, status: 'pending' },
      pair1Text: '阿杰 / 小林',
      pair2Text: 'Chris / 小王',
      scoreA: 21,
      scoreB: 17,
      scoreAIndex: 21,
      scoreBIndex: 17,
      scoreOptions: Array.from({ length: 61 }, (_, index) => index),
      quickScoreOptions: [{ label: '21:19', a: 21, b: 19 }],
      canUndo: true,
      canEdit: true,
      userCanScore: true,
      canUseScoreLock: true,
      lockState: 'locked_by_me',
      lockHintText: '你正在录入比分',
      lockActionText: '开始录分',
      lockBusy: false,
      submitBusy: false,
      hasScoreDraft: true,
      canRetryAction: false,
      matchStatusText: '录分中',
      pointsPerGame: 21,
      batchMode: false,
      syncStatusVisible: false,
    },
  },
  matchLocked: {
    path: '/pages/match/index?tournamentId=demo&roundIndex=0&matchIndex=0',
    selectors: ['.match-page', '.score-stage', '.score-submit-tray', '.score-submit-status-main'],
    selectorExpectations: {
      '.match-page': 1,
      '.score-stage': 1,
      '.score-submit-tray': 1,
      '.score-submit-status-main': 1,
    },
    data: {
      tournamentId: 'demo',
      tournamentName: '周末羽毛球赛',
      roundIndex: 0,
      matchIndex: 0,
      match: { matchIndex: 0, status: 'pending' },
      pair1Text: '阿杰 / 小林',
      pair2Text: 'Chris / 小王',
      displayScoreA: '-',
      displayScoreB: '-',
      canEdit: false,
      userCanScore: true,
      canUseScoreLock: true,
      lockState: 'locked_by_other',
      lockOwnerName: '小赵',
      lockRemainingMs: 42000,
      lockHintText: '小赵 正在录入比分（剩余42秒）',
      lockBusy: false,
      submitBusy: false,
      hasScoreDraft: false,
      canRetryAction: false,
      matchStatusText: '待录分',
      pointsPerGame: 21,
      batchMode: false,
      syncStatusVisible: false,
    },
  },
  settings: {
    path: '/pages/settings/index?tournamentId=demo',
    selectors: ['.settings-page', '.context-panel', '#section-params', '.settings-save'],
    selectorExpectations: {
      '.settings-page': 1,
      '.context-panel': 1,
      '#section-params': 1,
      '.settings-save': 1,
    },
    data: {
      tournamentId: 'demo',
      tournament: { _id: 'demo', name: '周末羽毛球赛', creatorId: '__ui_settings_owner', status: 'draft', settingsConfigured: true, totalMatches: 21, courts: 2 },
      pageTitle: '修改比赛',
      contextTitle: '仅草稿阶段可修改比赛信息',
      isAdmin: true,
      canManageTournament: true,
      name: '周末羽毛球赛',
      editM: 21,
      editC: 2,
      mode: 'multi_rotate',
      modeLabel: '多人转',
      useMatchPresetOptions: false,
      useSimpleMPicker: true,
      matchShortcutOptions: [],
      matchShortcutHint: '',
      matchPresetUnavailableHint: '',
      showAdvancedMatchEntry: false,
      showAdvancedMatchPicker: false,
      currentCustomMatchLabel: '',
      mOptions: [21],
      mIndex: 0,
      courtOptions: [2],
      courtIndex: 0,
      pointsOptions: [11, 15, 21],
      pointsPerGame: 21,
      pointsIndex: 2,
      canConfigureSettings: true,
      canEditTournamentName: true,
      settingsReady: true,
      mandatoryDone: 1,
      mandatoryTotal: 1,
      settingsGateHint: '',
      settingsBusy: false,
      canRetryAction: false,
      syncStatusVisible: false,
      loadError: false,
      showSquadEndCondition: false,
    },
  },
  preferences: {
    path: '/pages/preferences/index',
    selectors: [
      '.pref-page',
      '.chip[data-mode="updated"].active',
      '.chip[data-level="standard"].active',
      '.chip[data-density="comfortable"].active',
      '.pref-tip',
    ],
    selectorExpectations: {
      '.pref-page': 1,
      '.chip[data-mode="updated"].active': 1,
      '.chip[data-level="standard"].active': 1,
      '.chip[data-density="comfortable"].active': 1,
      '.pref-tip': 1,
    },
    data: {
      nickname: '阿杰',
      genderText: '男',
      profileStatusText: '已完善',
      sortMode: 'updated',
      autoReturn: true,
      autoNext: true,
      motionLevel: 'standard',
      listDensity: 'comfortable',
      version: 'dev',
    },
  },
  analytics: {
    path: '/pages/analytics/index?id=demo',
    selectors: ['.analytics-hero', '.analytics-hero-actions .btn', '.report-card'],
    data: {
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished' },
      tournamentId: 'demo',
      modeLabel: '多人转',
      statusLabel: '已结束',
      heroHeadline: '阿杰夺得第一',
      heroStats: [{ label: '完赛', value: '21' }, { label: '人数', value: '7' }, { label: '冠军', value: '阿杰' }],
      posterButtonText: '生成赛事战报卡',
      focusFacts: ['阿杰以 7 胜 1 负排名第一。'],
      reportHeadline: '最终排名已出炉，可以发回群里复盘。',
      summary: { finishedMatches: 21, totalMatches: 21 },
      summaryStats: [{ label: '完赛', value: '21' }, { label: '总分', value: '302' }, { label: '轮次', value: '7' }],
      top3Cards: [],
      fullRankings: [],
      playerStats: [],
      syncStatusVisible: false,
      showAnalyticsAdSlot: false,
      canRetryAction: false,
      loadError: false,
    },
  },
};

cases.matchError = {
  ...cases.matchEditing,
  selectors: ['.match-page', '.score-submit-tray', '.score-submit-status-main', '.score-retry-btn'],
  selectorExpectations: { '.match-page': 1, '.score-submit-tray': 1, '.score-submit-status-main': 1, '.score-retry-btn': 1 },
  // Submission failure restores the owned lock; "error" is not a real lock state.
  // This is a display case. A callable retry requires the controlled action harness.
  data: { ...cases.matchEditing.data, canEdit: true, lockState: 'locked_by_me',
    canRetryAction: true, lockHintText: buildLockHint('locked_by_me'),
    lastFailedActionText: '提交比分', submitBusy: false },
};

cases.profileAvatarUploading = {
  ...cases.profile,
  selectors: ['.profile-page', '.avatar-actions .btn-mini', '.quick-fill-btn', '.avatar-tip', '.profile-actions .btn-primary'],
  selectorExpectations: { '.profile-page': 1, '.avatar-actions .btn-mini': 1, '.quick-fill-btn': 1,
    '.avatar-tip': 1, '.profile-actions .btn-primary': 1 },
  data: { ...cases.profile.data, avatarUploading: true },
};
cases.profileSaving = {
  ...cases.profile,
  selectors: ['.profile-page', '.avatar-actions .btn-mini', '.quick-fill-btn', '.profile-actions .btn-primary'],
  selectorExpectations: { '.profile-page': 1, '.avatar-actions .btn-mini': 1, '.quick-fill-btn': 1, '.profile-actions .btn-primary': 1 },
  data: { ...cases.profile.data, saving: true },
};

cases.launchRecentWater = {
  ...cases.launch,
  data: { recentWater: { id: 'water_v2_demo', title: '周六晚间打水' } },
};
const independentRoom = JSON.parse(JSON.stringify(waterV2Fixtures.ownerEmpty.roomData));
independentRoom.room.participants = independentRoom.room.participants.slice(0, 1);
independentRoom.room.roundCount = 1;
independentRoom.round.number = 1;
independentRoom.round.title = '9月12日打水';
independentRoom.round.participantIds = ['p1'];
independentRoom.round.participantSnapshot = independentRoom.round.participantSnapshot.slice(0, 1);
independentRoom.round.ledger = [{ participantId: 'p1', won: 0, treat: 0, net: 0 }];
cases.waterIndependentNew = {
  path: '/pages/water/index?id=water_v2_demo',
  selectors: ['.water-page', '.water-ledger-table', '.water-action-dock'],
  fixture: { roomData: independentRoom, pageData: { activeTab: 'ledger' } },
};
cases.waterIndependentHistory = {
  path: '/pages/water/index?id=water_v2_demo',
  selectors: ['.water-ledger-history-sheet', '.water-ledger-history-row', '.water-ledger-history-sheet .water-sheet-close'],
  styleExpectations: {
    '.water-ledger-history-overlay': { position: 'fixed' },
    '.water-ledger-history-sheet': { display: 'flex', 'flex-direction': 'column' },
  },
  fixture: {
    roomData: independentRoom,
    postData: {
      ledgerHistoryOpen: true,
      historyLedgers: [
        { id: 'demo1', title: '周六晚间打水', timeText: '2026/09/12 19:30', participantCount: 6, recordCount: 12 },
        { id: 'demo2', title: '周末限定超长昵称球友的打水账本', timeText: '2026/09/11 20:15', participantCount: 24, recordCount: 128 },
        { id: 'demo3', title: '午间打水', timeText: '2026/09/10 12:30', participantCount: 4, recordCount: 3 },
      ],
      ledgerHistoryLoading: false, ledgerHistoryHasMore: false, ledgerHistoryError: '',
    },
  },
};
cases.waterIndependentHistoryEmpty = {
  ...cases.waterIndependentHistory,
  selectors: ['.water-ledger-history-sheet', '.water-empty-title'],
  fixture: { ...cases.waterIndependentHistory.fixture,
    postData: { ...cases.waterIndependentHistory.fixture.postData, historyLedgers: [], historyOnly: true, bottomActionMode: '' } },
};
cases.waterIndependentHistoryError = {
  ...cases.waterIndependentHistoryEmpty,
  selectors: ['.water-ledger-history-sheet', '.water-inline-error'],
  fixture: { ...cases.waterIndependentHistoryEmpty.fixture,
    postData: { ...cases.waterIndependentHistoryEmpty.fixture.postData, ledgerHistoryError: '历史账本暂时加载失败，请重试' } },
};

cases.waterFriendlyLoadError = {
  ...cases.waterIndependentNew,
  selectors: ['.water-error', '.water-error-title', '.water-error .water-primary-button'],
  fixture: { roomData: independentRoom,
    postData: { loading: false, loadError: '暂时无法打开打水账本，请稍后重试', invalidRoom: false, bottomActionMode: '' } },
};

// 连续路由曾返回无样式像素：这些页面必须先确认布局样式已加载。
cases.homeToolbar = {
  ...cases.home,
  selectors: ['.home-page', '.filter-row', '.sort-row', '.filter-chip.active', '.sort-chip.active'],
  styleExpectations: { '.filter-row': { display: 'grid' }, '.sort-row': { display: 'flex' } },
  data: {
    ...cases.home.data,
    items: Array.from({ length: 20 }, (_, index) => {
      const status = index < 5 ? 'running' : index < 16 ? 'draft' : 'finished';
      return { ...cases.home.data.items[0], _id: `toolbar-${index}`, name: `周末羽毛球赛 ${index + 1}`,
        status, statusLabel: { running: '进行中', draft: '草稿', finished: '已结束' }[status] };
    }),
    visibleCount: 20,
    sortMode: 'updated',
    statusCountRunning: 5,
    statusCountDraft: 11,
    statusCountFinished: 4,
  },
};

cases.launch.styleExpectations = { '.launch-actions': { display: 'flex' } };
cases.preferences.styleExpectations = { '.pref-page .chips': { display: 'flex' } };
cases.shareSquadChoice = {
  ...cases.shareDraft,
  path: '/pages/share-entry/index?code=__ui_share_squad',
  selectors: ['.share-hero', '.squad-chooser', '.squad-chooser .chip.active', '.share-primary-btn'],
  selectorExpectations: { '.share-hero': 1, '.squad-chooser': 1, '.squad-chooser .chip.active': 1, '.share-primary-btn': 1 },
  styleExpectations: { '.squad-chooser': { display: 'flex' } },
  data: { ...cases.shareDraft.data,
    tournament: shareSquadTournament,
    tournamentId: shareSquadTournament._id,
    preview: buildShareEntryViewModel({ tournament: shareSquadTournament, openid: shareViewerId }),
  },
};
cases.ranking.styleExpectations = { '.ranking-main-row': { display: 'flex' } };
cases.profile.styleExpectations = { '.gender-option': { display: 'flex' } };
cases.settings.styleExpectations = { '.status-pill': { display: 'flex' } };
cases.waterV2Member24Game.styleExpectations = {
  '.water-player-grid': { display: 'grid' },
  '.water-side-switch button': { display: 'flex', 'align-items': 'center' },
};

// New features use pure display projections and the generic page-data isolation
// path. No fixture invokes a business action or injects an identity into storage.
cases.tournamentList = {
  path: '/pages/tournament-list/index',
  selectors: ['.recovery-page', '.recovery-intro', '.recovery-item', '.recovery-notice'],
  selectorExpectations: { '.recovery-page': 1, '.recovery-intro': 1, '.recovery-item': 3, '.recovery-notice': 1 },
  data: {
    items: [
      { id: '__ui_recovery_running', name: '周末羽毛球赛', statusText: '进行中', modeText: '多人轮转',
        roleText: '主办 · 参赛', progressText: '1 / 2 场已完成' },
      { id: '__ui_recovery_draft', name: '周三下班后的羽毛球比赛 · 等待球友加入', statusText: '未开赛', modeText: '固定搭档',
        roleText: '参赛', progressText: '0 / 6 场已完成' },
      { id: '__ui_recovery_finished', name: '国庆小队双打', statusText: '已结束', modeText: '小队双打',
        roleText: '主办', progressText: '4 / 6 场已完成' },
    ],
    loading: false, loaded: true, hasMore: false, error: '',
  },
};
cases.tournamentListEmpty = {
  path: cases.tournamentList.path,
  selectors: ['.recovery-page', '.recovery-intro', '.state-empty', '.state-empty-title'],
  data: { items: [], loading: false, loaded: true, hasMore: false, error: '' },
};
cases.tournamentListError = {
  path: cases.tournamentList.path,
  selectors: ['.recovery-page', '.state-error', '.state-error-desc', '.recovery-action'],
  selectorExpectations: { '.state-error': 1, '.recovery-action': 1 },
  data: { items: [], loading: false, loaded: false, hasMore: false, error: '比赛加载失败，请稍后重试' },
};
cases.tournamentListLoading = {
  path: cases.tournamentList.path,
  selectors: ['.recovery-page', '.recovery-intro', '.recovery-notice'],
  selectorExpectations: { '.recovery-notice': 1 },
  data: { items: [], loading: true, loaded: false, hasMore: false, error: '' },
};
cases.tournamentListMore = {
  ...cases.tournamentList,
  selectors: ['.recovery-page', '.recovery-item', '.recovery-action'],
  selectorExpectations: { '.recovery-page': 1, '.recovery-item': 3, '.recovery-action': 1 },
  data: { ...cases.tournamentList.data, hasMore: true },
};
cases.tournamentListPageError = {
  ...cases.tournamentListMore,
  selectors: ['.recovery-page', '.recovery-item', '.state-error', '.state-error-desc', '.recovery-action'],
  selectorExpectations: { ...cases.tournamentListMore.selectorExpectations, '.state-error': 1, '.state-error-desc': 1 },
  data: { ...cases.tournamentListMore.data, error: '更多比赛加载失败，请重试' },
};

const roleTournament = {
  _id: '__ui_roles', name: '周末羽毛球赛', creatorId: '__ui_owner', status: 'draft', version: 1,
  mode: 'multi_rotate', totalMatches: 2, courts: 1, pointsPerGame: 21, settingsConfigured: true,
  coManagers: ['__ui_member'],
  players: [
    { id: '__ui_owner', name: '阿杰', gender: 'male' },
    { id: '__ui_member', name: '小林', gender: 'female' },
    { id: '__ui_bound', name: '周末限定超长昵称的球友', gender: 'male' },
    { id: 'guest_ui', name: '导入成员', type: 'guest', gender: 'female' },
  ],
  playerIds: ['__ui_owner', '__ui_member', '__ui_bound', 'guest_ui'],
};
function roleDisplayData(tournament, openid, coManagerBusy = false) {
  return JSON.parse(JSON.stringify({
    ...buildLobbyViewModel({ tournament, openid }).patch,
    tournament, tournamentId: tournament._id, coManagerBusy,
    adminPanelExpanded: true, showGrowthOnboardingGuide: false, showJoinSheet: false,
    syncStatusVisible: false, loadError: false, canRetryAction: false,
  }));
}
cases.lobbyCoManagerOwner = {
  path: '/pages/lobby/index?id=__ui_roles',
  scrollToSelector: '.co-managers-panel',
  selectors: ['.lobby-page', '.co-managers-panel', '.co-manager-row', '.co-manager-action'],
  selectorExpectations: { '.co-managers-panel': 1, '.co-manager-row': 4, '.co-manager-action': 2 },
  data: roleDisplayData(roleTournament, '__ui_owner'),
};
cases.lobbyCoManagerOwnerBusy = {
  ...cases.lobbyCoManagerOwner,
  data: roleDisplayData(roleTournament, '__ui_owner', true),
};
cases.lobbyCoManagerMember = {
  path: cases.lobbyCoManagerOwner.path,
  scrollToSelector: '.co-managers-panel',
  selectors: ['.lobby-page', '.hero-meta-pill', '.co-managers-panel', '.admin-panel'],
  selectorExpectations: { '.hero-meta-pill': 2, '.co-managers-panel': 1, '.admin-panel': 1 },
  data: roleDisplayData(roleTournament, '__ui_member'),
};
cases.lobbyCoManagerRevoked = {
  path: cases.lobbyCoManagerOwner.path,
  selectors: ['.lobby-page', '.hero-meta-pill', '.player-grid'],
  selectorExpectations: { '.hero-meta-pill': 1, '.player-grid': 1 },
  data: roleDisplayData({ ...roleTournament, version: 2, coManagers: [] }, '__ui_member'),
};
cases.settingsCoManager = {
  ...cases.settings,
  path: '/pages/settings/index?tournamentId=__ui_roles',
  selectors: [...cases.settings.selectors],
  selectorExpectations: { ...cases.settings.selectorExpectations, '.settings-save': 1 },
  data: { ...cases.settings.data, tournamentId: roleTournament._id, tournament: roleTournament,
    isAdmin: false, isCoManager: true, canManageTournament: true, editM: 2, editC: 1,
    mOptions: [2], courtOptions: [1] },
};

const completedMatch = { matchIndex: 0, status: 'finished', teamA: roleTournament.players.slice(0, 2),
  teamB: roleTournament.players.slice(2), scoreA: 21, scoreB: 17, scorerId: '__ui_owner', scorerName: '阿杰' };
const pendingMatch = { matchIndex: 1, status: 'pending', teamA: [roleTournament.players[0], roleTournament.players[2]],
  teamB: [roleTournament.players[1], roleTournament.players[3]] };
const runningTournament = { ...roleTournament, _id: '__ui_finish', status: 'running',
  rounds: [{ roundIndex: 0, matches: [completedMatch, pendingMatch] }] };

// Pure view-model projections keep permissions and canceled scores consistent
// with the actual match page. Busy is the transient submit-service UI state.
function matchRiskData(tournament, openid, lockState, patch = {}) {
  const state = buildTournamentViewState(tournament, {
    tournamentId: tournament._id, openid, roundIndex: 0, matchIndex: 1, lockState,
    currentScoreA: lockState === 'locked_by_me' ? 21 : 0,
    currentScoreB: lockState === 'locked_by_me' ? 17 : 0,
    draft: lockState === 'locked_by_me' ? { scoreA: 21, scoreB: 17 } : null,
  });
  return { ...cases.matchIdle.data, ...state.data, tournament: state.tournament,
    tournamentId: tournament._id, matchIndex: 1, lockState,
    lockHintText: buildLockHint(lockState), ...patch };
}
const matchRiskPath = '/pages/match/index?tournamentId=__ui_finish&roundIndex=0&matchIndex=1';
cases.matchSubmitBusy = {
  path: matchRiskPath,
  selectors: ['.match-page', '.score-stage-editing', '.score-submit-status-main', '.score-submit-tray .btn-primary'],
  selectorExpectations: { '.match-page': 1, '.score-stage-editing': 1, '.score-submit-status-main': 1,
    '.score-submit-tray .btn-primary': 1 },
  data: matchRiskData(runningTournament, roleTournament.creatorId, 'locked_by_me', {
    lockState: 'submitting', lockHintText: buildLockHint('submitting'), submitBusy: true,
  }),
};
cases.matchForbidden = {
  path: matchRiskPath,
  selectors: ['.match-page', '.match-status-tag', '.score-box-readonly'],
  selectorExpectations: { '.match-page': 1, '.match-status-tag': 1, '.score-box-readonly': 2 },
  data: matchRiskData(runningTournament, '__ui_spectator', 'forbidden'),
};
cases.matchCanceled = {
  path: matchRiskPath,
  selectors: ['.match-page', '.match-status-tag', '.score-box-readonly'],
  selectorExpectations: { '.match-page': 1, '.match-status-tag': 1, '.score-box-readonly': 2 },
  data: matchRiskData({ ...runningTournament, status: 'finished',
    rounds: [{ roundIndex: 0, matches: [completedMatch, { ...pendingMatch, status: 'canceled', cancelReason: 'manual_finish' }] }] },
  roleTournament.creatorId, 'finished'),
};
cases.matchLoadError = {
  path: matchRiskPath,
  selectors: ['.match-page', '.state-error', '.state-error-actions .btn'],
  selectorExpectations: { '.match-page': 1, '.state-error': 1, '.state-error-actions .btn': 1 },
  // Display-only falsy sentinel: this DevTools transport omits null when reading
  // Page.getData(path). Keep both fields in the strict declared-data contract.
  // The real Page initial state remains match:null; do not call match handlers here.
  data: { match: false, loadError: true },
};

// These fixtures invoke only local page projections and filter handlers.
// The runner freezes request generations before executing the methods.
const scheduleFilterFixture = {
  pageData: { tournamentId: runningTournament._id, selectedPlayerIds: [], avatarFilterMode: 'contains', statusFilter: 'all' },
  methods: [{ name: 'applyTournament', args: [runningTournament] }],
};
cases.schedulePlayerFilterSheet = {
  path: '/pages/schedule/index?id=__ui_finish',
  selectors: ['.schedule-page', '.schedule-filter-sheet', '.filter-sheet-option',
    '.filter-sheet-option.active[data-value="not_contains"]', '.selection-check', '.filter-sheet-actions .btn'],
  selectorExpectations: { '.schedule-page': 1, '.schedule-filter-sheet': 1, '.filter-sheet-option': 2,
    '.filter-sheet-option.active[data-value="not_contains"]': 1, '.selection-check': 1, '.filter-sheet-actions .btn': 2 },
  fixture: { ...scheduleFilterFixture, methods: [...scheduleFilterFixture.methods,
    { name: 'openPlayerFilterSheet', args: [] },
    { name: 'onPickPlayerFilterMode', args: [{ currentTarget: { dataset: { value: 'not_contains' } } }] }] },
};
cases.scheduleStatusFilterSheet = {
  path: cases.schedulePlayerFilterSheet.path,
  selectors: ['.schedule-page', '.schedule-filter-sheet', '.filter-sheet-option',
    '.filter-sheet-option.active[data-value="finished"]', '.selection-check', '.filter-sheet-actions .btn'],
  selectorExpectations: { '.schedule-page': 1, '.schedule-filter-sheet': 1, '.filter-sheet-option': 4,
    '.filter-sheet-option.active[data-value="finished"]': 1, '.selection-check': 1, '.filter-sheet-actions .btn': 2 },
  fixture: { ...scheduleFilterFixture, methods: [...scheduleFilterFixture.methods,
    { name: 'openStatusFilterSheet', args: [] },
    { name: 'onPickStatusFilter', args: [{ currentTarget: { dataset: { value: 'finished' } } }] }] },
};
cases.scheduleFilterSelected = {
  path: cases.schedulePlayerFilterSheet.path,
  selectors: ['.schedule-page', '.match-card', '.selected-player-chip', '.filter-trigger-right'],
  selectorExpectations: { '.schedule-page': 1, '.match-card': 1, '.selected-player-chip': 1, '.filter-trigger-right': 1 },
  fixture: { ...scheduleFilterFixture, methods: [...scheduleFilterFixture.methods,
    { name: 'onMatchPlayerAvatarTap', args: [{ currentTarget: { dataset: { playerId: '__ui_owner' } } }] },
    { name: 'openStatusFilterSheet', args: [] },
    { name: 'onPickStatusFilter', args: [{ currentTarget: { dataset: { value: 'finished' } } }] },
    { name: 'confirmStatusFilterSheet', args: [] }] },
};
cases.scheduleFilterEmpty = {
  path: cases.schedulePlayerFilterSheet.path,
  selectors: ['.schedule-page', '.state-empty', '.state-empty-title', '.selected-player-chip', '.filter-clear'],
  selectorExpectations: { '.schedule-page': 1, '.state-empty': 1, '.state-empty-title': 1, '.selected-player-chip': 1, '.filter-clear': 1 },
  fixture: { ...scheduleFilterFixture, methods: [...scheduleFilterFixture.methods,
    { name: 'onMatchPlayerAvatarTap', args: [{ currentTarget: { dataset: { playerId: '__ui_owner' } } }] },
    { name: 'openPlayerFilterSheet', args: [] },
    { name: 'onPickPlayerFilterMode', args: [{ currentTarget: { dataset: { value: 'not_contains' } } }] },
    { name: 'confirmPlayerFilterSheet', args: [] }] },
};
const completedDisplay = { key: '0-0', roundIndex: 0, matchIndex: 0, title: '第1场', status: 'finished',
  showScore: true, leftScoreText: '21', rightScoreText: '17', leftScoreClass: 'score-win', rightScoreClass: '',
  leftTeam: { text: '阿杰 / 小林', avatarItems: [] }, rightTeam: { text: '周末限定超长昵称的球友 / 导入成员', avatarItems: [] },
  scorerText: '录分：阿杰' };
const pendingDisplay = { key: '0-1', roundIndex: 0, matchIndex: 1, title: '第2场', status: 'pending',
  statusText: '待录分', statusClass: 'pill-pending', showScore: false, isFirstPending: true,
  leftTeam: { text: '阿杰 / 周末限定超长昵称的球友', avatarItems: [] }, rightTeam: { text: '小林 / 导入成员', avatarItems: [] } };
cases.scheduleManualFinishReady = {
  path: '/pages/schedule/index?id=__ui_finish',
  selectors: ['.schedule-page', '.hero', '.hero-management', '.manual-finish-btn', '.hero-primary'],
  selectorExpectations: { '.hero-management': 1, '.manual-finish-btn': 1, '.hero-primary': 1 },
  data: { ...cases.schedule.data, tournament: runningTournament, tournamentId: runningTournament._id,
    heroSummaryText: '多人转 · 2场', statusClass: 'hero-status-running', statusText: '进行中',
    heroMatchText: '1 / 2 场', heroPendingText: '还有 1 场待完成', heroProgressPercent: 50,
    nextActionText: '继续录分', nextActionKey: 'batch', heroActionBusy: false,
    canFinishTournament: true, manualFinishBusy: false, finishCompletedMatches: 1, finishRemainingMatches: 1,
    showFinishedShareActions: false, showFilterBar: true, selectedPlayersUi: [], avatarFilterLabel: '含有', statusFilterLabel: '全部对阵',
    roundsUi: [{ roundIndex: 0, isCurrentRound: true, matchesUi: [completedDisplay, pendingDisplay] }] },
};
cases.scheduleManualFinishBusy = {
  ...cases.scheduleManualFinishReady,
  data: { ...cases.scheduleManualFinishReady.data, manualFinishBusy: true },
};
cases.scheduleManualFinished = {
  path: cases.scheduleManualFinishReady.path,
  selectors: ['.hero', '.hero-finished-share', '.hero-finished-actions .btn', '.pill-canceled'],
  selectorExpectations: { '.hero-finished-share': 1, '.hero-finished-actions .btn': 2,
    '.pill-canceled': 1 },
  data: { ...cases.scheduleManualFinishReady.data,
    tournament: { ...runningTournament, status: 'finished', version: 2,
      finishMeta: { type: 'manual', completedMatches: 1, canceledMatches: 1 },
      rounds: [{ roundIndex: 0, matches: [completedMatch, { ...pendingMatch, status: 'canceled', cancelReason: 'manual_finish' }] }] },
    statusClass: 'hero-status-finished', statusText: '已提前结束', heroPendingText: '已完成 1 场，取消 1 场', heroProgressPercent: 100,
    nextActionText: '', nextActionKey: '', canFinishTournament: false, showFinishedShareActions: true,
    roundsUi: [{ roundIndex: 0, isCurrentRound: false, matchesUi: [completedDisplay,
      { ...pendingDisplay, status: 'canceled', statusText: '已取消', statusClass: 'pill-canceled', isFirstPending: false }] }] },
};

// Synthetic display states: cache/polling flags do not exercise a live watcher.
const cachedPollingState = {
  networkOffline: false, syncRefreshing: true, syncUsingCache: true,
  syncPollingFallback: true, syncCachedAt: 1791158400000,
};
cases.scheduleCachedPollingSilent = {
  ...cases.scheduleManualFinishReady,
  selectors: ['.schedule-page', '.hero', '.match-card', '.sync-banner', '.hero-primary', '.manual-finish-btn'],
  selectorExpectations: { '.schedule-page': 1, '.hero': 1, '.match-card': 2,
    '.sync-banner': { expectedCount: 1, visible: false, expectedVisibleCount: 0 },
    '.hero-primary': 1, '.manual-finish-btn': 1 },
  data: { ...cases.scheduleManualFinishReady.data, ...cachedPollingState, ...buildSyncBannerState(cachedPollingState) },
};
const offlineState = { ...cachedPollingState, networkOffline: true, syncRefreshing: false };
cases.scheduleOffline = {
  ...cases.scheduleCachedPollingSilent,
  selectors: ['.schedule-page', '.hero', '.match-card', '.sync-banner', '.sync-banner-text', '.sync-banner-action',
    '.hero-primary', '.manual-finish-btn'],
  selectorExpectations: { '.schedule-page': 1, '.hero': 1, '.match-card': 2,
    '.sync-banner': 1, '.sync-banner-text': 1, '.sync-banner-action': 1, '.hero-primary': 1, '.manual-finish-btn': 1 },
  styleExpectations: {},
  data: { ...cases.scheduleManualFinishReady.data, ...offlineState, ...buildSyncBannerState(offlineState) },
};

// Preserve the real selection handlers, without the old fixture's postData
// overrides: search results and expanded summaries must come from the page.
const game24Methods = waterV2Fixtures.member24Game.methods;
cases.waterV2GameSearchEmpty = {
  path: cases.waterV2Member24Game.path,
  selectors: ['.water-page', '.water-game-sheet', '.water-game-sheet .water-search',
    '.water-game-sheet .water-search-empty', '.water-game-sheet .water-search-empty-clear',
    '.water-game-sheet .water-confirm-button'],
  selectorExpectations: { '.water-page': 1, '.water-game-sheet': 1, '.water-game-sheet .water-search': 1,
    '.water-game-sheet .water-search-empty': 1, '.water-game-sheet .water-search-empty-clear': 1,
    '.water-game-sheet .water-confirm-button': 1 },
  fixture: { roomData: waterV2Fixtures.member24.roomData, pageData: { activeTab: 'ledger' },
    methods: [...game24Methods, { name: 'onGameSearchInput', args: [{ detail: { value: '找不到的球友' } }] }] },
};
cases.waterV2GameSummaryExpanded = {
  path: cases.waterV2Member24Game.path,
  selectors: ['.water-page', '.water-game-sheet', '.water-game-sheet .water-match-summary.is-expanded',
    '.water-game-sheet .water-team-names', '.water-game-sheet .water-game-summary-toggle',
    '.water-game-sheet .water-confirm-button'],
  selectorExpectations: { '.water-page': 1, '.water-game-sheet': 1,
    '.water-game-sheet .water-match-summary.is-expanded': 1, '.water-game-sheet .water-team-names': 2,
    '.water-game-sheet .water-game-summary-toggle': 1, '.water-game-sheet .water-confirm-button': 1 },
  fixture: { roomData: waterV2Fixtures.member24.roomData, pageData: { activeTab: 'ledger' },
    methods: [...game24Methods, { name: 'toggleGameSummary', args: [] }] },
};
cases.waterV2RosterSearchEmpty = {
  path: cases.waterV2Member24.path,
  selectors: ['.water-page', '.water-tab.is-active[data-tab="players"]', '.water-player-count',
    '.water-roster-search-empty', '.water-search-empty-clear'],
  selectorExpectations: { '.water-page': 1, '.water-tab.is-active[data-tab="players"]': 1, '.water-player-count': 1,
    '.water-roster-search-empty': 1, '.water-search-empty-clear': 1 },
  fixture: { roomData: waterV2Fixtures.member24.roomData,
    methods: [{ name: 'onSelectTab', args: [{ currentTarget: { dataset: { tab: 'players' } } }] },
      { name: 'onRosterSearchInput', args: [{ detail: { value: '找不到的球友' } }] }] },
};

require('./singles-screenshot-fixtures').registerCases(cases);

// Derived cases have their own fixture IDs. Build every displayed tournament
// navigation with the production helper after inheritance is complete.
for (const item of Object.values(cases)) {
  if (!item.fixture && item.data && /^\/pages\/schedule\/index(?:\?|$)/.test(item.path)) {
    item.data.hasVisibleRounds = Array.isArray(item.data.roundsUi) && item.data.roundsUi.length > 0;
  }
  if (!item.data || !Array.isArray(item.data.primaryNavItems)) continue;
  const page = item.path.match(/^\/pages\/(lobby|ranking|schedule)\/index(?:\?|$)/);
  if (!page) continue;
  const tournamentId = item.data.tournamentId || (item.data.tournament && item.data.tournament._id);
  item.data.primaryNavItems = getPrimaryNavItems(page[1] === 'lobby' ? 'match' : page[1], tournamentId);
}

for (const [suffix, schedulerProfile] of [['Balanced', 'balanced'], ['Rest', 'rest'], ['Coverage', 'coverage']]) {
  const tournament = { ...cases.settings.data.tournament,
    _id: `__ui_scheduler_${schedulerProfile}`, rules: { schedulerProfile } };
  const state = buildSettingsViewState(tournament, { openid: tournament.creatorId });
  const preference = Object.fromEntries(['isDraft', 'showSchedulerProfile', 'schedulerProfile',
    'schedulerProfileOptions', 'schedulerProfileIndex', 'schedulerProfileDisplayLabel', 'schedulerProfileHint']
    .map(key => [key, state[key]]));
  cases[`settingsScheduler${suffix}`] = { ...cases.settings,
    selectors: [...cases.settings.selectors, '#section-params .form-label'],
    selectorExpectations: { ...cases.settings.selectorExpectations, '#section-params .form-label': 5 },
    scrollToSelector: '#section-params',
    data: { ...cases.settings.data, tournamentId: tournament._id, tournament, ...preference } };
}

const fullClaimTournament = buildShareTournament('__ui_claim_full_names');
fullClaimTournament.presetKey = 'rotation_6';
fullClaimTournament.playerLimit = 6;
for (const [index, name] of [[1, '阿杰'], [2, '阿杰'], [3, '这是一个需要完整辨认且不能自动猜测本人身份的超长昵称球友']]) {
  fullClaimTournament.players[index] = { id: `guest_ui_claim_${index}`, type: 'guest', name, avatar: localAvatar };
}
fullClaimTournament.playerIds = fullClaimTournament.players.map(player => player.id);
cases.shareClaimFullNames = { ...cases.shareDraft,
  path: `/pages/share-entry/index?code=${fullClaimTournament._id}`,
  data: { ...cases.shareDraft.data, tournament: fullClaimTournament,
    tournamentId: fullClaimTournament._id,
    preview: buildShareEntryViewModel({ tournament: fullClaimTournament, openid: shareViewerId }) } };

module.exports = { cases, manualActions };
