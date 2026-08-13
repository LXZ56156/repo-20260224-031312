const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const screenshotTool = require('../scripts/dev/weapp-ui-screenshot');

const scriptPath = path.join(__dirname, '..', 'scripts/dev/weapp-ui-screenshot.js');
const helperPath = path.join(__dirname, '..', 'scripts/dev/weapp-devtools-win32-capture.ps1');

function validPrepare() {
  return {
    kind: 'wechat-devtools-win32-prepare-v1',
    captureMode: 'visible',
    name: 'waterV2OwnerEmpty',
    prepareId: 'f'.repeat(64),
    nonce: 'e'.repeat(64),
    pageId: 'page-123',
    endpoint: 'ws://127.0.0.1:64530',
    sourceProjectPath: path.resolve('fixture-project'),
    expectedRoute: '/pages/water/index',
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.14.2',
    fixtureHash: 'a'.repeat(64),
    pageDataHash: 'b'.repeat(64),
    domHash: 'c'.repeat(64),
    systemInfoHash: 'd'.repeat(64),
    gitHash: '1'.repeat(64),
    systemInfo: {
      model: 'iPhone 12/13 (Pro)',
      screenWidth: 390,
      screenHeight: 844,
      windowWidth: 390,
      windowHeight: 753,
      pixelRatio: 3,
      fontSizeSetting: 16,
    },
    windowBinding: {
      processId: 84288,
      hwnd: '0x17D0384',
      title: 'badminton-rotation-miniapp - 微信开发者工具',
      captureMode: 'visible',
      dpiAwareness: 'per-monitor-aware-v2',
      desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      isOnCurrentVirtualDesktop: true,
      visible: true,
      minimized: false,
      cloaked: false,
      cloakState: 0,
      dpi: 144,
      windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
    },
    screenCalibration: {
      source: 'explicit-screen-rect',
      processId: 84288,
      hwnd: '0x17D0384',
      dpi: 144,
      model: 'iPhone 12/13 (Pro)',
      logicalScreen: { width: 390, height: 844 },
      logicalWindow: { width: 390, height: 753 },
      windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
      screenRect: { x: 1862, y: 179, width: 523, height: 1132 },
    },
  };
}

test('two-stage CLI modes are explicit and reject ambiguous arguments', () => {
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['--prepare', 'waterV2OwnerEmpty']), {
    mode: 'prepare',
    value: 'waterV2OwnerEmpty',
  });
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['--capture-win32', 'tmp/water.prepare.json']), {
    mode: 'capture-win32',
    value: 'tmp/water.prepare.json',
  });
  assert.throws(
    () => screenshotTool.parseScreenshotArgs(['--prepare', 'waterV2OwnerEmpty', 'waterV2Member24']),
    /exactly one case/i
  );
  assert.throws(
    () => screenshotTool.parseScreenshotArgs(['--prepare']),
    /requires/i
  );
});

test('canonical hashes lock fixture and rendered page data independent of key order', () => {
  const left = { z: 3, a: { y: [2, 1], x: true } };
  const right = { a: { x: true, y: [2, 1] }, z: 3 };
  assert.equal(screenshotTool.hashCanonical(left), screenshotTool.hashCanonical(right));
  assert.match(screenshotTool.hashCanonical(left), /^[a-f0-9]{64}$/);
  assert.notEqual(screenshotTool.hashCanonical(left), screenshotTool.hashCanonical({ ...left, z: 4 }));
});

test('viewport crop is calibrated from each device screen rectangle and bottom anchored', () => {
  assert.deepEqual(screenshotTool.buildViewportRect(
    { x: 1862, y: 179, width: 523, height: 1132 },
    { screenWidth: 390, screenHeight: 844, windowWidth: 390, windowHeight: 753 }
  ), {
    x: 1862,
    y: 301,
    width: 523,
    height: 1010,
    relativeX: 0,
    relativeY: 122,
    scaleX: 523 / 390,
    scaleY: 1132 / 844,
  });

  const narrow = screenshotTool.buildViewportRect(
    { x: 1500, y: 200, width: 480, height: 852 },
    { screenWidth: 320, screenHeight: 568, windowWidth: 320, windowHeight: 477 }
  );
  assert.equal(narrow.width, 480);
  assert.equal(narrow.height, 716);
  assert.equal(narrow.y, 336);

  const wide = screenshotTool.buildViewportRect(
    { x: 1800, y: 160, width: 516, height: 1118 },
    { screenWidth: 430, screenHeight: 932, windowWidth: 430, windowHeight: 841 }
  );
  assert.equal(wide.width, 516);
  assert.equal(wide.height, 1009);
  assert.equal(wide.y, 269);
});

test('prepare records fail closed without exact endpoint, state hashes, PID and HWND binding', () => {
  assert.equal(screenshotTool.validatePrepareRecord(validPrepare()).ok, true);
  const broken = [
    { endpoint: '' },
    { nonce: '' },
    { pageId: '' },
    { pageDataHash: '' },
    { fixtureHash: '' },
    { windowBinding: { ...validPrepare().windowBinding, processId: 0 } },
    { windowBinding: { ...validPrepare().windowBinding, hwnd: '' } },
    { screenCalibration: { ...validPrepare().screenCalibration, model: 'iPhone 5' } },
    { systemInfo: { ...validPrepare().systemInfo, screenWidth: 0 } },
  ];
  broken.forEach((patch) => {
    assert.equal(screenshotTool.validatePrepareRecord({ ...validPrepare(), ...patch }).ok, false);
  });
});

