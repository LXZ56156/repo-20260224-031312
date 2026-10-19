const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateHorizontalAlignment } = require('../scripts/dev/weapp-screenshot-layout');
const waterV2Fixtures = require('../scripts/dev/water-v2-screenshot-fixtures');
const screenshotTool = require('../scripts/dev/weapp-ui-screenshot');

const screenshotScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts/dev/weapp-ui-screenshot.js'),
  'utf8'
);
const prewarmScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts/dev/weapp-ui-prewarm.js'),
  'utf8'
);
const focusProbeScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts/dev/weapp-background-focus-check.ps1'),
  'utf8'
);

test('DevTools screenshot workflow includes independent-water and tournament launch CTAs', () => {
  const launch = screenshotTool.cases.launch;
  assert.equal(launch.path, '/pages/launch/index');
  assert.equal(launch.route, 'switchTab');
  assert.deepEqual(launch.selectors, [
    '.launch-water-card',
    '.launch-water-btn',
    '.launch-card.is-default .launch-btn',
  ]);
  // The approved independent-ledger primary CTA now spans its card.
  assert.equal(launch.horizontalAlignment, undefined);
});

test('horizontal screenshot validator accepts matching CTA geometry', () => {
  const result = validateHorizontalAlignment([
    { selector: '.launch-water-btn', index: 0, size: { width: 184 }, offset: { left: 136.1 } },
    { selector: '.launch-card.is-default .launch-btn', index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], {
    selectors: ['.launch-water-btn', '.launch-card.is-default .launch-btn'],
    tolerance: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.leftDelta, 0);
  assert.equal(result.widthDelta, 0);
});

test('horizontal screenshot validator rejects drift and missing selectors', () => {
  const selectors = ['.launch-water-btn', '.launch-card.is-default .launch-btn'];
  const drifted = validateHorizontalAlignment([
    { selector: selectors[0], index: 0, size: { width: 184 }, offset: { left: 105.1 } },
    { selector: selectors[1], index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], { selectors, tolerance: 1 });
  const missing = validateHorizontalAlignment([
    { selector: selectors[0], index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], { selectors, tolerance: 1 });

  assert.equal(drifted.ok, false);
  assert.equal(drifted.leftDelta, 31);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /exactly one element/);
});

test('DevTools screenshot workflow locks the four V2 water risk states', () => {
  const expectedCases = {
    waterV2OwnerEmpty: waterV2Fixtures.ownerEmpty,
    waterV2Member24: waterV2Fixtures.member24,
    waterV2Member24Game: waterV2Fixtures.member24Game,
    waterV2VisitorLong: waterV2Fixtures.visitorLong,
  };

  Object.entries(expectedCases).forEach(([name, fixture]) => {
    assert.equal(
      screenshotTool.cases[name].path,
      '/pages/water/index?id=water_v2_demo',
      `${name} must open the stable V2 room path`
    );
    assert.equal(screenshotTool.cases[name].fixture, fixture);
    assert.equal(
      screenshotTool.cases[name].expectedWindowWidth,
      undefined,
      `${name} must accept the explicit 320/390/430 run width instead of pinning one device`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(screenshotTool.cases[name], 'strictReceipt'),
      false,
      `${name} must not carry a per-case escape hatch from the global receipt contract`
    );
  });
});

test('water popup screenshot selectors target one explicit sheet without hidden siblings', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/water/index.wxml'), 'utf8');
  assert.equal((wxml.match(/\bwater-direct-sheet\b/g) || []).length, 1);
  assert.match(wxml, /show="\{\{directSheetOpen\}\}"[^>]*>\s*<view class="water-sheet water-form-sheet water-direct-sheet">/);
  for (const [name, scope] of [
    ['waterV2Member24Game', '.water-game-sheet'],
    ['waterV2OwnerCorrectionLong', '.water-game-sheet'],
    ['waterV2MemberDirect', '.water-direct-sheet'],
    ['waterV2MemberCorrection', '.water-direct-sheet'],
    ['waterV2SheetError', '.water-direct-sheet'],
  ]) {
    const item = screenshotTool.cases[name];
    assert.ok(item.selectors.includes(scope), name);
    assert.ok(item.selectors.includes(`${scope} .water-confirm-button`), name);
    for (const selector of item.selectors) {
      assert.ok(!['.water-sheet', '.water-confirm-button', '.water-sheet-title', '.water-sheet-alert'].includes(selector), `${name}: ${selector}`);
    }
    for (const selector of [scope, `${scope} .water-confirm-button`]) {
      assert.deepEqual(item.selectorExpectations[selector], { expectedCount: 1, visible: true }, name);
    }
  }
  for (const [name, target] of [['waterV2MemberCorrection', '.water-sheet-title'], ['waterV2SheetError', '.water-sheet-alert']]) {
    const selector = `.water-direct-sheet ${target}`;
    assert.ok(screenshotTool.cases[name].selectors.includes(selector));
    assert.deepEqual(screenshotTool.cases[name].selectorExpectations[selector], { expectedCount: 1, visible: true });
  }
});

test('every screenshot case uses the same fail-closed receipt contract', () => {
  Object.entries(screenshotTool.cases).forEach(([name, item]) => {
    assert.equal(
      Object.prototype.hasOwnProperty.call(item, 'strictReceipt'),
      false,
      `${name} must not opt into or out of receipt validation independently`
    );
  });
  assert.doesNotMatch(screenshotScript, /item\.strictReceipt/);
  assert.match(screenshotScript, /result\.evidenceOk\s*=\s*!!\(result\.receiptValidation/);
  assert.match(screenshotScript, /result\.machineOk\s*=\s*result\.captureOk\s*&&\s*result\.evidenceOk/);
});

test('screenshot tooling uses a declared SDK and no npx-cache fallback', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

  assert.equal(manifest.scripts['ui:prewarm'], 'node scripts/dev/weapp-ui-prewarm.js');
  assert.equal(manifest.scripts['ui:doctor'], 'node scripts/dev/weapp-ui-screenshot.js --doctor');
  assert.equal(
    manifest.scripts['ui:screenshot:focus-check'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/weapp-background-focus-check.ps1'
  );
  assert.equal(manifest.devDependencies['miniprogram-automator'], '0.12.1');
  assert.equal(manifest.devDependencies['miniprogram-ci'], '2.1.31');
  assert.equal(lockfile.packages['node_modules/miniprogram-automator'].version, '0.12.1');
  assert.equal(lockfile.packages['node_modules/miniprogram-ci'].version, '2.1.31');
  assert.doesNotMatch(screenshotScript, /\.npm['"],\s*['_"]npx|_npx|npx --yes -p miniprogram-automator/);
});

test('normal screenshots require an explicit background-session endpoint and exact project path', () => {
  assert.doesNotMatch(screenshotScript, /WEAPP_WS_ENDPOINT\s*\|\|\s*['"]ws:\/\/127\.0\.0\.1:39420/);
  assert.match(screenshotScript, /Run the explicit npm run ui:prewarm step first/);
  assert.match(screenshotScript, /sourceProjectPath/);
});

test('water screenshot case targets the V2 ledger instead of retired scoreboards', () => {
  assert.deepEqual(screenshotTool.cases.water.selectors, [
    '.water-page',
    '.water-latest-receipt',
    '.water-ledger-row',
    '.water-action-dock',
  ]);
  assert.doesNotMatch(JSON.stringify(screenshotTool.cases), /\.water-scoreboard|\.water-hero/);
});

test('tracked screenshot registry covers every registered page and match risk states without remote assets', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'miniprogram/app.json'), 'utf8'));
  const coveredPages = new Set(Object.values(screenshotTool.cases).map((item) => (
    String(item.path || '').split('?')[0].replace(/^\//, '')
  )));
  appConfig.pages.forEach((pagePath) => {
    assert.equal(coveredPages.has(pagePath), true, `${pagePath} must have a tracked screenshot case`);
  });
  ['matchIdle', 'matchEditing', 'matchLocked', 'matchError'].forEach((name) => {
    assert.equal(!!screenshotTool.cases[name], true, `${name} must remain in the match risk matrix`);
  });
  assert.doesNotMatch(JSON.stringify(screenshotTool.cases), /https?:\/\//);
  assert.equal(screenshotTool.cases.feedback.storageFixture.profileGate, true);
  assert.equal(screenshotTool.cases.create.storageFixture.profileGate, true);
  assert.equal(screenshotTool.cases.feedback.data.contentLength, 20);
  assert.equal(screenshotTool.cases.create.data.modeLabel, '多人转');
  assert.equal(screenshotTool.cases.matchEditing.selectors.includes('.score-wheel'), false);
  assert.deepEqual(screenshotTool.cases.settings.selectors, [
    '.settings-page', '.context-panel', '#section-params', '.settings-save',
  ]);
});

test('recovery screenshot cases cover list, empty, error and loading with real display fields', async () => {
  const recovery = require('../miniprogram/core/tournamentRecovery');
  const cloud = require('../miniprogram/core/cloud');
  const names = ['tournamentList', 'tournamentListEmpty', 'tournamentListError', 'tournamentListLoading'];
  names.forEach((name) => {
    const item = screenshotTool.cases[name];
    assert.ok(item, name);
    assert.equal(item.path, '/pages/tournament-list/index');
    assert.equal(item.fixture, undefined, 'generic pages must use the page-data isolation path');
    assert.equal(item.data.hasMore, false);
  });
  const list = screenshotTool.cases.tournamentList;
  assert.equal(list.data.items.length, 3);
  const originalCall = cloud.call;
  try {
    cloud.call = async () => ({ ok: true, data: { items: [{ id: '__ui_recovery_running', name: '周末羽毛球赛',
      status: 'running', mode: 'multi_rotate', roles: ['owner', 'participant'], completedMatches: 1, totalMatches: 2 }], hasMore: false } });
    assert.deepEqual(list.data.items[0], (await recovery.getPage()).items[0]);
  } finally { cloud.call = originalCall; }
  assert.equal(list.selectorExpectations['.recovery-item'], 3);
  assert.deepEqual(screenshotTool.cases.tournamentListEmpty.data,
    { items: [], loading: false, loaded: true, hasMore: false, error: '' });
  assert.equal(screenshotTool.cases.tournamentListError.data.loaded, false);
  assert.ok(screenshotTool.cases.tournamentListError.data.error);
  assert.equal(screenshotTool.cases.tournamentListLoading.data.loading, true);
  assert.equal(screenshotTool.cases.tournamentListLoading.data.loaded, false);
});

test('manual-finish screenshot cases retain completed score and distinguish ready, busy and canceled in doubles and singles', () => {
  const ready = screenshotTool.cases.scheduleManualFinishReady;
  const busy = screenshotTool.cases.scheduleManualFinishBusy;
  const finished = screenshotTool.cases.scheduleManualFinished;
  assert.ok(ready && busy && finished);
  assert.equal(ready.data.canFinishTournament, true);
  assert.equal(ready.data.manualFinishBusy, false);
  assert.equal(busy.data.manualFinishBusy, true);
  assert.equal(ready.data.finishCompletedMatches, 1);
  assert.equal(ready.data.finishRemainingMatches, 1);
  assert.deepEqual(busy.data.tournament, ready.data.tournament);
  assert.equal(finished.data.canFinishTournament, false);
  assert.equal(finished.data.showFinishedShareActions, true);
  assert.equal(finished.data.heroPendingText, '已完成 1 场，取消 1 场');
  assert.equal(finished.data.tournament.finishMeta.type, 'manual');
  const matches = finished.data.tournament.rounds[0].matches;
  assert.deepEqual(matches[0], ready.data.tournament.rounds[0].matches[0]);
  assert.equal(matches[0].scoreA, 21);
  assert.equal(matches[0].scoreB, 17);
  assert.equal(matches[1].cancelReason, 'manual_finish');
  assert.equal(finished.data.roundsUi[0].matchesUi[1].statusText, '已取消');
  const singles = screenshotTool.cases.singlesScheduleManualFinished;
  const singlesMatches = singles.data.tournament.rounds.flatMap((round) => round.matches);
  assert.equal(singlesMatches.filter((match) => match.status === 'finished').length, 1);
  assert.equal(singlesMatches.filter((match) => match.status === 'canceled' && match.cancelReason === 'manual_finish').length, 5);
  assert.deepEqual([singlesMatches[0].scoreA, singlesMatches[0].scoreB, singlesMatches[0].scorerName], [21, 17, '阿杰']);
  assert.equal(singles.data.tournament.rankings.reduce((sum, row) => sum + row.played, 0), 2,
    'only the two participants in the one completed singles match contribute to rankings');
  assert.equal(singles.data.tournament.rankings.reduce((sum, row) => sum + row.pointsFor, 0), 38);
  const singlesResult = screenshotTool.cases.singlesScheduleManualFinishedResult;
  assert.equal(singlesResult.data, singles.data);
  assert.equal(singlesResult.scrollToSelector, '.match-score-row');
  assert.equal(singlesResult.selectorExpectations[singlesResult.scrollToSelector], 1);
  assert.equal(singles.data.roundsUi.flatMap((round) => round.matchesUi).filter((match) => match.showScore).length, 1);
  assert.equal(singlesResult.selectorExpectations['.match-card[data-round="0"][data-match="1"] .pill-canceled'], 1);
  assert.equal(singles.data.roundsUi[0].matchesUi[1].status, 'canceled');
  const pagePath = require.resolve('../miniprogram/pages/schedule/index.js');
  const previousPage = global.Page;
  const previousModule = require.cache[pagePath];
  let definition;
  global.Page = (value) => { definition = value; };
  try { delete require.cache[pagePath]; require(pagePath); }
  finally {
    global.Page = previousPage;
    if (previousModule) require.cache[pagePath] = previousModule;
    else delete require.cache[pagePath];
  }
  [ready, finished, singles].forEach(({ data }) => {
    const page = { ...definition, openid: '__ui_owner', data: globalThis.structuredClone(definition.data),
      setData(patch) { Object.assign(this.data, patch); }, refreshAvatarDisplays: async () => {} };
    page.applyTournament(data.tournament);
    ['statusText', 'canFinishTournament', 'showFinishedShareActions', 'finishCompletedMatches', 'finishRemainingMatches', 'heroMatchText']
      .forEach((key) => assert.equal(data[key], page.data[key], key));
    const rows = page.data.roundsUi[0].matchesUi;
    assert.equal(rows[0].leftScoreText, data.roundsUi[0].matchesUi[0].leftScoreText);
    assert.equal(rows[0].rightScoreText, data.roundsUi[0].matchesUi[0].rightScoreText);
    assert.equal(rows[1].statusText, data.roundsUi[0].matchesUi[1].statusText);
    if (data.tournament.mode === 'singles_round_robin') {
      ['heroPendingText', 'heroProgressPercent', 'heroSummaryText'].forEach((key) => assert.equal(data[key], page.data[key], key));
      assert.equal(rows[0].scorerText, '录分：阿杰');
      assert.equal(rows[0].leftTeam.avatarItems.length, 1);
      assert.equal(rows[0].rightTeam.avatarItems.length, 1);
    }
  });
});

test('cached background polling remains silent and confirmed offline retains content with a refresh banner', () => {
  const syncStatus = require('../miniprogram/core/syncStatus');
  const silent = screenshotTool.cases.scheduleCachedPollingSilent;
  const offline = screenshotTool.cases.scheduleOffline;
  [silent, offline].forEach((item) => {
    const expected = syncStatus.buildSyncBannerState(item.data);
    Object.entries(expected).forEach(([key, value]) => assert.equal(item.data[key], value, key));
    assert.equal(item.data.syncUsingCache, true);
    assert.equal(item.data.syncPollingFallback, true);
    assert.deepEqual(item.data.tournament, screenshotTool.cases.scheduleManualFinishReady.data.tournament);
    assert.deepEqual(item.data.roundsUi, screenshotTool.cases.scheduleManualFinishReady.data.roundsUi);
    assert.equal(item.data.loadError, false);
  });
  assert.equal(silent.data.networkOffline, false);
  assert.equal(silent.data.syncRefreshing, true);
  assert.equal(silent.data.syncStatusVisible, false);
  assert.equal(silent.data.syncStatusText, '');
  assert.deepEqual(silent.selectorExpectations['.sync-banner'], { expectedCount: 1, visible: false, expectedVisibleCount: 0 });
  assert.equal(silent.styleExpectations, undefined, 'native hidden geometry does not imply computed display:none');
  assert.equal(offline.data.networkOffline, true);
  assert.equal(offline.data.syncStatusText, '当前离线');
  assert.equal(offline.data.syncStatusActionText, '刷新');
  assert.equal(offline.selectorExpectations['.sync-banner-action'], 1);
  [silent, offline].forEach((item) => {
    assert.equal(item.data.nextActionText, '继续录分');
    assert.equal(item.data.canFinishTournament, true);
    assert.equal(item.selectorExpectations['.hero-primary'], 1);
    assert.equal(item.selectorExpectations['.manual-finish-btn'], 1);
  });
});

test('zero and one player singles draft screenshots derive the real blocked-start roster guidance', () => {
  const lobbyVm = require('../miniprogram/pages/lobby/lobbyViewModel');
  [0, 1].forEach((count) => {
    const item = screenshotTool.cases[`singlesLobby${count}`];
    const data = item.data;
    assert.equal(data.tournament.players.length, count);
    assert.equal(data.tournament.status, 'draft');
    assert.equal(data.tournament.rounds.length, 0);
    const actual = lobbyVm.buildLobbyViewModel({ tournament: data.tournament, openid: data.tournament.creatorId }).patch;
    ['checkPlayersOk', 'checkStartReady', 'primaryTaskKey', 'primaryTaskTitle', 'primaryTaskSummary', 'nextActionKey']
      .forEach((key) => assert.equal(data[key], actual[key], key));
    assert.equal(data.checkStartReady, false);
    assert.equal(data.checkPlayersOk, false);
    assert.equal(data.primaryTaskKey, 'import_players');
    assert.equal(data.primaryTaskTitle, '调整名单');
    assert.equal(data.primaryTaskSummary, '需要 2–8 人');
    assert.notEqual(data.nextActionKey, 'start');
    assert.equal(item.selectorExpectations[count ? '.player-cell' : '.player-grid-empty'], 1);
  });
});

test('co-manager screenshots derive real owner, bound member, guest and revoked role states', () => {
  const lobbyVm = require('../miniprogram/pages/lobby/lobbyViewModel');
  const names = ['lobbyCoManagerOwner', 'lobbyCoManagerOwnerBusy', 'lobbyCoManagerMember', 'lobbyCoManagerRevoked'];
  names.forEach((name) => assert.ok(screenshotTool.cases[name], name));
  const owner = screenshotTool.cases.lobbyCoManagerOwner.data;
  const member = screenshotTool.cases.lobbyCoManagerMember.data;
  const revoked = screenshotTool.cases.lobbyCoManagerRevoked.data;
  assert.equal(owner.showCoManagerManagement, true);
  assert.equal(owner.coManagerCandidates.find((item) => item.id === 'guest_ui').canGrant, false);
  assert.equal(owner.coManagerCandidates.filter((item) => item.canGrant).length, 2);
  assert.equal(screenshotTool.cases.lobbyCoManagerOwnerBusy.data.coManagerBusy, true);
  assert.equal(member.isAdmin, false);
  assert.equal(member.canManageTournament, true);
  assert.equal(member.showCoManagerManagement, false);
  assert.equal(member.showDraftAdminPanel, true);
  assert.equal(revoked.canManageTournament, false);
  assert.equal(revoked.showDraftAdminPanel, false);
  assert.equal(revoked.canEditScore, true);
  [member, revoked].forEach((data) => {
    const actual = lobbyVm.buildLobbyViewModel({ tournament: data.tournament, openid: '__ui_member' }).patch;
    ['isAdmin', 'isCoManager', 'canManageTournament', 'showCoManagerManagement', 'showDraftAdminPanel', 'canEditScore']
      .forEach((key) => assert.equal(data[key], actual[key], key));
  });
  const settings = screenshotTool.cases.settingsCoManager.data;
  assert.equal(settings.isAdmin, false);
  assert.equal(settings.canManageTournament, true);
  assert.equal(settings.canConfigureSettings, true);
  assert.ok(screenshotTool.cases.settingsCoManager.selectors.includes('.settings-save'));
});

test('new-feature fixtures only declare local data and never call business methods or pin receipt width', () => {
  const names = ['tournamentList', 'tournamentListEmpty', 'tournamentListError', 'tournamentListLoading',
    'scheduleManualFinishReady', 'scheduleManualFinishBusy', 'scheduleManualFinished',
    'scheduleCachedPollingSilent', 'scheduleOffline',
    ...Object.keys(screenshotTool.cases).filter((name) => name.startsWith('singles')),
    'lobbyCoManagerOwner', 'lobbyCoManagerOwnerBusy', 'lobbyCoManagerMember', 'lobbyCoManagerRevoked', 'settingsCoManager'];
  names.forEach((name) => {
    const item = screenshotTool.cases[name];
    assert.ok(item, name);
    assert.equal(item.fixture, undefined, `${name} must not invoke page methods`);
    assert.equal(item.storageFixture, undefined, `${name} must not inject identities into storage`);
    assert.equal(item.expectedWindowWidth, undefined);
    assert.equal(item.strictReceipt, undefined);
    assert.doesNotMatch(JSON.stringify(item), /https?:\/\//);
    const dom = item.selectors.flatMap((selector) => {
      const expectation = item.selectorExpectations && item.selectorExpectations[selector];
      const count = typeof expectation === 'number' ? expectation : (expectation && expectation.expectedCount || 1);
      const size = expectation && expectation.expectedVisibleCount === 0 ? { width: 0, height: 0 } : { width: 100, height: 48 };
      return Array.from({ length: count }, (_, index) => ({ selector, index, size }));
    });
    assert.equal(screenshotTool.validateSelectorCoverage(dom, item.selectors, item.selectorExpectations).ok, true,
      `${name} must use selector counts supported by the real runner`);
  });
});

test('singles screenshot selector counts match the rendered schedule, scoring, tied ranks and share projections', () => {
  ['singlesSettings6', 'settingsCoManager'].forEach((name) => {
    const item = screenshotTool.cases[name];
    assert.ok(item.selectors.includes('.settings-save'));
    assert.equal(item.selectorExpectations['.settings-save'], 1);
    assert.equal(item.data.tournament.status, 'draft');
    assert.equal(item.data.canManageTournament && item.data.canConfigureSettings, true);
  });
  const lobby = screenshotTool.cases.singlesLobby6;
  assert.ok(lobby.selectors.includes('.quick-settings-save'));
  assert.equal(lobby.selectorExpectations['.quick-settings-save'], 1);
  assert.equal(lobby.data.adminPanelExpanded && lobby.data.showDraftAdminPanel && lobby.data.canConfigureSettings, true);
  const schedule = screenshotTool.cases.singlesSchedule7;
  const rounds = schedule.data.roundsUi;
  assert.equal(schedule.selectorExpectations['.round-card'], rounds.length);
  assert.equal(schedule.selectorExpectations['.round-title'], rounds.length);
  assert.equal(schedule.selectorExpectations['.match-card'], rounds.flatMap((round) => round.matchesUi).length);
  assert.equal(schedule.selectorExpectations['.rest'], rounds.filter((round) => round.restText).length);
  assert.equal(schedule.selectorExpectations['.count-pill-active'], rounds.filter((round) => round.isCurrentRound).length);
  const match = screenshotTool.cases.singlesMatch21;
  assert.equal(match.data.canEdit, true);
  assert.equal(match.data.canRetryAction, false);
  assert.equal(match.selectorExpectations['.score-submit-tray .btn-primary'], 1);
  assert.equal(match.data.match.teamA.length, 1);
  assert.equal(match.data.match.teamB.length, 1);
  assert.equal(match.data.pointsPerGame, 21);
  assert.deepEqual([match.data.displayScoreA, match.data.displayScoreB], ['22', '20']);
  assert.equal(match.data.scoreOptions[match.data.scoreAIndex], match.data.scoreA);
  assert.equal(match.data.scoreOptions[match.data.scoreBIndex], match.data.scoreB);
  assert.equal(match.selectorExpectations['.score-wheel'], 2);
  assert.equal(match.selectorExpectations['.score-player-name'], [match.data.pair1Text, match.data.pair2Text].filter(Boolean).length);
  const ranked = screenshotTool.cases.singlesRankingTied;
  assert.deepEqual(ranked.data.rankings.map((row) => row.rank), [1, 1, 3, 3]);
  assert.equal(ranked.selectorExpectations['.ranking-card'], ranked.data.rankings.length);
  assert.equal(ranked.selectorExpectations['.ranking-card-1st'], ranked.data.rankings.filter((row) => row.rank === 1).length);
  assert.equal(ranked.selectorExpectations['.ranking-card-3rd'], ranked.data.rankings.filter((row) => row.rank === 3).length);
  const shared = screenshotTool.cases.singlesShareTied;
  assert.equal(shared.data.preview.showRankingPreview, true);
  assert.ok(shared.data.preview.secondaryAction && shared.data.preview.secondaryCtaText);
  assert.equal(shared.selectorExpectations['.share-actions .btn'], 2);
  assert.deepEqual(shared.data.preview.rankingPreview.map((row) => row.rank), [1, 1, 3]);
  assert.equal(shared.selectorExpectations['.ranking-preview-row'], shared.data.preview.rankingPreview.length);
});

test('real page-data isolation discards a late recovery response without business writes', async () => {
  const previousPages = global.getCurrentPages;
  const vm = require('node:vm');
  let definition;
  let resolvePage;
  const pendingPage = new Promise((resolve) => { resolvePage = resolve; });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/tournament-list/index.js'), 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      if (name === '../../core/tournamentRecovery') return { getPage: () => pendingPage };
      if (name === '../../core/cloud') return {};
      if (name === '../../core/nav') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const page = { ...definition, _requestSeq: 4, data: { ...definition.data },
    setData(patch) { Object.assign(this.data, patch); } };
  const load = page.loadList(true);
  global.getCurrentPages = () => [page];
  try {
    const result = await screenshotTool.isolatePageDataRuntime({ evaluate: async (fn, phase) => fn(phase) }, 'before');
    assert.equal(result.ok, true);
    assert.equal(result.generations._requestSeq, 1000005);
    page.setData(globalThis.structuredClone(screenshotTool.cases.tournamentListEmpty.data));
    resolvePage({ items: [{ id: 'late remote response' }], hasMore: true, cursor: 'late' });
    await load;
    assert.deepEqual(page.data, screenshotTool.cases.tournamentListEmpty.data);
    assert.deepEqual(result.methodCalls, []);
  } finally {
    global.getCurrentPages = previousPages;
  }
});

test('V2 water screenshots record native runtime provenance and viewport width', () => {
  assert.match(screenshotScript, /WEAPP_PROJECT_PATH/);
  assert.match(screenshotScript, /automator\.connect\(\{\s*wsEndpoint:/);
  assert.doesNotMatch(screenshotScript, /await\s+automator\.launch\s*\(/);
  assert.match(prewarmScript, /launched\s*=\s*await\s+screenshotTool\.timeout\(\s*automator\.launch\s*\(/);
  assert.match(prewarmScript, /\}\), launchAllowance, 'Startup automation launch'/);
  assert.equal((prewarmScript.match(/automator\.launch\(/g) || []).length, 1);
  assert.match(prewarmScript, /process\.env\.NW_PRE_ARGS/);
  assert.match(prewarmScript, /validateBackgroundCaptureProcessFlags/);
  assert.match(screenshotScript, /sourceProjectPath/);
  assert.match(screenshotScript, /miniProgram\.send\('Tool\.getInfo'\)/);
  assert.match(screenshotScript, /miniProgram\.send\('App\.getCurrentPage'\)/);
  assert.match(screenshotScript, /miniProgram\.systemInfo\(\)/);
  assert.match(screenshotScript, /windowWidth/);
  assert.match(screenshotScript, /toolInfo/);
  assert.match(screenshotScript, /currentPageInfo/);
});

test('exact-worktree launch normalizes a Windows cli.bat through the official wrapper', () => {
  assert.match(screenshotScript, /function resolveLaunchCommand\(requestedCliPath, options = \{\}\)/);
  assert.match(screenshotScript, /path\.extname\(requestedCliPath\)\.toLowerCase\(\) !== '\.bat'/);
  assert.match(screenshotScript, /executable:\s*'cmd'/);
  assert.match(screenshotScript, /args:\s*\['\/d', '\/s', '\/c', 'call', requestedCliPath\]/);
  assert.doesNotMatch(screenshotScript, /await\s+automator\.launch\s*\(|Tool\.close|App\.exit|SetForegroundWindow|SendInput/);
  assert.doesNotMatch(prewarmScript, /miniProgram\.close\s*\(|send\(['"](?:Tool\.close|App\.exit)|SetForegroundWindow|SendInput/);
});

test('focus acceptance probe samples without injecting focus or input', () => {
  assert.match(focusProbeScript, /GetForegroundWindow/);
  assert.match(focusProbeScript, /GetWindowThreadProcessId/);
  assert.match(focusProbeScript, /function Read-Utf8JsonFile/);
  assert.match(focusProbeScript, /UTF8Encoding\]::new\(\$false, \$true\)/);
  assert.doesNotMatch(focusProbeScript, /Get-Content[^\r\n]+ConvertFrom-Json/);
  assert.match(focusProbeScript, /sampleIntervalMs -lt 20 -or \$sampleIntervalMs -gt 50/);
  assert.doesNotMatch(focusProbeScript, /SetForegroundWindow|SendInput|mouse_event|keybd_event/);
  assert.match(focusProbeScript, /Resolve-TargetDevToolsProcess/);
  assert.match(focusProbeScript, /verified-executable-outside-devtools-root/);
  assert.match(focusProbeScript, /Get-NormalizedPath \(\[string\]\$candidate\.Path\)/);
  assert.doesNotMatch(focusProbeScript, /Get-CimInstance Win32_Process/);
  assert.match(focusProbeScript, /focus-probe-no-publish-v1/);
  assert.match(focusProbeScript, /unknownClassificationCount/);
  assert.match(focusProbeScript, /samplingReliable/);
  assert.match(focusProbeScript, /weapp-ui-session-poison-v1/);
  assert.match(focusProbeScript, /\.recovering\.json/);
  assert.match(focusProbeScript, /WEAPP_FOCUS_PROBE_ID/);
  assert.match(focusProbeScript, /WEAPP_CAPTURE_RUN_ID/);
  assert.match(focusProbeScript, /inputInjectionProbe = 'not-instrumented'/);
  assert.match(focusProbeScript, /\[IO\.Path\]::IsPathRooted/);
  assert.match(focusProbeScript, /warmDurationMs/);
  assert.match(focusProbeScript, /Session poison marker failed post-write identity verification/);
  assert.match(focusProbeScript, /if \(\$poisonWritten\) \{[\s\S]*?\$killAttempted = \$true/);
  assert.match(focusProbeScript, /Kill was not attempted because the session poison marker could not be verified/);
  assert.equal(
    focusProbeScript.indexOf('$warmClock.Stop()') < focusProbeScript.indexOf('$probeClock = [Diagnostics.Stopwatch]::StartNew()'),
    true
  );
  assert.doesNotMatch(focusProbeScript, /inputInjected\s*=\s*\$false/);
});

test('non-water screenshot data injection invalidates page and score-lock async work', () => {
  assert.match(screenshotScript, /invalidateFetchSeq/);
  assert.match(screenshotScript, /invalidateWatchGen/);
  assert.match(screenshotScript, /clearLockTimers/);
  assert.match(screenshotScript, /_profileSyncSeq/);
  assert.match(screenshotScript, /applyCaseStorageFixture/);
  assert.match(screenshotScript, /restoreCaseStorageFixture/);
});

test('a CLI-preopened exact project can connect without losing source provenance', () => {
  assert.match(screenshotScript, /mode:\s*'connect-preopened'/);
  assert.match(screenshotScript, /sourceProjectPath/);
  assert.match(screenshotScript, /sessionBinding/);
  assert.doesNotMatch(screenshotScript, /WEAPP_LAUNCH_EXACT/);
});

test('V2 water screenshot fixtures preserve roster, paging and ledger invariants', () => {
  const empty = waterV2Fixtures.ownerEmpty.roomData;
  const member24 = waterV2Fixtures.member24.roomData;
  const visitorLong = waterV2Fixtures.visitorLong.roomData;

  assert.equal(empty.room.participants.length, 2);
  assert.equal(empty.round.recordCount, 0);
  assert.equal(empty.round.eventCount, 0);
  assert.equal(empty.round.ledger.reduce((sum, row) => sum + row.net, 0), 0);

  assert.equal(member24.room.participants.length, 24);
  assert.equal(member24.room.participants.some((participant) => !participant.claimed), true);
  assert.equal(member24.round.ledger.reduce((sum, row) => sum + row.net, 0), 0);

  assert.equal(visitorLong.viewer.role, 'visitor');
  assert.equal(visitorLong.entries.length, 20);
  assert.equal(visitorLong.round.recordCount, 1000);
  assert.equal(visitorLong.page.hasMore, true);
  assert.equal(visitorLong.page.nextBeforeSeq, 1229);
  assert.equal(visitorLong.entries.some((entry) => entry.eventType === 'entry_corrected'), true);
  assert.equal(visitorLong.entries.some((entry) => entry.eventType === 'entry_reversed'), true);
});

test('directly injected detail and archive fixtures include their display descriptions', () => {
  const detail = waterV2Fixtures.entryDetail.pageData;
  const directDecoratedEntries = [
    detail.entryDetail,
    ...detail.entryHistory,
    ...waterV2Fixtures.archivedRound.pageData.historyRoundFeed,
  ];

  directDecoratedEntries.forEach((entry) => {
    assert.equal(typeof entry.displayDescription, 'string');
    assert.equal(entry.displayDescription.replace(/\u00a0/g, ' '), entry.description);
  });
  [detail.entryDetail, ...detail.entryHistory].forEach((entry) => {
    assert.doesNotMatch(entry.displayDescription, /\d+ 水/);
    assert.match(entry.displayDescription, /\d+\u00a0水/);
  });
});

test('direct water screenshot fixture keeps its visible selection and validation state aligned', () => {
  const direct = waterV2Fixtures.memberDirect.pageData;

  assert.equal(direct.directSelectionValid, true);
  assert.equal(direct.directValidationMessage, '双方不同，可以记水');
});

test('member24Game deterministically selects a real 12v12 draft', () => {
  const methods = waterV2Fixtures.member24Game.methods;
  const postData = waterV2Fixtures.member24Game.postData;
  const toggles = methods.filter((method) => method.name === 'onToggleGamePlayer');
  const sideSwitch = methods.findIndex((method) => method.name === 'onSelectGameSide');
  const selectedIds = toggles.map((method) => method.args[0].currentTarget.dataset.id);

  assert.equal(methods[0].name, 'openGameSheet');
  assert.equal(toggles.length, 24);
  assert.equal(new Set(selectedIds).size, 24);
  assert.deepEqual(selectedIds.slice(0, 12), Array.from({ length: 12 }, (_, index) => `p${index + 1}`));
  assert.deepEqual(selectedIds.slice(12), Array.from({ length: 12 }, (_, index) => `p${index + 13}`));
  assert.equal(sideSwitch, 13, 'the selector must switch to losers after the first 12 players');
  assert.equal(methods[sideSwitch].args[0].currentTarget.dataset.side, 'loser');
  assert.deepEqual(
    methods.slice(-2).map((method) => [method.name, method.args[0].currentTarget.dataset.side]),
    [['onSelectGameSide', 'winner'], ['onSelectGameSide', 'loser']],
    'the final real side changes must bring selected losers into the first row',
  );
  assert.equal(Object.prototype.hasOwnProperty.call(postData, 'gameParticipants'), false);
  assert.equal(postData.gameSelectionValid, true);
  assert.equal(postData.gameValidationMessage, '双方人数相同，可提交');
  assert.equal(postData.hasLongGameNames, true);
  assert.match(postData.winnerFullSummary, /周末限定超长昵称球友/);
  assert.match(postData.winnerFullSummary, /羽球新手小陈同学/);
  assert.match(postData.loserFullSummary, /小宇.*佳佳/);
});

test('every V2 room fixture keeps eventCount, latestSeq and loaded entry seq consistent', () => {
  Object.entries(waterV2Fixtures)
    .filter(([, fixture]) => fixture && fixture.roomData)
    .forEach(([name, fixture]) => {
      const data = fixture.roomData;
      const seqs = data.entries.map((entry) => Number(entry.seq));
      assert.equal(data.round.eventCount, data.page.latestSeq, `${name}: eventCount/latestSeq`);
      assert.equal(data.round.nextSeq, data.page.latestSeq + 1, `${name}: nextSeq`);
      if (!seqs.length) {
        assert.equal(data.page.latestSeq, 0, `${name}: empty page latestSeq`);
        return;
      }
      assert.equal(seqs[0], data.page.latestSeq, `${name}: newest entry`);
      assert.equal(seqs.at(-1), data.page.nextBeforeSeq, `${name}: older cursor`);
      assert.equal(seqs.every((seq, index) => index === 0 || seq === seqs[index - 1] - 1), true, `${name}: contiguous descending seq`);
    });
});

test('V2 sheet, correction, detail, archive and error cases inherit the signed 320/390/430 session width', () => {
  const expected = [
    'waterV2MemberDirect',
    'waterV2MemberCorrection',
    'waterV2OwnerCorrectionLong',
    'waterV2EntryDetail',
    'waterV2ArchivedRound',
    'waterV2SheetError',
    'water',
  ];
  assert.ok(screenshotTool.cases);
  expected.forEach((name) => {
    const item = screenshotTool.cases[name];
    assert.ok(item, `${name} must exist`);
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'expectedWindowWidth'), false,
      `${name} must follow config.expectedWindowWidth from the signed session`);
    assert.ok(item.fixture && item.fixture.roomData, `${name} must use a deterministic room fixture`);
  });
  // This removes only the stale per-case 390 override. The actual viewport still
  // has to equal the configured signed width; a drift cannot become evidence.
  for (const width of [320, 390, 430]) {
    const evidence = { expectedWindowWidth: width, systemInfo: { windowWidth: width } };
    assert.equal(screenshotTool.validateReceiptEvidence(evidence).checks.expectedWidth, true);
    assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence,
      systemInfo: { windowWidth: width + 1 } }).checks.expectedWidth, false);
  }
  assert.deepEqual(screenshotTool.manualActions, [
    '原生 picker 展开态与滚轮选择',
    '系统确认 modal 的确认与取消',
    '键盘弹起时输入区、safe-area 与内部滚动',
  ]);
});

test('fixture injection invalidates async generations and cleanup rebuilds a neutral page', async () => {
  const calls = [];
  const miniProgram = {
    async evaluate(fn, phase) {
      if (typeof phase === 'undefined') {
        return { available: true, length: 1, route: 'pages/launch/index' };
      }
      calls.push(`isolate:${phase}`);
      return { ok: true, phase, loadRequestSeq: 101, feedRequestSeq: 102, detailRequestSeq: 103, pollingFrozen: true };
    },
    async reLaunch(target) {
      calls.push(`reLaunch:${target}`);
      return { path: 'pages/launch/index', query: {} };
    },
    async send(command) {
      assert.equal(command, 'App.getCurrentPage');
      return { path: 'pages/launch/index', query: {} };
    },
  };
  const page = {
    async callMethod(name) { calls.push(`method:${name}`); },
    async setData() { calls.push('setData'); },
  };

  const isolation = await screenshotTool.applyFixture(page, waterV2Fixtures.ownerEmpty, miniProgram);
  const cleanup = await screenshotTool.cleanupFixture(page, miniProgram);

  assert.equal(calls[0], 'isolate:before');
  assert.equal(calls[1], 'method:applyRoomData');
  assert.equal(calls.at(-1), 'reLaunch:/pages/launch/index');
  assert.equal(isolation.pollingFrozen, true);
  assert.equal(cleanup.ok, true);
  assert.equal(cleanup.strategy, 'neutral-route-rebuild');
  assert.match(screenshotScript, /_loadRequestSeq/);
  assert.match(screenshotScript, /_feedRequestSeq/);
  assert.match(screenshotScript, /_detailRequestSeq/);
  assert.match(screenshotScript, /clearRefreshTimer/);
  assert.match(screenshotScript, /_isVisible\s*=\s*false/);
});

test('run cleanup fails closed unless reLaunch proves a one-page neutral stack', async () => {
  const miniProgram = {
    async reLaunch() { return { path: 'pages/launch/index' }; },
    async send(command) {
      assert.equal(command, 'App.getCurrentPage');
      return { path: 'pages/launch/index' };
    },
    async evaluate() {
      return { available: true, length: 2, route: 'pages/launch/index' };
    },
  };
  await assert.rejects(
    screenshotTool.cleanupCaptureRun(miniProgram),
    /one-page neutral rebuild/
  );
});

test('strict receipt validation accepts proportional DevTools PNG scaling and rejects malformed geometry', () => {
  const evidence = {
    expectedWindowWidth: 390,
    expectedRoute: '/pages/water/index?id=demo',
    toolInfo: { SDKVersion: '3.8.10', projectPath: path.resolve('fixture-project') },
    currentPageInfo: { path: 'pages/water/index', query: { id: 'demo' } },
    systemInfo: { windowWidth: 390, windowHeight: 753, pixelRatio: 3, fontSizeSetting: 16 },
    png: { valid: true, width: 717, height: 1384, sha256: 'a'.repeat(64), byteLength: 32000 },
    git: {
      ok: true,
      head: 'b'.repeat(40),
      dirty: true,
      status: [' M miniprogram/pages/water/index.js'],
      files: [{ path: 'miniprogram/pages/water/index.js', exists: true, sha256: 'c'.repeat(64) }],
    },
    selectorCoverage: { ok: true },
    horizontalOverflow: { ok: true, overflow: 0 },
    projectProvenance: { ok: true, mode: 'launch' },
    horizontalAlignment: null,
    caseData: { ok: true, fixtureNonce: '1'.repeat(32), stateBeforeHash: '2'.repeat(64), stateAfterHash: '2'.repeat(64) },
  };
  evidence.expectedGitManifestHash = screenshotTool.hashCanonical(evidence.git);
  assert.equal(screenshotTool.validateReceiptEvidence(evidence).ok, true);

  const broken = [
    { caseData: null },
    { caseData: { ...evidence.caseData, fixtureNonce: '' } },
    { caseData: { ...evidence.caseData, stateAfterHash: '3'.repeat(64) } },
    { toolInfo: { ...evidence.toolInfo, SDKVersion: '' } },
    { currentPageInfo: { path: 'pages/launch/index' } },
    { currentPageInfo: { path: 'pages/water/index', query: { id: 'wrong' } } },
    { systemInfo: { ...evidence.systemInfo, fontSizeSetting: 0 } },
    { png: { ...evidence.png, height: 1400 } },
    { png: { ...evidence.png, width: 0, height: 0 } },
    { systemInfo: { ...evidence.systemInfo, pixelRatio: 0 } },
    { git: { ...evidence.git, head: '' } },
    { git: { ...evidence.git, files: [] } },
    { expectedGitManifestHash: 'd'.repeat(64) },
    { horizontalOverflow: { ok: false, overflow: 4 } },
    { projectProvenance: { ok: false } },
    { horizontalAlignment: { ok: false } },
  ];
  broken.forEach((patch) => {
    assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, ...patch }).ok, false);
  });
});

test('PNG inspection decodes chunks and rejects header-only lookalikes', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  const inspected = screenshotTool.inspectPngBuffer(png);
  assert.equal(inspected.valid, true);
  assert.equal(inspected.width, 1);
  assert.equal(inspected.height, 1);
  assert.match(inspected.sha256, /^[a-f0-9]{64}$/);
  const headerOnly = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(headerOnly, 0);
  headerOnly.writeUInt32BE(13, 8);
  headerOnly.write('IHDR', 12, 'ascii');
  headerOnly.writeUInt32BE(780, 16);
  headerOnly.writeUInt32BE(1688, 20);
  assert.equal(screenshotTool.inspectPngBuffer(headerOnly).valid, false);
  assert.equal(screenshotTool.inspectPngBuffer(Buffer.from('not png')).valid, false);
});

test('connect-preopened provenance fails closed without exact Tool path or a valid runtime session binding', () => {
  const projectPath = path.resolve('fixture-project');
  const connection = {
    mode: 'connect-preopened',
    sourceProjectPath: projectPath,
    endpoint: 'ws://127.0.0.1:39421',
  };
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath: '' },
  }).ok, false);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection: {
      ...connection,
      sessionBinding: {
        ok: true,
        sessionValidation: { checks: { projectBinding: true } },
      },
    },
    toolInfo: { projectPath: '' },
  }).ok, true);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection: { ...connection, sessionBinding: { ok: false } },
    toolInfo: { projectPath: '' },
  }).ok, false);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath },
  }).ok, true);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath: path.resolve('other-project') },
  }).ok, false);
});

