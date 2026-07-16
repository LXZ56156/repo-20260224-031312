#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeWorkflowRecord } = require('../lib/workflow-records');
const { runFileSync } = require('../lib/process-runner');

const SMOKE_CASES = ['launch', 'scheduleRunning', 'home'];

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (error) {
    throw new Error(`Local miniprogram-automator is unavailable. Run npm install in the repository. (${error.message})`);
  }
}

const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:39420';
const outDir = path.resolve(process.env.WEAPP_SCREENSHOT_DIR || 'tmp/ui-screenshots-actual');
const screenshotTimeoutMs = Number(process.env.WEAPP_SCREENSHOT_TIMEOUT_MS || 45000);
const reLaunchTimeoutMs = Number(process.env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000);

const primaryNav = (active) => [
  { key: 'match', text: '比赛', active: active === 'match' },
  { key: 'ranking', text: '排名', active: active === 'ranking' },
  { key: 'schedule', text: '对阵', active: active === 'schedule' }
];

const players = ['阿杰', '小林', 'Chris', '王敏', '李雷', '赵青', '周舟', '陈晨'].map((name, index) => ({
  id: `p${index + 1}`,
  name,
  initial: name.slice(0, 1),
  genderLabel: index % 2 ? '女' : '男',
  colorClass: `pcolor-${index % 6}`,
  avatarRaw: '',
  avatarDisplay: ''
}));

const schedulePlayers = players.map((player, index) => {
  const names = ['阿杰', '小林同学', 'ChristopherWong', '王敏同学', '李雷', '赵青', 'AlexandraJohnson', '陈晨同学'];
  const name = names[index];
  return { ...player, name, initial: name.slice(0, 1) };
});

const rankings = players.slice(0, 6).map((player, index) => ({
  rank: index + 1,
  rankKey: player.id,
  displayName: player.name,
  name: player.name,
  entityType: 'player',
  played: 8,
  wins: Math.max(2, 7 - index),
  losses: Math.min(6, 1 + index),
  pointsFor: 168 - index * 8,
  pointsAgainst: 136 + index * 3,
  pointDiff: 32 - index * 11,
  trendText: index < 2 ? `连胜 ${4 - index}` : '持平',
  trendType: index < 2 ? 'up' : '',
  showTrend: true,
  avatarItems: [player]
}));

const rankingPreview = rankings.slice(0, 3).map((item) => ({
  rank: item.rank,
  name: item.name,
  summaryText: `${item.wins}胜 ${item.losses}负`
}));

function scheduleTeam(ids) {
  const avatarItems = ids.map((index) => schedulePlayers[index]);
  return { avatarItems, text: avatarItems.map((item) => item.name).join(' / ') };
}

const scheduleRounds = [{
  roundIndex: 0,
  isCurrentRound: true,
  restText: '',
  matchesUi: [
    { key: '0-0', roundIndex: 0, matchIndex: 0, status: 'pending', title: '第 1 场', leftTeam: scheduleTeam([0, 1]), rightTeam: scheduleTeam([2, 3]), isFirstPending: true, focusBadgeText: '优先录分', scorerText: '', showScore: false, statusText: '待录分', statusClass: 'pill-pending' },
    { key: '0-1', roundIndex: 0, matchIndex: 1, status: 'finished', title: '第 2 场', leftTeam: scheduleTeam([4, 5]), rightTeam: scheduleTeam([6, 7]), isFirstPending: false, focusBadgeText: '', scorerText: '本场裁判：阿杰', showScore: true, leftScoreText: '21', rightScoreText: '17', leftScoreClass: 'score-win', rightScoreClass: '' }
  ]
}];

const participantPreviewList = players.slice(0, 6).map((item) => ({
  ...item,
  avatarUrl: '',
  showAvatar: false
}));

const basePreview = {
  tournamentName: '周末羽毛球赛',
  modeLabel: '多人轮转',
  eventSummaryText: '7人轮转 · 21场 · 1片场地',
  socialProofText: '已有 6 人加入',
  playersCountText: '6 人',
  organizerName: '阿杰',
  timeText: '今天 19:00',
  venueText: '社区球馆',
  joinAllowed: true,
  joined: false,
  viewModeLabel: '游客可加入',
  availabilityText: '加入后可看赛程、录分、查看排名。',
  primaryCtaReason: '还差 2 人满员',
  primaryAction: { key: 'join', text: '加入比赛' },
  secondaryAction: null,
  secondaryCtaText: '',
  showParticipantPreview: true,
  participantPreviewList,
  participantOverflowText: '',
  showRankingPreview: false,
  rankingTitle: '实时排名',
  rankingPreview: [],
  headline: '朋友邀请你加入这场比赛',
  subtitle: '加入后可参与对阵和排名',
  statusText: '报名中',
  statusClass: 'status-draft',
  progressText: '等待开赛'
};

function withPreview(patch) {
  return Object.assign({}, basePreview, patch);
}

