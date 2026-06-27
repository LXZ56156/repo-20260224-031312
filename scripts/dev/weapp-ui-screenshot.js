#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (_) {
    // Fall through to the local npx cache.
  }
  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  const candidates = [];
  try {
    for (const entry of fs.readdirSync(npxRoot)) {
      const modulePath = path.join(npxRoot, entry, 'node_modules', 'miniprogram-automator');
      if (fs.existsSync(modulePath)) candidates.push({ modulePath, mtimeMs: fs.statSync(modulePath).mtimeMs });
    }
  } catch (_) {
    // The actionable error below covers a missing cache.
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length) return require(candidates[0].modulePath);
  throw new Error('miniprogram-automator not found. Run: npx --yes -p miniprogram-automator node scripts/dev/weapp-ui-screenshot.js <case>');
}

const automator = resolveAutomator();
const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:39420';
const outDir = path.resolve(process.env.WEAPP_SCREENSHOT_DIR || 'tmp/ui-screenshots-actual');
const screenshotTimeoutMs = Number(process.env.WEAPP_SCREENSHOT_TIMEOUT_MS || 45000);
const reLaunchTimeoutMs = Number(process.env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000);

const nav = (active) => [
  { key: 'match', text: '赛事', active: active === 'match' },
  { key: 'schedule', text: '对阵', active: active === 'schedule' },
  { key: 'ranking', text: '排名', active: active === 'ranking' }
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
  summaryText: `${item.wins} 胜 · 净胜 ${item.pointDiff}`
}));

const lobbyBase = {
  tournamentId: 'demo',
  mode: 'multi_rotate',
  modeLabel: '6人转',
  statusClass: 'tag-draft',
  statusText: '报名中',
  primaryNavItems: nav('match'),
  displayPlayers: [],
  playerCountText: '0 人',
  playerRosterHint: '',
  showMyProfile: false,
  showAllPlayers: true,
  showJoinSheet: false,
  showDraftAdminPanel: false,
  adminPanelExpanded: false,
  isAdmin: false,
  myJoined: false,
  canRetryAction: false,
  loadError: false,
  syncStatusVisible: false,
  uiMotionClass: 'motion-reduced',
  dynamicSharePreparing: false,
  dynamicShareReady: true,
  dynamicShareError: '',
  dynamicShareUnavailableReason: ''
};

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

const previewBase = {
  tournamentName: '周末羽毛球赛',
  lifecycle: 'draft',
  modeLabel: '6人转',
  playersCountText: '已报名 5/6 人',
  joinAllowed: true,
  joined: false,
  identityStatusText: '',
  primaryAction: { key: 'join', text: '加入比赛' },
  secondaryAction: null,
  showParticipantPreview: true,
  participantPreviewList: players.slice(0, 5).map((item) => ({ ...item, avatarUrl: '', showAvatar: false })),
  participantOverflowText: '',
  showRankingPreview: false,
  rankingPreview: [],
  rankingTitle: '实时排名前 3',
  progressText: '比赛尚未开始',
  statusText: '报名中',
  statusClass: 'tag-draft',
  viewMode: 'join-preview'
};