test('Win32 capture validation locks binding, foreground occlusion and crop pixel identity', () => {
  const prepare = validPrepare();
  const capture = {
    captureMode: 'visible',
    renderMethod: 'CopyFromScreen',
    dpiAwareness: 'per-monitor-aware-v2',
    processId: 84288,
    hwnd: '0x17D0384',
    title: prepare.windowBinding.title,
    dpi: 144,
    visible: true,
    minimized: false,
    cloaked: false,
    cloakState: 0,
    desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
    isOnCurrentVirtualDesktop: true,
    windowStable: true,
    windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
    windowAfter: {
      processId: 84288,
      hwnd: '0x17D0384',
      title: prepare.windowBinding.title,
      dpi: 144,
      visible: true,
      minimized: false,
      cloaked: false,
      cloakState: 0,
      desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      isOnCurrentVirtualDesktop: true,
      windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
    },
    screenCalibration: {
      model: 'iPhone 12/13 (Pro)',
      logicalScreen: { width: 390, height: 844 },
      screenRect: { x: 1862, y: 179, width: 523, height: 1132 },
      scaleX: 523 / 390,
      scaleY: 1132 / 844,
    },
    viewportRect: { x: 1862, y: 301, width: 523, height: 1010 },
    foreground: {
      before: {
        hwnd: '0x17D0384',
        processId: 84288,
        desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      },
      after: {
        hwnd: '0x17D0384',
        processId: 84288,
        desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      },
    },
    desktop: {
      targetBefore: '798af4b3-e850-4468-992a-1f512a3a2340',
      targetAfter: '798af4b3-e850-4468-992a-1f512a3a2340',
      currentBefore: '798af4b3-e850-4468-992a-1f512a3a2340',
      currentAfter: '798af4b3-e850-4468-992a-1f512a3a2340',
      targetOnCurrentBefore: true,
      targetOnCurrentAfter: true,
    },
    requestProvenance: {
      kind: 'wechat-devtools-win32-request-v1',
      prepareId: prepare.prepareId,
      nonce: prepare.nonce,
    },
    overlappingWindows: [],
    fullFrame: { sha256: '2'.repeat(64), pixelSha256: '3'.repeat(64), width: 2582, height: 1538 },
    crop: { sha256: '4'.repeat(64), pixelSha256: '5'.repeat(64), width: 523, height: 1010 },
    frameRegionPixelSha256: '5'.repeat(64),
    cropMatchesFrameRegion: true,
    likelyBlackFrame: false,
  };

  assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, capture).ok, true);
  const broken = [
    { processId: 7 },
    { hwnd: '0xBAD' },
    { visible: false },
    { minimized: true },
    { cloaked: true },
    { windowStable: false },
    { overlappingWindows: [{ hwnd: '0x99', intersection: { width: 40, height: 20 } }] },
    { cropMatchesFrameRegion: false },
    { frameRegionPixelSha256: '6'.repeat(64) },
    { crop: { ...capture.crop, width: 520 } },
  ];
  broken.forEach((patch) => {
    assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, { ...capture, ...patch }).ok, false);
  });
});