const cases = {
  launch: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-hero', '.launch-card', '.launch-rule-link', '.launch-btn'],
    visualSelectors: ['.launch-card'],
    expectedTexts: ['选择赛制', '规则说明', '发起'],
    forbiddenTexts: ['创建'],
    data: {
      modeCards: [
        { key: 'rotation_6', mode: 'multi_rotate', presetKey: 'rotation_6', name: '6人转', summary: '默认 9 场 · 满 6 人开赛', badge: '推荐' },
        { key: 'rotation_7', mode: 'multi_rotate', presetKey: 'rotation_7', name: '7人转', summary: '默认 14 场 · 满 7 人开赛' },
        { key: 'rotation_8', mode: 'multi_rotate', presetKey: 'rotation_8', name: '8人转', summary: '默认 14 场 · 可选 1/2 场地' },
        { key: 'multi', mode: 'multi_rotate', presetKey: 'custom', name: '多人转', summary: '4–30 人 · 自动轮换搭档' }
      ]
    }
  },
  create: {
    path: '/pages/create/index',
    selectors: ['.create-hero', '.create-panel', '.input', '.create-flow', '.create-flow-item', '.create-actions', '.create-actions .btn'],
    visualSelectors: ['.create-hero', '.create-panel', '.create-flow'],
    expectedTexts: ['创建比赛', '基本信息', '赛事名称', '已选赛制', '创建后流程', '创建并进入'],
    forbiddenTexts: ['正在前往发起页'],
    data: {
      name: '周末友谊赛',
      mode: 'multi_rotate',
      presetKey: 'custom',
      modeLabel: '多人转',
      canEditTournamentName: true,
      createFlowSteps: ['1. 先邀请成员或导入名单', '2. 满 4 人后在比赛大厅设置参数并开赛'],
      networkOffline: false,
      createBusy: false,
      canRetryAction: false,
      lastFailedActionText: ''
    }
  },
  home: {
    path: '/pages/home/index',
    route: 'switchTab',
    selectors: ['.home-page', '.swipe-row', '.finished-growth-markers', '.finished-review-note', '.t-quick-action'],
    visualSelectors: ['.swipe-row'],
    expectedTexts: ['最终排名已出炉', '可生成战绩卡', '赛后复盘已准备好', '查看战绩', '再办一场'],
    data: {
      loadError: false,
      showHeroCard: false,
      syncStatusVisible: false,
      items: [{ _id: 'demo', name: '周末羽毛球赛', status: 'finished', statusClass: 'badge-success', statusLabel: '已结束', modeLabel: '多人轮转', playersCount: 7, matchProgressText: '21/21场', updatedAtText: '刚刚', _offset: 0 }],
      visibleCount: 1,
      filterStatus: 'all',
      sortMode: 'updated',
      statusCountRunning: 0,
      statusCountDraft: 0,
      statusCountFinished: 1,
      loading: false,
      showProfileNudge: false,
      showOnboarding: false,
      showHomeAdSlot: false,
      canRetryAction: false
    }
  },
  shareDraft: {
    path: '/pages/share-entry/index',
    quiesceTournamentSync: true,
    selectors: ['.share-hero', '.share-decision', '.share-guidance', '.participant-preview', '.participant-avatar-row', '.share-actions .btn', '.share-info', '.share-fact'],
    expectedTexts: ['朋友邀请你加入这场比赛', '加入比赛', '比赛摘要', '组织者', '今天 19:00', '社区球馆'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'draft' },
      tournamentId: '',
      preview: withPreview({}),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
      joinSquadChoice: 'A'
    }
  },
  shareRunning: {
    path: '/pages/share-entry/index',
    quiesceTournamentSync: true,
    selectors: ['.share-hero', '.share-decision', '.share-guidance', '.ranking-preview', '.ranking-preview-row', '.share-actions .btn', '.share-info', '.share-fact'],
    expectedTexts: ['比赛已经开打', '查看赛程', '查看排名', '实时排名', '比赛摘要'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'running' },
      tournamentId: '',
      preview: withPreview({
        joinAllowed: false,
        headline: '比赛已经开打',
        subtitle: '可以查看实时赛程和排名',
        statusText: '进行中',
        statusClass: 'status-running',
        progressText: '已完成 12 / 21 场',
        viewModeLabel: '实时进展',
        availabilityText: '比赛进行中，先看赛程和实时排名。',
        primaryCtaReason: '实时排名已更新',
        primaryAction: { key: 'schedule', text: '查看赛程' },
        secondaryAction: { key: 'ranking' },
        secondaryCtaText: '查看排名',
        showParticipantPreview: false,
        showRankingPreview: true,
        rankingPreview
      }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false
    }
  },
  shareFinished: {
    path: '/pages/share-entry/index',
    quiesceTournamentSync: true,
    selectors: ['.share-hero', '.share-decision', '.share-guidance', '.ranking-preview', '.ranking-preview-row', '.share-actions .btn', '.share-info', '.share-fact'],
    expectedTexts: ['这场比赛已结束', '查看最终排名', '查看赛事战报', '最终排名', '比赛摘要'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'finished' },
      tournamentId: '',
      preview: withPreview({
        joinAllowed: false,
        headline: '这场比赛已结束',
        subtitle: '最终排名和战绩卡已生成',
        statusText: '已结束',
        statusClass: 'status-finished',
        progressText: '21 / 21 场完成',
        viewModeLabel: '赛后复盘',
        availabilityText: '可以查看最终排名，生成战绩卡后发回群里。',
        primaryCtaReason: '最终排名已出炉',
        primaryAction: { key: 'ranking', text: '查看最终排名' },
        secondaryAction: { key: 'analytics' },
        secondaryCtaText: '查看赛事战报',
        showParticipantPreview: false,
        showRankingPreview: true,
        rankingTitle: '最终排名',
        rankingPreview
      }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false
    }
  },
  lobbyGuide: {
    path: '/pages/lobby/index',
    quiesceTournamentSync: true,
    selectors: ['.match-primary-nav', '.hero', '.hero-stats', '.state-overview', '.growth-guide-card', '.growth-guide-step', '.growth-guide-done', '.info-panel'],
    expectedTexts: ['比赛', '排名', '对阵', '人数', '场次', '场地', '刚加入，先看这 3 件事', '按顺序确认名单、规则和赛程', '比赛信息', '胜场优先'],
    data: {
      tournamentId: '',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'draft', mode: 'multi_rotate', players: players.slice(0, 5) },
      primaryNavItems: primaryNav('match'),
      mode: 'multi_rotate',
      modeLabel: '多人轮转',
      statusClass: 'tag-draft',
      statusText: '报名中',
      heroGradientClass: 'hero-draft',
      isAdmin: false,
      myJoined: true,
      matchInfoText: '21 分制 · 9 场 · 每轮最多 2 场',
      genderSummaryText: '男 3 · 女 2',
      kpiPlayers: '5/6',
      kpiMatches: '9',
      kpiCourts: '2',
      statePanelTitle: '开赛准备',
      stateStageBadge: '报名中',
      statePanelRoleLabel: '参赛者',
      statePanelSummary: '还差 1 人满员，管理员设置参数后即可开赛。',
      showStateChecklist: false,
      primaryTaskTitle: '',
      statePrimaryActionText: '',
      dynamicSharePreparing: false,
      dynamicShareReady: true,
      dynamicShareError: '',
      dynamicShareUnavailableReason: '',
      showGrowthOnboardingGuide: true,
      growthOnboardingSteps: [
        { step: 1, title: '看看有谁参加', desc: '先熟悉参赛名单' },
        { step: 2, title: '了解赛制规则', desc: '确认轮转和计分方式' },
        { step: 3, title: '等待开赛 / 查看赛程', desc: '开赛后从这里进入赛程和录分' }
      ],
      showJoinSheet: false,
      displayPlayers: players.slice(0, 5),
      showAllPlayers: true,
      playerCountText: '5 人',
      playerRosterHint: '还差 1 人',
      showDraftAdminPanel: false,
      pointsPerGame: 21,
      canRetryAction: false,
      syncStatusVisible: false,
      loadError: false,
      uiMotionClass: 'motion-reduced'
    }
  },
  ranking: {
    path: '/pages/ranking/index',
    quiesceTournamentSync: true,
    selectors: ['.match-primary-nav', '.hero', '.ranking-action-full', '.ranking-hero-actions .btn', '.ranking-share-banner', '.ranking-card', '.rank-row-share'],
    expectedTexts: ['比赛', '排名', '对阵', '生成我的战绩卡', '分享到朋友圈', '保存后发群', '最终排名已出炉', '分享'],
    data: {
      tournamentId: '',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished', mode: 'multi_rotate' },
      rankings: rankings.map((item, index) => ({ ...item, topShareText: index < 3 ? '分享' : '' })),
      rankingTypeLabel: '个人榜',
      posterButtonText: '生成我的战绩卡',
      rankingShareBannerText: '最终排名已出炉',
      loadError: false,
      syncStatusVisible: false,
      primaryNavItems: primaryNav('ranking')
    }
  },
  scheduleRunning: {
    path: '/pages/schedule/index',
    quiesceTournamentSync: true,
    selectors: ['.match-primary-nav', '.hero', '.hero-actions-panel', '.round-card', '.match-card-focus', '.match-card-head', '.match-team-name-line', '.match-card-result', '.match-center', '.match-center-score'],
    visualSelectors: ['.round-card', '.match-card-focus', '.match-center-score'],
    expectedTexts: ['比赛', '排名', '对阵', '待录分', '优先录分', '阿杰/小林同学', 'ChristopherWong/王敏同学', 'AlexandraJohnson/陈晨同学', '21:17'],
    data: {
      tournamentId: '',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'running', players: schedulePlayers },
      primaryNavItems: primaryNav('schedule'),
      statusText: '进行中',
      statusClass: 'hero-status-running',
      heroSummaryText: '6人转 · 第 1 轮',
      heroMatchText: '1 / 9 场',
      heroPendingText: '仍有 8 场待录分',
      heroProgressPercent: 11,
      nextActionKey: 'batch',
      nextActionText: '继续录分',
      heroActionBusy: false,
      roundsUi: scheduleRounds,
      showFilterBar: false,
      syncStatusVisible: false,
      loadError: false
    }
  },
  schedule: {
    path: '/pages/schedule/index',
    quiesceTournamentSync: true,
    selectors: ['.match-primary-nav', '.hero', '.hero-finished-share', '.hero-finished-actions .btn'],
    visualSelectors: ['.hero', '.hero-finished-share'],
    expectedTexts: ['比赛', '排名', '对阵', '比赛已结束', '查看最终排名', '分享我的战绩'],
    data: {
      tournamentId: '',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished' },
      primaryNavItems: primaryNav('schedule'),
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
      loadError: false
    }
  },
  settingsWater: {
    path: '/pages/settings/index',
    quiesceTournamentSync: true,
    selectors: ['.settings-page', '.context-panel', '.settings-panel', '.water-setting-field', '.water-setting-switch', '.settings-save'],
    visualSelectors: ['.context-panel', '.settings-panel', '.water-setting-field'],
    expectedTexts: ['修改比赛', '每局分制', '打水记账', '每局默认 1 瓶', '不影响正式排名', '保存修改'],
    data: {
      tournamentId: '',
      tournament: {
        _id: 'demo',
        name: '周末羽毛球赛',
        status: 'draft',
        mode: 'multi_rotate',
        totalMatches: 9,
        courts: 1,
        rules: {
          pointsPerGame: 21,
          water: { enabled: true, defaultUnitsPerLoser: 1 }
        }
      },
      mandatoryDone: 1,
      mandatoryTotal: 1,
      settingsReady: true,
      settingsGateHint: '',
      isAdmin: true,
      isDraft: true,
      canConfigureSettings: true,
      canEditTournamentName: true,
      name: '周末羽毛球赛',
      mode: 'multi_rotate',
      modeLabel: '多人转',
      editM: 9,
      editC: 1,
      pointsPerGame: 21,
      pointsIndex: 2,
      showWaterSettings: true,
      waterEnabled: true,
      waterDefaultUnitsPerLoser: 1,
      showSquadEndCondition: false,
      syncStatusVisible: false,
      settingsBusy: false,
      canRetryAction: false,
      loadError: false,
      contextTitle: '仅草稿阶段可修改比赛信息'
    }
  },
  matchWater: {
    path: '/pages/match/index',
    quiesceTournamentSync: true,
    selectors: ['.match-page', '.score-stage', '.score-row', '.water-control', '.water-units-picker', '.bottom-tray'],
    visualSelectors: ['.score-stage', '.water-control', '.bottom-tray'],
    expectedTexts: ['第1轮 · 第1场', '本场对阵', '阿杰 / 小林', '王敏 / 陈晨', '比分录入', '负方每人请水', '1 瓶', '不影响正式排名', '提交比分'],
    data: {
      tournamentId: '',
      tournamentName: '周末羽毛球赛',
      roundIndex: 0,
      matchIndex: 0,
      match: {
        matchIndex: 0,
        status: 'pending',
        teamA: [{ id: 'u1', name: '阿杰' }, { id: 'u2', name: '小林' }],
        teamB: [{ id: 'u3', name: '王敏' }, { id: 'u4', name: '陈晨' }]
      },
      pair1Text: '阿杰 / 小林',
      matchStatusText: '待录分',
      pointsPerGame: 21,
      userCanScore: true,
      canUseScoreLock: true,
      canEdit: true,
      lockState: 'locked_by_me',
      lockHintText: '你正在录入比分',
      scoreA: 21,
      scoreB: 18,
      scoreAIndex: 21,
      scoreBIndex: 18,
      displayScoreA: '21',
      displayScoreB: '18',
      waterEnabled: true,
      showWaterControl: true,
      waterUnitsPerLoser: 1,
      waterUnitsIndex: 1,
      waterUnitOptions: [{ value: 0, label: '0 瓶' }, { value: 1, label: '1 瓶' }, { value: 2, label: '2 瓶' }],
      batchMode: false,
      submitBusy: false,
      syncStatusVisible: false,
      canRetryAction: false,
      loadError: false,
      pair2Text: '王敏 / 陈晨'
    }
  },
  analytics: {
    path: '/pages/analytics/index',
    quiesceTournamentSync: true,
    clearLastEnterOptions: true,
    selectors: ['.analytics-hero', '.analytics-hero-actions .btn', '.report-card', '.analytics-copy-actions .btn', '.water-ledger-card', '.water-ledger-row'],
    visualSelectors: ['.analytics-hero', '.report-card', '.water-ledger-card'],
    expectedTexts: ['赛后战报', '生成赛事战报卡', '分享到朋友圈', '再办一场', '比赛结论', '复制摘要', '复制完整战报', '打水榜', '赢水', '请水', '净水'],
    data: {
      tournamentId: '',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished' },
      modeLabel: '多人轮转',
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
      pairHot: [],
      duelHot: [],
      showWaterLedger: true,
      waterLedgerHasRecords: true,
      waterLedgerRows: [
        { rank: 1, playerId: 'u1', name: '阿杰', wonUnits: 5, treatUnits: 1, netUnits: 4, netText: '+4' },
        { rank: 2, playerId: 'u2', name: '小林', wonUnits: 3, treatUnits: 2, netUnits: 1, netText: '+1' },
        { rank: 3, playerId: 'u3', name: '王敏', wonUnits: 1, treatUnits: 3, netUnits: -2, netText: '-2' }
      ],
      syncStatusVisible: false,
      showAnalyticsAdSlot: false,
      canRetryAction: false,
      loadError: false
    }
  }
};

function timeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function collectDom(page, selectors) {
  const rows = [];
  const missingSelectors = [];
  for (const selector of selectors) {
    const elements = await page.$$(selector).catch(() => []);
    if (!elements.length) missingSelectors.push(selector);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const [text, size, offset] = await Promise.all([
        element.text().catch(() => ''),
        element.size().catch(() => null),
        element.offset().catch(() => null)
      ]);
      rows.push({ selector, index, text: String(text || '').replace(/\s+/g, ' ').trim(), size, offset });
    }
  }
  return { rows, missingSelectors };
}

function normalizeVisibleText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function buildVisualProbe(data, domRows, preferredSelectors = [], viewportHeight = 0) {
  const eligibleRows = domRows.filter((row) => {
    if (!row || !row.text || !row.size || !row.offset) return false;
    if (preferredSelectors.length && !preferredSelectors.includes(row.selector)) return false;
    if (viewportHeight > 0) {
      const top = Number(row.offset.top) || 0;
      const bottom = top + (Number(row.size.height) || 0);
      if (top < 0 || bottom > viewportHeight) return false;
    }
    return true;
  });
  const cloned = JSON.parse(JSON.stringify(data));
  let match = null;

  function visit(value, parent, key, dataPath = []) {
    if (match) return;
    if (typeof value === 'string') {
      const normalized = normalizeVisibleText(value);
      if (normalized.length < 2) return;
      const row = eligibleRows.find((candidate) => normalizeVisibleText(candidate.text).includes(normalized));
      if (!row) return;
      const marker = Array.from(value).map((character) => {
        if (/\s/.test(character)) return character;
        if (/\d/.test(character)) return character === '8' ? '6' : '8';
        if (/[A-Za-z]/.test(character)) return character === 'W' ? 'M' : 'W';
        return '验';
      }).join('');
      if (marker === value) return;
      parent[key] = marker;
      match = { marker, original: value, selector: row.selector, dataPath: dataPath.join('.') };
      return;
    }
    if (!value || typeof value !== 'object') return;
    // Screenshot fixtures sometimes duplicate the same player/name under a source
    // tournament and a derived UI model. Prefer the later, rendered UI fields.
    for (const childKey of Object.keys(value).reverse()) {
      visit(value[childKey], value, childKey, [...dataPath, childKey]);
      if (match) return;
    }
  }

  visit(cloned, { root: cloned }, 'root', []);
  if (!match) {
    throw new Error('Screenshot coherence probe could not find visible fixture text inside the target DOM region');
  }
  return { data: cloned, ...match };
}