const cases = {
  launch: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-hero', '.launch-card', '.launch-btn'],
    data: {
      modeCards: [
        { key: 'rotation_6', mode: 'multi_rotate', presetKey: 'rotation_6', name: '6人转', summary: '默认 9 场 · 满 6 人开赛' },
        { key: 'rotation_7', mode: 'multi_rotate', presetKey: 'rotation_7', name: '7人转', summary: '默认 14 场 · 满 7 人开赛' },
        { key: 'rotation_8', mode: 'multi_rotate', presetKey: 'rotation_8', name: '8人转', summary: '默认 14 场 · 可选 1/2 场地' },
        { key: 'multi', mode: 'multi_rotate', presetKey: 'custom', name: '多人转', summary: '4–30 人 · 自动轮换搭档' }
      ],
      createBusy: false,
      createBusyKey: '',
      canRetryAction: false
    }
  },
  launchCreating: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-hero', '.launch-card', '.launch-btn'],
    expectedTexts: ['选择赛制', '6人转', '8人转', '创建'],
    data: {
      createBusy: true,
      createBusyKey: 'rotation_8',
      canRetryAction: false
    }
  },
  createCompat: {
    path: '/pages/launch/index',
    route: 'switchTab',
    selectors: ['.launch-hero', '.launch-card', '.launch-btn', '.launch-card.is-legacy-selected'],
    expectedTexts: ['选择赛制', '8人转', '创建'],
    forbiddenTexts: ['创建后流程', '一步创建', '创建并进入'],
    data: { legacySelectionKey: 'rotation_8' }
  },
  lobbyEmpty: {
    path: '/pages/lobby/index?tournamentId=demo',
    selectors: ['.lobby-summary', '.lobby-roster', '.lobby-next', '.state-primary-btn'],
    expectedTexts: ['21分制', '0/6人', '9场', '2场地', '可在下方「管理」中修改比赛参数'],
    data: {
      ...lobbyBase,
      tournament: { _id: 'demo', name: '周末新手场', status: 'draft', mode: 'multi_rotate', players: [] },
      isAdmin: true,
      myJoined: true,
      playerCountText: '0/6 人',
      heroMetaLine: '6人转 · 21分制 · 0/6人 · 9场 · 2场地',
      statePanelTitle: '下一步',
      statePanelSummary: '邀请球友加入，满 6 人后即可开赛',
      primaryTaskKey: 'share',
      primaryTaskTitle: '邀请球友',
      primaryTaskSummary: '邀请球友加入，满 6 人后即可开赛',
      showDraftAdminPanel: true
    }
  },
  lobbyWaiting: {
    path: '/pages/lobby/index?tournamentId=demo',
    selectors: ['.lobby-summary', '.lobby-roster', '.player-cell', '.lobby-next'],
    expectedTexts: ['21分制', '5/6人', '9场', '2场地'],
    data: {
      ...lobbyBase,
      tournament: { _id: 'demo', name: '周末羽毛球公开交流挑战赛', status: 'draft', mode: 'multi_rotate', players: players.slice(0, 5) },
      myJoined: true,
      displayPlayers: players.slice(0, 5),
      playerCountText: '5/6 人',
      heroMetaLine: '6人转 · 21分制 · 5/6人 · 9场 · 2场地',
      statePanelTitle: '下一步',
      statePanelSummary: '等待管理员邀请最后 1 位球友',
      primaryTaskKey: '',
      primaryTaskTitle: '',
      primaryTaskSummary: '等待管理员邀请最后 1 位球友'
    }
  },
  lobbyReady: {
    path: '/pages/lobby/index?tournamentId=demo',
    selectors: ['.lobby-summary', '.lobby-roster', '.player-cell', '.lobby-next', '.state-primary-btn', '.admin-panel'],
    expectedTexts: ['21分制', '6/6人', '9场', '2场地', '可在下方「管理」中修改比赛参数'],
    data: {
      ...lobbyBase,
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'draft', mode: 'multi_rotate', players: players.slice(0, 6) },
      isAdmin: true,
      myJoined: true,
      displayPlayers: players.slice(0, 6),
      playerCountText: '6/6 人',
      heroMetaLine: '6人转 · 21分制 · 6/6人 · 9场 · 2场地',
      statePanelTitle: '下一步',
      statePanelSummary: '名单已就绪，可以开始比赛',
      primaryTaskKey: 'start',
      primaryTaskTitle: '开始比赛',
      primaryTaskSummary: '名单已就绪，可以开始比赛',
      showDraftAdminPanel: true
    }
  },
  scheduleRunning: {
    path: '/pages/schedule/index?tournamentId=demo',
    selectors: ['.match-primary-nav', '.hero', '.hero-actions-panel', '.round-card', '.match-card-focus', '.match-team-name-line', '.match-card-result', '.match-center-score'],
    expectedTexts: ['待录分', '优先录分', '阿杰/小林同学', 'ChristopherWong/王敏同学', '21:17'],
    data: {
      tournamentId: 'demo',
      tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'running', players: schedulePlayers },
      primaryNavItems: nav('schedule'),
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
  matchIdle: {
    path: '/pages/match/index?tournamentId=demo&roundIndex=0&matchIndex=0',
    selectors: ['.hero-compact', '.score-stage', '.score-matchup', '.score-box', '.score-entry-btn'],
    data: {
      tournamentId: 'demo', tournamentName: '周末羽毛球赛', roundIndex: 0, matchIndex: 0,
      match: { status: 'pending' }, matchStatusText: '待录分', pointsPerGame: 21,
      pair1Text: '阿杰 / 小林', pair2Text: 'Chris / 王敏', pair1Players: players.slice(0, 2), pair2Players: players.slice(2, 4),
      userCanScore: true, canEdit: false, canUseScoreLock: true, lockState: 'idle', lockBusy: false, lockActionText: '开始录分',
      displayScoreA: '-', displayScoreB: '-', batchMode: false, syncStatusVisible: false, loadError: false, canRetryAction: false
    }
  },
  matchEditing: {
    path: '/pages/match/index?tournamentId=demo&roundIndex=0&matchIndex=0',
    selectors: ['.hero-compact', '.score-stage-editing', '.score-matchup', '.score-wheel', '.score-toolbar', '.bottom-tray'],
    data: {
      tournamentId: 'demo', tournamentName: '周末羽毛球赛', roundIndex: 0, matchIndex: 0,
      match: { status: 'pending' }, matchStatusText: '待录分', pointsPerGame: 21,
      pair1Text: '阿杰 / 小林', pair2Text: 'Chris / 王敏', pair1Players: players.slice(0, 2), pair2Players: players.slice(2, 4),
      userCanScore: true, canEdit: true, canUseScoreLock: true, lockState: 'locked_by_me', lockHintText: '你正在录入比分',
      scoreA: 21, scoreB: 17, scoreAIndex: 21, scoreBIndex: 17, scoreOptions: Array.from({ length: 61 }, (_, index) => index),
      quickScoreOptions: [{ label: '21:19', a: 21, b: 19 }, { label: '21:17', a: 21, b: 17 }, { label: '19:21', a: 19, b: 21 }],
      canUndo: true, submitBusy: false, batchMode: false, syncStatusVisible: false, loadError: false, canRetryAction: false
    }
  },
  rankingRunning: {
    path: '/pages/ranking/index?tournamentId=demo',
    selectors: ['.match-primary-nav', '.hero', '.ranking-action-primary', '.ranking-card'],
    data: { tournamentId: 'demo', tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'running', mode: 'multi_rotate' }, rankings, rankingTypeLabel: '实时个人榜', posterButtonText: '生成我的战绩卡', primaryNavItems: nav('ranking'), showMoreActions: false, showResultAdSlot: false, syncStatusVisible: false, loadError: false }
  },
  rankingFinished: {
    path: '/pages/ranking/index?tournamentId=demo',
    selectors: ['.match-primary-nav', '.hero', '.ranking-action-primary', '.ranking-card-1st', '.ranking-card-2nd', '.ranking-card-3rd'],
    data: { tournamentId: 'demo', tournament: { _id: 'demo', name: '周末羽毛球赛', status: 'finished', mode: 'multi_rotate' }, rankings, rankingTypeLabel: '最终个人榜', posterButtonText: '生成我的战绩卡', primaryNavItems: nav('ranking'), showMoreActions: false, showResultAdSlot: false, syncStatusVisible: false, loadError: false }
  },
  home: {
    path: '/pages/home/index',
    route: 'switchTab',
    selectors: ['.hero-card', '.hero-task-btn', '.toolbar-row', '.swipe-row', '.t-quick-action'],
    data: {
      loadError: false, syncStatusVisible: false, loading: false, showHeroCard: true, showProfileNudge: false, showHomeAdSlot: false,
      heroCard: { title: '继续比赛', label: '当前赛事', name: '周末羽毛球赛', meta: '第 1 轮 · 仍有 8 场待录分', progress: 11, actionTarget: 'batch', actionId: 'demo', actionRound: 0, actionMatch: 0, actionText: '继续录分', empty: false },
      items: [
        { _id: 'demo', name: '周末羽毛球赛', status: 'running', statusClass: 'tag-running', statusLabel: '进行中', modeLabel: '6人转', playersCount: 6, matchProgressText: '1/9 场', updatedAtText: '刚刚', _offset: 0 },
        { _id: 'done', name: '公司双打夜', status: 'finished', statusClass: 'tag-finished', statusLabel: '已结束', modeLabel: '固搭循环赛', playersCount: 8, matchProgressText: '12/12 场', updatedAtText: '昨天', _offset: 0 },
        { _id: 'draft', name: '周三约球', status: 'draft', statusClass: 'tag-draft', statusLabel: '报名中', modeLabel: '多人转', playersCount: 4, matchProgressText: '未开赛', updatedAtText: '2天前', _offset: 0 },
        { _id: 'done2', name: '社区周赛', status: 'finished', statusClass: 'tag-finished', statusLabel: '已结束', modeLabel: '小队转', playersCount: 10, matchProgressText: '16/16 场', updatedAtText: '上周', _offset: 0 }
      ],
      visibleCount: 4, showListControls: true, sortMode: 'updated', filterStatus: 'all', statusCountRunning: 1, statusCountDraft: 1, statusCountFinished: 2, canRetryAction: false
    }
  },
  shareDraft: {
    path: '/pages/share-entry/index?tournamentId=demo',
    selectors: ['.share-hero', '.participant-preview', '.participant-avatar-row', '.share-primary-btn'],
    data: { tournament: { _id: 'demo', mode: 'multi_rotate', status: 'draft' }, tournamentId: 'demo', preview: previewBase, identityPending: false, identityTimedOut: false, joinBusy: false, loadError: false, syncStatusVisible: false, joinSquadChoice: 'A' }
  },
  shareRunning: {
    path: '/pages/share-entry/index?tournamentId=demo',
    selectors: ['.share-hero', '.ranking-preview', '.ranking-preview-row', '.share-primary-btn'],
    data: { tournament: { _id: 'demo', mode: 'multi_rotate', status: 'running' }, tournamentId: 'demo', preview: { ...previewBase, lifecycle: 'running', statusText: '进行中', statusClass: 'tag-running', progressText: '第 3 轮 / 共 7 轮', joinAllowed: false, primaryAction: { key: 'schedule', text: '查看对阵' }, showParticipantPreview: false, showRankingPreview: true, rankingPreview, rankingTitle: '实时排名前 3' }, identityPending: false, identityTimedOut: false, joinBusy: false, loadError: false, syncStatusVisible: false }
  },
  shareFinished: {
    path: '/pages/share-entry/index?tournamentId=demo',
    selectors: ['.share-hero', '.ranking-preview', '.ranking-preview-row', '.share-primary-btn'],
    data: { tournament: { _id: 'demo', mode: 'multi_rotate', status: 'finished' }, tournamentId: 'demo', preview: { ...previewBase, lifecycle: 'finished', statusText: '已结束', statusClass: 'tag-finished', progressText: '已完成 21/21 场', joinAllowed: false, primaryAction: { key: 'ranking', text: '查看最终排名' }, showParticipantPreview: false, showRankingPreview: true, rankingPreview, rankingTitle: '最终排名前 3' }, identityPending: false, identityTimedOut: false, joinBusy: false, loadError: false, syncStatusVisible: false }
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

function fileLooksNonBlank(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  return buffer.length > 20 * 1024 && buffer.subarray(1, 4).toString('ascii') === 'PNG';
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
  if (dom.missingSelectors.length) throw new Error(`${name}: missing selectors: ${dom.missingSelectors.join(', ')}`);
  const visibleText = dom.rows.map((row) => row.text).join(' ').replace(/\s+/g, '');
  const missingTexts = (item.expectedTexts || []).filter((value) => !visibleText.includes(String(value).replace(/\s+/g, '')));
  if (missingTexts.length) throw new Error(`${name}: missing expected text: ${missingTexts.join(', ')}`);
  const forbiddenTexts = (item.forbiddenTexts || []).filter((value) => visibleText.includes(String(value).replace(/\s+/g, '')));
  if (forbiddenTexts.length) throw new Error(`${name}: forbidden text present: ${forbiddenTexts.join(', ')}`);
  await timeout(miniProgram.screenshot({ path: output }), screenshotTimeoutMs, `${name}:screenshot`);
  const ok = fileLooksNonBlank(output);
  return { name, ok, output, dom: dom.rows };
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
      } catch (_) {
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

module.exports = { cases, fileLooksNonBlank };
