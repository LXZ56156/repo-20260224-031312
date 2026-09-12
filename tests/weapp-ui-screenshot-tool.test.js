const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const screenshotTool = require('../scripts/dev/weapp-ui-screenshot');
const screenshotScriptSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts/dev/weapp-ui-screenshot.js'),
  'utf8'
);

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function createPngBuffer(width, height, byteLength = 24 * 1024) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = (width * 4) + 1;
  const pixels = Buffer.alloc(rowBytes * height);
  const padding = Buffer.alloc(Math.max(0, byteLength), 120);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', padding),
    pngChunk('IDAT', zlib.deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createListenerIdentity(endpoint, port) {
  return {
    ok: true,
    endpoint,
    port,
    localAddresses: ['127.0.0.1'],
    owningProcessId: 4321,
    processStartFileTimeUtc: '133999999999999999',
    sessionId: 1,
    executablePath: 'D:\\Soft\\微信web开发者工具\\wechatdevtools.exe',
    backgroundCaptureFlags: {
      disableBackgroundingOccludedWindows: true,
    },
    processChain: [{
      processId: 4321,
      parentProcessId: 1,
      processStartFileTimeUtc: '133999999999999999',
      sessionId: 1,
      executablePath: 'D:\\Soft\\微信web开发者工具\\wechatdevtools.exe',
      backgroundCaptureFlags: {
        disableBackgroundingOccludedWindows: true,
      },
    }],
  };
}

function createSession(projectPath, endpoint, port, overrides = {}) {
  const listenerIdentity = createListenerIdentity(endpoint, port);
  return {
    kind: screenshotTool.SESSION_KIND,
    sessionId: 'a'.repeat(64),
    endpoint,
    sourceProjectPath: projectPath,
    projectPathHash: screenshotTool.hashCanonical(screenshotTool.normalizeProjectPath(projectPath)),
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.7.12',
    listenerIdentity,
    projectBinding: {
      ok: true,
      method: screenshotTool.PROJECT_BINDING_METHOD,
      listenerIdentityHash: screenshotTool.listenerIdentityHash(listenerIdentity),
    },
    gitManifestHash: screenshotTool.hashCanonical(screenshotTool.currentGitManifest()),
    ...overrides,
  };
}

test('CLI exposes only list, doctor and direct background capture modes', () => {
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['--list']), { mode: 'list', value: '' });
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['--doctor']), { mode: 'doctor', value: '' });
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['launch']), { mode: 'capture', value: ['launch'] });
  assert.throws(() => screenshotTool.parseScreenshotArgs(['--prepare', 'launch']), /removed|background/i);
  assert.throws(() => screenshotTool.parseScreenshotArgs(['--capture-win32', 'x.json']), /removed|background/i);
  assert.equal(screenshotTool.prepareCase, undefined);
  assert.equal(screenshotTool.capturePreparedWin32, undefined);
  assert.equal(screenshotTool.invokeWin32Helper, undefined);
});

test('viewport rebind requires an explicit positive target', () => {
  assert.deepEqual(screenshotTool.parseScreenshotArgs(['--rebind-viewport', '390']), {
    mode: 'refresh-session', value: '', rebindViewport: 390,
  });
  for (const args of [['--rebind-viewport'], ['--rebind-viewport', '0'], ['--rebind-viewport', 'auto']]) {
    assert.throws(() => screenshotTool.parseScreenshotArgs(args), /viewport/);
  }
});

test('explicit viewport rebind preserves launch provenance and requires two-stage compile proof', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-rebind-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const Module = require('node:module');
  const scriptPath = require.resolve('../scripts/dev/weapp-ui-screenshot');
  const isolated = new Module(scriptPath, module);
  isolated.filename = scriptPath;
  isolated.paths = Module._nodeModulePaths(path.dirname(scriptPath));
  isolated._compile(screenshotScriptSource + '\ncurrentGitManifest = () => ({ ok: true, head: "' + '1'.repeat(40) + '", dirty: false, status: [], files: [] });', scriptPath);
  const tool = isolated.exports;
  const projectPath = path.resolve(__dirname, '..');
  const session = createSession(projectPath, 'ws://127.0.0.1:39501', 39501, {
    expectedWindowWidth: 320, gitManifestHash: tool.hashCanonical(tool.currentGitManifest()),
  });
  const config = { session, sessionFile: path.join(tempDir, 'session.json'), wsEndpoint: session.endpoint,
    sourceProjectPath: projectPath, expectedWindowWidth: 320, expectedSDKVersion: '3.7.12' };
  let marker = null;
  let width = 390;
  let sdk = '3.7.12';
  let identity = session.listenerIdentity;
  const mini = {
    async send(command) { return command === 'Tool.getInfo' ? { SDKVersion: sdk, projectPath } : { path: 'pages/home/index' }; },
    async systemInfo() { return { windowWidth: width, windowHeight: 700, pixelRatio: 2, fontSizeSetting: 16 }; },
    async evaluate(_fn, value) { if (value === undefined) return marker; marker = value; return { ok: true, ...value }; },
  };
  const options = { resolveListenerIdentity: () => identity, rebindViewport: 390 };
  const daily = await tool.runDoctor(mini, {}, config, { resolveListenerIdentity: () => identity });
  assert.equal(daily.ok, false);
  assert.equal(daily.checks.viewport, false);
  for (const wrong of ['pid', 'sdk', 'target']) {
    identity = wrong === 'pid' ? { ...session.listenerIdentity, owningProcessId: 9999 } : session.listenerIdentity;
    sdk = wrong === 'sdk' ? '3.17.3' : '3.7.12';
    width = wrong === 'target' ? 430 : 390;
    const rejected = await tool.runDoctor(mini, {}, config, options);
    assert.equal(rejected.ok, false, wrong);
    assert.equal(fs.existsSync(config.sessionFile), false, wrong);
  }
  identity = session.listenerIdentity; sdk = '3.7.12'; width = 390;
  const first = await tool.runDoctor(mini, {}, config, options);
  assert.equal(first.ok, false);
  const pending = JSON.parse(fs.readFileSync(config.sessionFile, 'utf8'));
  assert.equal(pending.expectedWindowWidth, 320);
  assert.deepEqual(pending.pendingRefresh.viewportRebind, { from: 320, to: 390 });
  assert.equal((await tool.runDoctor(mini, {}, { ...config, session: pending }, options)).ok, false);
  marker = null; // Explicit background compilation rebuilt AppService.
  const final = await tool.runDoctor(mini, {}, { ...config, session: pending }, options);
  assert.equal(final.ok, true);
  const trusted = JSON.parse(fs.readFileSync(config.sessionFile, 'utf8'));
  assert.equal(trusted.expectedWindowWidth, 390);
  assert.deepEqual(trusted.projectBinding, session.projectBinding);
  assert.deepEqual(trusted.listenerIdentity, session.listenerIdentity);
  assert.equal(trusted.endpoint, session.endpoint);
  assert.equal(trusted.viewportRebindings.at(-1).from, 320);
  assert.equal(trusted.viewportRebindings.at(-1).to, 390);
  assert.equal(tool.validateSessionRecord(trusted, { ...config, session: trusted, expectedWindowWidth: 390 }).ok, true);
  width = 430;
  const drift = await tool.verifySessionBinding(mini, { ...config, session: trusted, expectedWindowWidth: 390 }, {
    resolveListenerIdentity: () => identity,
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.checks.viewport, false);
});

test('background capture accepts only an explicit loopback WebSocket endpoint', () => {
  assert.equal(screenshotTool.isLocalWebSocketEndpoint('ws://127.0.0.1:39450'), true);
  assert.equal(screenshotTool.isLocalWebSocketEndpoint('ws://localhost:39450'), false);
  assert.equal(screenshotTool.isLocalWebSocketEndpoint('ws://0.0.0.0:39450'), false);
  assert.equal(screenshotTool.isLocalWebSocketEndpoint('wss://127.0.0.1:39450'), false);
  assert.equal(screenshotTool.isLocalWebSocketEndpoint('ws://127.0.0.1'), false);
});

test('tool information preserves the official DevTools version without inferring a missing version', () => {
  assert.deepEqual(screenshotTool.selectToolInfo({ version: '2.02.2609102', SDKVersion: '3.17.2' }), {
    version: '2.02.2609102',
    SDKVersion: '3.17.2',
    platform: '',
    compileType: '',
    projectPath: '',
  });
  assert.equal(screenshotTool.selectToolInfo({ SDKVersion: '3.17.2' }).version, '');
  assert.equal(screenshotTool.selectToolInfo().version, '');
});

