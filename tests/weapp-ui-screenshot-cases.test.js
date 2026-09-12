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

test('tracked screenshot registry covers all 15 pages and match risk states without remote assets', () => {
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
    '.settings-page', '.context-panel', '#section-params',
  ]);
});

test('V2 water screenshots record native runtime provenance and viewport width', () => {
  assert.match(screenshotScript, /WEAPP_PROJECT_PATH/);
  assert.match(screenshotScript, /automator\.connect\(\{\s*wsEndpoint:/);
  assert.doesNotMatch(screenshotScript, /await\s+automator\.launch\s*\(/);
  assert.match(prewarmScript, /await\s+automator\.launch\s*\(/);
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
  assert.match(screenshotScript, /function resolveLaunchCommand\(requestedCliPath\)/);
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
    assert.equal(entry.displayDescription, entry.description);
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

test('the 390px V2 matrix includes stable sheet, correction, detail, archive and error cases', () => {
  const expected = [
    'waterV2MemberDirect',
    'waterV2MemberCorrection',
    'waterV2OwnerCorrectionLong',
    'waterV2EntryDetail',
    'waterV2ArchivedRound',
    'waterV2SheetError',
  ];
  assert.ok(screenshotTool.cases);
  expected.forEach((name) => {
    const item = screenshotTool.cases[name];
    assert.ok(item, `${name} must exist`);
    assert.equal(item.expectedWindowWidth, 390, `${name} must force 390px`);
    assert.ok(item.fixture && item.fixture.roomData, `${name} must use a deterministic room fixture`);
  });
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