function assertCaseDom(name, item, dom, forbiddenMarker = '') {
  if (dom.missingSelectors.length) throw new Error(`${name}: missing selectors: ${dom.missingSelectors.join(', ')}`);
  const visibleText = normalizeVisibleText(dom.rows.map((row) => row.text).join(' '));
  const missingTexts = (item.expectedTexts || []).filter((value) => !visibleText.includes(normalizeVisibleText(value)));
  if (missingTexts.length) throw new Error(`${name}: missing expected text: ${missingTexts.join(', ')}`);
  const forbiddenTexts = (item.forbiddenTexts || []).filter((value) => visibleText.includes(normalizeVisibleText(value)));
  if (forbiddenTexts.length) throw new Error(`${name}: forbidden text present: ${forbiddenTexts.join(', ')}`);
  if (forbiddenMarker && visibleText.includes(normalizeVisibleText(forbiddenMarker))) {
    throw new Error(`${name}: visual coherence marker remained after fixture restoration`);
  }
  return visibleText;
}

async function forcePageRepaint(miniProgram, page) {
  await miniProgram.pageScrollTo(1);
  await page.waitFor(120);
  await miniProgram.pageScrollTo(0);
}

async function captureScreenshot(miniProgram, filePath, label) {
  await timeout(miniProgram.screenshot({ path: filePath }), screenshotTimeoutMs, label);
}

function inspectPng(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, isPng: false, bytes: 0, width: 0, height: 0 };
  }
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const ihdr = signature && buffer.subarray(12, 16).toString('ascii') === 'IHDR';
  return {
    exists: true,
    isPng: !!ihdr,
    bytes: buffer.length,
    width: ihdr ? buffer.readUInt32BE(16) : 0,
    height: ihdr ? buffer.readUInt32BE(20) : 0
  };
}

function fileLooksNonBlank(filePath) {
  const png = inspectPng(filePath);
  return png.isPng && png.bytes > 20 * 1024 && png.width >= 300 && png.height >= 400;
}

function logicalViewportWidth(domRows) {
  const rows = domRows
    .filter((row) => row && row.size && row.offset && Number(row.size.width) > 0)
    .map((row) => ({ width: Number(row.size.width), left: Math.max(0, Number(row.offset.left) || 0) }));
  if (!rows.length) return 0;
  const widest = Math.max(...rows.map((row) => row.width));
  const fullWidthCandidates = rows.filter((row) => Math.abs(row.width - widest) < 0.5);
  return Math.min(...fullWidthCandidates.map((row) => row.width + row.left * 2));
}