test('the archived legacy Home receipt is rejected by the strict evidence contract', () => {
  const legacyHomeEvidence = {
    expectedWindowWidth: 390,
    expectedRoute: '/pages/home/index',
    toolInfo: { SDKVersion: '3.14.2' },
    currentPageInfo: { path: 'pages/home/index', query: {} },
    systemInfo: {
      windowWidth: 390,
      windowHeight: 671,
      pixelRatio: 3,
      fontSizeSetting: 16,
    },
    png: {
      valid: true,
      width: 717,
      height: 1233,
      byteLength: 59377,
      sha256: '02f537ba10f5782a4f7c63775b4367fbf0c4f0f0a24e114572ee4e244ca47d73',
    },
    git: {
      ok: true,
      head: '55bfc4fa319ab74a33d406f05fbdab975ab8cfb7',
      dirty: false,
      status: [],
      files: [],
    },
    selectorCoverage: { ok: true },
    horizontalOverflow: { ok: true },
    projectProvenance: { ok: false },
  };
  const validation = screenshotTool.validateReceiptEvidence(legacyHomeEvidence);
  assert.equal(validation.ok, false);
  assert.equal(validation.checks.projectProvenance, false);
  assert.equal(validation.checks.sourceSnapshot, false);
  assert.equal(
    Object.entries(validation.checks)
      .filter(([name]) => !['projectProvenance', 'sourceSnapshot', 'caseData'].includes(name))
      .every(([, ok]) => ok),
    true
  );
});

test('simulator-frame is explicit, isolated and does not weaken source or PNG integrity gates', () => {
  const cwd = path.resolve(__dirname, '..');
  const env = { WEAPP_SCREENSHOT_DIR: 'tmp/surface-test/images', WEAPP_UI_RUN_ROOT: 'tmp/surface-test/runs' };
  const page = screenshotTool.readRuntimeConfig(env, cwd);
  const frame = screenshotTool.readRuntimeConfig({ ...env, WEAPP_CAPTURE_SURFACE: 'simulator-frame' }, cwd);
  assert.equal(page.captureSurface, 'page');
  assert.equal(frame.outDir, path.join(page.outDir, 'simulator-frame'));
  assert.equal(frame.runRoot, path.join(page.runRoot, 'simulator-frame'));
  assert.throws(() => screenshotTool.readRuntimeConfig({ WEAPP_CAPTURE_SURFACE: 'auto' }, cwd), /capture surface/i);
  const git = { ok: true, head: 'a'.repeat(40), dirty: false, status: [], files: [] };
  const evidence = {
    captureSurface: 'simulator-frame', expectedWindowWidth: 390, expectedRoute: 'pages/launch/index',
    toolInfo: { SDKVersion: '3.17.2' }, currentPageInfo: { path: 'pages/launch/index' },
    systemInfo: { windowWidth: 390, windowHeight: 671, pixelRatio: 3, fontSizeSetting: 16 },
    png: screenshotTool.inspectPngBuffer(createPngBuffer(476, 1026)), git,
    expectedGitManifestHash: screenshotTool.hashCanonical(git),
    selectorCoverage: { ok: true }, horizontalOverflow: { ok: true }, projectProvenance: { ok: true },
    caseData: { ok: true, fixtureNonce: 'a'.repeat(32), stateBeforeHash: 'b'.repeat(64), stateAfterHash: 'b'.repeat(64) },
  };
  const validation = screenshotTool.validateReceiptEvidence(evidence);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.captureSurface, {
    kind: 'simulator-frame', method: 'App.captureScreenshot', pageGeometryVerified: false, systemChromeNoise: true,
  });
  assert.equal(validation.pngScaleX, null);
  assert.equal(validation.pngScaleY, null);
  assert.equal(screenshotTool.validateReceiptEvidence({
    ...evidence, systemInfo: { ...evidence.systemInfo, windowHeight: 0 },
  }).ok, false);
  assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, captureSurface: 'page' }).checks.png, false);
  assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, captureSurface: undefined }).checks.png, false);
  assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, captureSurface: 'auto' }).ok, false);
  for (const png of [{ ...evidence.png, valid: false }, { ...evidence.png, sha256: '' }, { ...evidence.png, width: 476.5 }]) {
    assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, png }).ok, false);
  }
  assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, projectProvenance: { ok: false } }).ok, false);
  assert.equal(screenshotTool.validateReceiptEvidence({ ...evidence, expectedGitManifestHash: '' }).ok, false);
});

test('listener identity accepts the wildcard bind addresses used by Windows DevTools', () => {
  const endpoint = 'ws://127.0.0.1:39457';
  const result = screenshotTool.resolveListenerIdentity(endpoint, {
    platform: 'win32',
    spawnSync(executable, args) {
      assert.equal(executable, 'powershell.exe');
      const command = args[args.length - 1];
      assert.match(command, /Console\]::OutputEncoding = \[System\.Text\.UTF8Encoding\]::new\(\$false\)/);
      assert.match(command, /LocalAddress -eq '127\.0\.0\.1'/);
      assert.match(command, /LocalAddress -eq '::1'/);
      assert.match(command, /LocalAddress -eq '0\.0\.0\.0'/);
      assert.match(command, /LocalAddress -eq '::'/);
      assert.match(command, /disable-backgrounding-occluded-windows/);
      return {
        status: 0,
        stdout: JSON.stringify({ ok: false, reason: 'not-found', port: 39457 }),
        stderr: '',
      };
    },
  });
  assert.deepEqual(result, { ok: false, reason: 'not-found', port: 39457 });
});

test('route evidence includes normalized query parameters', () => {
  assert.equal(
    screenshotTool.locationsMatch(
      { path: 'pages/water/index', query: { id: 'demo', tab: 'ledger' } },
      '/pages/water/index?tab=ledger&id=demo'
    ),
    true
  );
  assert.equal(
    screenshotTool.locationsMatch(
      { path: 'pages/water/index', query: { id: 'wrong' } },
      '/pages/water/index?id=demo'
    ),
    false
  );
});

test('listener identity pins endpoint, owner process and process start time', () => {
  const endpoint = 'ws://127.0.0.1:39456';
  const expected = createListenerIdentity(endpoint, 39456);
  assert.equal(screenshotTool.validateListenerIdentity(expected, expected).ok, true);
  assert.equal(screenshotTool.validateListenerIdentity({
    ...expected,
    processStartFileTimeUtc: '133000000000000000',
  }, expected).ok, false);
  assert.equal(screenshotTool.validateDevToolsOwnership(
    expected,
    'D:\\Soft\\微信web开发者工具\\cli.bat'
  ).ok, true);
  assert.equal(screenshotTool.validateBackgroundCaptureProcessFlags(expected).ok, true);
  assert.equal(screenshotTool.validateBackgroundCaptureProcessFlags({
    ...expected,
    backgroundCaptureFlags: { disableBackgroundingOccludedWindows: false },
    processChain: expected.processChain.map((item) => ({
      ...item,
      backgroundCaptureFlags: { disableBackgroundingOccludedWindows: false },
    })),
  }).ok, false);
});

test('the shared screenshot session lock rejects a live second owner and releases by token', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-lock-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  const resolveProcessIdentity = (processId) => ({
    ok: true,
    processId,
    processStartFileTimeUtc: 'lock-owner-start',
  });
  const first = screenshotTool.acquireSessionLock(sessionFile, 'first', { resolveProcessIdentity });
  assert.throws(
    () => screenshotTool.acquireSessionLock(sessionFile, 'second', { resolveProcessIdentity }),
    /session is busy/i
  );
  assert.deepEqual(screenshotTool.releaseSessionLock(first), { ok: true, released: true });
  const second = screenshotTool.acquireSessionLock(sessionFile, 'second', { resolveProcessIdentity });
  assert.equal(screenshotTool.releaseSessionLock(second).ok, true);
});

