#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { URL } = require('url');
const { validateHorizontalAlignment } = require('./weapp-screenshot-layout');
const waterV2Fixtures = require('./water-v2-screenshot-fixtures');

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

function resolveLaunchCommand(requestedCliPath) {
  if (process.platform !== 'win32'
      || path.extname(requestedCliPath).toLowerCase() !== '.bat') {
    return { executable: requestedCliPath, args: [] };
  }
  const cliDir = path.dirname(requestedCliPath);
  const command = {
    executable: 'node',
    args: [path.join(cliDir, 'cli.js')],
  };
  if (!fs.existsSync(command.args[0])) {
    throw new Error(`Wechat DevTools cli.bat is missing cli.js: ${requestedCliPath}`);
  }
  return command;
}

const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:39420';
const sourceProjectPath = process.env.WEAPP_PROJECT_PATH
  ? path.resolve(process.env.WEAPP_PROJECT_PATH)
  : '';
const connectExisting = process.env.WEAPP_CONNECT_EXISTING === '1';
const cliPath = String(process.env.WEAPP_CLI_PATH || '').trim();
const launchPort = Number(process.env.WEAPP_AUTO_PORT || 39440);
const launchTimeoutMs = Number(process.env.WEAPP_LAUNCH_TIMEOUT_MS || 60000);
const outDir = path.resolve(process.env.WEAPP_SCREENSHOT_DIR || 'tmp/ui-screenshots-actual');
const screenshotTimeoutMs = Number(process.env.WEAPP_SCREENSHOT_TIMEOUT_MS || 45000);
const reLaunchTimeoutMs = Number(process.env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000);
const expectedWindowWidth = Number(process.env.WEAPP_EXPECTED_WINDOW_WIDTH || 0);
const expectedSDKVersion = String(process.env.WEAPP_EXPECTED_SDK_VERSION || '').trim();
const provenanceLogPath = String(process.env.WEAPP_PROJECT_PROVENANCE_LOG || '').trim();
const transparentTargetCapture = process.env.WEAPP_WIN32_TRANSPARENT_TARGET_CAPTURE === '1';
const win32HelperPath = path.join(__dirname, 'weapp-devtools-win32-capture.ps1');
const win32PrepareTtlMs = Number(process.env.WEAPP_WIN32_PREPARE_TTL_MS || 120000);
const WIN32_PREPARE_KIND = 'wechat-devtools-win32-prepare-v1';
const WIN32_CAPTURE_KINDS = Object.freeze({
  visible: 'wechat-devtools-win32-visible-crop-v1',
  printwindow: 'wechat-devtools-win32-offdesktop-printwindow-crop-v1',
  'printwindow-current': 'wechat-devtools-win32-current-desktop-occluded-printwindow-crop-v1',
});

function normalizeWin32CaptureMode(value) {
  const mode = String(value || 'visible').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(WIN32_CAPTURE_KINDS, mode)) {
    throw new Error(`Unsupported WEAPP_WIN32_CAPTURE_MODE: ${value || ''}`);
  }
  return mode;
}

const win32CaptureMode = normalizeWin32CaptureMode(process.env.WEAPP_WIN32_CAPTURE_MODE || 'visible');

const manualActions = [
  '原生 picker 展开态与滚轮选择',
  '系统确认 modal 的确认与取消',
  '键盘弹起时输入区、safe-area 与内部滚动',
];

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
  waterV2OwnerEmpty: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-ledger-table', '.water-action-dock'],
    fixture: waterV2Fixtures.ownerEmpty,
    strictReceipt: true,
  },
  waterV2Member24: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-latest-receipt', '.water-ledger-row', '.water-action-dock'],
    fixture: waterV2Fixtures.member24,
    strictReceipt: true,
  },
  waterV2Member24Game: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: [
      '.water-page', '.water-game-sheet', '.water-game-sheet .water-search',
      '.water-confirm-button', '.water-player-chip.is-winner', '.water-player-chip.is-loser',
      '.water-game-validation', '.water-action-dock',
    ],
    fixture: waterV2Fixtures.member24Game,
    strictReceipt: true,
  },
  waterV2VisitorLong: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-audit-track', '.water-feed-item', '.water-action-dock'],
    fixture: waterV2Fixtures.visitorLong,
    strictReceipt: true,
  },
  waterV2MemberDirect: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-sheet', '.water-direct-preview', '.water-confirm-button'],
    fixture: waterV2Fixtures.memberDirect,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  waterV2MemberCorrection: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-sheet', '.water-direct-preview', '.water-sheet-title', '.water-confirm-button'],
    fixture: waterV2Fixtures.memberCorrection,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  waterV2OwnerCorrectionLong: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-game-sheet', '.water-match-summary', '.water-confirm-button'],
    fixture: waterV2Fixtures.ownerCorrectionLong,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  waterV2EntryDetail: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-detail-sheet', '.water-detail-current', '.water-detail-history'],
    fixture: waterV2Fixtures.entryDetail,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  waterV2ArchivedRound: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-history-sheet', '.water-archived-note', '.water-audit-track'],
    fixture: waterV2Fixtures.archivedRound,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  waterV2SheetError: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-sheet', '.water-sheet-alert', '.water-confirm-button'],
    fixture: waterV2Fixtures.sheetError,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  water: {
    path: '/pages/water/index?id=water_v2_demo',
    selectors: ['.water-page', '.water-latest-receipt', '.water-ledger-row', '.water-action-dock'],
    fixture: waterV2Fixtures.member24,
    expectedWindowWidth: 390,
    strictReceipt: true,
  },
  launch: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-water-card', '.launch-water-btn', '.launch-card.is-default .launch-btn'],
    horizontalAlignment: {
      selectors: ['.launch-water-btn', '.launch-card.is-default .launch-btn'],
      tolerance: 1,
    },
    data: {},
  },
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

function parseScreenshotArgs(argv) {
  const requested = Array.isArray(argv) ? argv.slice() : [];
  if (requested[0] === '--prepare') {
    if (!requested[1]) throw new Error('--prepare requires one screenshot case.');
    if (requested.length !== 2) throw new Error('--prepare accepts exactly one case.');
    return { mode: 'prepare', value: requested[1] };
  }
  if (requested[0] === '--capture-win32') {
    if (!requested[1]) throw new Error('--capture-win32 requires one prepare JSON path.');
    if (requested.length !== 2) throw new Error('--capture-win32 accepts exactly one prepare JSON path.');
    return { mode: 'capture-win32', value: requested[1] };
  }
  if (requested.includes('--prepare') || requested.includes('--capture-win32')) {
    throw new Error('Two-stage screenshot flags must be the first argument.');
  }
  if (requested.includes('--list')) return { mode: 'list', value: '' };
  return { mode: 'legacy', value: requested };
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  if (seen.has(value)) throw new Error('Cannot hash cyclic screenshot evidence.');
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((item) => {
      const entry = canonicalize(item, seen);
      return typeof entry === 'undefined' ? null : entry;
    });
  } else {
    normalized = {};
    Object.keys(value).sort().forEach((key) => {
      const entry = canonicalize(value[key], seen);
      if (typeof entry !== 'undefined') normalized[key] = entry;
    });
  }
  seen.delete(value);
  return normalized;
}