function resolveVisualBounds(imageWidth, imageHeight, domRows, selectors) {
  const viewportWidth = logicalViewportWidth(domRows);
  if (!viewportWidth) throw new Error('Screenshot visual region validation failed: cannot infer logical viewport width');
  const scale = imageWidth / viewportWidth;
  const resolved = [];

  for (const selector of selectors) {
    const rows = domRows.filter((row) => row.selector === selector && row.size && row.offset);
    if (!rows.length) throw new Error(`Screenshot visual region missing DOM selector: ${selector}`);
    for (const row of rows) {
      const left = Math.max(0, Math.floor(Number(row.offset.left) * scale));
      const top = Math.max(0, Math.floor(Number(row.offset.top) * scale));
      const right = Math.min(imageWidth, Math.ceil((Number(row.offset.left) + Number(row.size.width)) * scale));
      const bottom = Math.min(imageHeight, Math.ceil((Number(row.offset.top) + Number(row.size.height)) * scale));
      if (right <= left || bottom <= top) {
        throw new Error(`Screenshot visual region is outside the captured surface: ${selector}`);
      }
      resolved.push({ selector, index: row.index, bounds: { left, top, right, bottom } });
    }
  }
  return resolved;
}

function sampleRegion(imageData, bounds) {
  const { data, width } = imageData;
  const area = Math.max(1, bounds.width * bounds.height);
  const stride = Math.max(1, Math.floor(Math.sqrt(area / 6000)));
  const buckets = new Set();
  let count = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let y = bounds.top; y < bounds.bottom; y += stride) {
    for (let x = bounds.left; x < bounds.right; x += stride) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha === 0) continue;
      buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      sum += luminance;
      sumSquares += luminance * luminance;
      count += 1;
    }
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  return {
    sampledPixels: count,
    uniqueColorBuckets: buckets.size,
    luminanceStddev: Math.sqrt(variance)
  };
}

async function validateScreenshot({ filePath, domRows = [], visualSelectors = [] }) {
  const png = inspectPng(filePath);
  if (!png.isPng || png.bytes <= 20 * 1024 || png.width < 300 || png.height < 400) {
    throw new Error(`Screenshot PNG validation failed: ${filePath}; bytes=${png.bytes}; dimensions=${png.width}x${png.height}`);
  }

  const metrics = { ...png, visualRegions: [] };
  if (!visualSelectors.length) return metrics;

  const { createCanvas, loadImage } = require('canvas');
  const image = await loadImage(filePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  const regions = resolveVisualBounds(image.width, image.height, domRows, visualSelectors);

  for (const { selector, index, bounds } of regions) {
      const { left, top, right, bottom } = bounds;
      const region = sampleRegion(imageData, {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top
      });
      const result = { selector, index, bounds, ...region };
      metrics.visualRegions.push(result);
      if (region.uniqueColorBuckets < 4 || region.luminanceStddev < 2) {
        throw new Error(
          `Screenshot visual region looks blank or stale: ${selector}; ` +
          `colors=${region.uniqueColorBuckets}; stddev=${region.luminanceStddev.toFixed(2)}`
        );
      }
  }
  return metrics;
}

async function compareScreenshotRegions(firstPath, secondPath, domRows, selectors) {
  const { createCanvas, loadImage } = require('canvas');
  const [first, second] = await Promise.all([loadImage(firstPath), loadImage(secondPath)]);
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error(`Screenshot coherence dimensions changed: ${first.width}x${first.height} -> ${second.width}x${second.height}`);
  }
  const regions = resolveVisualBounds(first.width, first.height, domRows, selectors);
  const render = (image) => {
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  };
  const firstPixels = render(first);
  const secondPixels = render(second);
  let sampledPixels = 0;
  let changedPixels = 0;
  let differenceSum = 0;

  for (const { bounds } of regions) {
    const area = Math.max(1, (bounds.right - bounds.left) * (bounds.bottom - bounds.top));
    const stride = Math.max(1, Math.floor(Math.sqrt(area / 50000)));
    for (let y = bounds.top; y < bounds.bottom; y += stride) {
      for (let x = bounds.left; x < bounds.right; x += stride) {
        const offset = (y * first.width + x) * 4;
        const red = Math.abs(firstPixels[offset] - secondPixels[offset]);
        const green = Math.abs(firstPixels[offset + 1] - secondPixels[offset + 1]);
        const blue = Math.abs(firstPixels[offset + 2] - secondPixels[offset + 2]);
        const maximum = Math.max(red, green, blue);
        if (maximum >= 12) changedPixels += 1;
        differenceSum += (red + green + blue) / 3;
        sampledPixels += 1;
      }
    }
  }

  return {
    sampledPixels,
    changedPixels,
    changedRatio: sampledPixels ? changedPixels / sampledPixels : 0,
    meanAbsoluteDifference: sampledPixels ? differenceSum / sampledPixels : 0
  };
}

async function validateTemporalCoherence({ probePath, candidatePath, confirmationPath, domRows, selector }) {
  const selectors = [selector];
  const [transition, stability] = await Promise.all([
    compareScreenshotRegions(probePath, confirmationPath, domRows, selectors),
    compareScreenshotRegions(candidatePath, confirmationPath, domRows, selectors)
  ]);
  const transitionVisible = transition.changedRatio >= 0.0005 && transition.meanAbsoluteDifference >= 0.03;
  const finalStable = stability.changedRatio <= 0.01 && stability.meanAbsoluteDifference <= 1;
  const separated = transition.changedRatio >= stability.changedRatio + 0.0002 &&
    transition.meanAbsoluteDifference >= stability.meanAbsoluteDifference + 0.02;
  if (!transitionVisible || !finalStable || !separated) {
    throw new Error(
      'Screenshot coherence probe failed: ' +
      `transition ratio=${transition.changedRatio.toFixed(5)} mean=${transition.meanAbsoluteDifference.toFixed(3)}; ` +
      `stability ratio=${stability.changedRatio.toFixed(5)} mean=${stability.meanAbsoluteDifference.toFixed(3)}`
    );
  }
  return { selector, transition, stability };
}

async function validateAndPromoteScreenshot({ candidatePath, outputPath, domRows = [], visualSelectors = [] }) {
  try {
    const metrics = await validateScreenshot({ filePath: candidatePath, domRows, visualSelectors });
    fs.copyFileSync(candidatePath, outputPath);
    fs.rmSync(candidatePath, { force: true });
    return { ok: true, ...metrics };
  } catch (error) {
    fs.rmSync(candidatePath, { force: true });
    throw error;
  }
}

function isCompleteScreenshotSet(results, expectedNames) {
  if (!Array.isArray(results) || !Array.isArray(expectedNames) || results.length !== expectedNames.length) return false;
  const byName = new Map(results.map((item) => [item.name, item]));
  return byName.size === expectedNames.length && expectedNames.every((name) => byName.get(name) && byName.get(name).ok === true);
}