test('prepare and Win32 finalize paths never invoke the DevTools capturePage screenshot API', () => {
  assert.doesNotMatch(String(screenshotTool.prepareCase), /\.screenshot\s*\(/);
  assert.doesNotMatch(String(screenshotTool.capturePreparedWin32), /\.screenshot\s*\(/);
  assert.match(String(screenshotTool.prepareCase), /fixtureHash/);
  assert.match(String(screenshotTool.prepareCase), /pageDataHash/);
  assert.match(String(screenshotTool.capturePreparedWin32), /WIN32_CAPTURE_KIND/);
});

test('case routing recovers a completed reLaunch whose automator acknowledgement timed out', async () => {
  const page = { path: 'pages/water/index' };
  const calls = [];
  const miniProgram = {
    async reLaunch() {
      calls.push('reLaunch');
      throw new Error('timeout');
    },
    async currentPage() {
      calls.push('currentPage');
      return page;
    },
  };

  const recovered = await screenshotTool.routeCasePage(
    miniProgram,
    'reLaunch',
    '/pages/water/index?id=water_v2_demo',
    { recoveryTimeoutMs: 25, recoveryPollMs: 1 }
  );

  assert.equal(recovered, page);
  assert.deepEqual(calls, ['reLaunch', 'currentPage']);
});

test('prepare applies and freezes fixture state, writes hashes, and leaves cleanup to finalize', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-win32-prepare-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const calls = [];
  const element = {
    async text() { return 'fixture'; },
    async size() { return { width: 100, height: 44 }; },
    async offset() { return { left: 10, top: 20 }; },
  };
  const page = {
    async waitFor() {},
    async callMethod(name) { calls.push(`method:${name}`); },
    async setData() { calls.push('setData'); },
    async size() { return { width: 390, height: 753 }; },
    async data() { return { stable: true, nested: { b: 2, a: 1 } }; },
    async $$(selector) { calls.push(`selector:${selector}`); return [element]; },
  };
  const miniProgram = {
    async reLaunch() { calls.push('reLaunch'); return page; },
    async evaluate(fn, value) {
      if (value === 'before' || value === 'cleanup') {
        calls.push(`isolate:${value}`);
        return { ok: true, phase: value, pollingFrozen: true };
      }
      calls.push('marker');
      return { ok: true, nonce: value.nonce, pageId: value.pageId, route: 'pages/water/index' };
    },
    async send(method) {
      if (method === 'Tool.getInfo') {
        return { SDKVersion: '3.14.2', projectPath: path.resolve('fixture-project') };
      }
      if (method === 'App.getCurrentPage') return { path: 'pages/water/index' };
      throw new Error(`Unexpected method: ${method}`);
    },
    async systemInfo() {
      return {
        model: 'iPhone 12/13 (Pro)',
        platform: 'devtools',
        screenWidth: 390,
        screenHeight: 844,
        windowWidth: 390,
        windowHeight: 753,
        pixelRatio: 3,
        fontSizeSetting: 16,
        statusBarHeight: 47,
      };
    },
    screenshot() { throw new Error('capturePage must not run during prepare'); },
  };
  const connection = {
    mode: 'connect-preopened',
    endpoint: 'ws://127.0.0.1:64530',
    sourceProjectPath: path.resolve('fixture-project'),
    provenanceLogEvidence: null,
  };
  const git = { ok: true, head: 'a'.repeat(40), dirty: false, status: [], files: [] };
  const record = await screenshotTool.prepareCase(
    'waterV2MemberDirect',
    miniProgram,
    connection,
    {
      outDir: tempDir,
      nonce: 'b'.repeat(64),
      pageId: 'page-fixture',
      currentGitManifest: () => git,
      windowBinding: {
        processId: 84288,
        hwnd: '0x17D0384',
        title: 'fixture - 微信开发者工具',
        captureMode: 'visible',
        dpiAwareness: 'per-monitor-aware-v2',
        desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
        isOnCurrentVirtualDesktop: true,
        dpi: 144,
        visible: true,
        minimized: false,
        cloaked: false,
        cloakState: 0,
        windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
      },
      screenRect: { x: 1862, y: 179, width: 523, height: 1132 },
    }
  );

  assert.equal(record.prepareValidation.ok, true);
  assert.match(record.fixtureHash, /^[a-f0-9]{64}$/);
  assert.match(record.pageDataHash, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(record.preparePath), true);
  assert.equal(calls.includes('isolate:before'), true);
  assert.equal(calls.includes('isolate:cleanup'), false);
});

test('Win32 helper is DPI-aware, captures a full visible frame and audits occlusion and pixel hashes', () => {
  const helper = fs.readFileSync(helperPath, 'utf8');
  assert.match(helper, /SetProcessDpiAwarenessContext/);
  assert.match(helper, /Add-Type\s+-ReferencedAssemblies\s+['"]System\.Drawing\.dll['"]/);
  assert.match(helper, /Get-Content\s+-LiteralPath\s+\$resolvedRequestPath\s+-Raw\s+-Encoding\s+UTF8/);
  assert.match(helper, /DwmGetWindowAttribute/);
  assert.match(helper, /CopyFromScreen/);
  assert.match(helper, /GetForegroundWindow/);
  assert.match(helper, /GetWindowThreadProcessId/);
  assert.match(helper, /EnumWindows/);
  assert.match(helper, /cropMatchesFrameRegion/);
  assert.match(helper, /frameRegionPixelSha256/);
  assert.match(helper, /InspectPixelProbe/);
  assert.match(helper, /surfaceRatio/);
  assert.match(helper, /overlayDarkRatio/);
  assert.match(helper, /deepGreenRatio/);
  assert.doesNotMatch(helper, /1862|179|523|1132/);
});

test('off-desktop PrintWindow mode is explicit, provenance-bound and accepts a visible cloaked target', () => {
  const prepare = validPrepare();
  prepare.output = path.resolve('final', 'waterV2OwnerEmpty.png');
  prepare.fullFramePath = path.resolve('final', 'waterV2OwnerEmpty.devtools-full-frame.png');
  prepare.receiptPath = path.resolve('final', 'waterV2OwnerEmpty.receipt.json');
  prepare.captureMode = 'printwindow';
  prepare.windowBinding = {
    ...prepare.windowBinding,
    captureMode: 'printwindow',
    desktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
    isOnCurrentVirtualDesktop: false,
    cloaked: true,
    cloakState: 2,
  };
  prepare.screenCalibration = {
    ...prepare.screenCalibration,
    hwnd: prepare.windowBinding.hwnd,
  };
  const plan = screenshotTool.buildWin32ArtifactPlan(prepare);
  const request = screenshotTool.buildWin32CaptureRequest(prepare, { artifactPlan: plan });
  assert.equal(request.captureMode, 'printwindow');
  assert.equal(request.expectedDesktopId, prepare.windowBinding.desktopId);
  assert.equal(request.expectedCloaked, true);
  assert.equal(request.expectedCloakState, 2);
  assert.notEqual(request.cropPath, prepare.output);
  assert.notEqual(request.fullFramePath, prepare.fullFramePath);

  const capture = {
    captureMode: 'printwindow',
    renderMethod: 'PrintWindow(PW_RENDERFULLCONTENT)',
    dpiAwareness: 'per-monitor-aware-v2',
    processId: prepare.windowBinding.processId,
    hwnd: prepare.windowBinding.hwnd,
    title: prepare.windowBinding.title,
    dpi: prepare.windowBinding.dpi,
    visible: true,
    minimized: false,
    cloaked: true,
    cloakState: 2,
    desktopId: prepare.windowBinding.desktopId,
    isOnCurrentVirtualDesktop: false,
    windowStable: true,
    windowRect: prepare.windowBinding.windowRect,
    windowAfter: {
      processId: prepare.windowBinding.processId,
      hwnd: prepare.windowBinding.hwnd,
      title: prepare.windowBinding.title,
      dpi: prepare.windowBinding.dpi,
      visible: true,
      minimized: false,
      cloaked: true,
      cloakState: 2,
      desktopId: prepare.windowBinding.desktopId,
      isOnCurrentVirtualDesktop: false,
      windowRect: prepare.windowBinding.windowRect,
    },
    screenCalibration: {
      model: prepare.systemInfo.model,
      logicalScreen: { width: 390, height: 844 },
      screenRect: prepare.screenCalibration.screenRect,
    },
    viewportRect: { x: 1862, y: 301, width: 523, height: 1010 },
    foreground: {
      before: {
        hwnd: '0x9C0892',
        processId: 53468,
        desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      },
      after: {
        hwnd: '0x9C0892',
        processId: 53468,
        desktopId: '798af4b3-e850-4468-992a-1f512a3a2340',
      },
    },
    desktop: {
      targetBefore: prepare.windowBinding.desktopId,
      targetAfter: prepare.windowBinding.desktopId,
      currentBefore: '798af4b3-e850-4468-992a-1f512a3a2340',
      currentAfter: '798af4b3-e850-4468-992a-1f512a3a2340',
      targetOnCurrentBefore: false,
      targetOnCurrentAfter: false,
    },
    requestProvenance: {
      kind: 'wechat-devtools-win32-request-v1',
      prepareId: prepare.prepareId,
      nonce: prepare.nonce,
      artifactBindingHash: plan.bindingHash,
    },
    overlappingWindows: [],
    fullFrame: {
      path: plan.candidateFullFramePath,
      sha256: '2'.repeat(64),
      pixelSha256: '3'.repeat(64),
      width: 2582,
      height: 1538,
    },
    crop: {
      path: plan.candidateCropPath,
      sha256: '4'.repeat(64),
      pixelSha256: '5'.repeat(64),
      width: 523,
      height: 1010,
    },
    frameRegionPixelSha256: '5'.repeat(64),
    cropMatchesFrameRegion: true,
    likelyBlackFrame: false,
  };

  assert.equal(screenshotTool.validatePrepareRecord(prepare).ok, true);
  assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, capture, plan).ok, true);
  [
    { renderMethod: 'CopyFromScreen' },
    { dpiAwareness: 'system-aware' },
    { isOnCurrentVirtualDesktop: true },
    { minimized: true },
    { cloakState: 0 },
    { likelyBlackFrame: true },
    { windowAfter: { ...capture.windowAfter, windowRect: { x: 0, y: 0, width: 1, height: 1 } } },
    { desktop: { ...capture.desktop, targetOnCurrentAfter: true } },
    { desktop: { ...capture.desktop, currentAfter: '00000000-0000-0000-0000-000000000000' } },
    { foreground: { ...capture.foreground, after: { ...capture.foreground.after, hwnd: prepare.windowBinding.hwnd } } },
    { foreground: { ...capture.foreground, after: { ...capture.foreground.after, processId: prepare.windowBinding.processId } } },
    { requestProvenance: { ...capture.requestProvenance, nonce: '0'.repeat(64) } },
  ].forEach((patch) => {
    assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, { ...capture, ...patch }, plan).ok, false);
  });
});