test('session lock release fails closed when the owned lock is missing or unreadable', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-release-lock-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  const resolveProcessIdentity = (processId) => ({
    ok: true,
    processId,
    processStartFileTimeUtc: 'release-owner-start',
  });

  const unreadable = screenshotTool.acquireSessionLock(sessionFile, 'unreadable', { resolveProcessIdentity });
  fs.writeFileSync(unreadable.lockFile, '{malformed', 'utf8');
  assert.deepEqual(screenshotTool.releaseSessionLock(unreadable), {
    ok: false,
    released: false,
    reason: 'lock exists but is unreadable',
  });
  assert.throws(
    () => screenshotTool.releaseSessionLockOrThrow(unreadable),
    /lock release failed/i
  );
  assert.equal(fs.existsSync(unreadable.lockFile), true);
  fs.rmSync(unreadable.lockFile);

  const missing = screenshotTool.acquireSessionLock(sessionFile, 'missing', { resolveProcessIdentity });
  fs.rmSync(missing.lockFile);
  assert.deepEqual(screenshotTool.releaseSessionLock(missing), {
    ok: false,
    released: false,
    reason: 'lock missing before release',
  });
});

test('only prewarm recovers a PID-reused stale session lock without deleting evidence', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-stale-lock-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  const first = screenshotTool.acquireSessionLock(sessionFile, 'old', {
    resolveProcessIdentity: (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'old-start' }),
  });
  const newIdentity = (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'new-start' });
  assert.throws(
    () => screenshotTool.acquireSessionLock(sessionFile, 'capture', { resolveProcessIdentity: newIdentity }),
    /must be recovered by a new ui:prewarm/i
  );
  const recovered = screenshotTool.acquireSessionLock(sessionFile, 'prewarm', {
    resolveProcessIdentity: newIdentity,
    allowStaleRecovery: true,
  });
  assert.notEqual(recovered.token, first.token);
  assert.equal(
    fs.readdirSync(tempDir).some((name) => name.startsWith('session.json.lock.stale-')),
    true
  );
  assert.equal(fs.existsSync(screenshotTool.sessionRecoveryFile(sessionFile)), true);
  assert.equal(screenshotTool.releaseSessionLock(recovered).ok, true);
  assert.equal(screenshotTool.clearSessionRecovery(sessionFile).ok, true);
});

test('stale-lock recovery rechecks the token and never moves a replacement owner', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-lock-aba-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  const first = screenshotTool.acquireSessionLock(sessionFile, 'old', {
    resolveProcessIdentity: (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'old-start' }),
  });
  const replacement = {
    ...first,
    token: 'b'.repeat(48),
    purpose: 'replacement',
    processStartFileTimeUtc: 'new-start',
  };
  assert.throws(
    () => screenshotTool.acquireSessionLock(sessionFile, 'prewarm', {
      allowStaleRecovery: true,
      resolveProcessIdentity: (processId) => ({
        ok: true,
        processId,
        processStartFileTimeUtc: 'new-start',
      }),
      beforeStaleRecheck({ lockFile }) {
        fs.writeFileSync(lockFile, `${JSON.stringify(replacement, null, 2)}\n`, 'utf8');
      },
    }),
    /session is busy/i
  );
  assert.equal(JSON.parse(fs.readFileSync(first.lockFile, 'utf8')).token, replacement.token);
  assert.equal(fs.existsSync(`${first.lockFile}.stale-${replacement.token}`), false);
  assert.deepEqual(screenshotTool.releaseSessionLock(replacement), { ok: true, released: true });
});

test('a durable recovery barrier rejects capture inside the stale-lock rename gap', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-recovery-gap-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  screenshotTool.acquireSessionLock(sessionFile, 'old', {
    resolveProcessIdentity: (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'old-start' }),
  });
  const newIdentity = (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'new-start' });
  let checkedGap = false;
  const recovered = screenshotTool.acquireSessionLock(sessionFile, 'prewarm', {
    allowStaleRecovery: true,
    resolveProcessIdentity: newIdentity,
    afterStaleRename({ lockFile, recoveryFile }) {
      assert.equal(fs.existsSync(lockFile), false);
      assert.equal(fs.existsSync(recoveryFile), true);
      assert.throws(
        () => screenshotTool.acquireSessionLock(sessionFile, 'capture', {
          resolveProcessIdentity: newIdentity,
        }),
        /recovery is incomplete|recovery started/i
      );
      checkedGap = true;
    },
  });
  assert.equal(checkedGap, true);
  assert.equal(screenshotTool.releaseSessionLock(recovered).ok, true);
  assert.equal(screenshotTool.clearSessionRecovery(sessionFile).ok, true);
});

test('a crash after stale-lock rename leaves a barrier that only a new prewarm can clear', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-recovery-crash-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sessionFile = path.join(tempDir, 'session.json');
  screenshotTool.acquireSessionLock(sessionFile, 'old', {
    resolveProcessIdentity: (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'old-start' }),
  });
  const newIdentity = (processId) => ({ ok: true, processId, processStartFileTimeUtc: 'new-start' });
  assert.throws(
    () => screenshotTool.acquireSessionLock(sessionFile, 'prewarm', {
      allowStaleRecovery: true,
      resolveProcessIdentity: newIdentity,
      afterStaleRename() { throw new Error('injected post-rename crash'); },
    }),
    /injected post-rename crash/
  );
  assert.equal(fs.existsSync(`${sessionFile}.lock`), false);
  assert.equal(fs.existsSync(screenshotTool.sessionRecoveryFile(sessionFile)), true);
  assert.throws(
    () => screenshotTool.acquireSessionLock(sessionFile, 'doctor', { resolveProcessIdentity: newIdentity }),
    /recovery is incomplete/i
  );
  const recovered = screenshotTool.acquireSessionLock(sessionFile, 'prewarm', {
    allowStaleRecovery: true,
    resolveProcessIdentity: newIdentity,
  });
  assert.equal(screenshotTool.releaseSessionLock(recovered).ok, true);
  assert.equal(screenshotTool.clearSessionRecovery(sessionFile).ok, true);
});

test('PNG inspection rejects truncated data and CRC corruption', () => {
  const valid = createPngBuffer(2, 2, 0);
  assert.equal(screenshotTool.inspectPngBuffer(valid).valid, true);
  assert.equal(screenshotTool.inspectPngBuffer(valid.subarray(0, valid.length - 3)).valid, false);
  const corrupted = Buffer.from(valid);
  corrupted[corrupted.length - 5] ^= 0xff;
  assert.equal(screenshotTool.inspectPngBuffer(corrupted).valid, false);
});

test('doctor session receipt becomes the only implicit capture configuration', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-config-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const sessionFile = path.join(tempDir, 'session.json');
  const session = createSession(projectPath, 'ws://127.0.0.1:39451', 39451);
  fs.writeFileSync(sessionFile, JSON.stringify(session), 'utf8');

  const config = screenshotTool.readRuntimeConfig({ WEAPP_UI_SESSION_FILE: sessionFile }, projectPath);
  assert.equal(config.wsEndpoint, session.endpoint);
  assert.equal(config.sourceProjectPath, projectPath);
  assert.equal(config.expectedWindowWidth, 390);
  assert.equal(config.expectedSDKVersion, '3.7.12');
  assert.equal(screenshotTool.validateSessionRecord(session, config).ok, true);
  assert.equal(screenshotTool.validateSessionRecord({ ...session, endpoint: 'ws://127.0.0.1:39452' }, config).ok, false);
  const explicitOnly = screenshotTool.readRuntimeConfig(
    { WEAPP_UI_SESSION_FILE: sessionFile },
    projectPath,
    { allowSessionFallback: false }
  );
  assert.equal(explicitOnly.wsEndpoint, '');
  assert.equal(explicitOnly.sourceProjectPath, '');
  assert.equal(explicitOnly.expectedWindowWidth, 0);
  assert.equal(explicitOnly.session, null);
});