function shouldWriteScreenshotRecord(results, expectedNames, runKind) {
  return ['smoke', 'full'].includes(runKind) && isCompleteScreenshotSet(results, expectedNames);
}

function cleanupResultCandidates(results) {
  for (const result of results || []) {
    if (result && result.candidatePath) fs.rmSync(result.candidatePath, { force: true });
  }
}

function promoteScreenshotSet(results, expectedNames) {
  if (!isCompleteScreenshotSet(results, expectedNames)) {
    cleanupResultCandidates(results);
    return false;
  }
  const token = `${process.pid}.${Date.now()}`;
  const entries = results.map((result) => ({
    result,
    promotePath: path.join(path.dirname(result.output), `.${path.basename(result.output)}.${token}.promote`),
    backupPath: path.join(path.dirname(result.output), `.${path.basename(result.output)}.${token}.backup`),
    hadOutput: fs.existsSync(result.output),
    promoted: false
  }));

  try {
    for (const entry of entries) fs.copyFileSync(entry.result.candidatePath, entry.promotePath);
    for (const entry of entries) {
      if (entry.hadOutput) fs.renameSync(entry.result.output, entry.backupPath);
      fs.renameSync(entry.promotePath, entry.result.output);
      entry.promoted = true;
    }
    for (const entry of entries) {
      fs.rmSync(entry.backupPath, { force: true });
      fs.rmSync(entry.result.candidatePath, { force: true });
    }
    return true;
  } catch (error) {
    for (const entry of [...entries].reverse()) {
      if (entry.promoted) fs.rmSync(entry.result.output, { force: true });
      if (fs.existsSync(entry.backupPath)) fs.renameSync(entry.backupPath, entry.result.output);
      fs.rmSync(entry.promotePath, { force: true });
      fs.rmSync(entry.result.candidatePath, { force: true });
    }
    throw error;
  }
}

function cleanupScreenshotCandidates() {
  if (!fs.existsSync(outDir)) return;
  for (const entry of fs.readdirSync(outDir)) {
    if (/^\..+\.(?:candidate|probe|confirmation)\.png$/.test(entry) || /^\..+\.(?:promote|backup)$/.test(entry)) {
      fs.rmSync(path.join(outDir, entry), { force: true });
    }
  }
}

function runDevToolsWindowHelper(args) {
  const result = runFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(__dirname, 'show-weapp-devtools-window.ps1'),
    ...args
  ], { cwd: path.resolve(__dirname, '..', '..') });
  if (result.error || result.status !== 0) {
    throw new Error(`DevTools window state helper failed: ${result.stderr.trim() || (result.error && result.error.message) || 'unknown error'}`);
  }
  return result.stdout.trim();
}

function observeRuntimeDiagnostic(diagnostics, entry) {
  let message;
  try {
    message = typeof entry === 'string' ? entry : JSON.stringify(entry);
  } catch (_) {
    message = String(entry || '');
  }
  if (/wx\.(?:saveFile|removeSavedFile).*废弃|wx\.(?:saveFile|removeSavedFile).*deprecat/i.test(message)) {
    diagnostics.deprecatedFileApiWarningCount += 1;
  }
  if (/document\.get[\s\S]*(?:_id\s*demo|\bdemo\b)|watch:poll:[\s\S]*\bdemo\b/i.test(message)) {
    diagnostics.fakeFixtureSyncErrors.push(message.slice(0, 500));
  }
}

function attachRuntimeDiagnostics(miniProgram, diagnostics) {
  miniProgram.on('console', (entry) => observeRuntimeDiagnostic(diagnostics, entry));
}

function prepareDevToolsWindow() {
  if (process.platform !== 'win32') return { durationMs: 0, state: null };
  const startedAt = process.hrtime.bigint();
  const output = runDevToolsWindowHelper(['-Mode', 'Prepare']);
  let state;
  try {
    state = JSON.parse(output);
  } catch (error) {
    throw new Error(`DevTools window prepare emitted invalid JSON: ${error.message}`);
  }
  if (!state || state.windowPrepared !== true || state.preparedShowCmd !== 3 || state.preparedForegroundVerified !== true) {
    throw new Error('DevTools window prepare did not verify a maximized foreground window');
  }
  return { durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6, state };
}

function restoreDevToolsWindow(state) {
  if (!state || process.platform !== 'win32') return null;
  const startedAt = process.hrtime.bigint();
  const output = runDevToolsWindowHelper([
    '-Mode', 'Restore',
    '-ProcessId', String(state.processId),
    '-ProcessCreationDate', String(state.processCreationDate),
    '-WindowHandle', String(state.windowHandle),
    '-OriginalShowCmd', String(state.originalShowCmd),
    '-ForegroundWindowHandle', String(state.foregroundWindowHandle || 0)
  ]);
  let result;
  try {
    result = JSON.parse(output);
  } catch (error) {
    throw new Error(`DevTools window restore emitted invalid JSON: ${error.message}`);
  }
  const exactFocusExpected = result && result.foregroundRestoreAction !== 'original-window-unavailable';
  if (!result || result.windowStateRestored !== true || result.foregroundSafe !== true ||
      result.restoredShowCmd !== state.originalShowCmd ||
      (exactFocusExpected && result.foregroundRestored !== true)) {
    throw new Error('DevTools window restoration was not verified');
  }
  return {
    ...result,
    durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6)
  };
}