test('settings capture fixtures match real owner, co-manager and read-only permissions and save visibility', () => {
  const settingsVm = require('../miniprogram/pages/settings/settingsViewModel');
  const owner = screenshotTool.cases.settings;
  const member = screenshotTool.cases.settingsCoManager;
  const viewer = { data: { ...member.data, isAdmin: false, canManageTournament: false } };
  [
    { name: 'owner', item: owner, openid: '__ui_settings_owner', isAdmin: true, canManageTournament: true },
    { name: 'co-manager', item: member, openid: '__ui_member', isAdmin: false, canManageTournament: true },
    { name: 'read-only', item: viewer, openid: '__ui_unbound_viewer', isAdmin: false, canManageTournament: false },
  ].forEach(({ name, item, openid, isAdmin, canManageTournament }) => {
    const actual = settingsVm.buildSettingsFormState(item.data.tournament, { openid });
    assert.equal(actual.isAdmin, isAdmin, name + ' real owner marker');
    assert.equal(actual.canManageTournament, canManageTournament, name + ' real management ability');
    ['isAdmin', 'canManageTournament'].forEach((key) => assert.equal(item.data[key], actual[key], name + ' ' + key));
  });
  assert.match(owner.data.tournament.creatorId, /^__ui_/);
  [owner, member].forEach((item) => {
    assert.equal(item.selectors.filter((selector) => selector === '.settings-save').length, 1);
    assert.equal(item.selectorExpectations['.settings-save'], 1);
    assert.equal(item.data.canManageTournament && item.data.tournament.status === 'draft' && item.data.canConfigureSettings, true);
    assert.equal(item.fixture, undefined);
    assert.equal(item.storageFixture, undefined);
  });
  assert.equal(viewer.data.canManageTournament && viewer.data.tournament.status === 'draft' && viewer.data.canConfigureSettings, false);
});