test('poisoned or recovering sessions fail closed until a new prewarm clears the marker', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-session-poison-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const sessionFile = path.join(tempDir, 'session.json');
  const session = createSession(projectPath, 'ws://127.0.0.1:39461', 39461);
  fs.writeFileSync(sessionFile, JSON.stringify(session), 'utf8');
  fs.writeFileSync(screenshotTool.sessionPoisonFile(sessionFile), JSON.stringify({
    kind: 'weapp-ui-session-poison-v1',
    reason: 'test-timeout',
  }), 'utf8');

  const poisoned = screenshotTool.readRuntimeConfig({ WEAPP_UI_SESSION_FILE: sessionFile }, projectPath);
  const validation = screenshotTool.validateRuntimeConfig(poisoned, { requireSession: true });
  assert.equal(validation.ok, false);
  assert.equal(validation.checks.sessionNotPoisoned, false);
  assert.equal(screenshotTool.clearSessionPoison(sessionFile).ok, true);
  const recovered = screenshotTool.readRuntimeConfig({ WEAPP_UI_SESSION_FILE: sessionFile }, projectPath);
  assert.equal(screenshotTool.validateRuntimeConfig(recovered, { requireSession: true }).checks.sessionNotPoisoned, true);

  fs.writeFileSync(screenshotTool.sessionPoisonFile(sessionFile), '{malformed', 'utf8');
  const malformed = screenshotTool.readRuntimeConfig({ WEAPP_UI_SESSION_FILE: sessionFile }, projectPath);
  assert.equal(malformed.sessionPoison, null);
  assert.equal(malformed.sessionPoisonExists, true);
  assert.equal(
    screenshotTool.validateRuntimeConfig(malformed, { requireSession: true }).checks.sessionNotPoisoned,
    false
  );
  assert.equal(screenshotTool.clearSessionPoison(sessionFile).ok, true);

  fs.writeFileSync(screenshotTool.sessionRecoveryFile(sessionFile), '{malformed', 'utf8');
  const recovering = screenshotTool.readRuntimeConfig({ WEAPP_UI_SESSION_FILE: sessionFile }, projectPath);
  const recoveringValidation = screenshotTool.validateRuntimeConfig(recovering, { requireSession: true });
  assert.equal(recovering.sessionRecovery, null);
  assert.equal(recovering.sessionRecoveryExists, true);
  assert.equal(recoveringValidation.checks.sessionNotRecovering, false);
  assert.equal(recoveringValidation.ok, false);
  assert.equal(screenshotTool.clearSessionRecovery(sessionFile).ok, true);
});

test('main acquires the session lock before reading the mutable session receipt', () => {
  const mainStart = screenshotScriptSource.indexOf('async function main()');
  const lockRead = screenshotScriptSource.indexOf('const sessionLock = acquireSessionLock(sessionFile, command.mode);', mainStart);
  const configRead = screenshotScriptSource.indexOf('config = readRuntimeConfig(process.env, process.cwd()', mainStart);
  assert.notEqual(mainStart, -1);
  assert.notEqual(lockRead, -1);
  assert.notEqual(configRead, -1);
  assert.equal(lockRead < configRead, true);
});

test('ui:doctor refreshes only a launch-signed exact hot session', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-doctor-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const endpoint = 'ws://127.0.0.1:39453';
  const session = createSession(projectPath, endpoint, 39453);
  const config = {
    wsEndpoint: endpoint,
    sourceProjectPath: projectPath,
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.7.12',
    sessionFile: path.join(tempDir, 'session.json'),
    session,
  };
  const miniProgram = {
    async send(command) {
      if (command === 'Tool.getInfo') {
        return { SDKVersion: '3.7.12', projectPath, platform: 'devtools' };
      }
      if (command === 'App.getCurrentPage') return { path: 'pages/home/index' };
      throw new Error(`Unexpected command: ${command}`);
    },
    async systemInfo() {
      return {
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 2,
        fontSizeSetting: 16,
      };
    },
    async evaluate(_fn, marker) {
      if (typeof marker === 'undefined') {
        return {
          sessionId: session.sessionId,
          projectPathHash: session.projectPathHash,
          listenerIdentityHash: session.projectBinding.listenerIdentityHash,
        };
      }
      return {
        ok: true,
        sessionId: marker.sessionId,
        projectPathHash: marker.projectPathHash,
        listenerIdentityHash: marker.listenerIdentityHash,
      };
    },
  };

  const result = await screenshotTool.runDoctor(
    miniProgram,
    { mode: 'connect-preopened' },
    config,
    { resolveListenerIdentity: () => session.listenerIdentity }
  );
  assert.equal(result.ok, true);
  assert.equal(result.connectionMode, 'connect-preopened');
  assert.equal(fs.existsSync(config.sessionFile), true);
  const refreshedSession = JSON.parse(fs.readFileSync(config.sessionFile, 'utf8'));
  assert.equal(refreshedSession.endpoint, config.wsEndpoint);
  assert.equal(refreshedSession.sourceProjectPath, projectPath);
  assert.equal(refreshedSession.expectedSDKVersion, '3.7.12');
  assert.notEqual(refreshedSession.sessionId, session.sessionId);
  assert.equal(screenshotTool.validateSessionRecord(refreshedSession, { ...config, session: refreshedSession }).ok, true);
});

test('ui:doctor requires a source challenge to disappear before signing changed source', async (t) => {
  // This case tests recompilation proof against unchanged source. Keep its Git
  // snapshot independent of concurrent edits in the shared working tree.
  const Module = require('node:module');
  const scriptPath = require.resolve('../scripts/dev/weapp-ui-screenshot');
  const isolatedModule = new Module(scriptPath, module);
  isolatedModule.filename = scriptPath;
  isolatedModule.paths = Module._nodeModulePaths(path.dirname(scriptPath));
  isolatedModule._compile(screenshotScriptSource + '\ncurrentGitManifest = () => ({ ok: true, head: "' + '1'.repeat(40) + '", dirty: false, status: [], files: [] });', scriptPath);
  const doctorTool = isolatedModule.exports;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-doctor-stale-runtime-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const endpoint = 'ws://127.0.0.1:39457';
  const session = createSession(projectPath, endpoint, 39457, {
    gitManifestHash: 'f'.repeat(64),
  });
  let bindCalls = 0;
  let runtimeMarker = {
    sessionId: session.sessionId,
    projectPathHash: session.projectPathHash,
    listenerIdentityHash: session.projectBinding.listenerIdentityHash,
  };
  const miniProgram = {
    async send(command) {
      if (command === 'Tool.getInfo') return { SDKVersion: '3.7.12', projectPath };
      if (command === 'App.getCurrentPage') return { path: 'pages/home/index' };
      throw new Error(`Unexpected command: ${command}`);
    },
    async systemInfo() {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 2, fontSizeSetting: 16 };
    },
    async evaluate(_fn, marker) {
      if (typeof marker === 'undefined') return runtimeMarker;
      bindCalls += 1;
      runtimeMarker = marker;
      return {
        ok: true,
        sessionId: marker.sessionId,
        projectPathHash: marker.projectPathHash,
        listenerIdentityHash: marker.listenerIdentityHash,
      };
    },
  };
  const sessionFile = path.join(tempDir, 'session.json');
  const config = {
    wsEndpoint: endpoint,
    sourceProjectPath: projectPath,
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.7.12',
    sessionFile,
    session,
  };
  const result = await doctorTool.runDoctor(
    miniProgram,
    { mode: 'connect-preopened' },
    config,
    { resolveListenerIdentity: () => session.listenerIdentity }
  );
  assert.equal(result.ok, false);
  assert.equal(result.sourceSnapshotChanged, true);
  assert.equal(result.priorMarkerMatchesSession, true);
  assert.equal(result.checks.runtimeRecompiledForChangedSource, false);
  assert.equal(bindCalls, 1);
  assert.equal(fs.existsSync(sessionFile), true, result.action);
  const pendingSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  assert.equal(pendingSession.gitManifestHash, session.gitManifestHash);
  assert.match(pendingSession.pendingRefresh.challengeId, /^[a-f0-9]{64}$/);

  runtimeMarker = null;
  const finalized = await doctorTool.runDoctor(
    miniProgram,
    { mode: 'connect-preopened' },
    { ...config, session: pendingSession },
    { resolveListenerIdentity: () => session.listenerIdentity }
  );
  assert.equal(finalized.ok, true);
  assert.equal(finalized.changedSourceCompileProven, true);
  assert.equal(bindCalls, 2);
  const trustedSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  assert.notEqual(trustedSession.gitManifestHash, session.gitManifestHash);
  assert.equal(Object.prototype.hasOwnProperty.call(trustedSession, 'pendingRefresh'), false);
});

