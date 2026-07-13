const test = require('node:test');
const assert = require('node:assert/strict');

const { SMOKE_CASES, cases } = require('../scripts/dev/weapp-ui-screenshot');

const EXPECTED_CASES = [
  'launch',
  'create',
  'home',
  'shareDraft',
  'shareRunning',
  'shareFinished',
  'lobbyGuide',
  'ranking',
  'scheduleRunning',
  'schedule',
  'analytics'
];

test('real UI screenshot matrix covers the restored master flows plus the approved schedule layout', () => {
  assert.deepEqual(Object.keys(cases), EXPECTED_CASES);
  assert.deepEqual(SMOKE_CASES, ['launch', 'scheduleRunning', 'home']);

  for (const [name, item] of Object.entries(cases)) {
    assert.ok(String(item.path || '').startsWith('/pages/'), `${name} needs a real page route`);
    assert.doesNotMatch(String(item.path), /(?:tournamentId|\bid)=demo/, `${name} must not start real cloud polling for a fake fixture id`);
    if (Object.prototype.hasOwnProperty.call(item.data || {}, 'tournamentId')) {
      assert.equal(String(item.data.tournamentId || '').trim(), '', `${name} must not re-arm cloud polling after a network reconnect`);
      assert.equal(item.quiesceTournamentSync, true, `${name} must verify that no fixture watcher remains active`);
    }
    assert.ok(Array.isArray(item.selectors) && item.selectors.length > 0, `${name} needs rendered selectors`);
    assert.ok(item.data && typeof item.data === 'object', `${name} needs a stable runtime fixture`);
  }
});

test('launch and create cases preserve the master two-page creation flow', () => {
  assert.equal(cases.launch.path, '/pages/launch/index');
  assert.ok(cases.launch.expectedTexts.includes('发起'));
  assert.ok(cases.launch.expectedTexts.includes('规则说明'));
  assert.ok(cases.launch.forbiddenTexts.includes('创建'));

  assert.equal(cases.create.path, '/pages/create/index');
  assert.ok(cases.create.selectors.includes('.create-panel'));
  assert.ok(cases.create.selectors.includes('.create-flow'));
  assert.ok(cases.create.expectedTexts.includes('赛事名称'));
  assert.ok(cases.create.expectedTexts.includes('创建后流程'));
  assert.ok(cases.create.expectedTexts.includes('创建并进入'));
  assert.ok(cases.create.forbiddenTexts.includes('正在前往发起页'));

  assert.equal(Object.prototype.hasOwnProperty.call(cases, 'createCompat'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cases, 'launchCreating'), false);
});

test('lobby, result, share and analytics cases retain the rich master product surfaces', () => {
  assert.ok(cases.lobbyGuide.selectors.includes('.hero-stats'));
  assert.ok(cases.lobbyGuide.selectors.includes('.growth-guide-card'));
  assert.ok(cases.lobbyGuide.selectors.includes('.info-panel'));
  assert.ok(cases.lobbyGuide.expectedTexts.includes('刚加入，先看这 3 件事'));

  assert.ok(cases.home.selectors.includes('.finished-growth-markers'));
  assert.ok(cases.home.expectedTexts.includes('查看战绩'));
  assert.ok(cases.home.expectedTexts.includes('赛后复盘已准备好'));

  assert.ok(cases.ranking.selectors.includes('.ranking-action-full'));
  assert.ok(cases.ranking.selectors.includes('.ranking-share-banner'));
  assert.ok(cases.ranking.expectedTexts.includes('分享到朋友圈'));

  for (const name of ['shareDraft', 'shareRunning', 'shareFinished']) {
    assert.ok(cases[name].selectors.includes('.share-info'), `${name} must keep the match summary card`);
  }
  assert.ok(cases.shareFinished.expectedTexts.includes('查看赛事战报'));

  assert.equal(cases.analytics.path, '/pages/analytics/index');
  assert.ok(cases.analytics.selectors.includes('.analytics-hero'));
  assert.ok(cases.analytics.selectors.includes('.report-card'));
  assert.ok(cases.analytics.expectedTexts.includes('比赛结论'));
  assert.ok(cases.analytics.expectedTexts.includes('复制完整战报'));
});

test('schedule matrix keeps master chrome while proving central score and long-name rendering', () => {
  const running = cases.scheduleRunning;
  const matches = running.data.roundsUi.flatMap((round) => round.matchesUi);
  const pending = matches.find((match) => !match.showScore);
  const finished = matches.find((match) => match.showScore);
  const visibleNames = matches.flatMap((match) => [match.leftTeam.text, match.rightTeam.text]);

  assert.ok(running.selectors.includes('.hero-actions-panel'));
  assert.ok(running.selectors.includes('.match-card-focus'));
  assert.ok(running.selectors.includes('.match-card-head'));
  assert.ok(running.selectors.includes('.match-center'));
  assert.ok(running.selectors.includes('.match-center-score'));
  assert.equal(running.selectors.includes('.match-side-rail'), false);
  assert.equal(pending.statusText, '待录分');
  assert.equal(finished.leftScoreText, '21');
  assert.equal(finished.rightScoreText, '17');
  assert.ok(visibleNames.some((name) => name.includes('ChristopherWong')));
  assert.ok(visibleNames.some((name) => name.includes('AlexandraJohnson')));
  assert.ok(visibleNames.some((name) => name.includes('同学')));
  assert.ok(running.expectedTexts.includes('21:17'));

  assert.ok(cases.schedule.selectors.includes('.hero-finished-share'));
  assert.ok(cases.schedule.expectedTexts.includes('查看最终排名'));
  assert.ok(cases.schedule.expectedTexts.includes('分享我的战绩'));
});