function localCapturePage(relativePath) {
  const pagePath = require.resolve(`../miniprogram/${relativePath}`);
  const previousPage = global.Page;
  const previousModule = require.cache[pagePath];
  let definition;
  global.Page = (value) => { definition = value; };
  try { delete require.cache[pagePath]; require(pagePath); }
  finally {
    global.Page = previousPage;
    if (previousModule) require.cache[pagePath] = previousModule;
    else delete require.cache[pagePath];
  }
  return { ...definition, data: globalThis.structuredClone(definition.data),
    _pageActive: false, _isVisible: false,
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback.call(this); } };
}

function runLocalCaptureFixture(name) {
  const item = screenshotTool.cases[name];
  const page = localCapturePage(item.path.split('?')[0].replace(/^\//, ''));
  const fixture = item.fixture;
  if (fixture.roomData) page.applyRoomData(fixture.roomData);
  if (fixture.pageData) page.setData(fixture.pageData);
  for (const method of fixture.methods || []) page[method.name](...(method.args || []));
  assert.equal(fixture.postData, undefined, `${name} must not replace derived state`);
  return page;
}

test('schedule filter captures derive draft selection, applied rows and an empty result through real page handlers', () => {
  const playerSheet = runLocalCaptureFixture('schedulePlayerFilterSheet');
  assert.equal(playerSheet.data.showPlayerFilterSheet, true);
  assert.equal(playerSheet.data.playerFilterOptions.length, 2);
  assert.equal(playerSheet.data.playerFilterDraftMode, 'not_contains');
  assert.equal(playerSheet.data.avatarFilterMode, 'contains', 'sheet selection is still a draft');
  playerSheet.closePlayerFilterSheet();
  assert.equal(playerSheet.data.playerFilterDraftMode, 'contains');

  const statusSheet = runLocalCaptureFixture('scheduleStatusFilterSheet');
  assert.equal(statusSheet.data.showStatusFilterSheet, true);
  assert.equal(statusSheet.data.statusFilterOptions.length, 4);
  assert.equal(statusSheet.data.statusFilterDraftValue, 'finished');
  assert.equal(statusSheet.data.statusFilter, 'all');

  const selected = runLocalCaptureFixture('scheduleFilterSelected');
  assert.equal(selected.data.showStatusFilterSheet, false);
  assert.equal(selected.data.statusFilter, 'finished');
  assert.equal(selected.data.statusFilterLabel, '已结束');
  assert.equal(selected.data.selectedPlayersUi.length, 1);
  assert.deepEqual(selected.data.roundsUi.flatMap((round) => round.matchesUi).map((match) => match.status), ['finished']);

  const empty = runLocalCaptureFixture('scheduleFilterEmpty');
  assert.equal(empty.data.showPlayerFilterSheet, false);
  assert.equal(empty.data.avatarFilterMode, 'not_contains');
  assert.equal(empty.data.filterEmptyText, '暂无符合条件的对阵');
  assert.equal(empty.data.roundsUi.length, 0);
  assert.equal(empty.data.showFilterBar, true);
  assert.equal(empty.data.selectedPlayersUi.length, 1);
  empty.onClearSelectedPlayers();
  assert.equal(empty.data.filterEmptyText, '');
  assert.equal(empty.data.roundsUi.flatMap((round) => round.matchesUi).length, 2);
});

test('24-player game and roster captures derive empty search and complete summaries without postData overrides', (t) => {
  const previousWx = global.wx;
  global.wx = { getStorageSync() {}, setStorageSync() {}, setNavigationBarTitle() {} };
  t.after(() => { global.wx = previousWx; });
  const cloud = require('../miniprogram/core/cloud');
  t.mock.method(cloud, 'call', () => { throw new Error('local display methods must not call cloud'); });

  const empty = runLocalCaptureFixture('waterV2GameSearchEmpty');
  assert.equal(empty.data.gameSheetOpen, true);
  assert.equal(empty.data.participantCount, 24);
  assert.equal(empty.data.gameParticipants.length, 0);
  assert.equal(empty.data.gameSearchQuery, '找不到的球友');
  assert.equal(empty.data.winnerIds.length, 12);
  assert.equal(empty.data.loserIds.length, 12);
  assert.equal(empty.data.gameSelectionValid, true, 'search does not discard the selected game');
  empty.clearGameSearch();
  assert.equal(empty.data.gameParticipants.length, 24);

  const expanded = runLocalCaptureFixture('waterV2GameSummaryExpanded');
  assert.equal(expanded.data.gameSummaryExpanded, true);
  for (const [side, ids] of [['winner', expanded.data.winnerIds], ['loser', expanded.data.loserIds]]) {
    const expected = ids.map((id) => expanded.data.participants.find((player) => player.id === id).name).join('、');
    assert.equal(expanded.data[`${side}FullSummary`], expected);
  }
  assert.equal(expanded.data.gameParticipants[0].loserSelected, true, 'the current loser side stays first');
  expanded.toggleGameSummary();
  assert.equal(expanded.data.gameSummaryExpanded, false);

  const roster = runLocalCaptureFixture('waterV2RosterSearchEmpty');
  assert.equal(roster.data.activeTab, 'players');
  assert.equal(roster.data.rosterParticipants.length, 0);
  assert.equal(roster.data.rosterSearchQuery, '找不到的球友');
  roster.clearRosterSearch();
  assert.equal(roster.data.rosterParticipants.length, 24);
});

test('paged recovery failure capture preserves the actual loaded rows and load-more state', async (t) => {
  const recovery = require('../miniprogram/core/tournamentRecovery');
  const expected = screenshotTool.cases.tournamentListPageError.data;
  const page = localCapturePage('pages/tournament-list/index.js');
  let count = 0;
  t.mock.method(recovery, 'getPage', async (cursor) => {
    if (++count === 1) return { items: expected.items, hasMore: true, cursor: '__ui_older' };
    assert.equal(cursor, '__ui_older');
    throw new Error(expected.error);
  });
  await page.loadList(true);
  assert.deepEqual(page.data, screenshotTool.cases.tournamentListMore.data);
  await page.loadMore();
  assert.deepEqual(page.data, expected);
  assert.equal(page._cursor, '__ui_older');
  assert.equal(page._lastLoadReset, false);
});

test('match capture matrix uses actual forbidden and canceled view states and the restored submit lock', () => {
  const vm = require('../miniprogram/pages/match/matchViewModel');
  for (const [name, openid] of [['matchForbidden', '__ui_spectator'], ['matchCanceled', '__ui_owner']]) {
    const data = screenshotTool.cases[name].data;
    const state = vm.buildTournamentViewState(data.tournament, { openid, tournamentId: data.tournamentId,
      roundIndex: data.roundIndex, matchIndex: data.matchIndex, lockState: data.lockState,
      currentScoreA: data.scoreA, currentScoreB: data.scoreB });
    for (const key of ['matchStatusText', 'canEdit', 'userCanScore', 'canUseScoreLock', 'displayScoreA', 'displayScoreB']) {
      assert.equal(data[key], state.data[key], `${name} ${key}`);
    }
    assert.equal((data.userCanScore && data.canUseScoreLock) || data.canRetryAction, false, 'no score-submit tray');
  }
  const busy = screenshotTool.cases.matchSubmitBusy.data;
  assert.equal(busy.submitBusy, true);
  assert.equal(busy.lockState, 'submitting');
  assert.equal(busy.canEdit, true, 'submit service retains the editable projection while the button is disabled');
  assert.equal(busy.lockHintText, vm.buildLockHint('submitting'));
  const failed = screenshotTool.cases.matchError.data;
  assert.equal(failed.lockState, 'locked_by_me');
  assert.equal(failed.canEdit, true);
  assert.equal(failed.canRetryAction, true);
  assert.equal(failed.hasScoreDraft, true);
  assert.equal(failed.lastFailedActionText, '提交比分');
  assert.equal(vm.normalizeLockState(failed.lockState), failed.lockState);
  assert.equal(screenshotTool.cases.matchLoadError.data.match, false);
  assert.equal(screenshotTool.cases.matchLoadError.data.loadError, true);
});

test('inherited tournament capture navigation uses production keys, active state and its own fixture ID', () => {
  const { getPrimaryNavItems } = require('../miniprogram/core/matchPrimaryNav');
  const affected = ['ranking', 'schedule', 'scheduleManualFinishReady', 'scheduleManualFinishBusy',
    'scheduleManualFinished', 'scheduleCachedPollingSilent', 'scheduleOffline', 'singlesSchedule7',
    'singlesRankingTied', 'singlesScheduleManualFinished', 'singlesScheduleManualFinishedResult'];
  for (const name of affected) assert.ok(screenshotTool.cases[name].data.primaryNavItems, name);
  for (const [name, item] of Object.entries(screenshotTool.cases)) {
    if (!item.data || !Array.isArray(item.data.primaryNavItems)) continue;
    const route = item.path.match(/^\/pages\/(lobby|ranking|schedule)\/index(?:\?|$)/);
    if (!route) continue;
    const current = route[1] === 'lobby' ? 'match' : route[1];
    const id = item.data.tournamentId || item.data.tournament._id;
    assert.ok(id, name);
    assert.deepEqual(item.data.primaryNavItems, getPrimaryNavItems(current, id), name);
    assert.deepEqual(item.data.primaryNavItems.map(({ key, text }) => [key, text]),
      [['match', '比赛'], ['ranking', '排名'], ['schedule', '对阵']], name);
    assert.deepEqual(item.data.primaryNavItems.filter(item => item.active).map(item => item.key), [current], name);
    for (const nav of item.data.primaryNavItems) {
      assert.match(nav.url, new RegExp(`tournamentId=${encodeURIComponent(id)}$`), name);
    }
  }
});

test('match load-error display uses a transport-readable falsy sentinel and preserves the strict two-field gate', () => {
  const { buildInitialData } = require('../miniprogram/pages/match/matchViewModel');
  const item = screenshotTool.cases.matchLoadError;
  assert.equal(buildInitialData().match, null, 'real Page initial state is unchanged');
  assert.deepEqual(item.data, { match: false, loadError: true });
  assert.equal(item.fixture, undefined, 'retain strict declared-data hashing');
  assert.equal(item.strictReceipt, undefined);
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/match/index.wxml'), 'utf8');
  assert.match(wxml, /class="container safe-bottom match-page" wx:if="\{\{match\}\}"/);
  assert.match(wxml, /class="container safe-bottom match-page" wx:elif="\{\{loadError\}\}"/);
  // The failed 430 receipt has the exact hash of {loadError:true}: null was
  // omitted by Page.getData(path), while false remains a readable field.
  const transport = Object.fromEntries(Object.entries(item.data).map(([key, value]) => [key, value === null ? undefined : value]));
  assert.equal(screenshotTool.hashCanonical(transport), screenshotTool.hashCanonical(item.data));
  assert.notEqual(screenshotTool.hashCanonical({ loadError: true }), screenshotTool.hashCanonical(item.data),
    'dropping match must still fail the declared-data hash');
  assert.notEqual(screenshotTool.hashCanonical({ match: true, loadError: true }), screenshotTool.hashCanonical(item.data));
});

test('schedule direct captures declare visible rounds while method captures retain production derivation', () => {
  for (const [name, item] of Object.entries(screenshotTool.cases)) {
    if (!/^\/pages\/schedule\/index(?:\?|$)/.test(item.path)) continue;
    if (item.fixture) {
      assert.equal(Object.hasOwn(item.fixture.pageData || {}, 'hasVisibleRounds'), false, name);
      assert.equal(Object.hasOwn(item.fixture.postData || {}, 'hasVisibleRounds'), false, name);
      continue;
    }
    assert.ok(Array.isArray(item.data.roundsUi), name);
    assert.equal(item.data.hasVisibleRounds, item.data.roundsUi.length > 0, name);
  }
  const selected = runLocalCaptureFixture('scheduleFilterSelected');
  assert.equal(selected.data.hasVisibleRounds, true);
  const empty = runLocalCaptureFixture('scheduleFilterEmpty');
  assert.equal(empty.data.hasVisibleRounds, false);
  empty.onClearSelectedPlayers();
  assert.equal(empty.data.hasVisibleRounds, true, 'the real clear handler restores visible rows');
});

test('share captures project complete local documents with consistent roster, lifecycle and selector contracts', () => {
  const share = require('../miniprogram/core/shareMeta');
  const ranking = require('../miniprogram/core/ranking');
  const fixtures = ['shareDraft', 'shareRunning', 'shareFinished', 'shareSquadChoice'];
  const ids = new Set();
  for (const name of fixtures) {
    const item = screenshotTool.cases[name];
    const tournament = item.data.tournament;
    const preview = item.data.preview;
    assert.match(tournament._id, /^__ui_share_/); ids.add(tournament._id);
    assert.equal(item.data.tournamentId, tournament._id);
    assert.match(item.path, new RegExp(`code=${tournament._id}$`));
    assert.equal(tournament.players.length, 6);
    assert.deepEqual(tournament.playerIds, tournament.players.map(player => player.id));
    assert.equal(tournament.creatorId, tournament.players[0].id);
    assert.equal(tournament.totalMatches, 6);
    assert.equal(tournament.courts, 1);
    assert.equal(tournament.rules.pointsPerGame, 21);
    assert.deepEqual(preview, share.buildShareEntryViewModel({ tournament, openid: '__ui_share_viewer' }), name);
    assert.equal(preview.playersCount, 6);
    assert.equal(preview.playersCountText, '6 人');
    assert.equal(preview.socialProofText, '已有 6 人加入');
    assert.equal(preview.playerLimit, 0, 'generic modes have no fixed rotation quota');
    assert.doesNotMatch(preview.primaryCtaReason, /满员/);
    assert.doesNotMatch(JSON.stringify(item), /https?:\/\//);
    assert.equal(item.fixture, undefined);
    assert.equal(item.storageFixture, undefined);
    assert.equal(item.strictReceipt, undefined);
    for (const player of tournament.players) assert.equal(player.avatar, '/assets/avatar-default.png');
    for (const selector of item.selectors) assert.ok(item.selectorExpectations[selector] > 0, `${name}: ${selector}`);
    if (tournament.status === 'draft') {
      assert.deepEqual(tournament.rounds, []);
      assert.deepEqual(tournament.rankings, []);
      assert.equal(preview.showParticipantPreview, true);
      assert.equal(preview.participantPreviewList.length, 6);
      assert.equal(preview.participantPreviewList.filter(player => player.showAvatar).length, 6);
      assert.equal(preview.joinAllowed, true);
      assert.equal(preview.joined, false);
      assert.equal(preview.primaryAction.key, 'join');
      assert.equal(preview.secondaryAction, null);
    } else {
      const matches = tournament.rounds.flatMap(round => round.matches);
      assert.equal(matches.length, tournament.totalMatches);
      const appearances = new Map(tournament.playerIds.map(id => [id, 0]));
      for (const match of matches) {
        const ids = match.teamA.concat(match.teamB).map(player => player.id);
        assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4);
        ids.forEach(id => appearances.set(id, appearances.get(id) + 1));
        if (match.status === 'finished') assert.ok(match.score.teamA > match.score.teamB);
        else assert.equal(match.score, undefined);
      }
      assert.deepEqual([...appearances.values()], [4, 4, 4, 4, 4, 4]);
      assert.equal(share.countRoundProgress(tournament.rounds).finishedMatches, tournament.status === 'running' ? 3 : 6);
      assert.deepEqual(tournament.rankings, ranking.computeRankings(tournament));
      assert.equal(preview.showRankingPreview, true);
      assert.equal(preview.showParticipantPreview, false);
      assert.equal(preview.rankingPreview.length, 3);
      assert.equal(item.selectorExpectations['.ranking-preview-row'], preview.rankingPreview.length);
      assert.equal(item.selectorExpectations['.share-actions .btn'], 2);
      assert.equal(preview.joinAllowed, false);
      assert.equal(preview.primaryAction.key, tournament.status === 'running' ? 'schedule' : 'ranking');
      assert.ok(preview.secondaryAction && preview.secondaryCtaText);
    }
  }
  assert.equal(ids.size, 4);
  assert.equal(screenshotTool.cases.shareDraft.selectorExpectations['.participant-avatar-img'], 6);
  const squad = screenshotTool.cases.shareSquadChoice;
  assert.equal(squad.data.preview.modeLabel, '小队转');
  assert.equal(squad.data.preview.mode, 'squad_doubles');
  assert.equal(squad.data.tournament.players.filter(player => player.squad === 'A').length, 3);
  assert.equal(squad.data.tournament.players.filter(player => player.squad === 'B').length, 3);
  assert.equal(squad.data.joinSquadChoice, 'A');
  assert.equal(squad.selectorExpectations['.squad-chooser .chip.active'], 1);
});

test('profile upload and save captures retain the dirty guard and both disabled avatar entrances', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/profile/index.wxml'), 'utf8');
  assert.equal((wxml.match(/open-type="chooseAvatar"[\s\S]*?disabled="\{\{avatarUploading \|\| quickFillLoading \|\| saving\}\}"/g) || []).length, 2);
  assert.match(wxml, /bindtap="onSave"[^>]*disabled="\{\{saving \|\| quickFillLoading \|\| avatarUploading\}\}"/);
  for (const [name, busy] of [['profileAvatarUploading', 'avatarUploading'], ['profileSaving', 'saving']]) {
    const item = screenshotTool.cases[name];
    assert.equal(item.data[busy], true);
    assert.equal(item.data.pendingAvatarTempPath, screenshotTool.cases.profile.data.pendingAvatarTempPath);
    assert.equal(item.data.avatarUploadFailed, false);
    for (const selector of ['.avatar-actions .btn-mini', '.quick-fill-btn', '.profile-actions .btn-primary']) {
      assert.equal(item.selectorExpectations[selector], 1);
    }
  }
});

test('new pending-plan cases use positive readiness anchors, explicit counts and adaptable viewport widths', () => {
  const names = ['schedulePlayerFilterSheet', 'scheduleStatusFilterSheet', 'scheduleFilterSelected', 'scheduleFilterEmpty',
    'tournamentListMore', 'tournamentListPageError', 'matchSubmitBusy', 'matchForbidden', 'matchCanceled', 'matchLoadError',
    'waterV2GameSearchEmpty', 'waterV2GameSummaryExpanded', 'waterV2RosterSearchEmpty', 'profileAvatarUploading', 'profileSaving'];
  for (const name of names) {
    const item = screenshotTool.cases[name];
    assert.equal(item.expectedWindowWidth, undefined, name);
    assert.equal(item.storageFixture, undefined, name);
    assert.equal(item.strictReceipt, undefined, name);
    assert.doesNotMatch(JSON.stringify(item), /https?:\/\//);
    const dom = item.selectors.flatMap((selector) => {
      const count = item.selectorExpectations[selector];
      assert.ok(Number.isInteger(count) && count > 0, `${name}: ${selector} can be waited for`);
      return Array.from({ length: count }, (_, index) => ({ selector, index, size: { width: 100, height: 48 } }));
    });
    assert.equal(screenshotTool.validateSelectorCoverage(dom, item.selectors, item.selectorExpectations).ok, true, name);
  }
});

test('scheduler screenshot states expose all three real draft preference labels', () => {
  const view = require('../miniprogram/pages/settings/settingsViewModel');
  const base = screenshotTool.cases.settings.data;
  assert.equal(base.settingsReady, base.tournament.settingsConfigured === true,
    'the completion badge must agree with the draft tournament fixture');
  for (const [name, profile] of [['settingsSchedulerBalanced', 'balanced'], ['settingsSchedulerRest', 'rest'], ['settingsSchedulerCoverage', 'coverage']]) {
    const item = screenshotTool.cases[name];
    assert.ok(item, name);
    const expected = view.buildSettingsViewState(item.data.tournament, { openid: item.data.tournament.creatorId });
    assert.equal(item.data.showSchedulerProfile, true);
    assert.equal(item.data.isDraft, true);
    assert.equal(item.data.schedulerProfile, profile);
    for (const key of ['schedulerProfileOptions', 'schedulerProfileIndex', 'schedulerProfileDisplayLabel', 'schedulerProfileHint']) {
      assert.deepEqual(item.data[key], expected[key], `${name}: ${key}`);
    }
    assert.equal(item.scrollToSelector, '#section-params');
    assert.equal(item.selectorExpectations['#section-params .form-label'], 5);
    assert.equal(item.expectedWindowWidth, undefined);
  }
});

test('full-roster claim screenshot preserves distinct same-name guests and a long native choice label', () => {
  const memberClaim = require('../miniprogram/core/memberClaim');
  const item = screenshotTool.cases.shareClaimFullNames;
  assert.ok(item);
  const tournament = item.data.tournament;
  const guests = memberClaim.getClaimCandidates(tournament, '__ui_share_viewer');
  assert.equal(tournament.players.length, tournament.playerLimit);
  assert.equal(guests.length, 3);
  assert.equal(guests[0].name, guests[1].name);
  assert.notEqual(guests[0].id, guests[1].id);
  assert.ok(memberClaim.candidateLabel(guests[2], tournament, 2).length > 24);
  assert.equal(item.data.preview.joinAllowed, true);
  assert.equal(item.data.preview.joined, false);
  assert.match(item.data.preview.availabilityText, /名额已满.*认领/);
  assert.doesNotMatch(JSON.stringify(item), /https?:\/\//);
});