test('ui:doctor never trusts a missing runtime marker as first proof for changed source', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-doctor-missing-marker-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const endpoint = 'ws://127.0.0.1:39460';
  const session = createSession(projectPath, endpoint, 39460, { gitManifestHash: 'e'.repeat(64) });
  const miniProgram = {
    async send(command) {
      if (command === 'Tool.getInfo') return { SDKVersion: '3.7.12', projectPath };
      if (command === 'App.getCurrentPage') return { path: 'pages/home/index' };
      throw new Error(`Unexpected command: ${command}`);
    },
    async systemInfo() { return { windowWidth: 390, windowHeight: 844, pixelRatio: 2, fontSizeSetting: 16 }; },
    async evaluate(_fn, marker) {
      if (typeof marker === 'undefined') return null;
      return {
        ok: true,
        sessionId: marker.sessionId,
        projectPathHash: marker.projectPathHash,
        listenerIdentityHash: marker.listenerIdentityHash,
      };
    },
  };
  const result = await screenshotTool.runDoctor(
    miniProgram,
    { mode: 'connect-preopened' },
    {
      wsEndpoint: endpoint,
      sourceProjectPath: projectPath,
      expectedWindowWidth: 390,
      expectedSDKVersion: '3.7.12',
      sessionFile: path.join(tempDir, 'session.json'),
      session,
    },
    { resolveListenerIdentity: () => session.listenerIdentity }
  );
  assert.equal(result.ok, false);
  assert.equal(result.changedSourceCompileProven, false);
  assert.equal(!!result.pendingSession, true);
});

test('ui:doctor fails closed instead of self-signing a session without a launch receipt', async () => {
  const projectPath = path.resolve(__dirname, '..');
  const endpoint = 'ws://127.0.0.1:39455';
  const miniProgram = {
    async send(command) {
      if (command === 'Tool.getInfo') return { SDKVersion: '3.7.12' };
      if (command === 'App.getCurrentPage') return { path: 'pages/home/index' };
      throw new Error(`Unexpected command: ${command}`);
    },
    async systemInfo() { return { windowWidth: 390 }; },
    async evaluate() { throw new Error('doctor must not bind a marker without a trusted receipt'); },
  };
  const result = await screenshotTool.runDoctor(
    miniProgram,
    { mode: 'connect-preopened' },
    {
      wsEndpoint: endpoint,
      sourceProjectPath: projectPath,
      expectedWindowWidth: 390,
      expectedSDKVersion: '3.7.12',
      sessionFile: path.join(os.tmpdir(), 'must-not-be-written.json'),
      session: null,
    },
    { resolveListenerIdentity: () => createListenerIdentity(endpoint, 39455) }
  );
  assert.equal(result.ok, false);
  assert.equal(result.checks.sessionRecord, false);
  assert.equal(result.checks.marker, false);
});

test('Windows cli.bat normalization invokes the official batch wrapper through cmd', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-cli-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cliBat = path.join(tempDir, 'cli.bat');
  const cliJs = path.join(tempDir, 'cli.js');
  fs.writeFileSync(cliBat, '@echo off\r\n', 'utf8');
  fs.writeFileSync(cliJs, '', 'utf8');

  if (process.platform === 'win32') {
    assert.deepEqual(screenshotTool.resolveLaunchCommand(cliBat), {
      executable: 'cmd',
      args: ['/d', '/s', '/c', 'call', cliBat],
    });
  } else {
    assert.deepEqual(screenshotTool.resolveLaunchCommand(cliBat), { executable: cliBat, args: [] });
  }
});

test('prewarm adds the native-window-occlusion switch without dropping existing NW flags', () => {
  assert.equal(
    screenshotTool.ensureBackgroundCaptureNwPreArgs(''),
    '--disable-backgrounding-occluded-windows'
  );
  assert.equal(
    screenshotTool.ensureBackgroundCaptureNwPreArgs('--disable-gpu'),
    '--disable-gpu --disable-backgrounding-occluded-windows'
  );
  assert.equal(
    screenshotTool.ensureBackgroundCaptureNwPreArgs('--disable-backgrounding-occluded-windows --foo'),
    '--disable-backgrounding-occluded-windows --foo'
  );
});

test('route timeout can recover from the page that actually finished loading', async () => {
  const page = { path: 'pages/launch/index' };
  const miniProgram = {
    switchTab() {
      return new Promise(() => {});
    },
    async currentPage() {
      return page;
    },
  };

  const recovered = await screenshotTool.routeCasePage(
    miniProgram,
    'switchTab',
    '/pages/launch/index',
    { routeTimeoutMs: 5, recoveryTimeoutMs: 30, recoveryPollMs: 1 }
  );
  assert.equal(recovered, page);
});

test('selector coverage enforces exact counts, non-zero size and valid contracts', () => {
  const dom = [
    { selector: '.row', size: { width: 100, height: 44 } },
    { selector: '.row', size: { width: 0, height: 44 } },
  ];
  const hidden = screenshotTool.validateSelectorCoverage(dom, ['.row'], { '.row': 2 });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.counts['.row'], 2);
  assert.equal(hidden.visibleCounts['.row'], 1);
  assert.equal(hidden.failures.some((failure) => failure.reason === 'non-zero-size'), true);

  const valid = screenshotTool.validateSelectorCoverage([
    { selector: '.row', size: { width: 100, height: 44 } },
    { selector: '.row', size: { width: 80, height: 44 } },
  ], ['.row'], { '.row': { expectedCount: 2, visible: true } });
  assert.equal(valid.ok, true);

  const invalidContract = screenshotTool.validateSelectorCoverage(dom, ['.row'], { '.row': 0 });
  assert.equal(invalidContract.ok, false);
  assert.equal(invalidContract.failures.some((failure) => failure.reason === 'invalid-expectedCount'), true);
});

test('visual settle waits through delayed reveal and changing geometry', async () => {
  let clock = 0;
  let reads = 0;
  const page = { async $$(selector) {
    if (selector === '.reveal') return [{ async style(name) {
      return name === 'opacity' ? (reads < 3 ? '0' : '1') : 'none';
    } }];
    reads += 1;
    return [{ async text() { return 'ready'; }, async size() { return { width: 100, height: 44 }; },
      async offset() { return { left: 0, top: Math.min(reads, 4) }; } }];
  } };
  const result = await screenshotTool.waitForVisualSettle(page, { selectors: ['.row'] }, {
    now: () => clock, sleep: async (ms) => { clock += ms; },
  });
  assert.equal(result.ok, true);
  assert.equal(reads, 5);
  assert.equal(clock, 300);
});

test('style readiness and visual settle wait for late stylesheet despite stable geometry', async () => {
  const item = { selectors: ['.sheet'], styleExpectations: { '.sheet': { display: 'flex', 'flex-direction': 'column' } } };
  for (const phase of ['ready', 'settle']) {
    let clock = 0;
    const page = { async waitFor() {}, async $$(selector) {
      if (selector === '.reveal') return [];
      return [{ async text() { return 'content'; }, async size() { return { width: 320, height: 150 }; },
        async offset() { return { left: 0, top: 0 }; },
        async style(property) { return clock < 150 ? 'initial' : item.styleExpectations['.sheet'][property]; } }];
    } };
    const options = { now: () => clock, sleep: async (ms) => { clock += ms; }, timeoutMs: 400 };
    const result = phase === 'ready'
      ? await screenshotTool.waitForCaseReady(page, item, 400, options)
      : await screenshotTool.waitForVisualSettle(page, item, options);
    assert.equal(result.ok, true);
    assert.ok(clock >= (phase === 'ready' ? 150 : 225), phase);
  }
});

test('configured style contracts reject missing elements, read errors and default styles', async () => {
  const item = { selectors: ['.sheet'], styleExpectations: { '.overlay': { position: 'fixed' } } };
  for (const failure of ['missing', 'read-error', 'default']) {
    for (const phase of ['ready', 'settle']) {
      let clock = 0;
      const page = { async waitFor() {}, async $$(selector) {
        if (selector === '.reveal' || selector === '.overlay' && failure === 'missing') return [];
        return [{ async text() { return 'content'; }, async size() { return { width: 320, height: 150 }; },
          async offset() { return { left: 0, top: 0 }; },
          async style() { if (failure === 'read-error') throw new Error('style unavailable'); return 'static'; } }];
      } };
      const options = { now: () => clock, sleep: async (ms) => { clock += ms; }, timeoutMs: 150 };
      await assert.rejects(() => phase === 'ready'
        ? screenshotTool.waitForCaseReady(page, item, 150, options)
        : screenshotTool.waitForVisualSettle(page, item, options), /ready|stabilize/);
    }
  }
});