test('current-desktop PrintWindow mode requires stable full foreground occlusion without changing the target', () => {
  const prepare = validPrepare();
  prepare.output = path.resolve('final', 'waterV2OwnerEmpty.png');
  prepare.fullFramePath = path.resolve('final', 'waterV2OwnerEmpty.devtools-full-frame.png');
  prepare.receiptPath = path.resolve('final', 'waterV2OwnerEmpty.receipt.json');
  prepare.captureMode = 'printwindow-current';
  prepare.windowBinding = {
    ...prepare.windowBinding,
    captureMode: 'printwindow-current',
  };
  const plan = screenshotTool.buildWin32ArtifactPlan(prepare);
  const request = screenshotTool.buildWin32CaptureRequest(prepare, { artifactPlan: plan });
  const foregroundHwnd = '0x9C0892';
  const viewportRect = { x: 1862, y: 301, width: 523, height: 1010 };
  const foregroundOverlap = {
    hwnd: foregroundHwnd,
    processId: 53468,
    title: 'user foreground',
    className: 'Chrome_WidgetWin_1',
    windowRect: { x: 0, y: 0, width: 2582, height: 1538 },
    intersection: viewportRect,
  };
  const capture = {
    captureMode: 'printwindow-current',
    renderMethod: 'PrintWindow(PW_RENDERFULLCONTENT)',
    dpiAwareness: 'per-monitor-aware-v2',
    processId: prepare.windowBinding.processId,
    hwnd: prepare.windowBinding.hwnd,
    title: prepare.windowBinding.title,
    dpi: prepare.windowBinding.dpi,
    visible: true,
    minimized: false,
    cloaked: false,
    cloakState: 0,
    desktopId: prepare.windowBinding.desktopId,
    isOnCurrentVirtualDesktop: true,
    windowStable: true,
    windowRect: prepare.windowBinding.windowRect,
    windowAfter: {
      processId: prepare.windowBinding.processId,
      hwnd: prepare.windowBinding.hwnd,
      title: prepare.windowBinding.title,
      dpi: prepare.windowBinding.dpi,
      visible: true,
      minimized: false,
      cloaked: false,
      cloakState: 0,
      desktopId: prepare.windowBinding.desktopId,
      isOnCurrentVirtualDesktop: true,
      windowRect: prepare.windowBinding.windowRect,
    },
    screenCalibration: {
      model: prepare.systemInfo.model,
      logicalScreen: { width: 390, height: 844 },
      screenRect: prepare.screenCalibration.screenRect,
    },
    viewportRect,
    absoluteViewportRect: viewportRect,
    foreground: {
      before: {
        hwnd: foregroundHwnd,
        processId: 53468,
        desktopId: prepare.windowBinding.desktopId,
      },
      after: {
        hwnd: foregroundHwnd,
        processId: 53468,
        desktopId: prepare.windowBinding.desktopId,
      },
    },
    desktop: {
      targetBefore: prepare.windowBinding.desktopId,
      targetAfter: prepare.windowBinding.desktopId,
      currentBefore: prepare.windowBinding.desktopId,
      currentAfter: prepare.windowBinding.desktopId,
      targetOnCurrentBefore: true,
      targetOnCurrentAfter: true,
    },
    requestProvenance: {
      kind: 'wechat-devtools-win32-request-v1',
      prepareId: prepare.prepareId,
      nonce: prepare.nonce,
      artifactBindingHash: plan.bindingHash,
    },
    overlappingWindows: [foregroundOverlap],
    overlappingWindowsBefore: [foregroundOverlap],
    overlappingWindowsAfter: [foregroundOverlap],
    fullFrame: {
      path: plan.candidateFullFramePath,
      sha256: '2'.repeat(64),
      pixelSha256: '3'.repeat(64),
      width: 2582,
      height: 1538,
    },
    crop: {
      path: plan.candidateCropPath,
      sha256: '4'.repeat(64),
      pixelSha256: '5'.repeat(64),
      width: 523,
      height: 1010,
    },
    frameRegionPixelSha256: '5'.repeat(64),
    cropMatchesFrameRegion: true,
    likelyBlackFrame: false,
  };

  assert.equal(request.captureMode, 'printwindow-current');
  assert.equal(screenshotTool.validatePrepareRecord(prepare).ok, true);
  assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, capture, plan).ok, true);
  const nonTransparentTaskSwitcher = {
    ...capture,
    foreground: {
      before: { ...capture.foreground.before, desktopId: '' },
      after: { ...capture.foreground.after, desktopId: '' },
    },
    desktop: { ...capture.desktop, currentBefore: '', currentAfter: '' },
  };
  assert.equal(
    screenshotTool.validateWin32CaptureEvidence(prepare, nonTransparentTaskSwitcher, plan).ok,
    false
  );
  [
    { renderMethod: 'CopyFromScreen' },
    { dpiAwareness: 'system-aware' },
    { isOnCurrentVirtualDesktop: false },
    { cloaked: true, cloakState: 2 },
    { foreground: { ...capture.foreground, after: { ...capture.foreground.after, hwnd: prepare.windowBinding.hwnd } } },
    { overlappingWindowsBefore: [{ ...foregroundOverlap, intersection: { ...viewportRect, width: 522 } }] },
    { overlappingWindowsAfter: [] },
    { desktop: { ...capture.desktop, targetOnCurrentAfter: false } },
    { windowAfter: { ...capture.windowAfter, windowRect: { ...capture.windowAfter.windowRect, x: 1 } } },
  ].forEach((patch) => {
    assert.equal(screenshotTool.validateWin32CaptureEvidence(prepare, { ...capture, ...patch }, plan).ok, false);
  });

  const transparentPrepare = {
    ...prepare,
    transparentTargetCapture: true,
  };
  const transparentPlan = screenshotTool.buildWin32ArtifactPlan(transparentPrepare);
  const transparentState = {
    eligible: true,
    exStyle: 0x00080020,
    layered: true,
    clickThrough: true,
    layeredAttributesAvailable: true,
    alphaZero: true,
    layeredAlpha: 0,
    layeredFlags: 2,
  };
  const transparentCapture = {
    ...capture,
    requestProvenance: {
      ...capture.requestProvenance,
      artifactBindingHash: transparentPlan.bindingHash,
    },
    overlappingWindows: [],
    overlappingWindowsBefore: [],
    overlappingWindowsAfter: [],
    transparentTarget: {
      requested: true,
      stable: true,
      before: transparentState,
      after: transparentState,
    },
    fullFrame: {
      ...capture.fullFrame,
      path: transparentPlan.candidateFullFramePath,
    },
    crop: {
      ...capture.crop,
      path: transparentPlan.candidateCropPath,
    },
  };

  assert.equal(screenshotTool.buildWin32CaptureRequest(transparentPrepare, {
    artifactPlan: transparentPlan,
  }).transparentTargetCapture, true);
  assert.equal(
    screenshotTool.validateWin32CaptureEvidence(
      transparentPrepare,
      transparentCapture,
      transparentPlan
    ).ok,
    true
  );
  const naturallyChangedForeground = {
    ...transparentCapture,
    foreground: {
      before: transparentCapture.foreground.before,
      after: {
        hwnd: '0xA10B20',
        processId: 61234,
        desktopId: prepare.windowBinding.desktopId,
      },
    },
  };
  const naturalForegroundValidation = screenshotTool.validateWin32CaptureEvidence(
    transparentPrepare,
    naturallyChangedForeground,
    transparentPlan
  );
  assert.equal(naturalForegroundValidation.ok, true);
  assert.equal(naturalForegroundValidation.checks.targetNeverForeground, true);
  assert.equal('foregroundStable' in naturalForegroundValidation.checks, false);
  const taskSwitcherForeground = {
    ...naturallyChangedForeground,
    foreground: {
      before: { ...naturallyChangedForeground.foreground.before, desktopId: '' },
      after: { ...naturallyChangedForeground.foreground.after, desktopId: '' },
    },
    desktop: {
      ...naturallyChangedForeground.desktop,
      currentBefore: '',
      currentAfter: '',
    },
  };
  const taskSwitcherValidation = screenshotTool.validateWin32CaptureEvidence(
    transparentPrepare,
    taskSwitcherForeground,
    transparentPlan
  );
  assert.equal(taskSwitcherValidation.ok, true);
  assert.equal(taskSwitcherValidation.checks.targetNeverForeground, true);
  assert.equal(taskSwitcherValidation.checks.desktopStable, true);
  [
    {
      foreground: {
        ...transparentCapture.foreground,
        after: {
          ...transparentCapture.foreground.after,
          hwnd: prepare.windowBinding.hwnd,
        },
      },
    },
    {
      foreground: {
        ...transparentCapture.foreground,
        after: {
          ...transparentCapture.foreground.after,
          processId: prepare.windowBinding.processId,
        },
      },
    },
  ].forEach((patch) => {
    const validation = screenshotTool.validateWin32CaptureEvidence(
      transparentPrepare,
      { ...transparentCapture, ...patch },
      transparentPlan
    );
    assert.equal(validation.ok, false);
    assert.equal(validation.checks.targetNeverForeground, false);
  });
  const unavailableDesktopProbeCapture = {
    ...transparentCapture,
    desktopId: '',
    isOnCurrentVirtualDesktop: false,
    desktopProbeUnavailable: true,
    windowAfter: {
      ...transparentCapture.windowAfter,
      desktopId: '',
      isOnCurrentVirtualDesktop: false,
    },
    desktop: {
      ...transparentCapture.desktop,
      targetBefore: '',
      targetAfter: '',
      targetOnCurrentBefore: false,
      targetOnCurrentAfter: false,
      currentBefore: prepare.windowBinding.desktopId,
      currentAfter: prepare.windowBinding.desktopId,
    },
  };
  assert.equal(
    screenshotTool.validateWin32CaptureEvidence(
      transparentPrepare,
      unavailableDesktopProbeCapture,
      transparentPlan
    ).ok,
    true
  );
  assert.equal(
    screenshotTool.validateWin32CaptureEvidence(
      transparentPrepare,
      {
        ...unavailableDesktopProbeCapture,
        desktop: {
          ...unavailableDesktopProbeCapture.desktop,
          currentBefore: '00000000-0000-0000-0000-000000000000',
        },
      },
      transparentPlan
    ).ok,
    false
  );
  [
    { transparentTarget: { ...transparentCapture.transparentTarget, requested: false } },
    { transparentTarget: { ...transparentCapture.transparentTarget, stable: false } },
    {
      transparentTarget: {
        ...transparentCapture.transparentTarget,
        before: { ...transparentState, alphaZero: false, layeredAlpha: 1 },
      },
    },
    {
      transparentTarget: {
        ...transparentCapture.transparentTarget,
        after: { ...transparentState, clickThrough: false },
      },
    },
  ].forEach((patch) => {
    assert.equal(
      screenshotTool.validateWin32CaptureEvidence(
        transparentPrepare,
        { ...transparentCapture, ...patch },
        transparentPlan
      ).ok,
      false
    );
  });
});

