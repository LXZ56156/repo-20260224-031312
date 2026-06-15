#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (err) {
    // Continue to local npx cache lookup below.
  }

  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  const candidates = [];
  try {
    for (const entry of fs.readdirSync(npxRoot)) {
      const modulePath = path.join(npxRoot, entry, 'node_modules', 'miniprogram-automator');
      if (fs.existsSync(modulePath)) {
        candidates.push({ modulePath, mtimeMs: fs.statSync(modulePath).mtimeMs });
      }
    }
  } catch (err) {
    // Fall through to the actionable error below.
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length) {
    return require(candidates[0].modulePath);
  }

  throw new Error('miniprogram-automator not found. Run: npx --yes -p miniprogram-automator node scripts/dev/weapp-ui-screenshot.js <case>');
}

const automator = resolveAutomator();
const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:39420';
const outDir = path.resolve(process.env.WEAPP_SCREENSHOT_DIR || 'tmp/ui-screenshots-actual');
const screenshotTimeoutMs = Number(process.env.WEAPP_SCREENSHOT_TIMEOUT_MS || 45000);
const reLaunchTimeoutMs = Number(process.env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000);

const shared = {
  navSchedule: [
    { key: 'schedule', text: '比赛', active: true },
    { key: 'ranking', text: '排名', active: false },
    { key: 'analytics', text: '对阵', active: false },
  ],
  navRanking: [
    { key: 'schedule', text: '比赛', active: false },
    { key: 'ranking', text: '排名', active: true },
    { key: 'analytics', text: '对阵', active: false },
  ],
  rankings: [
    { rank: 1, rankKey: 'p1', displayName: '阿杰', name: '阿杰', entityType: 'player', played: 8, wins: 7, losses: 1, pointsFor: 168, pointsAgainst: 136, pointDiff: 32, trendText: '连胜 4', trendType: 'up', showTrend: true, topShareText: '分享', avatarItems: [] },
    { rank: 2, rankKey: 'p2', displayName: '小林', name: '小林', entityType: 'player', played: 8, wins: 6, losses: 2, pointsFor: 154, pointsAgainst: 136, pointDiff: 18, trendText: '连胜 2', trendType: 'up', showTrend: true, topShareText: '分享', avatarItems: [] },
    { rank: 3, rankKey: 'p3', displayName: 'Chris', name: 'Chris', entityType: 'player', played: 8, wins: 5, losses: 3, pointsFor: 148, pointsAgainst: 139, pointDiff: 9, trendText: '状态稳定', trendType: '', showTrend: true, topShareText: '分享', avatarItems: [] },
  ],
};

const participantAvatars = [
  'https://api.dicebear.com/9.x/personas/png?seed=ajie&backgroundColor=b6e3f4',
  'https://api.dicebear.com/9.x/personas/png?seed=xiaolin&backgroundColor=c0aede',
  'https://api.dicebear.com/9.x/personas/png?seed=chris&backgroundColor=ffd5dc',
  'https://api.dicebear.com/9.x/personas/png?seed=wang&backgroundColor=d1d4f9',
  'https://api.dicebear.com/9.x/personas/png?seed=li&backgroundColor=ffdfbf',
  'https://api.dicebear.com/9.x/personas/png?seed=zhao&backgroundColor=c0f0c8',
];

const participantPreviewList = ['阿', '林', 'C', '王', '李', '赵'].map((initial, idx) => ({
  id: `p${idx}`,
  name: initial,
  initial,
  avatarRaw: participantAvatars[idx],
  avatarUrl: participantAvatars[idx],
  showAvatar: true,
}));

const rankingPreview = shared.rankings.slice(0, 3).map((item) => ({
  rank: item.rank,
  name: item.name,
  summaryText: `${item.wins}胜 ${item.losses}负`,
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
  progressText: '等待开赛',
};

function withPreview(patch) {
  return Object.assign({}, basePreview, patch);
}

const cases = {
  home: {
    path: '/pages/home/index',
    route: 'switchTab',
    selectors: ['.home-page', '.swipe-row', '.finished-growth-markers'],
    data: {
      loadError: false,
      showHeroCard: false,
      syncStatusVisible: false,
      items: [{ _id: 'demo', name: '周末羽毛球赛', status: 'finished', statusClass: 'badge-success', statusLabel: '已结束', modeLabel: '多人轮转', playersCount: 7, matchProgressText: '21/21场', updatedAtText: '刚刚', _offset: 0 }],
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
    path: '/pages/share-entry/index?code=demo',
    selectors: ['.share-hero', '.share-actions .btn', '.participant-avatar-img', '.participant-avatar-row'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'draft' },
      tournamentId: 'demo',
      preview: withPreview({}),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
      joinSquadChoice: 'A',
    },
  },
  shareRunning: {
    path: '/pages/share-entry/index?code=demo',
    selectors: ['.share-hero', '.share-actions .btn', '.ranking-preview', '.ranking-preview-row'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'running' },
      tournamentId: 'demo',
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
        rankingPreview,
      }),
      identityPending: false,
      identityTimedOut: false,
      joinBusy: false,
      loadError: false,
      syncStatusVisible: false,
    },
  },
  shareFinished: {
    path: '/pages/share-entry/index?code=demo',
    selectors: ['.share-hero', '.share-actions .btn', '.ranking-preview', '.ranking-preview-row'],
    data: {
      tournament: { _id: 'demo', mode: 'multi_rotate', status: 'finished' },
      tournamentId: 'demo',
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
        rankingPreview,
      }),
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
  analytics: {
    path: '/pages/analytics/index?id=demo',
    selectors: ['.analytics-hero', '.analytics-hero-actions .btn', '.report-card'],
    data: {
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished' },
      tournamentId: 'demo',
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
      syncStatusVisible: false,
      showAnalyticsAdSlot: false,
      canRetryAction: false,
      loadError: false,
    },
  },
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
  for (const selector of selectors) {
    const elements = await page.$$(selector).catch(() => []);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const [text, size, offset] = await Promise.all([
        element.text().catch(() => ''),
        element.size().catch(() => null),
        element.offset().catch(() => null),
      ]);
      rows.push({ selector, index, text: String(text || '').replace(/\s+/g, ' ').trim(), size, offset });
    }
  }
  return rows;
}

function fileLooksNonBlank(filePath) {
  const stat = fs.statSync(filePath);
  return stat.size > 20 * 1024;
}

async function runCase(name, miniProgram) {
  const item = cases[name];
  if (!item) throw new Error(`Unknown case: ${name}`);
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, `${name}.png`);
  const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
  const page = await timeout(miniProgram[routeMethod](item.path), reLaunchTimeoutMs, `${name}:${routeMethod}`);
  await page.waitFor(1200);
  await page.setData(item.data);
  await page.waitFor(1800);
  const dom = await collectDom(page, item.selectors);
  await timeout(miniProgram.screenshot({ path: output }), screenshotTimeoutMs, `${name}:screenshot`);
  const ok = fileLooksNonBlank(output);
  return { name, ok, output, dom };
}

async function main() {
  const requested = process.argv.slice(2);
  if (requested.includes('--list')) {
    console.log(Object.keys(cases).join('\n'));
    return 0;
  }

  const names = requested.length ? requested : Object.keys(cases);
  const results = [];
  for (const name of names) {
    const miniProgram = await automator.connect({ wsEndpoint });
    try {
      const result = await runCase(name, miniProgram);
      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      try {
        miniProgram.disconnect();
      } catch (err) {
        // Best effort cleanup only.
      }
    }
  }

  return results.every((item) => item.ok) ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
