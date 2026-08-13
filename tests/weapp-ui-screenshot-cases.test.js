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

test('DevTools screenshot workflow includes the launch CTA alignment case', () => {
  assert.match(screenshotScript, /launch:\s*\{[\s\S]*?path:\s*'\/pages\/launch\/index'/);
  assert.match(screenshotScript, /launch:\s*\{[\s\S]*?route:\s*'switchTab'/);
  assert.match(
    screenshotScript,
    /launch:\s*\{[\s\S]*?selectors:\s*\['\.launch-water-card',\s*'\.launch-water-btn',\s*'\.launch-card\.is-default \.launch-btn'\]/
  );
  assert.match(
    screenshotScript,
    /launch:\s*\{[\s\S]*?horizontalAlignment:\s*\{[\s\S]*?selectors:\s*\['\.launch-water-btn',\s*'\.launch-card\.is-default \.launch-btn'\][\s\S]*?tolerance:\s*1/
  );
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
  const expectedCases = [
    'waterV2OwnerEmpty',
    'waterV2Member24',
    'waterV2Member24Game',
    'waterV2VisitorLong',
  ];

  expectedCases.forEach((name) => {
    assert.match(
      screenshotScript,
      new RegExp(`${name}:\\s*\\{[\\s\\S]*?path:\\s*'\\/pages\\/water\\/index\\?id=water_v2_demo'`),
      `${name} must open the stable V2 room path`
    );
  });

  assert.match(
    screenshotScript,
    /waterV2OwnerEmpty:\s*\{[\s\S]*?fixture:\s*waterV2Fixtures\.ownerEmpty/
  );
  assert.match(
    screenshotScript,
    /waterV2Member24:\s*\{[\s\S]*?fixture:\s*waterV2Fixtures\.member24/
  );
  assert.match(
    screenshotScript,
    /waterV2Member24Game:\s*\{[\s\S]*?fixture:\s*waterV2Fixtures\.member24Game/
  );
  assert.match(
    screenshotScript,
    /waterV2VisitorLong:\s*\{[\s\S]*?fixture:\s*waterV2Fixtures\.visitorLong/
  );

  expectedCases.forEach((name) => {
    assert.equal(
      screenshotTool.cases[name].expectedWindowWidth,
      undefined,
      `${name} must accept the explicit 320/390/430 run width instead of pinning one device`
    );
    assert.equal(screenshotTool.cases[name].strictReceipt, true);
  });
});

test('water screenshot case targets the V2 ledger instead of retired scoreboards', () => {
  assert.match(
    screenshotScript,
    /water:\s*\{[\s\S]*?selectors:\s*\['\.water-page',\s*'\.water-latest-receipt',\s*'\.water-ledger-row',\s*'\.water-action-dock'\]/
  );
  assert.doesNotMatch(screenshotScript, /'\.water-scoreboard'|'\.water-hero'/);
});

test('V2 water screenshots record native runtime provenance and viewport width', () => {
  assert.match(screenshotScript, /WEAPP_PROJECT_PATH/);
  assert.match(screenshotScript, /automator\.launch\(\{[\s\S]*?projectPath/);
  assert.match(screenshotScript, /sourceProjectPath/);
  assert.match(screenshotScript, /miniProgram\.send\('Tool\.getInfo'\)/);
  assert.match(screenshotScript, /miniProgram\.send\('App\.getCurrentPage'\)/);
  assert.match(screenshotScript, /miniProgram\.systemInfo\(\)/);
  assert.match(screenshotScript, /windowWidth/);
  assert.match(screenshotScript, /toolInfo/);
  assert.match(screenshotScript, /currentPageInfo/);
});

test('exact-worktree launch normalizes a Windows cli.bat through bundled node', () => {
  assert.match(screenshotScript, /function resolveLaunchCommand\(requestedCliPath\)/);
  assert.match(screenshotScript, /path\.extname\(requestedCliPath\)\.toLowerCase\(\) !== '\.bat'/);
  assert.match(screenshotScript, /executable:\s*'node'/);
  assert.match(screenshotScript, /args:\s*\[path\.join\(cliDir, 'cli\.js'\)\]/);
  assert.match(screenshotScript, /automator\.launch\(\{[\s\S]*?cliPath:\s*launchCommand\.executable[\s\S]*?args:\s*launchCommand\.args/);
});

test('a CLI-preopened exact project can connect without losing source provenance', () => {
  assert.match(screenshotScript, /WEAPP_CONNECT_EXISTING/);
  assert.match(screenshotScript, /mode:\s*'connect-preopened'/);
  assert.match(screenshotScript, /sourceProjectPath/);
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

test('fixture injection invalidates async generations before applyRoomData and cleans up afterwards', async () => {
  const calls = [];
  const miniProgram = {
    async evaluate(fn, phase) {
      calls.push(`isolate:${phase}`);
      return { ok: true, phase, loadRequestSeq: 101, feedRequestSeq: 102, detailRequestSeq: 103, pollingFrozen: true };
    },
  };
  const page = {
    async callMethod(name) { calls.push(`method:${name}`); },
    async setData() { calls.push('setData'); },
  };

  const isolation = await screenshotTool.applyFixture(page, waterV2Fixtures.ownerEmpty, miniProgram);
  await screenshotTool.cleanupFixture(page, miniProgram);

  assert.equal(calls[0], 'isolate:before');
  assert.equal(calls[1], 'method:applyRoomData');
  assert.equal(calls.at(-1), 'isolate:cleanup');
  assert.equal(isolation.pollingFrozen, true);
  assert.match(screenshotScript, /_loadRequestSeq/);
  assert.match(screenshotScript, /_feedRequestSeq/);
  assert.match(screenshotScript, /_detailRequestSeq/);
  assert.match(screenshotScript, /clearRefreshTimer/);
  assert.match(screenshotScript, /_isVisible\s*=\s*false/);
});

test('strict receipt validation accepts proportional DevTools PNG scaling and rejects malformed geometry', () => {
  const evidence = {
    expectedWindowWidth: 390,
    expectedRoute: '/pages/water/index',
    toolInfo: { SDKVersion: '3.8.10', projectPath: path.resolve('fixture-project') },
    currentPageInfo: { path: 'pages/water/index' },
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
  };
  assert.equal(screenshotTool.validateReceiptEvidence(evidence).ok, true);

  const broken = [
    { toolInfo: { ...evidence.toolInfo, SDKVersion: '' } },
    { currentPageInfo: { path: 'pages/launch/index' } },
    { systemInfo: { ...evidence.systemInfo, fontSizeSetting: 0 } },
    { png: { ...evidence.png, height: 1400 } },
    { png: { ...evidence.png, width: 0, height: 0 } },
    { systemInfo: { ...evidence.systemInfo, pixelRatio: 0 } },
    { git: { ...evidence.git, head: '' } },
    { git: { ...evidence.git, files: [] } },
    { horizontalOverflow: { ok: false, overflow: 4 } },
    { projectProvenance: { ok: false } },
  ];
  broken.forEach((patch) => {
    assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, ...patch }).ok, false);
  });
});

test('PNG inspection locks signature, IHDR pixels and SHA-256', () => {
  const png = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(780, 16);
  png.writeUInt32BE(1688, 20);

  const inspected = screenshotTool.inspectPngBuffer(png);
  assert.equal(inspected.valid, true);
  assert.equal(inspected.width, 780);
  assert.equal(inspected.height, 1688);
  assert.match(inspected.sha256, /^[a-f0-9]{64}$/);
  assert.equal(screenshotTool.inspectPngBuffer(Buffer.from('not png')).valid, false);
});

test('connect-preopened provenance fails closed without exact Tool path or matching project-port log', () => {
  const projectPath = path.resolve('fixture-project');
  const connection = {
    mode: 'connect-preopened',
    sourceProjectPath: projectPath,
    endpoint: 'ws://127.0.0.1:39421',
  };
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath: '' },
    logEvidence: null,
  }).ok, false);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath: '' },
    logEvidence: { projectPath, wsEndpoint: connection.endpoint, port: 39421 },
  }).ok, true);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath: '' },
    logEvidence: { projectPath: path.resolve('other-project'), wsEndpoint: connection.endpoint, port: 39421 },
  }).ok, false);
  assert.equal(screenshotTool.validateProjectProvenance({
    connection,
    toolInfo: { projectPath },
    logEvidence: null,
  }).ok, true);
});