test('freshness proof requires a nonce-bound visible challenge, exact restore and changed target pixels', () => {
  const prepare = validPrepare();
  const capture = {
    crop: { pixelSha256: '5'.repeat(64) },
  };
  const proof = {
    kind: 'wechat-devtools-visible-fixture-challenge-v1',
    nonce: prepare.nonce,
    pageId: prepare.pageId,
    selector: '.water-round-title',
    challengeText: `截图新鲜度校验 ${prepare.nonce.slice(0, 8)}`,
    challengeDomHash: '6'.repeat(64),
    restoredDomHash: prepare.domHash,
    restoredPageDataHash: prepare.pageDataHash,
    probeRect: { x: 20, y: 24, width: 300, height: 44 },
    challengeRegionPixelSha256: '7'.repeat(64),
    finalRegionPixelSha256: '8'.repeat(64),
    finalCropPixelSha256: capture.crop.pixelSha256,
  };

  assert.equal(screenshotTool.validateCaptureFreshnessProof(prepare, capture, proof).ok, true);
  [
    { nonce: '0'.repeat(64) },
    { challengeText: '截图新鲜度校验' },
    { restoredDomHash: '9'.repeat(64) },
    { restoredPageDataHash: '9'.repeat(64) },
    { probeRect: { x: 20, y: 24, width: 0, height: 44 } },
    { finalRegionPixelSha256: proof.challengeRegionPixelSha256 },
    { finalCropPixelSha256: '9'.repeat(64) },
  ].forEach((patch) => {
    assert.equal(
      screenshotTool.validateCaptureFreshnessProof(prepare, capture, { ...proof, ...patch }).ok,
      false
    );
  });
  assert.equal(screenshotTool.validateCaptureFreshnessProof(prepare, capture, {}).ok, false);
});

test('modal ROI freshness rejects a stale ledger frame and accepts sheet, overlay, CTA and 12v12 state evidence', () => {
  const prepare = validPrepare();
  prepare.name = 'waterV2Member24Game';
  const proof = {
    kind: 'wechat-devtools-modal-roi-v1',
    nonce: prepare.nonce,
    pageId: prepare.pageId,
    domHash: prepare.domHash,
    sheet: {
      rect: { x: 0, y: 80, width: 523, height: 930 },
      surfaceRatio: 0.91,
      topLeftOverlayDarkRatio: 0.72,
      topRightOverlayDarkRatio: 0.69,
    },
    cta: { rect: { x: 20, y: 920, width: 483, height: 64 }, deepGreenRatio: 0.81 },
    gameSelection: {
      winnerDomCount: 12,
      loserDomCount: 12,
      validationText: '双方人数相同 · 每人 1 水',
      winnerSoftRatio: 0,
      loserSoftRatio: 0.55,
    },
  };
  assert.equal(screenshotTool.validateModalRoiFreshnessProof(prepare, proof).ok, true);
  [
    { sheet: { ...proof.sheet, surfaceRatio: 0.1 } },
    { sheet: { ...proof.sheet, topLeftOverlayDarkRatio: 0 } },
    { cta: { ...proof.cta, deepGreenRatio: 0.05 } },
    { gameSelection: { ...proof.gameSelection, winnerDomCount: 0 } },
    { gameSelection: { ...proof.gameSelection, loserSoftRatio: 0 } },
  ].forEach((patch) => {
    assert.equal(screenshotTool.validateModalRoiFreshnessProof(prepare, { ...proof, ...patch }).ok, false);
  });
  assert.equal(screenshotTool.validateModalRoiFreshnessProof(prepare, {}).ok, false);
});