function hashCanonical(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function buildViewportRect(screenRect, systemInfo) {
  const source = screenRect || {};
  const system = systemInfo || {};
  const screenWidth = Number(system.screenWidth || 0);
  const screenHeight = Number(system.screenHeight || 0);
  const windowWidth = Number(system.windowWidth || 0);
  const windowHeight = Number(system.windowHeight || 0);
  const x = Number(source.x || 0);
  const y = Number(source.y || 0);
  const width = Number(source.width || 0);
  const height = Number(source.height || 0);
  if (![screenWidth, screenHeight, windowWidth, windowHeight, width, height].every((item) => item > 0)) {
    throw new Error('Screen calibration and logical screen/window dimensions must be positive.');
  }
  if (windowWidth !== screenWidth) {
    throw new Error('Win32 visible crop currently requires portrait windowWidth === screenWidth.');
  }
  const scaleX = width / screenWidth;
  const scaleY = height / screenHeight;
  if (Math.abs(height - Math.round(screenHeight * scaleX)) > 2) {
    throw new Error('Screen calibration X/Y scales differ by more than two physical pixels.');
  }
  const viewportWidth = Math.round(windowWidth * scaleX);
  const viewportHeight = Math.round(windowHeight * scaleX);
  const relativeX = 0;
  const relativeY = height - viewportHeight;
  if (relativeY < 0 || viewportWidth > width || viewportHeight > height) {
    throw new Error('Bottom-anchored viewport does not fit inside the calibrated device screen.');
  }
  return {
    x: x + relativeX,
    y: y + relativeY,
    width: viewportWidth,
    height: viewportHeight,
    relativeX,
    relativeY,
    scaleX,
    scaleY,
  };
}

function selectSystemInfo(source) {
  const info = source && typeof source === 'object' ? source : {};
  return {
    brand: info.brand || '',
    model: info.model || '',
    platform: info.platform || '',
    screenWidth: Number(info.screenWidth || 0),
    screenHeight: Number(info.screenHeight || 0),
    windowWidth: Number(info.windowWidth || 0),
    windowHeight: Number(info.windowHeight || 0),
    pixelRatio: Number(info.pixelRatio || 0),
    fontSizeSetting: Number(info.fontSizeSetting || 0),
    statusBarHeight: Number(info.statusBarHeight || 0),
    safeArea: info.safeArea || null,
  };
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

function normalizeRoute(value) {
  const route = String(value && (value.path || value.route) || value || '')
    .split('?')[0]
    .replace(/^\/+/, '');
  return route ? `/${route}` : '';
}

function normalizeProjectPath(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const normalized = path.resolve(source).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sameResolvedPath(left, right) {
  if (!String(left || '').trim() || !String(right || '').trim()) return false;
  const normalize = (value) => path.resolve(String(value)).replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function endpointPort(endpoint) {
  try {
    const parsed = new URL(String(endpoint || ''));
    return Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80));
  } catch (err) {
    return 0;
  }
}

function inspectPngBuffer(source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source || '');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const signatureOk = buffer.length >= 24 && buffer.subarray(0, 8).equals(signature);
  const ihdrOk = signatureOk && buffer.subarray(12, 16).toString('ascii') === 'IHDR';
  const width = ihdrOk ? buffer.readUInt32BE(16) : 0;
  const height = ihdrOk ? buffer.readUInt32BE(20) : 0;
  return {
    valid: !!(ihdrOk && width > 0 && height > 0),
    signatureOk,
    ihdrOk,
    width,
    height,
    byteLength: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function inspectPngFile(filePath) {
  return inspectPngBuffer(fs.readFileSync(filePath));
}

function validateSelectorCoverage(dom, selectors) {
  const missing = (Array.isArray(selectors) ? selectors : [])
    .filter((selector) => !(Array.isArray(dom) ? dom : []).some((row) => row.selector === selector));
  return { ok: missing.length === 0, missing };
}

function validateHorizontalOverflow(pageSize, systemInfo, tolerance = 1) {
  const contentWidth = Number(pageSize && pageSize.width || 0);
  const viewportWidth = Number(systemInfo && systemInfo.windowWidth || 0);
  const overflow = contentWidth && viewportWidth ? Math.max(0, contentWidth - viewportWidth) : Number.POSITIVE_INFINITY;
  return {
    ok: Number.isFinite(overflow) && contentWidth > 0 && viewportWidth > 0 && overflow <= tolerance,
    contentWidth,
    viewportWidth,
    overflow,
    tolerance,
  };
}

function currentGitManifest(repoRoot = path.resolve(__dirname, '..', '..')) {
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  const statusResult = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  const changedResult = spawnSync('git', ['diff', 'HEAD', '--name-only', '-z', '--diff-filter=ACMRTUXBD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const head = String(headResult.stdout || '').trim();
  const status = String(statusResult.stdout || '').split(/\r?\n/).filter(Boolean);
  const dirtyPaths = Array.from(new Set(
    `${String(changedResult.stdout || '')}\0${String(untrackedResult.stdout || '')}`
      .split('\0')
      .map((item) => item.trim())
      .filter(Boolean)
  )).sort();
  const files = dirtyPaths.map((relativePath) => {
    const absolutePath = path.resolve(repoRoot, relativePath);
    const insideRepo = !path.relative(repoRoot, absolutePath).startsWith('..') && !path.isAbsolute(path.relative(repoRoot, absolutePath));
    const exists = insideRepo && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    return {
      path: relativePath.replace(/\\/g, '/'),
      exists,
      sha256: exists ? crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex') : '',
    };
  });
  return {
    ok: headResult.status === 0
      && statusResult.status === 0
      && changedResult.status === 0
      && untrackedResult.status === 0
      && /^[a-f0-9]{40}$/i.test(head),
    head,
    dirty: status.length > 0,
    status,
    files,
  };
}

function readProjectProvenanceLog(filePath) {
  const requested = String(filePath || '').trim();
  if (!requested) return null;
  const resolved = path.resolve(requested);
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return { ...parsed, logPath: resolved };
  } catch (err) {
    return { logPath: resolved, error: String(err && err.message || err) };
  }
}

function validateProjectProvenance({ connection = {}, toolInfo = {}, logEvidence = null } = {}) {
  const expectedProjectPath = normalizeProjectPath(connection.sourceProjectPath);
  const toolProjectPath = normalizeProjectPath(toolInfo.projectPath);
  const endpoint = String(connection.endpoint || '');
  if (!expectedProjectPath) {
    return { ok: false, reason: 'missing exact sourceProjectPath input', mode: connection.mode || '' };
  }
  if (toolProjectPath) {
    return {
      ok: toolProjectPath === expectedProjectPath,
      reason: toolProjectPath === expectedProjectPath ? '' : 'Tool.getInfo projectPath does not match WEAPP_PROJECT_PATH',
      mode: connection.mode || '',
      evidence: 'Tool.getInfo.projectPath',
      expectedProjectPath,
      actualProjectPath: toolProjectPath,
    };
  }
  if (connection.mode === 'launch') {
    return {
      ok: true,
      reason: '',
      mode: connection.mode,
      evidence: 'automator.launch exact projectPath/port input',
      expectedProjectPath,
      endpoint,
    };
  }
  if (connection.mode !== 'connect-preopened') {
    return { ok: false, reason: 'Tool.getInfo omitted projectPath and connection is not an exact launch', mode: connection.mode || '' };
  }
  const loggedProjectPath = normalizeProjectPath(logEvidence && logEvidence.projectPath);
  const loggedEndpoint = String(logEvidence && (logEvidence.wsEndpoint || logEvidence.endpoint) || '');
  const loggedPort = Number(logEvidence && logEvidence.port || 0);
  const expectedPort = endpointPort(endpoint);
  const logMatches = !!logEvidence
    && !logEvidence.error
    && loggedProjectPath === expectedProjectPath
    && loggedEndpoint === endpoint
    && loggedPort === expectedPort
    && expectedPort > 0;
  return {
    ok: logMatches,
    reason: logMatches ? '' : 'connect-preopened requires matching projectPath, wsEndpoint and port provenance log evidence',
    mode: connection.mode,
    evidence: logMatches ? 'WEAPP_PROJECT_PROVENANCE_LOG' : '',
    expectedProjectPath,
    endpoint,
    logPath: logEvidence && logEvidence.logPath || '',
  };
}

function normalizeHwnd(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return '';
  if (/^0x[0-9a-f]+$/.test(source)) return `0x${BigInt(source).toString(16)}`;
  if (/^[0-9]+$/.test(source)) return `0x${BigInt(source).toString(16)}`;
  return '';
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function validUuid(value) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
    .test(String(value || ''));
}

function validRect(value) {
  const rect = value || {};
  return [rect.x, rect.y, rect.width, rect.height].every((item) => Number.isFinite(Number(item)))
    && Number(rect.width) > 0
    && Number(rect.height) > 0;
}

function sameRect(left, right) {
  if (!validRect(left) || !validRect(right)) return false;
  return ['x', 'y', 'width', 'height'].every((key) => Number(left[key]) === Number(right[key]));
}

function isLocalWebSocketEndpoint(endpoint) {
  try {
    const parsed = new URL(String(endpoint || ''));
    return ['ws:', 'wss:'].includes(parsed.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      && endpointPort(endpoint) > 0;
  } catch (err) {
    return false;
  }
}

function validateScreenCalibration(prepare) {
  const binding = prepare && prepare.windowBinding || {};
  const system = prepare && prepare.systemInfo || {};
  const calibration = prepare && prepare.screenCalibration || {};
  let viewportRect = null;
  try {
    viewportRect = buildViewportRect(calibration.screenRect, system);
  } catch (err) {
    return { ok: false, reason: String(err && err.message || err), viewportRect: null };
  }
  const logicalScreen = calibration.logicalScreen || {};
  const logicalWindow = calibration.logicalWindow || {};
  const rect = calibration.screenRect || {};
  const windowRect = binding.windowRect || {};
  const checks = {
    source: ['explicit-screen-rect', 'calibration-file'].includes(String(calibration.source || '')),
    processId: Number(calibration.processId || 0) === Number(binding.processId || 0),
    hwnd: normalizeHwnd(calibration.hwnd) === normalizeHwnd(binding.hwnd),
    dpi: Number(calibration.dpi || 0) > 0 && Number(calibration.dpi) === Number(binding.dpi || 0),
    model: !!String(system.model || '') && String(calibration.model || '') === String(system.model || ''),
    logicalScreen: Number(logicalScreen.width || 0) === Number(system.screenWidth || 0)
      && Number(logicalScreen.height || 0) === Number(system.screenHeight || 0),
    logicalWindow: Number(logicalWindow.width || 0) === Number(system.windowWidth || 0)
      && Number(logicalWindow.height || 0) === Number(system.windowHeight || 0),
    windowRect: sameRect(calibration.windowRect, windowRect),
    screenRect: validRect(rect)
      && Number(rect.x) >= 0
      && Number(rect.y) >= 0
      && Number(rect.x) + Number(rect.width) <= Number(windowRect.width || 0)
      && Number(rect.y) + Number(rect.height) <= Number(windowRect.height || 0),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    reason: Object.values(checks).every(Boolean) ? '' : 'screen calibration does not match bound DevTools window/device geometry',
    checks,
    viewportRect,
  };
}

function validatePrepareRecord(prepare = {}) {
  const binding = prepare.windowBinding || {};
  const system = prepare.systemInfo || {};
  const calibration = validateScreenCalibration(prepare);
  const captureMode = String(prepare.captureMode || '');
  const isVisibleMode = captureMode === 'visible';
  const isOffDesktopPrintWindowMode = captureMode === 'printwindow';
  const isCurrentDesktopPrintWindowMode = captureMode === 'printwindow-current';
  const isPrintWindowMode = isOffDesktopPrintWindowMode || isCurrentDesktopPrintWindowMode;
  const checks = {
    kind: prepare.kind === WIN32_PREPARE_KIND,
    captureMode: isVisibleMode || isPrintWindowMode,
    caseName: !!String(prepare.name || '') && !!cases[prepare.name],
    prepareId: validSha256(prepare.prepareId),
    nonce: validSha256(prepare.nonce),
    pageId: !!String(prepare.pageId || ''),
    endpoint: isLocalWebSocketEndpoint(prepare.endpoint),
    sourceProjectPath: !!String(prepare.sourceProjectPath || ''),
    route: !!normalizeRoute(prepare.expectedRoute),
    expectedWidth: Number(prepare.expectedWindowWidth || 0) > 0
      && Number(prepare.expectedWindowWidth) === Number(system.windowWidth || 0),
    sdk: !!String(prepare.expectedSDKVersion || ''),
    stateHashes: ['fixtureHash', 'pageDataHash', 'domHash', 'systemInfoHash', 'gitHash']
      .every((key) => validSha256(prepare[key])),
    system: Number(system.screenWidth || 0) > 0
      && Number(system.screenHeight || 0) > 0
      && Number(system.windowWidth || 0) > 0
      && Number(system.windowHeight || 0) > 0
      && Number(system.pixelRatio || 0) > 0
      && Number(system.fontSizeSetting || 0) > 0,
    processId: Number.isInteger(Number(binding.processId)) && Number(binding.processId) > 0,
    hwnd: !!normalizeHwnd(binding.hwnd),
    title: String(binding.title || '').includes('微信开发者工具'),
    dpi: Number(binding.dpi || 0) > 0,
    windowRect: validRect(binding.windowRect),
    helperCaptureMode: binding.captureMode === captureMode,
    transparentTargetCapture: prepare.transparentTargetCapture !== true
      || isCurrentDesktopPrintWindowMode,
    dpiAwareness: isPrintWindowMode
      ? binding.dpiAwareness === 'per-monitor-aware-v2'
      : ['per-monitor-aware-v2', 'per-monitor-aware', 'system-aware'].includes(binding.dpiAwareness),
    desktopId: validUuid(binding.desktopId),
    windowState: binding.visible === true
      && binding.minimized === false
      && Number.isInteger(Number(binding.cloakState))
      && Number(binding.cloakState) >= 0
      && binding.cloaked === (Number(binding.cloakState) !== 0)
      && (isVisibleMode || isCurrentDesktopPrintWindowMode
        ? binding.cloaked === false && binding.isOnCurrentVirtualDesktop === true
        : isOffDesktopPrintWindowMode && binding.isOnCurrentVirtualDesktop === false),
    calibration: calibration.ok,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    calibration,
  };
}

function validateWin32CaptureEvidence(prepare, capture = {}, artifactPlan = null) {
  const binding = prepare && prepare.windowBinding || {};
  const captureMode = String(prepare && prepare.captureMode || '');
  const isVisibleMode = captureMode === 'visible';
  const isOffDesktopPrintWindowMode = captureMode === 'printwindow';
  const isCurrentDesktopPrintWindowMode = captureMode === 'printwindow-current';
  const isPrintWindowMode = isOffDesktopPrintWindowMode || isCurrentDesktopPrintWindowMode;
  const expectedCalibration = validateScreenCalibration(prepare || {});
  const actualCalibration = capture.screenCalibration || {};
  const crop = capture.crop || {};
  const fullFrame = capture.fullFrame || {};
  const expectedViewport = expectedCalibration.viewportRect || {};
  const actualViewport = capture.viewportRect || {};
  const overlaps = Array.isArray(capture.overlappingWindows) ? capture.overlappingWindows : null;
  const overlapsBefore = Array.isArray(capture.overlappingWindowsBefore)
    ? capture.overlappingWindowsBefore
    : null;
  const overlapsAfter = Array.isArray(capture.overlappingWindowsAfter)
    ? capture.overlappingWindowsAfter
    : null;
  const foreground = capture.foreground || {};
  const foregroundBefore = foreground.before || {};
  const foregroundAfter = foreground.after || {};
  const desktop = capture.desktop || {};
  const requestProvenance = capture.requestProvenance || {};
  const windowAfter = capture.windowAfter || {};
  const absoluteViewport = capture.absoluteViewportRect || {};
  const transparentTarget = capture.transparentTarget || {};
  const transparentTargetStateValid = (state) => !!state
    && state.eligible === true
    && state.layered === true
    && state.clickThrough === true
    && state.layeredAttributesAvailable === true
    && state.alphaZero === true
    && Number(state.layeredAlpha) === 0
    && (Number(state.layeredFlags) & 2) === 2;
  const transparentTargetEvidenceValid = prepare && prepare.transparentTargetCapture === true
    && transparentTarget.requested === true
    && transparentTarget.stable === true
    && transparentTargetStateValid(transparentTarget.before)
    && transparentTargetStateValid(transparentTarget.after);
  const transparentDesktopProbeUnavailable = prepare && prepare.transparentTargetCapture === true
    && capture.desktopProbeUnavailable === true
    && !String(capture.desktopId || '')
    && capture.isOnCurrentVirtualDesktop === false
    && !String(windowAfter.desktopId || '')
    && windowAfter.isOnCurrentVirtualDesktop === false
    && capture.cloaked === false
    && Number(capture.cloakState) === 0;
  const transparentForegroundDesktopUnavailable = prepare && prepare.transparentTargetCapture === true
    && !String(foregroundBefore.desktopId || '')
    && !String(foregroundAfter.desktopId || '')
    && !String(desktop.currentBefore || '')
    && !String(desktop.currentAfter || '')
    && validUuid(desktop.targetBefore)
    && String(desktop.targetBefore || '').toLowerCase() === String(binding.desktopId || '').toLowerCase()
    && String(desktop.targetAfter || '').toLowerCase() === String(desktop.targetBefore || '').toLowerCase()
    && desktop.targetOnCurrentBefore === true
    && desktop.targetOnCurrentAfter === true
    && capture.isOnCurrentVirtualDesktop === true
    && windowAfter.isOnCurrentVirtualDesktop === true;
  const foregroundFullyCoversViewport = (entries, foregroundWindow) => Array.isArray(entries)
    && !!normalizeHwnd(foregroundWindow && foregroundWindow.hwnd)
    && normalizeHwnd(foregroundWindow.hwnd) !== normalizeHwnd(binding.hwnd)
    && entries.some((entry) => (
      normalizeHwnd(entry && entry.hwnd) === normalizeHwnd(foregroundWindow.hwnd)
      && sameRect(entry && entry.intersection, absoluteViewport)
    ));
  const checks = {
    prepare: validatePrepareRecord(prepare || {}).ok,
    captureMode: String(capture.captureMode || '') === captureMode,
    renderMethod: isVisibleMode
      ? capture.renderMethod === 'CopyFromScreen'
      : isPrintWindowMode && capture.renderMethod === 'PrintWindow(PW_RENDERFULLCONTENT)',
    dpiAwareness: isPrintWindowMode
      ? capture.dpiAwareness === 'per-monitor-aware-v2'
      : ['per-monitor-aware-v2', 'per-monitor-aware', 'system-aware'].includes(capture.dpiAwareness),
    processId: Number(capture.processId || 0) === Number(binding.processId || 0),
    hwnd: !!normalizeHwnd(capture.hwnd)
      && normalizeHwnd(capture.hwnd) === normalizeHwnd(binding.hwnd),
    title: !!String(capture.title || '') && String(capture.title) === String(binding.title || ''),
    dpi: Number(capture.dpi || 0) === Number(binding.dpi || 0),
    visible: capture.visible === true,
    minimized: capture.minimized === false,
    cloaked: capture.cloaked === binding.cloaked
      && Number(capture.cloakState) === Number(binding.cloakState)
      && capture.cloaked === (Number(capture.cloakState) !== 0)
      && (isPrintWindowMode || capture.cloaked === false),
    desktopId: transparentDesktopProbeUnavailable
      ? validUuid(binding.desktopId)
      : validUuid(capture.desktopId)
        && String(capture.desktopId).toLowerCase() === String(binding.desktopId || '').toLowerCase(),
    currentDesktopPlacement: transparentDesktopProbeUnavailable
      ? true
      : isVisibleMode || isCurrentDesktopPrintWindowMode
        ? capture.isOnCurrentVirtualDesktop === true
      : isOffDesktopPrintWindowMode && capture.isOnCurrentVirtualDesktop === false,
    windowStable: capture.windowStable === true,
    postWindow: normalizeHwnd(windowAfter.hwnd) === normalizeHwnd(binding.hwnd)
      && Number(windowAfter.processId || 0) === Number(binding.processId || 0)
      && String(windowAfter.title || '') === String(binding.title || '')
      && Number(windowAfter.dpi || 0) === Number(binding.dpi || 0)
      && windowAfter.visible === true
      && windowAfter.minimized === false
      && windowAfter.cloaked === binding.cloaked
      && Number(windowAfter.cloakState) === Number(binding.cloakState)
      && (transparentDesktopProbeUnavailable
        ? !String(windowAfter.desktopId || '') && windowAfter.isOnCurrentVirtualDesktop === false
        : String(windowAfter.desktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase()
          && windowAfter.isOnCurrentVirtualDesktop === binding.isOnCurrentVirtualDesktop)
      && sameRect(windowAfter.windowRect, binding.windowRect),
    windowRect: sameRect(capture.windowRect, binding.windowRect),
    model: String(actualCalibration.model || '') === String(prepare && prepare.systemInfo && prepare.systemInfo.model || ''),
    logicalScreen: Number(actualCalibration.logicalScreen && actualCalibration.logicalScreen.width || 0)
        === Number(prepare && prepare.systemInfo && prepare.systemInfo.screenWidth || 0)
      && Number(actualCalibration.logicalScreen && actualCalibration.logicalScreen.height || 0)
        === Number(prepare && prepare.systemInfo && prepare.systemInfo.screenHeight || 0),
    screenRect: sameRect(actualCalibration.screenRect, prepare && prepare.screenCalibration && prepare.screenCalibration.screenRect),
    viewportRect: sameRect(actualViewport, expectedViewport),
    noOcclusion: isCurrentDesktopPrintWindowMode
      ? (prepare && prepare.transparentTargetCapture === true
        ? transparentTargetEvidenceValid
        : foregroundFullyCoversViewport(overlapsBefore, foregroundBefore)
          && foregroundFullyCoversViewport(overlapsAfter, foregroundAfter))
      : !!overlaps && overlaps.length === 0,
    targetNeverForeground: isVisibleMode || (!!normalizeHwnd(foregroundBefore.hwnd)
      && !!normalizeHwnd(foregroundAfter.hwnd)
      && normalizeHwnd(foregroundBefore.hwnd) !== normalizeHwnd(binding.hwnd)
      && normalizeHwnd(foregroundAfter.hwnd) !== normalizeHwnd(binding.hwnd)
      && Number(foregroundBefore.processId || 0) > 0
      && Number(foregroundAfter.processId || 0) > 0
      && Number(foregroundBefore.processId || 0) !== Number(binding.processId || 0)
      && Number(foregroundAfter.processId || 0) !== Number(binding.processId || 0)
      && (transparentForegroundDesktopUnavailable || (
        validUuid(foregroundBefore.desktopId)
        && validUuid(foregroundAfter.desktopId)
        && String(foregroundBefore.desktopId || '').toLowerCase() === String(desktop.currentBefore || '').toLowerCase()
        && String(foregroundAfter.desktopId || '').toLowerCase() === String(desktop.currentAfter || '').toLowerCase()
      ))),
    foregroundOccluderStable: !isCurrentDesktopPrintWindowMode
      || prepare && prepare.transparentTargetCapture === true
      || (normalizeHwnd(foregroundBefore.hwnd) === normalizeHwnd(foregroundAfter.hwnd)
        && Number(foregroundBefore.processId || 0) === Number(foregroundAfter.processId || 0)),
    desktopStable: transparentForegroundDesktopUnavailable
      ? true
      : transparentDesktopProbeUnavailable
      ? !String(desktop.targetBefore || '')
        && !String(desktop.targetAfter || '')
        && desktop.targetOnCurrentBefore === false
        && desktop.targetOnCurrentAfter === false
        && validUuid(desktop.currentBefore)
        && String(desktop.currentBefore).toLowerCase() === String(binding.desktopId || '').toLowerCase()
        && String(desktop.currentAfter || '').toLowerCase() === String(desktop.currentBefore).toLowerCase()
      : validUuid(desktop.targetBefore)
        && String(desktop.targetBefore).toLowerCase() === String(binding.desktopId || '').toLowerCase()
        && String(desktop.targetAfter || '').toLowerCase() === String(desktop.targetBefore).toLowerCase()
        && validUuid(desktop.currentBefore)
        && String(desktop.currentAfter || '').toLowerCase() === String(desktop.currentBefore).toLowerCase()
        && (isVisibleMode || isCurrentDesktopPrintWindowMode
          ? desktop.targetOnCurrentBefore === true && desktop.targetOnCurrentAfter === true
          : isOffDesktopPrintWindowMode
            && desktop.targetOnCurrentBefore === false
            && desktop.targetOnCurrentAfter === false
            && String(desktop.currentBefore).toLowerCase() !== String(desktop.targetBefore).toLowerCase()),
    requestProvenance: requestProvenance.kind === 'wechat-devtools-win32-request-v1'
      && String(requestProvenance.prepareId || '') === String(prepare && prepare.prepareId || '')
      && String(requestProvenance.nonce || '') === String(prepare && prepare.nonce || '')
      && (!artifactPlan || String(requestProvenance.artifactBindingHash || '') === artifactPlan.bindingHash),
    pngHashes: validSha256(fullFrame.sha256) && validSha256(crop.sha256),
    pixelHashes: validSha256(fullFrame.pixelSha256)
      && validSha256(crop.pixelSha256)
      && validSha256(capture.frameRegionPixelSha256),
    pixelIdentity: capture.cropMatchesFrameRegion === true
      && String(crop.pixelSha256) === String(capture.frameRegionPixelSha256),
    nonBlackFrame: capture.likelyBlackFrame === false,
    fullFrameGeometry: Number(fullFrame.width || 0) === Number(binding.windowRect && binding.windowRect.width || 0)
      && Number(fullFrame.height || 0) === Number(binding.windowRect && binding.windowRect.height || 0),
    cropGeometry: Number(crop.width || 0) === Number(expectedViewport.width || 0)
      && Number(crop.height || 0) === Number(expectedViewport.height || 0),
    candidatePaths: !artifactPlan || (
      sameResolvedPath(fullFrame.path, artifactPlan.candidateFullFramePath)
      && sameResolvedPath(crop.path, artifactPlan.candidateCropPath)
    ),
  };
  return { ok: Object.values(checks).every(Boolean), checks, expectedViewport };
}

function validateCaptureFreshnessProof(prepare = {}, capture = {}, proof = {}) {
  const probeRect = proof.probeRect || {};
  const challengeHash = String(proof.challengeRegionPixelSha256 || '');
  const finalHash = String(proof.finalRegionPixelSha256 || '');
  const noncePrefix = String(prepare.nonce || '').slice(0, 8);
  const checks = {
    kind: proof.kind === 'wechat-devtools-visible-fixture-challenge-v1',
    nonce: validSha256(prepare.nonce) && String(proof.nonce || '') === String(prepare.nonce || ''),
    pageId: !!String(prepare.pageId || '') && String(proof.pageId || '') === String(prepare.pageId || ''),
    selector: /^\.[a-zA-Z0-9_-]/.test(String(proof.selector || '')),
    challengeText: !!noncePrefix && String(proof.challengeText || '').includes(noncePrefix),
    challengeDom: validSha256(proof.challengeDomHash),
    exactRestore: String(proof.restoredDomHash || '') === String(prepare.domHash || '')
      && String(proof.restoredPageDataHash || '') === String(prepare.pageDataHash || ''),
    probeRect: validRect(probeRect),
    regionPixels: validSha256(challengeHash) && validSha256(finalHash) && challengeHash !== finalHash,
    finalCrop: validSha256(capture && capture.crop && capture.crop.pixelSha256)
      && String(proof.finalCropPixelSha256 || '') === String(capture && capture.crop && capture.crop.pixelSha256 || ''),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function validateModalRoiFreshnessProof(prepare = {}, proof = {}) {
  const sheet = proof.sheet || {};
  const cta = proof.cta || {};
  const game = proof.gameSelection || {};
  const isGameCase = String(prepare.name || '') === 'waterV2Member24Game';
  const checks = {
    kind: proof.kind === 'wechat-devtools-modal-roi-v1',
    nonce: validSha256(prepare.nonce) && String(proof.nonce || '') === String(prepare.nonce || ''),
    pageId: !!String(prepare.pageId || '') && String(proof.pageId || '') === String(prepare.pageId || ''),
    dom: validSha256(prepare.domHash) && String(proof.domHash || '') === String(prepare.domHash || ''),
    sheetRect: validRect(sheet.rect),
    sheetSurface: Number(sheet.surfaceRatio || 0) >= 0.55,
    roundedOverlay: Number(sheet.topLeftOverlayDarkRatio || 0) >= 0.15
      && Number(sheet.topRightOverlayDarkRatio || 0) >= 0.15,
    ctaRect: validRect(cta.rect),
    ctaGreen: Number(cta.deepGreenRatio || 0) >= 0.35,
    gameSelection: !isGameCase || (
      Number(game.winnerDomCount || 0) === 12
      && Number(game.loserDomCount || 0) === 12
      && String(game.validationText || '').includes('双方人数相同 · 每人 1 水')
      && Number(game.loserSoftRatio || 0) >= 0.1
    ),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function validateBackgroundCleanupEvidence(prepare = {}, cleanup = {}) {
  const binding = prepare.windowBinding || {};
  const begin = cleanup.begin || {};
  const attach = cleanup.attach || {};
  const rebind = cleanup.rebind || {};
  const materialize = cleanup.materialize || {};
  const wake = cleanup.wake || {};
  const restore = cleanup.restore || {};
  const end = cleanup.end || {};
  const attachPlacement = attach.internalPlacementProof || {};
  const rebindPlacement = rebind.internalPlacementProof || {};
  const rebindPublicPlacement = rebind.publicPlacementProof || {};
  const rebindReceipt = rebind.rebindReceipt || {};
  const rebindReceiptPlacement = rebindReceipt.internalPlacementProof || {};
  const rebindForegroundAfterMove = rebind.foregroundAfterMove || {};
  const rebindReceiptForegroundAfterMove = rebindReceipt.foregroundAfterMove || {};
  const materializePlacement = materialize.internalPlacementProof || {};
  const materializePublicPlacement = materialize.publicPlacementProof || {};
  const materializeReceipt = materialize.materializeReceipt || {};
  const materializeReceiptPlacement = materializeReceipt.internalPlacementProof || {};
  const materializeForeground = materialize.foregroundAfterMaterialize || {};
  const materializeReceiptForeground = materializeReceipt.foregroundAfterMaterialize || {};
  const wakePlacement = wake.bridgeReceipt || {};
  const restorePlacement = restore.internalPlacementProof || {};
  const beganAt = Date.parse(begin.completedAt || '');
  const attachedAt = Date.parse(attach.completedAt || '');
  const reboundAt = Date.parse(rebind.completedAt || '');
  const materializedAt = Date.parse(materialize.completedAt || '');
  const wokeAt = Date.parse(wake.completedAt || '');
  const capturedAt = Date.parse(cleanup.capturedAt || '');
  const restoredAt = Date.parse(restore.completedAt || '');
  const endedAt = Date.parse(end.completedAt || '');
  const originalDesktopId = String(cleanup.originalDesktopId || '').toLowerCase();
  const currentDesktopId = String(binding.desktopId || '').toLowerCase();
  const checks = {
    kind: cleanup.kind === 'weapp-background-capture-cleanup-v1',
    target: normalizeHwnd(cleanup.targetHwnd) === normalizeHwnd(binding.hwnd)
      && Number(cleanup.targetProcessId || 0) === Number(binding.processId || 0),
    order: Number.isFinite(beganAt) && Number.isFinite(attachedAt) && Number.isFinite(reboundAt)
      && Number.isFinite(materializedAt)
      && Number.isFinite(wokeAt)
      && Number.isFinite(capturedAt)
      && Number.isFinite(restoredAt) && Number.isFinite(endedAt)
      && beganAt <= attachedAt && attachedAt <= reboundAt && reboundAt <= materializedAt
      && materializedAt <= wokeAt && wokeAt <= capturedAt
      && capturedAt <= restoredAt && restoredAt <= endedAt,
    begin: begin.ok === true && begin.action === 'BeginPassive'
      && begin.targetNeverForeground === true && begin.transparent === true && begin.clickThrough === true
      && String(begin.originalDesktopId || '').toLowerCase() === originalDesktopId,
    attach: attach.ok === true && attach.action === 'Attach'
      && attach.targetNeverForeground === true && attach.geometryStable === true
      && String(attach.attachedDesktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase()
      && attachPlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(attachPlacement.currentDesktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase()
      && String(attachPlacement.targetDesktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase(),
    rebind: rebind.ok === true && rebind.action === 'RebindCurrent'
      && rebind.targetNeverForeground === true && rebind.geometryStable === true
      && rebind.transparent === true && rebind.clickThrough === true && rebind.alphaZero === true
      && rebind.sameCurrent === true && rebind.movePerformed === true && Number(rebind.moveCount) === 1
      && rebind.walRetained === true
      && Boolean(normalizeHwnd(rebindForegroundAfterMove.hwnd))
      && normalizeHwnd(rebindForegroundAfterMove.hwnd) !== normalizeHwnd(binding.hwnd)
      && Number(rebindForegroundAfterMove.processId || 0) > 0
      && Number(rebindForegroundAfterMove.processId || 0) !== Number(binding.processId || 0)
      && String(rebind.attachedDesktopId || '').toLowerCase() === currentDesktopId
      && rebindPlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(rebindPlacement.currentDesktopId || '').toLowerCase() === currentDesktopId
      && String(rebindPlacement.targetDesktopId || '').toLowerCase() === currentDesktopId
      && (rebind.publicPlacementAvailable === false || (
        rebind.publicPlacementAvailable === true
        && String(rebindPublicPlacement.desktopId || '').toLowerCase() === currentDesktopId
        && rebindPublicPlacement.onCurrentDesktop === true
      ))
      && rebindReceipt.kind === 'weapp-same-current-rebind-v1'
      && Number(rebindReceipt.moveCount) === 1 && rebindReceipt.sameCurrent === true
      && String(rebindReceipt.attachedDesktopId || '').toLowerCase() === currentDesktopId
      && normalizeHwnd(rebindReceiptForegroundAfterMove.hwnd) === normalizeHwnd(rebindForegroundAfterMove.hwnd)
      && Number(rebindReceiptForegroundAfterMove.processId || 0) === Number(rebindForegroundAfterMove.processId || 0)
      && rebindReceiptPlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(rebindReceiptPlacement.currentDesktopId || '').toLowerCase() === currentDesktopId
      && String(rebindReceiptPlacement.targetDesktopId || '').toLowerCase() === currentDesktopId,
    materialize: materialize.ok === true && materialize.action === 'MaterializeCurrent'
      && materialize.targetNeverForeground === true && materialize.geometryStable === true
      && materialize.transparent === true && materialize.clickThrough === true && materialize.alphaZero === true
      && materialize.cloakStateZero === true
      && materialize.originalVisible === true && materialize.liveVisible === true && materialize.minimized === false
      && Number(materialize.materializeCount) === 1 && materialize.showWindowFlag === true
      && materialize.walRetained === true
      && Boolean(normalizeHwnd(materializeForeground.hwnd))
      && normalizeHwnd(materializeForeground.hwnd) !== normalizeHwnd(binding.hwnd)
      && Number(materializeForeground.processId || 0) > 0
      && Number(materializeForeground.processId || 0) !== Number(binding.processId || 0)
      && String(materialize.attachedDesktopId || '').toLowerCase() === currentDesktopId
      && materializePlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(materializePlacement.currentDesktopId || '').toLowerCase() === currentDesktopId
      && String(materializePlacement.targetDesktopId || '').toLowerCase() === currentDesktopId
      && (materialize.publicPlacementAvailable === false || (
        materialize.publicPlacementAvailable === true
        && String(materializePublicPlacement.desktopId || '').toLowerCase() === currentDesktopId
        && materializePublicPlacement.onCurrentDesktop === true
      ))
      && materializeReceipt.kind === 'weapp-current-materialize-v1'
      && Number(materializeReceipt.materializeCount) === 1 && materializeReceipt.cloakStateZero === true
      && materializeReceipt.showWindowFlag === true
      && materializeReceipt.originalVisible === true && materializeReceipt.liveVisible === true
      && materializeReceipt.targetNeverForeground === true && materializeReceipt.geometryStable === true
      && materializeReceipt.transparent === true
      && materializeReceipt.clickThrough === true && materializeReceipt.alphaZero === true
      && String(materializeReceipt.attachedDesktopId || '').toLowerCase() === currentDesktopId
      && normalizeHwnd(materializeReceiptForeground.hwnd) === normalizeHwnd(materializeForeground.hwnd)
      && Number(materializeReceiptForeground.processId || 0) === Number(materializeForeground.processId || 0)
      && materializeReceiptPlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(materializeReceiptPlacement.currentDesktopId || '').toLowerCase() === currentDesktopId
      && String(materializeReceiptPlacement.targetDesktopId || '').toLowerCase() === currentDesktopId,
    wake: wake.ok === true && wake.action === 'WakeCurrent'
      && wake.targetNeverForeground === true && wake.geometryStable === true
      && wake.transparent === true && wake.clickThrough === true && wake.painted === true
      && wake.currentDesktop === true
      && wakePlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(wakePlacement.currentDesktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase()
      && String(wakePlacement.targetDesktopId || '').toLowerCase() === String(binding.desktopId || '').toLowerCase(),
    restore: restore.ok === true && restore.action === 'Restore'
      && restore.targetNeverForeground === true && restore.geometryStable === true
      && restore.walRetained === true
      && String(restore.originalDesktopId || '').toLowerCase() === originalDesktopId
      && validUuid(String(restore.currentDesktopId || '').toLowerCase())
      && String(restore.currentDesktopId || '').toLowerCase() === currentDesktopId
      && String(restore.currentDesktopId || '').toLowerCase() !== originalDesktopId
      && restorePlacement.kind === 'weapp-internal-desktop-placement-v1'
      && String(restorePlacement.currentDesktopId || '').toLowerCase() === String(restore.currentDesktopId || '').toLowerCase()
      && String(restorePlacement.targetDesktopId || '').toLowerCase() === originalDesktopId,
    end: end.ok === true && end.action === 'End'
      && end.targetNeverForeground === true && end.geometryStable === true && end.styleRestored === true
      && end.originalDesktopRestored === true
      && end.publicPlacementAvailable === true
      && String(end.publicPlacement && end.publicPlacement.desktopId || '').toLowerCase() === originalDesktopId
      && end.publicPlacement && end.publicPlacement.onCurrentDesktop === false
      && end.bridgeStateDeleted === true && end.stateDeleted === true,
    desktop: validUuid(originalDesktopId),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function validateReceiptEvidence(evidence = {}) {
  const expectedWidth = Number(evidence.expectedWindowWidth || 0);
  const systemInfo = evidence.systemInfo || {};
  const png = evidence.png || {};
  const git = evidence.git || {};
  const sdkVersion = String(evidence.toolInfo && evidence.toolInfo.SDKVersion || '');
  const pixelRatio = Number(systemInfo.pixelRatio || 0);
  const windowWidth = Number(systemInfo.windowWidth || 0);
  const windowHeight = Number(systemInfo.windowHeight || 0);
  const pngWidth = Number(png.width || 0);
  const pngHeight = Number(png.height || 0);
  const pngScaleX = windowWidth > 0 ? pngWidth / windowWidth : 0;
  const pngScaleY = windowHeight > 0 ? pngHeight / windowHeight : 0;
  const pngScaleTolerance = windowWidth > 0 && windowHeight > 0
    ? Math.max(1 / windowWidth, 1 / windowHeight)
    : 0;
  const pngScaleIsReasonable = Number.isFinite(pngScaleX)
    && Number.isFinite(pngScaleY)
    && pngScaleX >= 0.5
    && pngScaleX <= 4
    && pngScaleY >= 0.5
    && pngScaleY <= 4;
  const pngGeometryIsProportional = pngScaleIsReasonable
    && Math.abs(pngScaleX - pngScaleY) <= pngScaleTolerance;
  const dirtyFiles = Array.isArray(git.files) ? git.files : [];
  const dirtyFilesValid = (!git.dirty || dirtyFiles.length > 0) && dirtyFiles.every((item) => (
    !!String(item && item.path || '')
    && typeof item.exists === 'boolean'
    && (item.exists
      ? /^[a-f0-9]{64}$/i.test(String(item.sha256 || ''))
      : String(item.sha256 || '') === '')
  ));
  const checks = {
    expectedWidth: expectedWidth > 0 && Number(systemInfo.windowWidth || 0) === expectedWidth,
    sdkVersion: !!sdkVersion && (!evidence.expectedSDKVersion || sdkVersion === evidence.expectedSDKVersion),
    route: !!normalizeRoute(evidence.expectedRoute)
      && normalizeRoute(evidence.currentPageInfo) === normalizeRoute(evidence.expectedRoute),
    png: !!png.valid
      && png.byteLength > 20 * 1024
      && /^[a-f0-9]{64}$/i.test(String(png.sha256 || ''))
      && pngWidth > 0
      && pngHeight > 0
      && pngGeometryIsProportional,
    pixelRatio: pixelRatio > 0,
    fontSizeSetting: Number(systemInfo.fontSizeSetting || 0) > 0,
    git: git.ok === true && /^[a-f0-9]{40}$/i.test(String(git.head || ''))
      && typeof git.dirty === 'boolean' && Array.isArray(git.status) && dirtyFilesValid,
    selectorCoverage: !!(evidence.selectorCoverage && evidence.selectorCoverage.ok),
    horizontalOverflow: !!(evidence.horizontalOverflow && evidence.horizontalOverflow.ok),
    projectProvenance: !!(evidence.projectProvenance && evidence.projectProvenance.ok),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    pngScaleX,
    pngScaleY,
    pngScaleTolerance,
  };
}

async function isolateFixtureRuntime(miniProgram, phase) {
  if (!miniProgram || typeof miniProgram.evaluate !== 'function') {
    throw new Error('Fixture injection requires miniProgram.evaluate for stale-request isolation.');
  }
  const result = await miniProgram.evaluate(function isolateWaterFixture(phaseValue) {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    if (!current) return { ok: false, phase: phaseValue, reason: 'current page unavailable' };
    const bump = (key) => {
      current[key] = Number(current[key] || 0) + 1000000;
      return current[key];
    };
    const loadRequestSeq = bump('_loadRequestSeq');
    current._latestSuccessfulLoadSeq = loadRequestSeq;
    const feedRequestSeq = bump('_feedRequestSeq');
    const detailRequestSeq = bump('_detailRequestSeq');
    bump('_historyRequestSeq');
    bump('_historyRoundRequestSeq');
    bump('_correctionRequestSeq');
    current._isVisible = false;
    current._pollInFlight = false;
    current._pollFailureCount = 0;
    current._burstRemaining = 0;
    current._mutationIntents = {};
    if (typeof current.clearRefreshTimer === 'function') current.clearRefreshTimer();
    if (typeof current.clearReceiptTimer === 'function') current.clearReceiptTimer();
    if (typeof current.clearHighlightTimer === 'function') current.clearHighlightTimer();
    if (typeof current.closeSheets === 'function') current.closeSheets();
    if (typeof current.closeHistorySheet === 'function') current.closeHistorySheet();
    return {
      ok: true,
      phase: phaseValue,
      loadRequestSeq,
      feedRequestSeq,
      detailRequestSeq,
      pollingFrozen: current._isVisible === false && !current._refreshTimer,
    };
  }, phase);
  if (!result || result.ok !== true || result.pollingFrozen !== true) {
    throw new Error(`Water fixture isolation failed during ${phase}: ${JSON.stringify(result || {})}`);
  }
  return result;
}

async function applyFixture(page, fixture, miniProgram) {
  if (!fixture || typeof fixture !== 'object') return;
  const isolation = await isolateFixtureRuntime(miniProgram, 'before');
  if (fixture.roomData) {
    await page.callMethod('applyRoomData', fixture.roomData);
  }
  if (fixture.pageData) {
    await page.setData(fixture.pageData);
  }
  for (const method of Array.isArray(fixture.methods) ? fixture.methods : []) {
    await page.callMethod(method.name, ...(Array.isArray(method.args) ? method.args : []));
  }
  if (fixture.postData) {
    await page.setData(fixture.postData);
  }
  return isolation;
}

async function cleanupFixture(page, miniProgram) {
  return isolateFixtureRuntime(miniProgram, 'cleanup');
}

function selectToolInfo(source) {
  const info = source && typeof source === 'object' ? source : {};
  return {
    SDKVersion: info.SDKVersion || '',
    platform: info.platform || '',
    compileType: info.compileType || '',
    projectPath: info.projectPath || info.projectpath || info.projectRoot || '',
  };
}

function parseScreenRect(value) {
  if (value && typeof value === 'object') {
    const rect = {
      x: Number(value.x),
      y: Number(value.y),
      width: Number(value.width),
      height: Number(value.height),
    };
    if (validRect(rect)) return rect;
  }
  const source = String(value || '').trim();
  if (!source) return null;
  try {
    return parseScreenRect(JSON.parse(source));
  } catch (err) {
    const values = source.split(',').map((item) => Number(item.trim()));
    if (values.length === 4) {
      return parseScreenRect({ x: values[0], y: values[1], width: values[2], height: values[3] });
    }
  }
  throw new Error('WEAPP_WIN32_SCREEN_RECT must be JSON or x,y,width,height physical pixels relative to the bound full frame.');
}

function readCalibrationFile(filePath, systemInfo) {
  const requested = String(filePath || '').trim();
  if (!requested) return null;
  const resolved = path.resolve(requested);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const records = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.calibrations) ? parsed.calibrations : [parsed]);
  const matching = records.filter((item) => (
    String(item && item.model || '') === String(systemInfo.model || '')
    && Number(item && item.logicalScreen && item.logicalScreen.width || 0) === Number(systemInfo.screenWidth || 0)
    && Number(item && item.logicalScreen && item.logicalScreen.height || 0) === Number(systemInfo.screenHeight || 0)
    && Number(item && item.logicalWindow && item.logicalWindow.width || 0) === Number(systemInfo.windowWidth || 0)
    && Number(item && item.logicalWindow && item.logicalWindow.height || 0) === Number(systemInfo.windowHeight || 0)
  ));
  if (matching.length !== 1) {
    throw new Error(`Calibration file must contain exactly one matching device record; found ${matching.length}: ${resolved}`);
  }
  return { ...matching[0], source: 'calibration-file', calibrationPath: resolved };
}

function createScreenCalibration(binding, systemInfo, options = {}) {
  const fromFile = options.calibration || readCalibrationFile(
    options.calibrationFile || process.env.WEAPP_WIN32_CALIBRATION_FILE,
    systemInfo
  );
  if (fromFile) return fromFile;
  const screenRect = parseScreenRect(options.screenRect || process.env.WEAPP_WIN32_SCREEN_RECT);
  if (!screenRect) {
    throw new Error('Win32 capture requires per-device WEAPP_WIN32_SCREEN_RECT calibration; simulator is a composed surface with no child HWND rect.');
  }
  return {
    source: 'explicit-screen-rect',
    processId: Number(binding.processId || 0),
    hwnd: normalizeHwnd(binding.hwnd),
    dpi: Number(binding.dpi || 0),
    model: String(systemInfo.model || ''),
    logicalScreen: {
      width: Number(systemInfo.screenWidth || 0),
      height: Number(systemInfo.screenHeight || 0),
    },
    logicalWindow: {
      width: Number(systemInfo.windowWidth || 0),
      height: Number(systemInfo.windowHeight || 0),
    },
    windowRect: binding.windowRect,
    screenRect,
  };
}

function resolveDevToolsBindingInput(connection, options = {}) {
  const provenance = connection && connection.provenanceLogEvidence || {};
  const processId = Number(
    options.processId
      || process.env.WEAPP_DEVTOOLS_PID
      || provenance.devToolsProcessId
      || provenance.mainProcessId
      || provenance.windowProcessId
      || 0
  );
  const hwnd = normalizeHwnd(
    options.hwnd
      || process.env.WEAPP_DEVTOOLS_HWND
      || provenance.devToolsHwnd
      || provenance.mainWindowHwnd
      || ''
  );
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new Error('Win32 capture requires exact WEAPP_DEVTOOLS_PID or matching provenance devToolsProcessId.');
  }
  return { processId, hwnd };
}

function invokeWin32Helper(mode, request, options = {}) {
  if (process.platform !== 'win32' && options.allowNonWindows !== true) {
    throw new Error('Win32 visible capture is available only on Windows.');
  }
  const helperPath = path.resolve(options.helperPath || win32HelperPath);
  if (!fs.existsSync(helperPath)) throw new Error(`Win32 capture helper is missing: ${helperPath}`);
  const requestPath = path.resolve(options.requestPath || path.join(
    os.tmpdir(),
    `weapp-win32-${process.pid}-${crypto.randomBytes(8).toString('hex')}.json`
  ));
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  const shell = options.powershellPath || 'powershell.exe';
  const result = (options.spawnSync || spawnSync)(shell, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Mode',
    mode,
    '-RequestPath',
    requestPath,
  ], {
    cwd: path.dirname(helperPath),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Win32 ${mode} helper failed (${result.status}): ${String(result.stderr || result.stdout || '').trim()}`);
  }
  const resultPath = request && request.resultPath ? path.resolve(request.resultPath) : '';
  if (resultPath && fs.existsSync(resultPath)) {
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  }
  const stdout = String(result.stdout || '').trim();
  if (!stdout) throw new Error(`Win32 ${mode} helper returned no JSON evidence.`);
  return JSON.parse(stdout);
}

function inspectDevToolsWindow(connection, options = {}) {
  if (options.windowBinding) return options.windowBinding;
  const input = resolveDevToolsBindingInput(connection, options);
  const captureMode = normalizeWin32CaptureMode(options.captureMode || win32CaptureMode);
  const resultPath = path.resolve(options.inspectResultPath || path.join(
    outDir,
    `.win32-inspect-${process.pid}-${crypto.randomBytes(6).toString('hex')}.json`
  ));
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  return invokeWin32Helper('Inspect', {
    ...input,
    captureMode,
    expectedTitleIncludes: '微信开发者工具',
    resultPath,
  }, options);
}

async function setWin32CaptureMarker(miniProgram, marker) {
  return miniProgram.evaluate(function setCodexWin32CaptureMarker(value) {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    if (!current) return { ok: false, reason: 'current page unavailable' };
    current.__codexWin32CaptureMarker = {
      nonce: value.nonce,
      pageId: value.pageId,
    };
    return {
      ok: true,
      nonce: current.__codexWin32CaptureMarker.nonce,
      pageId: current.__codexWin32CaptureMarker.pageId,
      route: current.route || current.__route__ || '',
    };
  }, marker);
}

async function readWin32CaptureMarker(miniProgram) {
  return miniProgram.evaluate(function readCodexWin32CaptureMarker() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    if (!current) return { ok: false, reason: 'current page unavailable' };
    const marker = current.__codexWin32CaptureMarker || {};
    return {
      ok: !!marker.nonce && !!marker.pageId,
      nonce: marker.nonce || '',
      pageId: marker.pageId || '',
      route: current.route || current.__route__ || '',
    };
  });
}

async function readPageData(page) {
  if (!page || typeof page.data !== 'function') {
    throw new Error('Two-stage screenshot requires page.data() state evidence.');
  }
  const data = await page.data();
  if (!data || typeof data !== 'object') throw new Error('page.data() returned no state object.');
  return data;
}

async function routeCasePage(miniProgram, routeMethod, targetPath, options = {}) {
  const routeTimeoutMs = Number(options.routeTimeoutMs || reLaunchTimeoutMs);
  try {
    return await timeout(
      miniProgram[routeMethod](targetPath),
      routeTimeoutMs,
      `${normalizeRoute(targetPath)}:${routeMethod}`
    );
  } catch (routeError) {
    if (!/timeout|timed out/i.test(String(routeError && routeError.message || routeError))) throw routeError;
    const recoveryTimeoutMs = Number(options.recoveryTimeoutMs || 10000);
    const recoveryPollMs = Number(options.recoveryPollMs || 250);
    const deadline = Date.now() + recoveryTimeoutMs;
    let lastError = routeError;
    while (Date.now() < deadline) {
      try {
        const remainingMs = Math.max(1, deadline - Date.now());
        const page = await timeout(
          miniProgram.currentPage(),
          Math.min(5000, remainingMs),
          `${normalizeRoute(targetPath)}:${routeMethod}:currentPage`
        );
        if (page && normalizeRoute(page.path) === normalizeRoute(targetPath)) return page;
        lastError = new Error(
          `Route recovery found ${normalizeRoute(page && page.path)} instead of ${normalizeRoute(targetPath)}.`
        );
      } catch (currentPageError) {
        lastError = currentPageError;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(recoveryPollMs, remainingMs)));
      }
    }
    const error = new Error(
      `Route acknowledgement timed out and recovery failed for ${normalizeRoute(targetPath)}: ${String(lastError && lastError.message || lastError)}`
    );
    error.cause = routeError;
    throw error;
  }
}

async function prepareCase(name, miniProgram, connection, options = {}) {
  const item = cases[name];
  if (!item) throw new Error(`Unknown case: ${name}`);
  const targetDir = path.resolve(options.outDir || outDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const preparePath = path.resolve(options.preparePath || path.join(targetDir, `${name}.prepare.json`));
  const output = path.resolve(options.output || path.join(targetDir, `${name}.png`));
  const fullFramePath = path.resolve(options.fullFramePath || path.join(targetDir, `${name}.devtools-full-frame.png`));
  const receiptPath = path.resolve(options.receiptPath || path.join(targetDir, `${name}.receipt.json`));
  const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
  const captureMode = normalizeWin32CaptureMode(options.captureMode || win32CaptureMode);
  const page = await routeCasePage(miniProgram, routeMethod, item.path, options);
  await page.waitFor(1200);
  let fixtureApplied = false;
  try {
    let fixtureIsolation = null;
    if (item.fixture) {
      fixtureIsolation = await applyFixture(page, item.fixture, miniProgram);
      fixtureApplied = true;
    } else {
      await page.setData(item.data);
    }
    await page.waitFor(1800);
    const nonce = String(options.nonce || crypto.randomBytes(32).toString('hex'));
    const pageId = String(options.pageId || page.id || `capture-${crypto.randomUUID()}`);
    const marker = await setWin32CaptureMarker(miniProgram, { nonce, pageId });
    if (!marker || marker.ok !== true || marker.nonce !== nonce || marker.pageId !== pageId) {
      throw new Error(`Failed to bind Win32 prepare marker: ${JSON.stringify(marker || {})}`);
    }
    const rawToolInfo = await timeout(miniProgram.send('Tool.getInfo'), 5000, `${name}:Tool.getInfo`);
    const currentPageInfo = await timeout(miniProgram.send('App.getCurrentPage'), 5000, `${name}:App.getCurrentPage`);
    const rawSystemInfo = await timeout(miniProgram.systemInfo(), 5000, `${name}:systemInfo`);
    const pageSize = await timeout(page.size(), 5000, `${name}:page.size`);
    const pageData = await timeout(readPageData(page), 5000, `${name}:page.data`);
    const toolInfo = selectToolInfo(rawToolInfo);
    const systemInfo = selectSystemInfo(rawSystemInfo);
    const dom = await collectDom(page, item.selectors);
    const selectorCoverage = validateSelectorCoverage(dom, item.selectors);
    const horizontalAlignment = item.horizontalAlignment
      ? validateHorizontalAlignment(dom, item.horizontalAlignment)
      : null;
    const horizontalOverflow = validateHorizontalOverflow(pageSize, systemInfo);
    const git = (options.currentGitManifest || currentGitManifest)();
    const projectProvenance = validateProjectProvenance({
      connection,
      toolInfo,
      logEvidence: connection.provenanceLogEvidence,
    });
    const caseExpectedWindowWidth = Number(item.expectedWindowWidth || expectedWindowWidth || 0);
    const caseExpectedSDKVersion = String(expectedSDKVersion || toolInfo.SDKVersion || '');
    const windowBinding = await Promise.resolve(inspectDevToolsWindow(connection, { ...options, captureMode }));
    windowBinding.hwnd = normalizeHwnd(windowBinding.hwnd);
    const screenCalibration = createScreenCalibration(windowBinding, systemInfo, options);
    const preparedAt = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
    const expiresAt = new Date(Date.parse(preparedAt) + win32PrepareTtlMs).toISOString();
    const record = {
      kind: WIN32_PREPARE_KIND,
      captureMode,
      transparentTargetCapture: captureMode === 'printwindow-current' && transparentTargetCapture,
      name,
      preparedAt,
      expiresAt,
      nonce,
      pageId,
      preparePath,
      output,
      fullFramePath,
      receiptPath,
      endpoint: connection.endpoint,
      connectionMode: connection.mode,
      sourceProjectPath: connection.sourceProjectPath,
      provenanceLogEvidence: connection.provenanceLogEvidence,
      toolInfo,
      currentPageInfo,
      expectedRoute: normalizeRoute(item.path),
      expectedWindowWidth: caseExpectedWindowWidth,
      expectedSDKVersion: caseExpectedSDKVersion,
      systemInfo,
      fixtureHash: hashCanonical(item.fixture || item.data || {}),
      pageDataHash: hashCanonical(pageData),
      domHash: hashCanonical(dom),
      systemInfoHash: hashCanonical(systemInfo),
      gitHash: hashCanonical(git),
      git,
      pageSize,
      dom,
      selectorCoverage,
      horizontalAlignment,
      horizontalOverflow,
      projectProvenance,
      fixtureIsolation,
      marker,
      windowBinding,
      screenCalibration,
      manualActions: item.fixture ? manualActions : [],
    };
    record.prepareId = hashCanonical({
      name: record.name,
      preparedAt: record.preparedAt,
      nonce: record.nonce,
      pageId: record.pageId,
      endpoint: record.endpoint,
      sourceProjectPath: record.sourceProjectPath,
      fixtureHash: record.fixtureHash,
      pageDataHash: record.pageDataHash,
      domHash: record.domHash,
      systemInfoHash: record.systemInfoHash,
      gitHash: record.gitHash,
      captureMode: record.captureMode,
      transparentTargetCapture: record.transparentTargetCapture,
      windowBinding: record.windowBinding,
      screenCalibration: record.screenCalibration,
    });
    const validation = validatePrepareRecord(record);
    const preflightOk = validation.ok
      && normalizeRoute(currentPageInfo) === normalizeRoute(item.path)
      && selectorCoverage.ok
      && horizontalOverflow.ok
      && projectProvenance.ok
      && (!horizontalAlignment || horizontalAlignment.ok);
    record.prepareValidation = { ...validation, ok: preflightOk };
    if (!preflightOk) {
      throw new Error(`Win32 prepare evidence failed: ${JSON.stringify(record.prepareValidation)}`);
    }
    fs.writeFileSync(preparePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  } catch (err) {
    if (fixtureApplied) {
      try {
        await cleanupFixture(page, miniProgram);
      } catch (cleanupErr) {
        err.message = `${err.message}; prepare cleanup failed: ${String(cleanupErr && cleanupErr.message || cleanupErr)}`;
      }
    }
    throw err;
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

function buildWin32ArtifactPlan(prepare, options = {}) {
  const finalCropPath = path.resolve(prepare.output);
  const finalFullFramePath = path.resolve(prepare.fullFramePath);
  const finalReceiptPath = path.resolve(prepare.receiptPath);
  const binding = {
    name: String(prepare.name || ''),
    prepareId: String(prepare.prepareId || ''),
    nonce: String(prepare.nonce || ''),
    captureMode: String(prepare.captureMode || ''),
    transparentTargetCapture: prepare.transparentTargetCapture === true,
  };
  const bindingHash = hashCanonical(binding);
  const safeName = binding.name.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'capture';
  const candidateRoot = path.resolve(options.candidateRoot || path.join(
    path.dirname(finalCropPath),
    'diagnostics',
    'win32-candidates'
  ));
  const candidateDir = path.resolve(candidateRoot, `${safeName}-${bindingHash.slice(0, 32)}`);
  return {
    binding,
    bindingHash,
    candidateDir,
    candidateCropPath: path.join(candidateDir, 'viewport.png'),
    candidateFullFramePath: path.join(candidateDir, 'devtools-full-frame.png'),
    candidateReceiptPath: path.join(candidateDir, 'receipt.json'),
    candidateCaptureResultPath: path.join(candidateDir, 'win32-capture.json'),
    candidateRequestPath: path.join(candidateDir, 'win32-request.json'),
    finalCropPath,
    finalFullFramePath,
    finalReceiptPath,
  };
}

function publishFilesAtomically(entries, transactionId) {
  const normalized = entries.map((entry, index) => {
    const source = path.resolve(entry.source);
    const target = path.resolve(entry.target);
    if (source === target) throw new Error('Candidate and final artifact paths must differ.');
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Candidate artifact is missing: ${source}`);
    }
    const targetDir = path.dirname(target);
    fs.mkdirSync(targetDir, { recursive: true });
    const suffix = `${transactionId}-${index}`;
    return {
      source,
      target,
      sourceSha256: sha256File(source),
      stage: path.join(targetDir, `.${path.basename(target)}.${suffix}.publish.tmp`),
      backup: path.join(targetDir, `.${path.basename(target)}.${suffix}.rollback.tmp`),
      targetExisted: fs.existsSync(target),
      backupCreated: false,
      published: false,
    };
  });

  try {
    normalized.forEach((entry) => {
      safeUnlink(entry.stage);
      safeUnlink(entry.backup);
      fs.copyFileSync(entry.source, entry.stage, fs.constants.COPYFILE_EXCL);
      if (sha256File(entry.stage) !== entry.sourceSha256) {
        throw new Error(`Staged artifact hash differs from candidate: ${entry.source}`);
      }
    });

    normalized.forEach((entry) => {
      if (entry.targetExisted) {
        fs.renameSync(entry.target, entry.backup);
        entry.backupCreated = true;
      }
      fs.renameSync(entry.stage, entry.target);
      entry.published = true;
    });

    normalized.forEach((entry) => {
      if (sha256File(entry.target) !== entry.sourceSha256) {
        throw new Error(`Published artifact hash differs from candidate: ${entry.target}`);
      }
    });
    normalized.forEach((entry) => {
      try { safeUnlink(entry.backup); } catch (err) { /* Published finals are authoritative; retain undeleted rollback files. */ }
    });
    return normalized.map((entry) => ({
      candidatePath: entry.source,
      finalPath: entry.target,
      sha256: entry.sourceSha256,
      replacedExisting: entry.targetExisted,
    }));
  } catch (err) {
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const entry = normalized[index];
      let restored = !entry.backupCreated;
      try {
        if (entry.published) safeUnlink(entry.target);
        if (entry.backupCreated && fs.existsSync(entry.backup)) {
          fs.renameSync(entry.backup, entry.target);
        }
        restored = true;
      } catch (rollbackErr) {
        err.message = `${err.message}; rollback failed for ${entry.target}: ${String(rollbackErr && rollbackErr.message || rollbackErr)}`;
      }
      try { safeUnlink(entry.stage); } catch (cleanupErr) { /* Best effort after rollback. */ }
      if (restored) {
        try { safeUnlink(entry.backup); } catch (cleanupErr) { /* Best effort after successful rollback. */ }
      }
    }
    throw err;
  } finally {
    normalized.forEach((entry) => {
      try { safeUnlink(entry.stage); } catch (err) { /* Best effort temp cleanup. */ }
    });
  }
}

function publishWin32CandidateArtifacts(plan, options = {}) {
  const eligible = options.eligible === true;
  const base = {
    eligible,
    attempted: false,
    published: false,
    reason: String(options.reason || ''),
    binding: plan.binding,
    bindingHash: plan.bindingHash,
    candidateDisposition: 'retained-for-diagnostics',
    artifacts: [],
  };
  if (!eligible) return base;
  const transactionId = String(options.transactionId || `${plan.bindingHash.slice(0, 16)}-${crypto.randomBytes(6).toString('hex')}`);
  try {
    const artifacts = publishFilesAtomically([
      { source: plan.candidateFullFramePath, target: plan.finalFullFramePath },
      { source: plan.candidateCropPath, target: plan.finalCropPath },
    ], transactionId);
    return {
      ...base,
      attempted: true,
      published: true,
      transactionId,
      artifacts,
    };
  } catch (err) {
    return {
      ...base,
      attempted: true,
      transactionId,
      reason: String(err && err.message || err),
    };
  }
}

function writeJsonAtomically(filePath, value) {
  const target = path.resolve(filePath);
  const targetDir = path.dirname(target);
  fs.mkdirSync(targetDir, { recursive: true });
  const transactionId = crypto.randomBytes(8).toString('hex');
  const candidate = path.join(targetDir, `.${path.basename(target)}.${transactionId}.write.tmp`);
  fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    publishFilesAtomically([{ source: candidate, target }], transactionId);
  } finally {
    safeUnlink(candidate);
  }
}

function buildWin32CaptureRequest(prepare, options = {}) {
  const artifactPlan = options.artifactPlan || buildWin32ArtifactPlan(prepare, options);
  const pixelProbes = buildModalRoiPixelProbes(prepare);
  return {
    kind: 'wechat-devtools-win32-request-v1',
    captureMode: normalizeWin32CaptureMode(prepare.captureMode),
    transparentTargetCapture: prepare.transparentTargetCapture === true,
    prepareId: String(prepare.prepareId || ''),
    nonce: String(prepare.nonce || ''),
    artifactBindingHash: artifactPlan.bindingHash,
    processId: Number(prepare.windowBinding.processId),
    hwnd: normalizeHwnd(prepare.windowBinding.hwnd),
    expectedTitle: String(prepare.windowBinding.title || ''),
    expectedDesktopId: String(prepare.windowBinding.desktopId || ''),
    expectedCloaked: prepare.windowBinding.cloaked === true,
    expectedCloakState: Number(prepare.windowBinding.cloakState || 0),
    expectedWindowRect: prepare.windowBinding.windowRect,
    expectedDpi: Number(prepare.windowBinding.dpi || 0),
    screenCalibration: prepare.screenCalibration,
    systemInfo: prepare.systemInfo,
    fullFramePath: artifactPlan.candidateFullFramePath,
    cropPath: artifactPlan.candidateCropPath,
    pixelProbes,
    resultPath: path.resolve(options.resultPath || artifactPlan.candidateCaptureResultPath),
  };
}

function buildModalRoiPixelProbes(prepare = {}) {
  const dom = Array.isArray(prepare.dom) ? prepare.dom : [];
  const system = prepare.systemInfo || {};
  const calibration = validateScreenCalibration(prepare);
  if (!calibration.ok) return {};
  const viewport = calibration.viewportRect;
  const scaleX = Number(viewport.width || 0) / Number(system.windowWidth || 0);
  const scaleY = Number(viewport.height || 0) / Number(system.windowHeight || 0);
  const row = (selector) => dom.find((item) => item && item.selector === selector && validRect({
    x: item.offset && item.offset.left,
    y: item.offset && item.offset.top,
    width: item.size && item.size.width,
    height: item.size && item.size.height,
  }));
  const sheet = row('.water-game-sheet') || row('.water-sheet');
  const cta = row('.water-confirm-button');
  if (!sheet || !cta) return {};
  const sheetTop = Number(sheet.offset.top || 0);
  const sheetHeight = Number(sheet.size.height || 0);
  const windowHeight = Number(system.windowHeight || 0);
  const sheetTopIsVisible = sheetTop >= 0 && sheetTop + sheetHeight <= windowHeight + 1;
  const sheetViewport = {
    x: Math.max(0, Number(sheet.offset.left || 0)),
    y: sheetTopIsVisible ? sheetTop : Math.max(0, windowHeight - sheetHeight),
  };
  const toPhysical = (source, inset = {}) => {
    if (!source) return null;
    const logical = {
      x: sheetViewport.x + (Number(source.offset.left || 0) - Number(sheet.offset.left || 0))
        + Number(inset.x || 0),
      y: sheetViewport.y + (Number(source.offset.top || 0) - Number(sheet.offset.top || 0))
        + Number(inset.y || 0),
      width: Number(inset.width || source.size.width),
      height: Number(inset.height || source.size.height),
    };
    const rect = {
      x: Math.max(0, Math.round(logical.x * scaleX)),
      y: Math.max(0, Math.round(logical.y * scaleY)),
      width: Math.max(1, Math.round(logical.width * scaleX)),
      height: Math.max(1, Math.round(logical.height * scaleY)),
    };
    rect.width = Math.min(rect.width, Number(viewport.width) - rect.x);
    rect.height = Math.min(rect.height, Number(viewport.height) - rect.y);
    return validRect(rect) ? rect : null;
  };
  const cornerSize = Math.min(8, Number(sheet.size.width) / 8, Number(sheet.size.height) / 8);
  const probes = {
    sheetSurface: toPhysical(sheet, {
      x: Number(sheet.size.width) / 2 - 10,
      y: Math.min(12, Number(sheet.size.height) / 4),
      width: 20,
      height: 8,
    }),
    sheetTopLeft: toPhysical(sheet, { x: 1, y: 1, width: cornerSize, height: cornerSize }),
    sheetTopRight: toPhysical(sheet, {
      x: Number(sheet.size.width) - cornerSize - 1,
      y: 1,
      width: cornerSize,
      height: cornerSize,
    }),
    cta: toPhysical(cta),
  };
  const winner = row('.water-player-chip.is-winner');
  const loser = row('.water-player-chip.is-loser');
  if (winner && loser) {
    probes.winnerChip = toPhysical(winner);
    probes.loserChip = toPhysical(loser);
  }
  return Object.fromEntries(Object.entries(probes).filter(([, value]) => validRect(value)));
}

function buildModalRoiFreshnessProof(prepare = {}, capture = {}) {
  const probes = capture.pixelProbes || {};
  const sheetSurface = probes.sheetSurface || {};
  const topLeft = probes.sheetTopLeft || {};
  const topRight = probes.sheetTopRight || {};
  const cta = probes.cta || {};
  const winnerRows = Array.isArray(prepare.dom)
    ? prepare.dom.filter((row) => row && row.selector === '.water-player-chip.is-winner')
    : [];
  const loserRows = Array.isArray(prepare.dom)
    ? prepare.dom.filter((row) => row && row.selector === '.water-player-chip.is-loser')
    : [];
  const validationRow = Array.isArray(prepare.dom)
    ? prepare.dom.find((row) => row && row.selector === '.water-game-validation')
    : null;
  return {
    kind: 'wechat-devtools-modal-roi-v1',
    nonce: prepare.nonce,
    pageId: prepare.pageId,
    domHash: prepare.domHash,
    sheet: {
      rect: sheetSurface.rect,
      surfaceRatio: sheetSurface.surfaceRatio,
      topLeftOverlayDarkRatio: topLeft.overlayDarkRatio,
      topRightOverlayDarkRatio: topRight.overlayDarkRatio,
    },
    cta: { rect: cta.rect, deepGreenRatio: cta.deepGreenRatio },
    gameSelection: {
      winnerDomCount: winnerRows.length,
      loserDomCount: loserRows.length,
      validationText: String(validationRow && validationRow.text || ''),
      winnerSoftRatio: Number(probes.winnerChip && probes.winnerChip.winnerSoftRatio || 0),
      loserSoftRatio: Number(probes.loserChip && probes.loserChip.loserSoftRatio || 0),
    },
  };
}

function compareCaptureFiles(capture, fullFramePng, cropPng) {
  const fullFrame = capture && capture.fullFrame || {};
  const crop = capture && capture.crop || {};
  const checks = {
    fullFramePng: !!fullFramePng.valid
      && fullFramePng.sha256 === fullFrame.sha256
      && fullFramePng.width === Number(fullFrame.width || 0)
      && fullFramePng.height === Number(fullFrame.height || 0),
    cropPng: !!cropPng.valid
      && cropPng.sha256 === crop.sha256
      && cropPng.width === Number(crop.width || 0)
      && cropPng.height === Number(crop.height || 0),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function validatePostCaptureEvidence(prepare, post = {}) {
  const marker = post.marker || {};
  const checks = {
    toolInfo: String(post.toolInfo && post.toolInfo.SDKVersion || '') === String(prepare.expectedSDKVersion || ''),
    route: normalizeRoute(post.currentPageInfo) === normalizeRoute(prepare.expectedRoute)
      && normalizeRoute(marker.route) === normalizeRoute(prepare.expectedRoute),
    pageId: String(marker.pageId || '') === String(prepare.pageId || ''),
    runtimePageId: String(post.runtimePageId || '') === String(prepare.pageId || ''),
    nonce: String(marker.nonce || '') === String(prepare.nonce || ''),
    fixture: post.fixtureHash === prepare.fixtureHash,
    pageData: post.pageDataHash === prepare.pageDataHash,
    dom: post.domHash === prepare.domHash,
    system: post.systemInfoHash === prepare.systemInfoHash,
    git: post.gitHash === prepare.gitHash,
    selectorCoverage: !!(post.selectorCoverage && post.selectorCoverage.ok),
    horizontalOverflow: !!(post.horizontalOverflow && post.horizontalOverflow.ok),
    projectProvenance: !!(post.projectProvenance && post.projectProvenance.ok),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

async function capturePreparedWin32(prepareJsonPath, options = {}) {
  const resolvedPreparePath = path.resolve(prepareJsonPath);
  const prepareBuffer = fs.readFileSync(resolvedPreparePath);
  const prepare = JSON.parse(prepareBuffer.toString('utf8'));
  const structuralValidation = validatePrepareRecord(prepare);
  if (!structuralValidation.ok) {
    throw new Error(`Invalid Win32 prepare record: ${JSON.stringify(structuralValidation)}`);
  }
  if (path.resolve(prepare.preparePath) !== resolvedPreparePath) {
    throw new Error('Prepare JSON path does not match its bound preparePath.');
  }
  const prepareFileSha256 = crypto.createHash('sha256').update(prepareBuffer).digest('hex');
  const artifactPlan = buildWin32ArtifactPlan(prepare, options);
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  const fresh = Number.isFinite(Date.parse(prepare.expiresAt)) && nowMs <= Date.parse(prepare.expiresAt);
  const configuredFixtureHash = hashCanonical(cases[prepare.name].fixture || cases[prepare.name].data || {});
  const fixtureDefinitionUnchanged = configuredFixtureHash === prepare.fixtureHash;
  let capture = null;
  let captureError = '';
  let captureRequest = null;
  let captureRequestPath = '';
  if (fresh && fixtureDefinitionUnchanged) {
    try {
      captureRequest = buildWin32CaptureRequest(prepare, { ...options, artifactPlan });
      captureRequestPath = path.resolve(options.requestPath || artifactPlan.candidateRequestPath);
      capture = options.captureEvidence || invokeWin32Helper('Capture', captureRequest, {
        ...options,
        requestPath: captureRequestPath,
      });
    } catch (err) {
      captureError = String(err && err.message || err);
    }
  } else if (!fresh) {
    captureError = 'Prepare record expired before Win32 capture.';
  } else {
    captureError = 'Screenshot fixture definition changed after prepare.';
  }

  let fullFramePng = {};
  let png = {};
  if (capture) {
    try {
      fullFramePng = inspectPngFile(artifactPlan.candidateFullFramePath);
      png = inspectPngFile(artifactPlan.candidateCropPath);
    } catch (err) {
      captureError = captureError || String(err && err.message || err);
    }
  }
  const captureValidation = capture
    ? validateWin32CaptureEvidence(prepare, capture, artifactPlan)
    : { ok: false, checks: {}, expectedViewport: structuralValidation.calibration.viewportRect };
  const captureFiles = capture
    ? compareCaptureFiles(capture, fullFramePng, png)
    : { ok: false, checks: {} };

  const automator = options.automator || resolveAutomator();
  let miniProgram = null;
  let page = null;
  let post = null;
  let finalizeError = '';
  let fixtureCleanup = null;
  let cleanupError = '';
  try {
    miniProgram = await automator.connect({ wsEndpoint: prepare.endpoint });
    const currentPageInfo = await timeout(
      miniProgram.send('App.getCurrentPage'),
      5000,
      `${prepare.name}:finalize:App.getCurrentPage`
    );
    if (typeof miniProgram.currentPage !== 'function') {
      throw new Error('Automator currentPage() is required for Win32 finalize evidence.');
    }
    page = await miniProgram.currentPage();
    if (!page) throw new Error('Current page unavailable during Win32 finalize.');
    const marker = await timeout(readWin32CaptureMarker(miniProgram), 5000, `${prepare.name}:finalize:marker`);
    const rawToolInfo = await timeout(
      miniProgram.send('Tool.getInfo'),
      5000,
      `${prepare.name}:finalize:Tool.getInfo`
    );
    const rawSystemInfo = await timeout(
      miniProgram.systemInfo(),
      5000,
      `${prepare.name}:finalize:systemInfo`
    );
    const pageSize = await timeout(page.size(), 5000, `${prepare.name}:finalize:page.size`);
    const pageData = await timeout(readPageData(page), 5000, `${prepare.name}:finalize:page.data`);
    const item = cases[prepare.name];
    const dom = await collectDom(page, item.selectors);
    const systemInfo = selectSystemInfo(rawSystemInfo);
    const git = (options.currentGitManifest || currentGitManifest)();
    const connection = {
      mode: 'connect-preopened',
      endpoint: prepare.endpoint,
      sourceProjectPath: prepare.sourceProjectPath,
      provenanceLogEvidence: prepare.provenanceLogEvidence,
    };
    const toolInfo = selectToolInfo(rawToolInfo);
    const selectorCoverage = validateSelectorCoverage(dom, item.selectors);
    const horizontalOverflow = validateHorizontalOverflow(pageSize, systemInfo);
    const projectProvenance = validateProjectProvenance({
      connection,
      toolInfo,
      logEvidence: prepare.provenanceLogEvidence,
    });
    post = {
      toolInfo,
      currentPageInfo,
      marker,
      runtimePageId: String(page.id || ''),
      systemInfo,
      pageSize,
      dom,
      git,
      fixtureHash: configuredFixtureHash,
      pageDataHash: hashCanonical(pageData),
      domHash: hashCanonical(dom),
      systemInfoHash: hashCanonical(systemInfo),
      gitHash: hashCanonical(git),
      selectorCoverage,
      horizontalOverflow,
      projectProvenance,
    };
  } catch (err) {
    finalizeError = String(err && err.message || err);
  } finally {
    if (page && cases[prepare.name].fixture) {
      try {
        fixtureCleanup = await cleanupFixture(page, miniProgram);
      } catch (err) {
        cleanupError = String(err && err.message || err);
      }
    }
    if (miniProgram) {
      try {
        miniProgram.disconnect();
      } catch (err) {
        if (!cleanupError) cleanupError = `disconnect failed: ${String(err && err.message || err)}`;
      }
    }
  }

  const postValidation = post
    ? validatePostCaptureEvidence(prepare, post)
    : { ok: false, checks: {} };
  const receiptValidation = post ? validateReceiptEvidence({
    expectedWindowWidth: prepare.expectedWindowWidth,
    expectedSDKVersion: prepare.expectedSDKVersion,
    expectedRoute: prepare.expectedRoute,
    toolInfo: post.toolInfo,
    currentPageInfo: post.currentPageInfo,
    systemInfo: post.systemInfo,
    png,
    git: post.git,
    selectorCoverage: post.selectorCoverage,
    horizontalOverflow: post.horizontalOverflow,
    projectProvenance: post.projectProvenance,
  }) : { ok: false, checks: {} };
  const capturedAt = capture && capture.capturedAt || null;
  const modalRoiRequired = Array.isArray(prepare.dom) && prepare.dom.some((row) => (
    row && (row.selector === '.water-sheet' || row.selector === '.water-game-sheet')
  ));
  const modalRoiFreshnessProof = options.modalRoiFreshnessProof
    || capture && capture.modalRoiFreshnessProof
    || (capture ? buildModalRoiFreshnessProof(prepare, capture) : {});
  const modalRoiFreshnessValidation = modalRoiRequired
    ? validateModalRoiFreshnessProof(prepare, modalRoiFreshnessProof)
    : { ok: true, checks: { required: false } };
  const backgroundCleanupRequired = prepare.captureMode === 'printwindow-current'
    && prepare.transparentTargetCapture === true;
  const backgroundCleanupEvidence = options.backgroundCleanupEvidence || {};
  const backgroundCleanupValidation = backgroundCleanupRequired
    ? validateBackgroundCleanupEvidence(prepare, backgroundCleanupEvidence)
    : { ok: true, checks: { required: false } };
  const finalizedAt = new Date(nowMs).toISOString();
  const captureKind = prepare.captureMode === 'printwindow-current' && prepare.transparentTargetCapture === true
    ? 'wechat-devtools-win32-current-desktop-transparent-printwindow-crop-v1'
    : WIN32_CAPTURE_KINDS[prepare.captureMode];
  const publicationEligible = fresh
    && fixtureDefinitionUnchanged
    && !captureError
    && captureValidation.ok
    && captureFiles.ok
    && modalRoiFreshnessValidation.ok
    && postValidation.ok
    && receiptValidation.ok
    && backgroundCleanupValidation.ok
    && !finalizeError
    && !cleanupError;
  const publication = publishWin32CandidateArtifacts(artifactPlan, {
    eligible: publicationEligible,
    reason: publicationEligible ? '' : 'Capture, post-capture, receipt, or cleanup validation failed.',
  });
  const result = {
    name: prepare.name,
    ok: publicationEligible && publication.published,
    captureKind,
    captureDescription: prepare.captureMode === 'printwindow'
      ? 'real WeChat DevTools off-desktop pixels rendered once by DPI-V2 PrintWindow and cropped from the bound physical full frame; not capturePage'
      : prepare.captureMode === 'printwindow-current'
        ? (prepare.transparentTargetCapture === true
          ? 'real WeChat DevTools current-desktop pixels rendered once by DPI-V2 PrintWindow while the live target is alpha-zero, click-through and no-activate; not capturePage'
          : 'real WeChat DevTools current-desktop pixels rendered once by DPI-V2 PrintWindow while fully occluded behind a stable user foreground window; not capturePage')
        : 'real WeChat DevTools visible pixels cropped from a DPI-aware Win32 full-frame capture; not capturePage',
    captureMode: prepare.captureMode,
    prepareId: prepare.prepareId,
    nonce: prepare.nonce,
    pageId: prepare.pageId,
    preparePath: resolvedPreparePath,
    prepareFileSha256,
    preparedAt: prepare.preparedAt,
    capturedAt,
    finalizedAt,
    output: publication.published ? artifactPlan.finalCropPath : null,
    fullFramePath: publication.published ? artifactPlan.finalFullFramePath : null,
    receiptPath: publication.published ? artifactPlan.finalReceiptPath : artifactPlan.candidateReceiptPath,
    finalOutputPath: artifactPlan.finalCropPath,
    finalFullFramePath: artifactPlan.finalFullFramePath,
    finalReceiptPath: artifactPlan.finalReceiptPath,
    candidateArtifacts: {
      binding: artifactPlan.binding,
      bindingHash: artifactPlan.bindingHash,
      directory: artifactPlan.candidateDir,
      output: artifactPlan.candidateCropPath,
      fullFramePath: artifactPlan.candidateFullFramePath,
      receiptPath: artifactPlan.candidateReceiptPath,
      captureResultPath: artifactPlan.candidateCaptureResultPath,
      requestPath: artifactPlan.candidateRequestPath,
      disposition: publication.candidateDisposition,
    },
    publicationEligible,
    publication,
    endpoint: prepare.endpoint,
    sourceProjectPath: prepare.sourceProjectPath,
    expectedRoute: prepare.expectedRoute,
    expectedWindowWidth: prepare.expectedWindowWidth,
    expectedSDKVersion: prepare.expectedSDKVersion,
    fresh,
    fixtureDefinitionUnchanged,
    structuralValidation,
    captureRequestPath,
    captureRequestHash: captureRequest ? hashCanonical(captureRequest) : '',
    capture,
    captureError,
    fullFramePng,
    png,
    captureValidation,
    captureFiles,
    modalRoiFreshnessProof,
    modalRoiFreshnessValidation,
    backgroundCleanupEvidence,
    backgroundCleanupValidation,
    post,
    postValidation,
    receiptValidation,
    fixtureCleanup,
    cleanupError,
    finalizeError,
    manualActions: prepare.manualActions || [],
  };
  if (captureKind !== result.captureKind) result.ok = false;
  writeJsonAtomically(artifactPlan.candidateReceiptPath, result);
  if (result.ok) writeJsonAtomically(artifactPlan.finalReceiptPath, result);
  return result;
}

async function runCase(name, miniProgram, connection) {
  const item = cases[name];
  if (!item) throw new Error(`Unknown case: ${name}`);
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, `${name}.png`);
  const receiptPath = path.join(outDir, `${name}.receipt.json`);
  const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
  const page = await routeCasePage(miniProgram, routeMethod, item.path);
  await page.waitFor(1200);
  let result;
  let fixtureIsolation = null;
  let fixtureCleanup = null;
  let cleanupError = null;
  try {
    if (item.fixture) {
      fixtureIsolation = await applyFixture(page, item.fixture, miniProgram);
    } else {
      await page.setData(item.data);
    }
    await page.waitFor(1800);
    const [rawToolInfo, currentPageInfo, rawSystemInfo, pageSize] = await Promise.all([
      timeout(miniProgram.send('Tool.getInfo'), 5000, `${name}:Tool.getInfo`),
      timeout(miniProgram.send('App.getCurrentPage'), 5000, `${name}:App.getCurrentPage`),
      timeout(miniProgram.systemInfo(), 5000, `${name}:systemInfo`),
      timeout(page.size(), 5000, `${name}:page.size`),
    ]);
    const toolInfo = selectToolInfo(rawToolInfo);
    const systemInfo = selectSystemInfo(rawSystemInfo);
    const dom = await collectDom(page, item.selectors);
    const horizontalAlignment = item.horizontalAlignment
      ? validateHorizontalAlignment(dom, item.horizontalAlignment)
      : null;
    const selectorCoverage = validateSelectorCoverage(dom, item.selectors);
    const horizontalOverflow = validateHorizontalOverflow(pageSize, systemInfo);
    await timeout(miniProgram.screenshot({ path: output }), screenshotTimeoutMs, `${name}:screenshot`);
    const png = inspectPngFile(output);
    const git = currentGitManifest();
    const projectProvenance = validateProjectProvenance({
      connection,
      toolInfo,
      logEvidence: connection.provenanceLogEvidence,
    });
    const caseExpectedWindowWidth = Number(item.expectedWindowWidth || expectedWindowWidth || 0);
    const viewportOk = !caseExpectedWindowWidth || systemInfo.windowWidth === caseExpectedWindowWidth;
    const receiptValidation = validateReceiptEvidence({
      expectedWindowWidth: caseExpectedWindowWidth,
      expectedSDKVersion,
      expectedRoute: item.path,
      toolInfo,
      currentPageInfo,
      systemInfo,
      png,
      git,
      selectorCoverage,
      horizontalOverflow,
      projectProvenance,
    });
    const basicOk = png.valid && png.byteLength > 20 * 1024
      && viewportOk
      && selectorCoverage.ok
      && (!horizontalAlignment || horizontalAlignment.ok);
    result = {
      name,
      ok: item.strictReceipt ? receiptValidation.ok && basicOk : basicOk,
      output,
      receiptPath,
      endpoint: connection.endpoint,
      connectionMode: connection.mode,
      sourceProjectPath: connection.sourceProjectPath,
      toolInfo,
      currentPageInfo,
      expectedRoute: normalizeRoute(item.path),
      systemInfo,
      expectedWindowWidth: caseExpectedWindowWidth || null,
      expectedSDKVersion: expectedSDKVersion || null,
      viewportOk,
      png,
      git,
      pageSize,
      dom,
      selectorCoverage,
      horizontalAlignment,
      horizontalOverflow,
      projectProvenance,
      fixtureIsolation,
      manualActions: item.fixture ? manualActions : [],
      receiptValidation,
    };
  } finally {
    if (item.fixture) {
      try {
        fixtureCleanup = await cleanupFixture(page, miniProgram);
      } catch (err) {
        cleanupError = String(err && err.message || err);
      }
    }
  }
  if (cleanupError) result.ok = false;
  result.fixtureCleanup = fixtureCleanup;
  result.cleanupError = cleanupError;
  fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

async function openMiniProgram() {
  const automator = resolveAutomator();
  const provenanceLogEvidence = readProjectProvenanceLog(provenanceLogPath);
  if (connectExisting) {
    if (!sourceProjectPath || !fs.existsSync(sourceProjectPath)) {
      throw new Error('WEAPP_CONNECT_EXISTING requires an existing WEAPP_PROJECT_PATH.');
    }
    return {
      miniProgram: await automator.connect({ wsEndpoint }),
      mode: 'connect-preopened',
      endpoint: wsEndpoint,
      sourceProjectPath,
      provenanceLogEvidence,
    };
  }
  if (!sourceProjectPath) {
    return {
      miniProgram: await automator.connect({ wsEndpoint }),
      mode: 'connect',
      endpoint: wsEndpoint,
      sourceProjectPath: '',
      provenanceLogEvidence,
    };
  }
  if (!cliPath) {
    throw new Error('WEAPP_CLI_PATH is required when WEAPP_PROJECT_PATH launches an exact worktree.');
  }
  if (!fs.existsSync(sourceProjectPath)) {
    throw new Error(`WEAPP_PROJECT_PATH does not exist: ${sourceProjectPath}`);
  }
  if (!Number.isInteger(launchPort) || launchPort < 1 || launchPort > 65535) {
    throw new Error(`WEAPP_AUTO_PORT is invalid: ${process.env.WEAPP_AUTO_PORT || ''}`);
  }
  const launchCommand = resolveLaunchCommand(cliPath);
  const miniProgram = await automator.launch({
    cliPath: launchCommand.executable,
    args: launchCommand.args,
    projectPath: sourceProjectPath,
    port: launchPort,
    timeout: launchTimeoutMs,
  });
  return {
    miniProgram,
    mode: 'launch',
    endpoint: `ws://127.0.0.1:${launchPort}`,
    sourceProjectPath,
    provenanceLogEvidence,
  };
}

async function main() {
  const command = parseScreenshotArgs(process.argv.slice(2));
  if (command.mode === 'list') {
    console.log(Object.keys(cases).join('\n'));
    return 0;
  }

  if (command.mode === 'capture-win32') {
    const result = await capturePreparedWin32(command.value);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 2;
  }

  if (command.mode === 'prepare') {
    const connection = await openMiniProgram();
    try {
      const result = await prepareCase(command.value, connection.miniProgram, connection);
      console.log(JSON.stringify(result, null, 2));
      return result.prepareValidation && result.prepareValidation.ok ? 0 : 2;
    } finally {
      try {
        connection.miniProgram.disconnect();
      } catch (err) {
        // Successful prepare deliberately disconnects without screenshot or fixture cleanup.
      }
    }
  }

  const requested = command.value;
  const names = requested.length ? requested : Object.keys(cases);
  const results = [];
  const connection = await openMiniProgram();
  try {
    for (const name of names) {
      const result = await runCase(name, connection.miniProgram, connection);
      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    try {
      connection.miniProgram.disconnect();
    } catch (err) {
      // Best effort cleanup only.
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

module.exports = {
  cases,
  manualActions,
  resolveLaunchCommand,
  normalizeRoute,
  inspectPngBuffer,
  validateHorizontalOverflow,
  validateProjectProvenance,
  validateReceiptEvidence,
  parseScreenshotArgs,
  hashCanonical,
  buildViewportRect,
  validatePrepareRecord,
  validateWin32CaptureEvidence,
  validateCaptureFreshnessProof,
  validateModalRoiFreshnessProof,
  validateBackgroundCleanupEvidence,
  validatePostCaptureEvidence,
  buildWin32ArtifactPlan,
  buildWin32CaptureRequest,
  buildModalRoiPixelProbes,
  invokeWin32Helper,
  publishWin32CandidateArtifacts,
  applyFixture,
  cleanupFixture,
  routeCasePage,
  prepareCase,
  capturePreparedWin32,
  runCase,
};