async function runCase(name, miniProgram) {
  const item = cases[name];
  if (!item) throw new Error(`Unknown case: ${name}`);
  const startedAt = process.hrtime.bigint();
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, `${name}.png`);
  const token = `${process.pid}.${Date.now()}`;
  const candidate = path.join(outDir, `.${name}.${token}.candidate.png`);
  const probePath = path.join(outDir, `.${name}.${token}.probe.png`);
  const confirmationPath = path.join(outDir, `.${name}.${token}.confirmation.png`);
  const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
  const navigationStartedAt = process.hrtime.bigint();
  try {
    let previousLastEnterOptions = null;
    if (item.clearLastEnterOptions) {
      previousLastEnterOptions = await timeout(miniProgram.evaluate(function () {
        var app = getApp();
        var previous = app && app.globalData ? app.globalData.lastEnterOptions : null;
        if (app && app.globalData) app.globalData.lastEnterOptions = {};
        return previous;
      }), 3000, `${name}:clear-last-enter-options`);
    }
    let page;
    try {
      page = await timeout(miniProgram[routeMethod](item.path), reLaunchTimeoutMs, `${name}:${routeMethod}`);
    } finally {
      if (item.clearLastEnterOptions) {
        await timeout(miniProgram.evaluate(function (previous) {
          var app = getApp();
          if (app && app.globalData) app.globalData.lastEnterOptions = previous || {};
        }, previousLastEnterOptions), 3000, `${name}:restore-last-enter-options`);
      }
    }
    const expectedRoute = item.path.split('?')[0].replace(/^\//, '');
    const actualRoute = String(page.path || '').replace(/^\//, '');
    if (actualRoute !== expectedRoute) throw new Error(`${name}: route mismatch: expected ${expectedRoute}, got ${actualRoute || '<unknown>'}`);
    if (item.quiesceTournamentSync) {
      await timeout(page.callMethod('invalidateFetchSeq'), 3000, `${name}:invalidate-fetch`);
      const activeWatcher = await timeout(page.callMethod('hasActiveWatch'), 3000, `${name}:inspect-watcher`);
      if (activeWatcher) throw new Error(`${name}: fixture watcher remained active before data injection`);
    }
    await page.waitFor(1200);
    await page.setData(item.data);
    if (item.quiesceTournamentSync) {
      const fixtureTournamentId = String(await page.data('tournamentId') || '').trim();
      if (fixtureTournamentId) throw new Error(`${name}: fixture tournamentId must remain empty`);
    }
    await page.waitFor(1800);
    let dom = await collectDom(page, item.selectors);
    assertCaseDom(name, item, dom);
    const preferredProbeSelectors = (item.visualSelectors && item.visualSelectors.length) ? item.visualSelectors : item.selectors;
    const viewportHeight = Number(await page.windowProperty('window.innerHeight')) || 0;
    const probe = buildVisualProbe(item.data, dom.rows, preferredProbeSelectors, viewportHeight);
    console.log(`[视觉探针] ${name}: ${probe.dataPath} ${JSON.stringify(probe.original)} -> ${JSON.stringify(probe.marker)}`);
    const navigationMs = Number(process.hrtime.bigint() - navigationStartedAt) / 1e6;

    await page.setData(probe.data);
    await forcePageRepaint(miniProgram, page);
    await page.waitFor(1800);
    const probeDom = await collectDom(page, [probe.selector]);
    const probeVisibleText = normalizeVisibleText(probeDom.rows.map((row) => row.text).join(' '));
    if (!probeVisibleText.includes(normalizeVisibleText(probe.marker))) {
      throw new Error(
        `${name}: visual coherence marker was not rendered in ${probe.selector}; ` +
        `original=${JSON.stringify(probe.original)} marker=${JSON.stringify(probe.marker)}`
      );
    }
    let captureStartedAt = process.hrtime.bigint();
    await captureScreenshot(miniProgram, probePath, `${name}:probe-screenshot`);
    let captureMs = Number(process.hrtime.bigint() - captureStartedAt) / 1e6;

    await page.setData(item.data);
    await forcePageRepaint(miniProgram, page);
    await page.waitFor(1800);
    page = await miniProgram.currentPage();
    const restoredRoute = String(page && page.path || '').replace(/^\//, '');
    if (!page || restoredRoute !== expectedRoute) {
      throw new Error(`${name}: route changed during screenshot capture: expected ${expectedRoute}, got ${restoredRoute || '<unknown>'}`);
    }
    dom = await collectDom(page, item.selectors);
    assertCaseDom(name, item, dom, probe.marker);
    captureStartedAt = process.hrtime.bigint();
    await captureScreenshot(miniProgram, candidate, `${name}:candidate-screenshot`);
    captureMs += Number(process.hrtime.bigint() - captureStartedAt) / 1e6;
    await page.waitFor(1200);
    const confirmationDom = await collectDom(page, item.selectors);
    assertCaseDom(name, item, confirmationDom, probe.marker);
    captureStartedAt = process.hrtime.bigint();
    await captureScreenshot(miniProgram, confirmationPath, `${name}:confirmation-screenshot`);
    captureMs += Number(process.hrtime.bigint() - captureStartedAt) / 1e6;

    const validation = await validateScreenshot({
      filePath: confirmationPath,
      domRows: confirmationDom.rows,
      visualSelectors: item.visualSelectors || []
    });
    const coherence = await validateTemporalCoherence({
      probePath,
      candidatePath: candidate,
      confirmationPath,
      domRows: confirmationDom.rows,
      selector: probe.selector
    });
    fs.rmSync(probePath, { force: true });
    fs.rmSync(candidate, { force: true });
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return {
      name,
      ok: true,
      output,
      candidatePath: confirmationPath,
      bytes: validation.bytes,
      width: validation.width,
      height: validation.height,
      navigationMs: Math.round(navigationMs),
      captureMs: Math.round(captureMs),
      captureCount: 3,
      durationMs: Math.round(durationMs),
      visualRegions: validation.visualRegions,
      coherence,
      dom: confirmationDom.rows
    };
  } catch (error) {
    if (process.env.WEAPP_SCREENSHOT_KEEP_FAILED === '1') {
      console.warn(`[截图诊断] 保留失败帧: ${probePath}, ${candidate}, ${confirmationPath}`);
    } else {
      fs.rmSync(probePath, { force: true });
      fs.rmSync(candidate, { force: true });
      fs.rmSync(confirmationPath, { force: true });
    }
    throw error;
  }
}

async function runWithAttempts(operation, { maxAttempts, delayMs = 750, onFailure = () => {} }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { value: await operation(attempt), attempt };
    } catch (error) {
      lastError = error;
      await onFailure(error, attempt);
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function main() {
  const requested = process.argv.slice(2);
  const flags = new Set(requested.filter((value) => value.startsWith('--')));
  const unknownFlags = [...flags].filter((value) => !['--list', '--smoke', '--reuse-connection'].includes(value));
  if (unknownFlags.length) throw new Error(`Unknown screenshot option(s): ${unknownFlags.join(', ')}`);
  if (flags.has('--list')) {
    console.log(Object.keys(cases).join('\n'));
    return 0;
  }
  const explicitNames = requested.filter((value) => !value.startsWith('--'));
  if (flags.has('--smoke') && explicitNames.length) {
    throw new Error('--smoke uses the fixed launch, scheduleRunning, home set and does not accept case names');
  }
  const runKind = flags.has('--smoke') ? 'smoke' : (explicitNames.length ? 'subset' : 'full');
  const names = flags.has('--smoke') ? SMOKE_CASES : (explicitNames.length ? explicitNames : Object.keys(cases));
  for (const name of names) {
    if (!cases[name]) throw new Error(`Unknown case: ${name}`);
  }

  const automator = resolveAutomator();
  const results = [];
  const startedAt = process.hrtime.bigint();
  const reuseConnection = flags.has('--reuse-connection');
  const maxAttempts = Math.max(1, Number(process.env.WEAPP_SCREENSHOT_ATTEMPTS || 2));
  let sharedMiniProgram;
  let sharedConnectMs = 0;
  let managedWindowState = null;
  let windowPrepareMs = 0;
  let windowRestore = null;
  let captureError = null;
  let restoreError = null;

  cleanupScreenshotCandidates();

  let captureSetComplete = false;
  const runtimeDiagnostics = {
    deprecatedFileApiWarningCount: 0,
    fakeFixtureSyncErrors: []
  };
  try {
    const preparedWindow = prepareDevToolsWindow();
    managedWindowState = preparedWindow.state;
    windowPrepareMs = preparedWindow.durationMs;
    for (const name of names) {
      const attempted = await runWithAttempts(async () => {
        let miniProgram = sharedMiniProgram;
        let ownsConnection = false;
        let connectMs = sharedConnectMs;
        try {
          if (!miniProgram) {
            const connectStartedAt = process.hrtime.bigint();
            miniProgram = await automator.connect({ wsEndpoint });
            attachRuntimeDiagnostics(miniProgram, runtimeDiagnostics);
            connectMs = Number(process.hrtime.bigint() - connectStartedAt) / 1e6;
            if (reuseConnection) {
              sharedMiniProgram = miniProgram;
              sharedConnectMs = connectMs;
            } else {
              ownsConnection = true;
            }
          }
          const result = await runCase(name, miniProgram);
          result.connectMs = Math.round(connectMs);
          if (miniProgram === sharedMiniProgram) sharedConnectMs = 0;
          return result;
        } catch (error) {
          if (miniProgram) {
            try {
              miniProgram.disconnect();
            } catch (_) {
              // Best effort cleanup only.
            }
          }
          ownsConnection = false;
          if (miniProgram === sharedMiniProgram) {
            sharedMiniProgram = undefined;
            sharedConnectMs = 0;
          }
          throw error;
        } finally {
          if (ownsConnection && miniProgram !== sharedMiniProgram) {
            try {
              miniProgram.disconnect();
            } catch (_) {
              // Best effort cleanup only.
            }
          }
        }
      }, {
        maxAttempts,
        onFailure(error, attempt) {
          console.warn(`[截图重试] ${name} attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
        }
      });
      const result = attempted.value;
      result.attempt = attempted.attempt;
      results.push(result);
      const publicResult = { ...result };
      delete publicResult.candidatePath;
      console.log(JSON.stringify(publicResult, null, 2));
    }
    if (runtimeDiagnostics.fakeFixtureSyncErrors.length) {
      throw new Error(`Screenshot fixture triggered ${runtimeDiagnostics.fakeFixtureSyncErrors.length} fake tournament sync error(s)`);
    }
    captureSetComplete = true;
  } catch (error) {
    captureError = error;
  } finally {
    if (sharedMiniProgram) {
      try {
        sharedMiniProgram.disconnect();
      } catch (_) {
        // Best effort cleanup only.
      }
    }
    if (!captureSetComplete) cleanupResultCandidates(results);
    try {
      windowRestore = restoreDevToolsWindow(managedWindowState);
    } catch (error) {
      restoreError = error;
    }
  }

  if (captureError || restoreError) {
    cleanupResultCandidates(results);
    if (captureError && restoreError) {
      throw new AggregateError([captureError, restoreError], 'Screenshot capture and DevTools window restoration both failed');
    }
    throw captureError || restoreError;
  }

  const totalDurationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
  const allOk = isCompleteScreenshotSet(results, names);
  const promoted = allOk && promoteScreenshotSet(results, names);
  const writeRecord = promoted && shouldWriteScreenshotRecord(results, names, runKind);
  if (writeRecord) {
    const record = writeWorkflowRecord('ui-screenshot', {
      event: 'screenshot_success',
      runKind,
      requestedCases: names,
      sourceProject: path.resolve(__dirname, '..', '..'),
      cases: results.map((item) => ({
        name: item.name,
        output: item.output,
        ok: item.ok,
        bytes: item.bytes,
        width: item.width,
        height: item.height,
        connectMs: item.connectMs,
        navigationMs: item.navigationMs,
        captureMs: item.captureMs,
        captureCount: item.captureCount,
        coherence: item.coherence,
        durationMs: item.durationMs
      })),
      outDir,
      wsEndpoint,
      screenshotTimeoutMs,
      reLaunchTimeoutMs,
      reuseConnection,
      maxAttempts,
      windowPrepareMs: Math.round(windowPrepareMs),
      windowRestore,
      runtimeDiagnostics: {
        deprecatedFileApiWarningCount: runtimeDiagnostics.deprecatedFileApiWarningCount,
        fakeFixtureSyncErrorCount: runtimeDiagnostics.fakeFixtureSyncErrors.length
      },
      totalDurationMs,
      command: ['node', 'scripts/dev/weapp-ui-screenshot.js', ...requested].join(' '),
      commandArgv: [process.execPath, path.resolve(__filename), ...requested]
    });
    console.log(`[记录] 截图成功记录已写入: ${record.recordPath}`);
  }
  console.log(JSON.stringify({ event: 'screenshot_run_complete', runKind, names, allOk, promoted, recordWritten: writeRecord, reuseConnection, windowPrepareMs: Math.round(windowPrepareMs), windowRestore, runtimeDiagnostics: { deprecatedFileApiWarningCount: runtimeDiagnostics.deprecatedFileApiWarningCount, fakeFixtureSyncErrorCount: runtimeDiagnostics.fakeFixtureSyncErrors.length }, totalDurationMs }));
  return allOk && promoted ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = {
  SMOKE_CASES,
  cases,
  compareScreenshotRegions,
  fileLooksNonBlank,
  inspectPng,
  isCompleteScreenshotSet,
  logicalViewportWidth,
  prepareDevToolsWindow,
  promoteScreenshotSet,
  restoreDevToolsWindow,
  runCase,
  runWithAttempts,
  shouldWriteScreenshotRecord,
  validateTemporalCoherence,
  validateAndPromoteScreenshot,
  validateScreenshot
};