test('modal ROI probes bottom-anchor flow offsets from a real 390 game-sheet prepare shape', () => {
  const prepare = validPrepare();
  prepare.name = 'waterV2Member24Game';
  prepare.dom = [
    { selector: '.water-game-sheet', offset: { left: 0, top: 753.197 }, size: { width: 390, height: 692 } },
    { selector: '.water-confirm-button', offset: { left: 28, top: 1360.197 }, size: { width: 334, height: 48 } },
    { selector: '.water-player-chip.is-winner', offset: { left: 20, top: 1150.197 }, size: { width: 110, height: 52 } },
    { selector: '.water-player-chip.is-loser', offset: { left: 260, top: 1210.197 }, size: { width: 110, height: 52 } },
  ];
  const probes = screenshotTool.buildModalRoiPixelProbes(prepare);
  assert.ok(probes.sheetSurface.y >= 0 && probes.sheetSurface.y < 1010);
  assert.ok(probes.cta.y >= 0 && probes.cta.y + probes.cta.height <= 1010);
  assert.ok(probes.winnerChip.y >= 0 && probes.winnerChip.y < 1010);
  assert.ok(probes.loserChip.y >= 0 && probes.loserChip.y < 1010);
  assert.ok(probes.cta.y > probes.winnerChip.y);
});

test('modal ROI probes preserve an in-viewport game-sheet top instead of re-anchoring it', () => {
  const prepare = validPrepare();
  prepare.name = 'waterV2Member24Game';
  prepare.dom = [
    { selector: '.water-game-sheet', offset: { left: 0, top: 60 }, size: { width: 390, height: 659 } },
    { selector: '.water-confirm-button', offset: { left: 14, top: 660 }, size: { width: 362, height: 48 } },
  ];
  const probes = screenshotTool.buildModalRoiPixelProbes(prepare);
  assert.ok(probes.sheetTopLeft.y < 100);
  assert.ok(probes.sheetTopRight.y < 100);
  assert.ok(probes.cta.y < 920);
});