test('selector readiness waits for the full count and non-zero-size contract', async () => {
  let clock = 0;
  let collectionCount = 0;
  const element = (width) => ({
    async text() { return 'row'; },
    async size() { return { width, height: 44 }; },
    async offset() { return { left: 0, top: 0 }; },
  });
  const page = {
    async waitFor() {},
    async $$() {
      collectionCount += 1;
      if (collectionCount === 1) return [element(100)];
      if (collectionCount === 2) return [element(100), element(0)];
      return [element(100), element(80)];
    },
  };
  const readiness = await screenshotTool.waitForCaseReady(page, {
    selectors: ['.row'],
    selectorExpectations: { '.row': 2 },
  }, 100, {
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
    pollMs: 10,
  });
  assert.equal(readiness.ok, true);
  assert.equal(readiness.selectorCoverage.counts['.row'], 2);
  assert.equal(readiness.selectorCoverage.visibleCounts['.row'], 2);
  assert.equal(collectionCount, 3);
});

test('failed atomic publication preserves existing final files byte-for-byte', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-failure-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateImage = path.join(tempDir, 'candidate.png');
  const missingReceipt = path.join(tempDir, 'missing.json');
  const finalImage = path.join(tempDir, 'final.png');
  const finalReceipt = path.join(tempDir, 'final.json');
  fs.writeFileSync(candidateImage, 'candidate-image');
  fs.writeFileSync(finalImage, 'approved-image');
  fs.writeFileSync(finalReceipt, 'approved-receipt');

  assert.throws(() => screenshotTool.publishFilesAtomically([
    { source: candidateImage, target: finalImage },
    { source: missingReceipt, target: finalReceipt },
  ], 'failure-test'));
  assert.equal(fs.readFileSync(finalImage, 'utf8'), 'approved-image');
  assert.equal(fs.readFileSync(finalReceipt, 'utf8'), 'approved-receipt');
});

test('successful atomic publication promotes image and receipt together', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-success-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateImage = path.join(tempDir, 'candidate.png');
  const candidateReceipt = path.join(tempDir, 'candidate.json');
  const finalImage = path.join(tempDir, 'final.png');
  const finalReceipt = path.join(tempDir, 'final.json');
  fs.writeFileSync(candidateImage, 'candidate-image');
  fs.writeFileSync(candidateReceipt, 'candidate-receipt');
  fs.writeFileSync(finalImage, 'approved-image');
  fs.writeFileSync(finalReceipt, 'approved-receipt');

  screenshotTool.publishFilesAtomically([
    { source: candidateImage, target: finalImage },
    { source: candidateReceipt, target: finalReceipt },
  ], 'success-test');
  assert.equal(fs.readFileSync(finalImage, 'utf8'), 'candidate-image');
  assert.equal(fs.readFileSync(finalReceipt, 'utf8'), 'candidate-receipt');
});

test('partial multi-file publication rolls every prior final back', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-rollback-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateA = path.join(tempDir, 'candidate-a');
  const candidateB = path.join(tempDir, 'candidate-b');
  const finalA = path.join(tempDir, 'final-a');
  const finalB = path.join(tempDir, 'final-b');
  fs.writeFileSync(candidateA, 'new-a');
  fs.writeFileSync(candidateB, 'new-b');
  fs.writeFileSync(finalA, 'old-a');
  fs.writeFileSync(finalB, 'old-b');

  assert.throws(() => screenshotTool.publishFilesAtomically([
    { source: candidateA, target: finalA },
    { source: candidateB, target: finalB },
  ], 'rollback-test', {
    renameSync(source, target) {
      if (source.includes('.stage') && path.resolve(target) === path.resolve(finalB)) {
        throw new Error('injected second publication failure');
      }
      fs.renameSync(source, target);
    },
  }), /injected second publication failure/);
  assert.equal(fs.readFileSync(finalA, 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(finalB, 'utf8'), 'old-b');
});

test('atomic publication preserves a stale backup collision instead of deleting recovery evidence', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-collision-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidate = path.join(tempDir, 'candidate');
  const target = path.join(tempDir, 'final');
  const staleBackup = path.join(tempDir, '.final.collision-test.0.backup');
  fs.writeFileSync(candidate, 'new');
  fs.writeFileSync(target, 'current');
  fs.writeFileSync(staleBackup, 'recovery-evidence');

  assert.throws(
    () => screenshotTool.publishFilesAtomically([{ source: candidate, target }], 'collision-test'),
    /transaction collision/
  );
  assert.equal(fs.readFileSync(target, 'utf8'), 'current');
  assert.equal(fs.readFileSync(staleBackup, 'utf8'), 'recovery-evidence');
});

test('rollback continues restoring a verified backup when remove throws after unlink', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-after-unlink-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateA = path.join(tempDir, 'candidate-a');
  const candidateB = path.join(tempDir, 'candidate-b');
  const finalA = path.join(tempDir, 'final-a');
  const finalB = path.join(tempDir, 'final-b');
  fs.writeFileSync(candidateA, 'new-a');
  fs.writeFileSync(candidateB, 'new-b');
  fs.writeFileSync(finalA, 'old-a');
  fs.writeFileSync(finalB, 'old-b');
  let injected = false;
  assert.throws(() => screenshotTool.publishFilesAtomically([
    { source: candidateA, target: finalA },
    { source: candidateB, target: finalB },
  ], 'after-unlink-test', {
    renameSync(source, target) {
      if (source.includes('.stage') && path.resolve(target) === path.resolve(finalB)) {
        throw new Error('injected publication failure');
      }
      fs.renameSync(source, target);
    },
    removeFile(filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (!injected && path.resolve(filePath) === path.resolve(finalA)) {
        injected = true;
        throw new Error('injected post-unlink error');
      }
    },
  }), /injected publication failure/);
  assert.equal(fs.readFileSync(finalA, 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(finalB, 'utf8'), 'old-b');
});

test('rollback reports an indeterminate state when the original final cannot be restored', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-indeterminate-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateA = path.join(tempDir, 'candidate-a');
  const candidateB = path.join(tempDir, 'candidate-b');
  const finalA = path.join(tempDir, 'final-a');
  const finalB = path.join(tempDir, 'final-b');
  fs.writeFileSync(candidateA, 'new-a');
  fs.writeFileSync(candidateB, 'new-b');
  fs.writeFileSync(finalA, 'old-a');
  fs.writeFileSync(finalB, 'old-b');
  let thrown;
  try {
    screenshotTool.publishFilesAtomically([
      { source: candidateA, target: finalA },
      { source: candidateB, target: finalB },
    ], 'indeterminate-test', {
      renameSync(source, target) {
        if (source.includes('.stage') && path.resolve(target) === path.resolve(finalB)) {
          throw new Error('injected publication failure');
        }
        fs.renameSync(source, target);
      },
      removeFile(filePath) {
        if (path.resolve(filePath) === path.resolve(finalA)) {
          throw new Error('injected pre-unlink rollback failure');
        }
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      },
    });
  } catch (err) {
    thrown = err;
  }
  assert.equal(thrown.code, 'ATOMIC_PUBLICATION_INDETERMINATE');
  assert.equal(thrown.rollbackVerification.some((entry) => entry.target === finalA && entry.ok === false), true);
  assert.equal(fs.readFileSync(finalA, 'utf8'), 'new-a');
  assert.equal(fs.existsSync(path.join(tempDir, '.final-a.indeterminate-test.0.backup')), true);
});

test('rollback repairs a rename that completed before the injected error was thrown', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-post-rename-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidate = path.join(tempDir, 'candidate');
  const target = path.join(tempDir, 'final');
  fs.writeFileSync(candidate, 'new');
  fs.writeFileSync(target, 'old');
  assert.throws(() => screenshotTool.publishFilesAtomically([
    { source: candidate, target },
  ], 'post-rename-test', {
    renameSync(source, destination) {
      fs.renameSync(source, destination);
      if (source.includes('.stage')) throw new Error('injected post-rename error');
    },
  }), /injected post-rename error/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'old');
});

test('backup cleanup failure after commit never rolls new finals back', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-publish-commit-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const candidateA = path.join(tempDir, 'candidate-a');
  const candidateB = path.join(tempDir, 'candidate-b');
  const finalA = path.join(tempDir, 'final-a');
  const finalB = path.join(tempDir, 'final-b');
  fs.writeFileSync(candidateA, 'new-a');
  fs.writeFileSync(candidateB, 'new-b');
  fs.writeFileSync(finalA, 'old-a');
  fs.writeFileSync(finalB, 'old-b');
  let backupCleanupCount = 0;
  const publication = screenshotTool.publishFilesAtomically([
    { source: candidateA, target: finalA },
    { source: candidateB, target: finalB },
  ], 'cleanup-test', {
    removeFile(filePath) {
      if (filePath.includes('.backup') && fs.existsSync(filePath)) {
        backupCleanupCount += 1;
        if (backupCleanupCount === 2) throw new Error('injected backup cleanup failure');
      }
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },
  });
  assert.equal(publication.backupCleanupErrors.length, 1);
  assert.equal(fs.readFileSync(finalA, 'utf8'), 'new-a');
  assert.equal(fs.readFileSync(finalB, 'utf8'), 'new-b');
});