test('transparent background publication requires ordered restore/end cleanup evidence', () => {
  const prepare = validPrepare();
  prepare.captureMode = 'printwindow-current';
  prepare.transparentTargetCapture = true;
  const cleanup = {
    kind: 'weapp-background-capture-cleanup-v1',
    targetHwnd: prepare.windowBinding.hwnd,
    targetProcessId: prepare.windowBinding.processId,
    begin: {
      ok: true,
      action: 'BeginPassive',
      completedAt: '2026-08-11T09:59:58.000Z',
      targetNeverForeground: true,
      transparent: true,
      clickThrough: true,
      originalDesktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
    },
    attach: {
      ok: true,
      action: 'Attach',
      completedAt: '2026-08-11T09:59:59.000Z',
      targetNeverForeground: true,
      geometryStable: true,
      attachedDesktopId: prepare.windowBinding.desktopId,
      internalPlacementProof: {
        kind: 'weapp-internal-desktop-placement-v1',
        currentDesktopId: prepare.windowBinding.desktopId,
        targetDesktopId: prepare.windowBinding.desktopId,
      },
    },
    rebind: {
      ok: true,
      action: 'RebindCurrent',
      completedAt: '2026-08-11T09:59:59.250Z',
      targetNeverForeground: true,
      geometryStable: true,
      transparent: true,
      clickThrough: true,
      alphaZero: true,
      sameCurrent: true,
      movePerformed: true,
      moveCount: 1,
      walRetained: true,
      attachedDesktopId: prepare.windowBinding.desktopId,
      internalPlacementProof: {
        kind: 'weapp-internal-desktop-placement-v1',
        currentDesktopId: prepare.windowBinding.desktopId,
        targetDesktopId: prepare.windowBinding.desktopId,
      },
      publicPlacementAvailable: true,
      publicPlacementProof: {
        desktopId: prepare.windowBinding.desktopId,
        onCurrentDesktop: true,
      },
      foregroundAfterMove: {
        hwnd: '0x7FEE',
        processId: prepare.windowBinding.processId + 1,
      },
      rebindReceipt: {
        kind: 'weapp-same-current-rebind-v1',
        attachedDesktopId: prepare.windowBinding.desktopId,
        sameCurrent: true,
        moveCount: 1,
        foregroundAfterMove: {
          hwnd: '0x7FEE',
          processId: prepare.windowBinding.processId + 1,
        },
        internalPlacementProof: {
          kind: 'weapp-internal-desktop-placement-v1',
          currentDesktopId: prepare.windowBinding.desktopId,
          targetDesktopId: prepare.windowBinding.desktopId,
        },
      },
    },
    materialize: {
      ok: true,
      action: 'MaterializeCurrent',
      completedAt: '2026-08-11T09:59:59.375Z',
      targetNeverForeground: true,
      geometryStable: true,
      transparent: true,
      clickThrough: true,
      alphaZero: true,
      cloakStateZero: true,
      originalVisible: true,
      liveVisible: true,
      minimized: false,
      materializeCount: 1,
      showWindowFlag: true,
      walRetained: true,
      attachedDesktopId: prepare.windowBinding.desktopId,
      foregroundAfterMaterialize: {
        hwnd: '0x7FEE',
        processId: prepare.windowBinding.processId + 1,
      },
      internalPlacementProof: {
        kind: 'weapp-internal-desktop-placement-v1',
        currentDesktopId: prepare.windowBinding.desktopId,
        targetDesktopId: prepare.windowBinding.desktopId,
      },
      publicPlacementAvailable: true,
      publicPlacementProof: {
        desktopId: prepare.windowBinding.desktopId,
        onCurrentDesktop: true,
      },
      materializeReceipt: {
        kind: 'weapp-current-materialize-v1',
        attachedDesktopId: prepare.windowBinding.desktopId,
        materializeCount: 1,
        showWindowFlag: true,
        cloakStateZero: true,
        originalVisible: true,
        liveVisible: true,
        targetNeverForeground: true,
        geometryStable: true,
        transparent: true,
        clickThrough: true,
        alphaZero: true,
        foregroundAfterMaterialize: {
          hwnd: '0x7FEE',
          processId: prepare.windowBinding.processId + 1,
        },
        internalPlacementProof: {
          kind: 'weapp-internal-desktop-placement-v1',
          currentDesktopId: prepare.windowBinding.desktopId,
          targetDesktopId: prepare.windowBinding.desktopId,
        },
      },
    },
    wake: {
      ok: true,
      action: 'WakeCurrent',
      completedAt: '2026-08-11T09:59:59.500Z',
      targetNeverForeground: true,
      geometryStable: true,
      transparent: true,
      clickThrough: true,
      painted: true,
      currentDesktop: true,
      bridgeReceipt: {
        kind: 'weapp-internal-desktop-placement-v1',
        currentDesktopId: prepare.windowBinding.desktopId,
        targetDesktopId: prepare.windowBinding.desktopId,
      },
    },
    capturedAt: '2026-08-11T10:00:00.000Z',
    restore: {
      ok: true,
      action: 'Restore',
      completedAt: '2026-08-11T10:00:01.000Z',
      targetNeverForeground: true,
      geometryStable: true,
      originalDesktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
      currentDesktopId: prepare.windowBinding.desktopId,
      walRetained: true,
      internalPlacementProof: {
        kind: 'weapp-internal-desktop-placement-v1',
        currentDesktopId: prepare.windowBinding.desktopId,
        targetDesktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
      },
    },
    end: {
      ok: true,
      action: 'End',
      completedAt: '2026-08-11T10:00:02.000Z',
      targetNeverForeground: true,
      geometryStable: true,
      styleRestored: true,
      originalDesktopRestored: true,
      publicPlacementAvailable: true,
      publicPlacement: {
        desktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
        onCurrentDesktop: false,
      },
      bridgeStateDeleted: true,
      stateDeleted: true,
    },
    originalDesktopId: 'b87391b3-f4aa-4111-9bac-5cde1f3adfe7',
  };
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, cleanup).ok, true);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {}).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    end: { ...cleanup.end, completedAt: '2026-08-11T09:59:59.000Z' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    attach: { ...cleanup.attach, completedAt: '2026-08-11T09:59:57.000Z' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    rebind: { ...cleanup.rebind, completedAt: '2026-08-11T09:59:58.500Z' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    materialize: { ...cleanup.materialize, completedAt: '2026-08-11T09:59:59.125Z' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    materialize: { ...cleanup.materialize, materializeCount: 2 },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    materialize: { ...cleanup.materialize, originalVisible: false },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    materialize: {
      ...cleanup.materialize,
      foregroundAfterMaterialize: {
        ...cleanup.materialize.foregroundAfterMaterialize,
        processId: prepare.windowBinding.processId,
      },
    },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    rebind: { ...cleanup.rebind, moveCount: 2 },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    rebind: { ...cleanup.rebind, action: 'Attach' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    rebind: {
      ...cleanup.rebind,
      foregroundAfterMove: {
        ...cleanup.rebind.foregroundAfterMove,
        hwnd: prepare.windowBinding.hwnd,
      },
    },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    wake: { ...cleanup.wake, completedAt: '2026-08-11T10:00:00.500Z' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    wake: { ...cleanup.wake, action: 'BeginPassive' },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    restore: { ...cleanup.restore, targetNeverForeground: false },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    restore: { ...cleanup.restore, currentDesktopId: cleanup.originalDesktopId },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    end: { ...cleanup.end, publicPlacementAvailable: false },
  }).ok, false);
  assert.equal(screenshotTool.validateBackgroundCleanupEvidence(prepare, {
    ...cleanup,
    end: { ...cleanup.end, bridgeStateDeleted: false },
  }).ok, false);
  assert.match(String(screenshotTool.capturePreparedWin32), /backgroundCleanupValidation/);
  assert.match(String(screenshotTool.capturePreparedWin32), /publicationEligible[\s\S]*backgroundCleanupValidation\.ok/);
});

test('transparent current-desktop PrintWindow waits bounded for DWM uncloaking before capture', () => {
  const helper = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts', 'dev', 'weapp-devtools-win32-capture.ps1'),
    'utf8'
  );
  const waitDefinition = helper.indexOf('function Wait-TransparentCurrentCaptureReadiness');
  const resolveDefinition = helper.indexOf('function Resolve-BoundWindow');
  assert.ok(waitDefinition >= 0 && resolveDefinition > waitDefinition);
  const waitBody = helper.slice(waitDefinition, resolveDefinition);

  assert.match(waitBody, /\[int\]\$Attempts\s*=\s*60/);
  assert.match(waitBody, /\[int\]\$DelayMilliseconds\s*=\s*100/);
  assert.match(waitBody, /InspectWindow\(\$TargetHwnd\)/);
  assert.match(waitBody, /sameHwnd/);
  assert.match(waitBody, /sameProcessId/);
  assert.match(waitBody, /geometryStable/);
  assert.match(waitBody, /transparentStable/);
  assert.match(waitBody, /targetNeverForeground/);
  assert.match(waitBody, /cloakStateZero/);
  assert.match(waitBody, /lastWindow/);
  assert.match(waitBody, /predicates/);
  assert.match(waitBody, /timed out before PrintWindow/);
  assert.match(waitBody, /Start-Sleep -Milliseconds \$DelayMilliseconds/);

  const waitCall = helper.indexOf('Wait-TransparentCurrentCaptureReadiness', resolveDefinition);
  const captureCall = helper.indexOf(
    '[Codex.WeappCapture.NativeCapture]::CapturePrintWindowFrame(',
    waitCall
  );
  assert.ok(waitCall >= 0 && captureCall > waitCall);
  assert.doesNotMatch(helper, /DwmSetWindowAttribute/);
});

test('PrintWindow helper path is DPI-V2-first, single-call, background-only and keeps visible capture isolated', () => {
  const helper = fs.readFileSync(helperPath, 'utf8');
  const dpiCall = helper.indexOf('[Codex.WeappCapture.NativeCapture]::EnableDpiAwareness()');
  const targetLookup = helper.indexOf('$window = Resolve-BoundWindow $request');
  assert.ok(dpiCall >= 0 && targetLookup > dpiCall, 'DPI awareness must precede target lookup');
  assert.match(helper, /EntryPoint\s*=\s*['"]PrintWindow['"]/);
  assert.match(helper, /PW_RENDERFULLCONTENT|PwRenderFullContent/);
  assert.match(helper, /CapturePrintWindowFrame/);
  assert.match(helper, /captureMode/i);
  assert.match(helper, /GetLayeredWindowAttributes/);
  assert.match(helper, /WS_EX_LAYERED/);
  assert.match(helper, /WS_EX_TRANSPARENT/);
  assert.doesNotMatch(helper, /WS_EX_NOACTIVATE/);
  assert.match(helper, /transparentTargetCapture/);
  assert.match(helper, /desktopProbeUnavailable/);
  assert.doesNotMatch(helper, /SetForegroundWindow|BringWindowToTop|SetWindowPos|ShowWindow|SendInput|mouse_event|keybd_event/);

  const printStart = helper.indexOf('public static BitmapEvidence CapturePrintWindowFrame');
  const visibleStart = helper.indexOf('public static BitmapEvidence CaptureVisibleFrame');
  assert.ok(printStart >= 0 && visibleStart >= 0);
  const printBody = helper.slice(printStart, helper.indexOf('\n    public static ', printStart + 20));
  const visibleBody = helper.slice(visibleStart, printStart > visibleStart ? printStart : helper.indexOf('\n    public static ', visibleStart + 20));
  assert.equal((printBody.match(/RenderWindow\s*\(/g) || []).length, 1);
  assert.doesNotMatch(printBody, /CopyFromScreen/);
  assert.match(visibleBody, /CopyFromScreen/);
});

test('capture receipt kind distinguishes visible, off-desktop and current-desktop PrintWindow from capturePage output', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /captureKind,/);
  assert.match(script, /wechat-devtools-win32-visible-crop-v1/);
  assert.match(script, /wechat-devtools-win32-offdesktop-printwindow-crop-v1/);
  assert.match(script, /wechat-devtools-win32-current-desktop-occluded-printwindow-crop-v1/);
  assert.match(script, /fully occluded behind a stable user foreground window/);
});

test('failed Win32 validation keeps prior final artifacts byte-for-byte and leaves nonce-bound candidates', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-win32-publish-failure-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const prepare = {
    ...validPrepare(),
    output: path.join(tempDir, 'waterV2OwnerEmpty.png'),
    fullFramePath: path.join(tempDir, 'waterV2OwnerEmpty.devtools-full-frame.png'),
    receiptPath: path.join(tempDir, 'waterV2OwnerEmpty.receipt.json'),
  };
  const plan = screenshotTool.buildWin32ArtifactPlan(prepare);
  fs.mkdirSync(plan.candidateDir, { recursive: true });
  fs.writeFileSync(prepare.output, 'prior-crop');
  fs.writeFileSync(prepare.fullFramePath, 'prior-frame');
  fs.writeFileSync(prepare.receiptPath, 'prior-receipt');
  fs.writeFileSync(plan.candidateCropPath, 'failed-crop-candidate');
  fs.writeFileSync(plan.candidateFullFramePath, 'failed-frame-candidate');

  const publication = screenshotTool.publishWin32CandidateArtifacts(plan, {
    eligible: false,
    reason: 'post-capture validation failed',
  });

  assert.equal(publication.attempted, false);
  assert.equal(publication.published, false);
  assert.equal(publication.candidateDisposition, 'retained-for-diagnostics');
  assert.equal(plan.binding.prepareId, prepare.prepareId);
  assert.equal(plan.binding.nonce, prepare.nonce);
  assert.match(plan.candidateDir, new RegExp(plan.bindingHash.slice(0, 32)));
  assert.equal(fs.readFileSync(prepare.output, 'utf8'), 'prior-crop');
  assert.equal(fs.readFileSync(prepare.fullFramePath, 'utf8'), 'prior-frame');
  assert.equal(fs.readFileSync(prepare.receiptPath, 'utf8'), 'prior-receipt');
  assert.equal(fs.readFileSync(plan.candidateCropPath, 'utf8'), 'failed-crop-candidate');
  assert.equal(fs.readFileSync(plan.candidateFullFramePath, 'utf8'), 'failed-frame-candidate');

  fs.unlinkSync(prepare.output);
  fs.unlinkSync(prepare.fullFramePath);
  const noPriorFinal = screenshotTool.publishWin32CandidateArtifacts(plan, {
    eligible: false,
    reason: 'receipt validation failed',
  });
  assert.equal(noPriorFinal.published, false);
  assert.equal(fs.existsSync(prepare.output), false);
  assert.equal(fs.existsSync(prepare.fullFramePath), false);
});

test('successful Win32 validation atomically publishes candidates to final image paths', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-win32-publish-success-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const prepare = {
    ...validPrepare(),
    output: path.join(tempDir, 'waterV2OwnerEmpty.png'),
    fullFramePath: path.join(tempDir, 'waterV2OwnerEmpty.devtools-full-frame.png'),
    receiptPath: path.join(tempDir, 'waterV2OwnerEmpty.receipt.json'),
  };
  const plan = screenshotTool.buildWin32ArtifactPlan(prepare);
  fs.mkdirSync(plan.candidateDir, { recursive: true });
  fs.writeFileSync(prepare.output, 'prior-crop');
  fs.writeFileSync(prepare.fullFramePath, 'prior-frame');
  fs.writeFileSync(plan.candidateCropPath, 'validated-crop-candidate');
  fs.writeFileSync(plan.candidateFullFramePath, 'validated-frame-candidate');

  const publication = screenshotTool.publishWin32CandidateArtifacts(plan, {
    eligible: true,
  });

  assert.equal(publication.attempted, true);
  assert.equal(publication.published, true);
  assert.equal(publication.candidateDisposition, 'retained-for-diagnostics');
  assert.equal(fs.readFileSync(prepare.output, 'utf8'), 'validated-crop-candidate');
  assert.equal(fs.readFileSync(prepare.fullFramePath, 'utf8'), 'validated-frame-candidate');
  assert.equal(fs.readFileSync(plan.candidateCropPath, 'utf8'), 'validated-crop-candidate');
  assert.equal(fs.readFileSync(plan.candidateFullFramePath, 'utf8'), 'validated-frame-candidate');
  assert.equal(fs.existsSync(`${prepare.output}.tmp`), false);
  assert.equal(fs.existsSync(`${prepare.fullFramePath}.tmp`), false);
});

test('Win32 helper request can only write nonce-bound diagnostic candidates, never final image paths', () => {
  const prepare = {
    ...validPrepare(),
    output: path.resolve('final', 'waterV2OwnerEmpty.png'),
    fullFramePath: path.resolve('final', 'waterV2OwnerEmpty.devtools-full-frame.png'),
    receiptPath: path.resolve('final', 'waterV2OwnerEmpty.receipt.json'),
  };
  const plan = screenshotTool.buildWin32ArtifactPlan(prepare);
  const request = screenshotTool.buildWin32CaptureRequest(prepare, { artifactPlan: plan });

  assert.equal(request.prepareId, prepare.prepareId);
  assert.equal(request.nonce, prepare.nonce);
  assert.equal(request.artifactBindingHash, plan.bindingHash);
  assert.equal(request.cropPath, plan.candidateCropPath);
  assert.equal(request.fullFramePath, plan.candidateFullFramePath);
  assert.notEqual(request.cropPath, prepare.output);
  assert.notEqual(request.fullFramePath, prepare.fullFramePath);
});

test('Win32 helper creates the nonce-bound request directory before invoking PowerShell', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-win32-helper-request-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const helperPath = path.join(tempDir, 'helper.ps1');
  const requestPath = path.join(tempDir, 'nested', 'candidate', 'win32-request.json');
  fs.writeFileSync(helperPath, '# test helper\n');

  const result = screenshotTool.invokeWin32Helper(
    'Capture',
    { kind: 'request' },
    {
      allowNonWindows: true,
      helperPath,
      requestPath,
      powershellPath: 'powershell.exe',
      spawnSync() {
        assert.equal(fs.existsSync(requestPath), true);
        return { status: 0, stdout: '{"ok":true}', stderr: '' };
      },
    }
  );

  assert.deepEqual(result, { ok: true });
});