function createBatchResult(tempDir, name, machineOk) {
  const candidateOutput = path.join(tempDir, 'candidate', `${name}.png`);
  const candidateReceiptPath = path.join(tempDir, 'candidate', `${name}.receipt.json`);
  const output = path.join(tempDir, 'final', `${name}.png`);
  const receiptPath = path.join(tempDir, 'final', `${name}.receipt.json`);
  fs.mkdirSync(path.dirname(candidateOutput), { recursive: true });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(candidateOutput, `candidate-${name}`);
  fs.writeFileSync(output, `old-${name}`);
  fs.writeFileSync(receiptPath, `old-receipt-${name}`);
  return {
    name,
    ok: machineOk,
    machineOk,
    captureOk: true,
    evidenceOk: machineOk,
    reviewStatus: 'pending',
    candidateOutput,
    candidateReceiptPath,
    output: null,
    receiptPath: null,
    promotion: { eligible: machineOk, promoted: false, output, receiptPath },
  };
}

test('a failed final case prevents every case in the run from publishing', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-run-promotion-fail-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const first = createBatchResult(tempDir, 'first', true);
  const second = createBatchResult(tempDir, 'second', false);
  const result = screenshotTool.promoteRunResults([first, second], 'batch-fail', {
    manifestPath: path.join(tempDir, 'manifest.json'),
  });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(first.promotion.output, 'utf8'), 'old-first');
  assert.equal(fs.readFileSync(second.promotion.output, 'utf8'), 'old-second');
  assert.equal(first.ok, false);
  assert.equal(first.evidenceOk, true);
  assert.match(first.promotion.reason, /no final artifacts/i);
});

test('an eligible run publishes every PNG and receipt in one transaction', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-run-promotion-success-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const first = createBatchResult(tempDir, 'first', true);
  const second = createBatchResult(tempDir, 'second', true);
  const result = screenshotTool.promoteRunResults([first, second], 'batch-success', {
    manifestPath: path.join(tempDir, 'manifest.json'),
    runContext: {
      focusProbeId: 'probe-123',
      sessionContext: {
        sessionId: 'session-123',
        endpoint: 'ws://127.0.0.1:39459',
        listenerIdentityHash: 'a'.repeat(64),
        gitManifestHash: 'b'.repeat(64),
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.publication.artifacts.length, 5);
  assert.equal(fs.readFileSync(first.promotion.output, 'utf8'), 'candidate-first');
  assert.equal(fs.readFileSync(second.promotion.output, 'utf8'), 'candidate-second');
  assert.equal(JSON.parse(fs.readFileSync(first.promotion.receiptPath, 'utf8')).promotion.promoted, true);
  assert.equal(JSON.parse(fs.readFileSync(second.promotion.receiptPath, 'utf8')).promotion.promoted, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.ok, true);
  assert.equal(manifest.runId, 'batch-success');
  assert.equal(manifest.focusProbeId, 'probe-123');
  assert.equal(manifest.sessionContext.sessionId, 'session-123');
  assert.equal(
    result.publication.artifacts.some((artifact) => artifact.target === path.join(tempDir, 'manifest.json')),
    true
  );
});

test('focus probe finalization keeps approved finals byte-for-byte untouched', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-focus-no-publish-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const result = createBatchResult(tempDir, 'launch', true);
  const oldImage = fs.readFileSync(result.promotion.output);
  const oldReceipt = fs.readFileSync(result.promotion.receiptPath);
  const manifestPath = path.join(tempDir, 'runs', 'focus-run', 'manifest.json');

  const promotion = screenshotTool.finalizeFocusProbeResult([result], 'focus-run', {
    manifestPath,
    runContext: { focusProbeId: 'probe-only' },
  });
  assert.equal(promotion.ok, true);
  assert.equal(promotion.promoted, false);
  assert.equal(promotion.finalsTouched, false);
  assert.equal(promotion.publicationState, 'not-attempted');
  assert.deepEqual(fs.readFileSync(path.join(tempDir, 'final', 'launch.png')), oldImage);
  assert.deepEqual(fs.readFileSync(path.join(tempDir, 'final', 'launch.receipt.json')), oldReceipt);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.mode, 'focus-probe-no-publish-v1');
  assert.equal(manifest.finalsTouched, false);
  assert.equal(manifest.cases.length, 1);
  assert.equal(manifest.cases[0].promotion.probeOnly, true);
  assert.throws(
    () => screenshotTool.finalizeFocusProbeResult([result, { ...result }], 'bad-focus-run'),
    /exactly one/
  );
});

test('run promotion preserves indeterminate final state in case and diagnostic manifest', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-run-indeterminate-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const result = createBatchResult(tempDir, 'launch', true);
  const manifestPath = path.join(tempDir, 'manifest.json');
  const receiptTarget = result.promotion.receiptPath;
  const imageTarget = result.promotion.output;
  const promotion = screenshotTool.promoteRunResults([result], 'indeterminate-run', {
    manifestPath,
    publishOptions: {
      renameSync(source, target) {
        if (source.includes('.stage') && path.resolve(target) === path.resolve(receiptTarget)) {
          throw new Error('injected receipt publication failure');
        }
        fs.renameSync(source, target);
      },
      removeFile(filePath) {
        if (path.resolve(filePath) === path.resolve(imageTarget)) {
          throw new Error('injected rollback refusal');
        }
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      },
    },
  });
  assert.equal(promotion.ok, false);
  assert.equal(promotion.promoted, null);
  assert.equal(promotion.finalsTouched, null);
  assert.equal(promotion.publicationState, 'indeterminate');
  assert.equal(promotion.rollbackVerified, false);
  assert.equal(result.promotion.promoted, null);
  assert.equal(result.promotion.finalsTouched, null);
  const diagnostic = JSON.parse(fs.readFileSync(`${manifestPath}.indeterminate.json`, 'utf8'));
  assert.equal(diagnostic.finalsTouched, null);
  assert.equal(diagnostic.publicationState, 'indeterminate');
});

test('profile-gated case storage is applied before routing and restored exactly afterwards', async () => {
  const storage = new Map([
    ['openid', 'real-user'],
    ['openid_cached_at', 123],
    ['unrelated', 'keep-me'],
  ]);
  let appOpenid = 'real-app-user';
  const miniProgram = {
    async callWxMethod(method, ...args) {
      if (method === 'getStorageInfoSync') return { keys: Array.from(storage.keys()) };
      if (method === 'getStorageSync') return storage.get(args[0]);
      if (method === 'setStorageSync') {
        storage.set(args[0], args[1]);
        return undefined;
      }
      if (method === 'removeStorageSync') {
        storage.delete(args[0]);
        return undefined;
      }
      throw new Error(`Unexpected wx method: ${method}`);
    },
    async evaluate(_fn, value) {
      if (typeof value === 'undefined') {
        return { available: true, existed: true, value: appOpenid };
      }
      if (typeof value === 'string') {
        appOpenid = value;
        return { ok: true };
      }
      if (value.existed) appOpenid = value.value;
      else appOpenid = undefined;
      return { ok: true, existed: value.existed, value: appOpenid };
    },
  };

  const applied = await screenshotTool.applyCaseStorageFixture(
    miniProgram,
    { profileGate: true },
    { now: 456 }
  );
  assert.equal(applied.evidence.ok, true);
  assert.equal(storage.get('openid'), 'ui-screenshot-user');
  assert.equal(storage.get('openid_cached_at'), 456);
  assert.equal(storage.get('profile_completed'), true);
  assert.equal(appOpenid, 'ui-screenshot-user');

  const restored = await screenshotTool.restoreCaseStorageFixture(miniProgram, applied.state);
  assert.equal(restored.ok, true);
  assert.equal(storage.get('openid'), 'real-user');
  assert.equal(storage.get('openid_cached_at'), 123);
  assert.equal(storage.has('userProfile'), false);
  assert.equal(storage.has('profile_completed'), false);
  assert.equal(storage.get('unrelated'), 'keep-me');
  assert.equal(appOpenid, 'real-app-user');
});

test('profile-gated storage fixture rejects an invalid storage inventory before any write', async () => {
  let writes = 0;
  const miniProgram = {
    async callWxMethod(method) {
      if (method === 'getStorageInfoSync') return {};
      writes += 1;
      return undefined;
    },
    async evaluate() { throw new Error('evaluate must not run'); },
  };
  await assert.rejects(
    screenshotTool.applyCaseStorageFixture(miniProgram, { profileGate: true }),
    /getStorageInfoSync\(\)\.keys/
  );
  assert.equal(writes, 0);
});

test('profile-gated storage restore fails closed on app or storage no-op', async () => {
  const fixture = screenshotTool.buildProfileGateStorageFixture(789);
  const storage = new Map(Object.entries(fixture));
  const state = {
    applied: true,
    storage: Object.keys(fixture).map((key) => ({
      key,
      existed: key === 'openid',
      value: key === 'openid' ? 'real-user' : undefined,
    })),
    appOpenid: { available: true, existed: true, value: 'real-app-user' },
  };
  const miniProgram = {
    async callWxMethod(method, ...args) {
      if (method === 'getStorageInfoSync') return { keys: Array.from(storage.keys()) };
      if (method === 'getStorageSync') return storage.get(args[0]);
      if (method === 'setStorageSync' || method === 'removeStorageSync') return undefined;
      throw new Error(`Unexpected wx method: ${method}`);
    },
    async evaluate() { return { ok: false }; },
  };
  const restored = await screenshotTool.restoreCaseStorageFixture(miniProgram, state);
  assert.equal(restored.ok, false);
  assert.match(restored.errors.join('\n'), /post-restore verification|presence does not match|value does not match/);
});

test('profile-gated storage apply reports a failed emergency rollback to the run controller', async () => {
  let setCalls = 0;
  const miniProgram = {
    async callWxMethod(method) {
      if (method === 'getStorageInfoSync') return { keys: [] };
      if (method === 'setStorageSync') {
        setCalls += 1;
        if (setCalls === 2) throw new Error('injected apply failure');
        return undefined;
      }
      if (method === 'removeStorageSync') throw new Error('injected rollback failure');
      throw new Error(`Unexpected wx method: ${method}`);
    },
    async evaluate(_fn, value) {
      if (typeof value === 'undefined') {
        return { available: true, existed: true, value: 'real-app-user' };
      }
      return { ok: true, existed: true, value: 'real-app-user' };
    },
  };
  await assert.rejects(
    screenshotTool.applyCaseStorageFixture(miniProgram, { profileGate: true }),
    (err) => {
      assert.match(err.message, /injected apply failure/);
      assert.equal(err.storageFixtureCleanup.ok, false);
      assert.match(err.storageFixtureCleanup.errors.join('\n'), /injected rollback failure/);
      return true;
    }
  );
});

test('runtime configuration rejects a different worktree from the registry worktree', (t) => {
  const otherProject = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-other-worktree-'));
  t.after(() => fs.rmSync(otherProject, { recursive: true, force: true }));
  fs.writeFileSync(path.join(otherProject, 'project.config.json'), '{}', 'utf8');
  const validation = screenshotTool.validateRuntimeConfig({
    wsEndpoint: 'ws://127.0.0.1:39458',
    sourceProjectPath: otherProject,
    expectedWindowWidth: 390,
    session: {},
  }, { requireSession: true });
  assert.equal(validation.ok, false);
  assert.equal(validation.checks.projectPath, true);
  assert.equal(validation.checks.runnerProjectPath, false);
});

test('failed strict evidence keeps the previous approved screenshot and receipt', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-run-case-failure-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const projectPath = path.resolve(__dirname, '..');
  const outDir = path.join(tempDir, 'approved');
  const runRoot = path.join(tempDir, 'runs');
  fs.mkdirSync(outDir, { recursive: true });
  const finalImage = path.join(outDir, 'launch.png');
  const finalReceipt = path.join(outDir, 'launch.receipt.json');
  fs.writeFileSync(finalImage, 'previous-approved-image');
  fs.writeFileSync(finalReceipt, 'previous-approved-receipt');

  const page = {
    async waitFor() {},
    state: {},
    async setData(data) { Object.assign(this.state, data); },
    async data(key) { return key ? this.state[key] : { ...this.state }; },
    async size() { return { width: 390, height: 844 }; },
    async $$(selector) {
      if (selector === '.reveal') return [];
      return [{
        async text() { return 'ready'; },
        async style(property) { return property === 'display' ? 'flex' : ''; },
        async size() { return { width: 320, height: 48 }; },
        async offset() { return { left: 35, top: 120 }; },
      }];
    },
  };
  const runtimeEvents = { console: [], exceptions: [] };
  const miniProgram = {
    async evaluate(_fn, phase) {
      if (typeof phase === 'undefined') {
        return { available: true, length: 1, route: 'pages/launch/index' };
      }
      return { ok: true, phase, pageFrozen: true };
    },
    async switchTab() { return page; },
    async reLaunch() { return page; },
    async currentPage() { return page; },
    async send(command) {
      if (command === 'Tool.getInfo') return { SDKVersion: '3.7.12', projectPath };
      if (command === 'App.getCurrentPage') return { path: 'pages/launch/index' };
      throw new Error(`Unexpected command: ${command}`);
    },
    async systemInfo() {
      return {
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 2,
        fontSizeSetting: 16,
      };
    },
    async screenshot({ path: outputPath }) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, createPngBuffer(780, 1688));
      runtimeEvents.exceptions.push({ message: 'injected post-capture runtime exception' });
    },
  };
  const config = {
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.7.12',
    outDir,
    runRoot,
    routeTimeoutMs: 50,
    readinessTimeoutMs: 50,
    screenshotTimeoutMs: 50,
  };
  const connection = {
    miniProgram,
    mode: 'connect-preopened',
    endpoint: 'ws://127.0.0.1:39454',
    sourceProjectPath: projectPath,
    sessionFile: path.join(tempDir, 'session.json'),
    sessionBinding: { ok: true },
    runtimeEvents,
    config,
  };

  const result = await screenshotTool.runCase('launch', miniProgram, connection, {
    config,
    runId: 'failure-run',
  });
  assert.equal(result.captureOk, true);
  assert.equal(result.evidenceOk, false);
  assert.equal(result.ok, false);
  assert.equal(result.promotion.promoted, false);
  assert.equal(fs.readFileSync(finalImage, 'utf8'), 'previous-approved-image');
  assert.equal(fs.readFileSync(finalReceipt, 'utf8'), 'previous-approved-receipt');
  assert.equal(fs.existsSync(result.candidateOutput), true);
  assert.equal(fs.existsSync(result.candidateReceiptPath), true);
  const frameConfig = {
    ...config,
    ...screenshotTool.readRuntimeConfig({
      WEAPP_SCREENSHOT_DIR: outDir,
      WEAPP_UI_RUN_ROOT: runRoot,
      WEAPP_CAPTURE_SURFACE: 'simulator-frame',
    }, projectPath),
    expectedWindowWidth: 390,
    expectedSDKVersion: '3.7.12',
  };
  miniProgram.screenshot = async ({ path: outputPath }) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, createPngBuffer(476, 1026));
  };
  const frameResult = await screenshotTool.runCase('launch', miniProgram, connection, {
    config: frameConfig, runId: 'frame-run',
  });
  assert.equal(frameResult.receiptValidation.checks.png, true);
  assert.equal(frameResult.captureSurface.kind, 'simulator-frame');
  assert.equal(frameResult.captureSurface.pageGeometryVerified, false);
  assert.equal(path.relative(runRoot, frameResult.candidateOutput), path.join('simulator-frame', 'frame-run', 'candidate', 'launch.png'));
  const manifestPath = path.join(frameConfig.runRoot, 'frame-run', 'manifest.json');
  screenshotTool.promoteRunResults([frameResult], 'frame-run', { manifestPath });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(manifest.captureSurface, frameResult.captureSurface);
  assert.deepEqual(manifest.cases[0].captureSurface, frameResult.captureSurface);
  assert.equal(fs.readFileSync(finalImage, 'utf8'), 'previous-approved-image');
  assert.equal(fs.readFileSync(finalReceipt, 'utf8'), 'previous-approved-receipt');
});
