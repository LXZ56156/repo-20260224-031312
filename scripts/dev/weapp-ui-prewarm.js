#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const screenshotTool = require('./weapp-ui-screenshot');

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for the explicit foreground-capable prewarm step.`);
  return value;
}

function disconnect(miniProgram) {
  if (!miniProgram) return;
  try {
    miniProgram.disconnect();
  } catch (err) {
    // Prewarm must never call close/App.exit/Tool.close; a failed transport close is diagnostic only.
  }
}

function resolveWindowsIdeServiceFiles(cliPath, options = {}) {
  const cliRoot = path.dirname(path.resolve(cliPath));
  const readFile = options.readFile || fs.readFileSync;
  const { name } = JSON.parse(readFile(path.join(cliRoot, 'resources/app.asar.unpacked/package.json'), 'utf8'));
  const userProfile = options.userProfile || process.env.USERPROFILE;
  if (!userProfile || typeof name !== 'string' || !name || path.basename(name) !== name) {
    throw new Error('Unable to resolve the selected Windows DevTools service files.');
  }
  // Match the official CLI installPath/productHash; never scan profiles or guess ports.
  const productHash = crypto.createHash('md5').update(path.join(cliRoot, 'resources/app.asar')).digest('hex');
  const profile = path.join(userProfile, 'AppData/Local', name, 'User Data', productHash, 'Default');
  return { portFile: path.join(profile, '.ide'), statusFile: path.join(profile, '.ide-status') };
}

function requestIdeServiceReadiness(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };
    // /upgrade only reads the existing WS port/runtimeId; /updatePort mutates CLI state.
    const request = http.get({ hostname: '127.0.0.1', port, path: '/upgrade', agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 4096) {
          finish(new Error('DevTools IDE readiness response exceeds the allowed size.'));
          request.destroy();
        }
      });
      response.on('error', (err) => finish(err));
      response.on('end', () => {
        if (response.statusCode === 503 && body === 'cli websocket server not ready') {
          return finish(null, { ready: false, reason: 'websocket-not-ready' });
        }
        if (response.statusCode !== 200) {
          return finish(new Error(`DevTools IDE readiness returned HTTP ${response.statusCode}.`));
        }
        let data;
        try { data = JSON.parse(body); } catch (err) {
          return finish(new Error('DevTools IDE readiness returned invalid JSON.'));
        }
        if (!data || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535
            || typeof data.projectId !== 'string') {
          return finish(new Error('DevTools IDE readiness returned an invalid upgrade response.'));
        }
        finish(null, { ready: true });
      });
    });
    request.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') finish(null, { ready: false, reason: 'connection-refused' });
      else finish(err);
    });
    timer = setTimeout(() => {
      finish(null, { ready: false, reason: 'request-timeout' });
      request.destroy();
    }, timeoutMs);
  });
}

async function waitForWindowsIdeServiceReady(cliPath, timeoutMs, options = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('IDE service readiness timeout must be a positive finite number.');
  }
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const readFile = options.readFile || fs.readFileSync;
  const files = options.files || resolveWindowsIdeServiceFiles(cliPath);
  const probe = options.probe || requestIdeServiceReadiness;
  const resolveListener = options.resolveListener || ((endpoint, remainingMs) => screenshotTool.resolveListenerIdentity(endpoint, {
    spawnSync: (command, args, settings) => spawnSync(command, args, { ...settings, timeout: remainingMs }),
  }));
  const executable = screenshotTool.normalizeProjectPath(path.join(path.dirname(cliPath), '微信开发者工具.exe'));
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let reason = 'service-files-not-ready';
  const readPort = () => {
    try {
      if (String(readFile(files.statusFile, 'utf8')).trim() !== 'On') return null;
      const value = String(readFile(files.portFile, 'utf8')).trim();
      const port = Number(value);
      if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Selected DevTools IDE service port file is invalid.');
      }
      return port;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };
  const validateOwner = (listener) => {
    if (!listener || listener.ok !== true) throw new Error(`DevTools IDE listener query failed: ${listener && listener.reason || 'invalid-result'}.`);
    if (!Array.isArray(listener.localAddresses) || !listener.localAddresses.length
        || listener.localAddresses.some((address) => address !== '127.0.0.1' && address !== '::1')) {
      throw new Error('DevTools IDE listener evidence contains an unsafe local address.');
    }
    if (screenshotTool.normalizeProjectPath(listener.executablePath) !== executable
        || !screenshotTool.validateDevToolsOwnership(listener, cliPath).ok) {
      throw new Error('DevTools IDE listener does not belong to the selected GUI installation.');
    }
  };
  while (now() < deadline) {
    attempts += 1;
    const port = readPort();
    if (port !== null) {
      const endpoint = `ws://127.0.0.1:${port}`;
      const listener = resolveListener(endpoint, Math.max(1, deadline - now()));
      if (listener && listener.reason === 'not-found' && listener.ok === false) reason = 'listener-not-ready';
      else {
        validateOwner(listener);
        if (now() >= deadline) break;
        const result = await screenshotTool.timeout(probe(port, Math.min(1000, deadline - now())),
          Math.max(1, deadline - now()), 'IDE service readiness probe');
        if (!result || typeof result.ready !== 'boolean') throw new Error('Invalid DevTools IDE readiness probe.');
        reason = result.reason || 'service-not-ready';
        if (result.ready) {
          if (now() >= deadline) break;
          const after = resolveListener(endpoint, Math.max(1, deadline - now()));
          validateOwner(after);
          if (!screenshotTool.validateListenerIdentity(after, listener).ok || readPort() !== port) {
            throw new Error('DevTools IDE service identity changed during readiness verification.');
          }
          if (now() < deadline) return { ready: true, attempts, elapsedMs: now() - startedAt };
          break;
        }
      }
    } else reason = 'service-files-not-ready';
    const remainingMs = deadline - now();
    if (remainingMs > 0) await sleep(Math.min(250, remainingMs));
  }
  throw new Error(`DevTools IDE service did not become ready within ${timeoutMs}ms; last state: ${reason}.`);
}

async function waitForAppServiceReady(miniProgram, timeoutMs, options = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('AppService readiness timeout must be a positive finite number.');
  }
  if (!miniProgram || typeof miniProgram.evaluate !== 'function') {
    throw new Error('AppService readiness requires the existing automation connection.');
  }
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollMs = Number(options.pollMs || 200);
  if (!Number.isFinite(pollMs) || pollMs <= 0) throw new Error('AppService readiness poll interval must be positive and finite.');
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let lastProbe = null;
  let attempts = 0;
  while (now() < deadline) {
    attempts += 1;
    // Only a valid not-ready snapshot is polled. Transport/runtime exceptions
    // and hung evaluate calls reject immediately; no launch or marker is retried.
    lastProbe = await screenshotTool.timeout(miniProgram.evaluate(function inspectAppServiceReady() {
      const functions = { getApp: typeof getApp, getCurrentPages: typeof getCurrentPages,
        App: typeof App, Page: typeof Page };
      const app = functions.getApp === 'function' ? getApp() : null;
      const pages = functions.getCurrentPages === 'function' ? getCurrentPages() : null;
      return { functions, appAvailable: !!app && typeof app === 'object', pagesAvailable: Array.isArray(pages) };
    }), Math.max(1, deadline - now()), 'AppService readiness evaluate');
    const keys = ['getApp', 'getCurrentPages', 'App', 'Page'];
    if (!lastProbe || !lastProbe.functions
        || keys.some((key) => typeof lastProbe.functions[key] !== 'string')
        || typeof lastProbe.appAvailable !== 'boolean' || typeof lastProbe.pagesAvailable !== 'boolean') {
      throw new Error(`Invalid AppService readiness probe: ${JSON.stringify(lastProbe || {})}`);
    }
    if (now() >= deadline) break;
    if (keys.every((key) => lastProbe.functions[key] === 'function')
        && lastProbe.appAvailable && lastProbe.pagesAvailable) {
      return { ready: true, attempts, elapsedMs: now() - startedAt, lastProbe };
    }
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollMs, remainingMs));
  }
  throw new Error(`AppService did not become ready within ${timeoutMs}ms; last probe: ${JSON.stringify(lastProbe || {})}`);
}

async function main() {
  if (process.env.WEAPP_ALLOW_FOREGROUND_PREWARM !== '1') {
    throw new Error('前台预热未获本次显式允许：日常截图只连接已签名热会话；仅在用户明确允许本次前台预热后设置 WEAPP_ALLOW_FOREGROUND_PREWARM=1。未启动进程，不自动授权或重试。');
  }
  const cwd = process.cwd();
  const requestedProjectPath = path.resolve(cwd, requiredEnv('WEAPP_PROJECT_PATH'));
  const sourceProjectPath = fs.realpathSync.native(requestedProjectPath);
  if (!screenshotTool.isRunnerProjectPath(sourceProjectPath)) {
    throw new Error(
      `WEAPP_PROJECT_PATH must be this screenshot runner's exact worktree: ${screenshotTool.REPOSITORY_ROOT}`
    );
  }
  const cliPath = fs.realpathSync.native(path.resolve(cwd, requiredEnv('WEAPP_CLI_PATH')));
  const port = Number(requiredEnv('WEAPP_AUTO_PORT'));
  const expectedWindowWidth = Number(requiredEnv('WEAPP_EXPECTED_WINDOW_WIDTH'));
  const expectedSDKVersion = String(process.env.WEAPP_EXPECTED_SDK_VERSION || '').trim();
  const timeoutMs = Number(process.env.WEAPP_PREWARM_TIMEOUT_MS || 60000);
  const sessionFile = path.resolve(
    cwd,
    String(process.env.WEAPP_UI_SESSION_FILE || 'tmp/weapp-ui-background-session.json')
  );
  if (!fs.existsSync(path.join(sourceProjectPath, 'project.config.json'))) {
    throw new Error(`WEAPP_PROJECT_PATH is not a mini-program project root: ${sourceProjectPath}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WEAPP_AUTO_PORT is invalid: ${process.env.WEAPP_AUTO_PORT || ''}`);
  }
  if (!Number.isFinite(expectedWindowWidth) || expectedWindowWidth <= 0) {
    throw new Error(`WEAPP_EXPECTED_WINDOW_WIDTH is invalid: ${process.env.WEAPP_EXPECTED_WINDOW_WIDTH || ''}`);
  }
  const endpoint = `ws://127.0.0.1:${port}`;
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  let sessionLock = null;
  let launched = null;
  let reconnected = null;
  try {
    sessionLock = screenshotTool.acquireSessionLock(sessionFile, 'prewarm', { allowStaleRecovery: true });
    const before = screenshotTool.resolveListenerIdentity(endpoint);
    if (before.ok || before.reason !== 'not-found') {
      throw new Error(`Prewarm requires an unused explicit automation port; current listener result: ${JSON.stringify(before)}`);
    }
    const gitBeforeLaunch = screenshotTool.currentGitManifest(screenshotTool.REPOSITORY_ROOT);
    if (!gitBeforeLaunch.ok) {
      throw new Error('Unable to snapshot the current Git worktree before DevTools launch.');
    }
    console.error('ui:prewarm may activate WeChat DevTools once; daily ui:doctor/ui:screenshot commands do not launch or focus it.');
    const automator = screenshotTool.resolveAutomator();
    const cliLogFile = `${sessionFile}.cli-${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}.log`;
    const launchCommand = screenshotTool.resolveLaunchCommand(cliPath, { logFile: cliLogFile });
    if (process.platform === 'win32' && path.extname(cliPath).toLowerCase() === '.bat') {
      console.error(`ui:prewarm CLI diagnostics: ${cliLogFile}`);
    }
    // NW_PRE_ARGS is consumed internally and is not reflected in the OS command
    // line. Pass the flag to the vendor launcher explicitly so it is verifiable.
    if (process.platform === 'win32') {
      const executable = path.join(path.dirname(cliPath), '微信开发者工具.exe');
      if (!fs.existsSync(executable)) throw new Error(`Vendor launcher missing: ${executable}`);
      await new Promise((resolve, reject) => {
        const child = spawn(executable, ['--disable-backgrounding-occluded-windows'], {
          cwd: path.dirname(cliPath), windowsHide: true, detached: true, stdio: 'ignore',
        });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
      const ideReadiness = await waitForWindowsIdeServiceReady(cliPath, timeoutMs);
      console.error(`ui:prewarm IDE service ready after ${ideReadiness.elapsedMs}ms (${ideReadiness.attempts} probes)`);
    }
    const previousNwPreArgs = process.env.NW_PRE_ARGS;
    process.env.NW_PRE_ARGS = screenshotTool.ensureBackgroundCaptureNwPreArgs(previousNwPreArgs);
    try {
      launched = await automator.launch({
        cliPath: launchCommand.executable,
        args: launchCommand.args,
        projectPath: sourceProjectPath,
        port,
        timeout: timeoutMs,
      });
    } finally {
      if (typeof previousNwPreArgs === 'undefined') delete process.env.NW_PRE_ARGS;
      else process.env.NW_PRE_ARGS = previousNwPreArgs;
    }

    const launchedListener = screenshotTool.resolveListenerIdentity(endpoint);
    if (!launchedListener.ok) {
      throw new Error(`The explicit automation listener was not created: ${JSON.stringify(launchedListener)}`);
    }
    const ownership = screenshotTool.validateDevToolsOwnership(launchedListener, cliPath);
    if (!ownership.ok) {
      throw new Error(`Automation listener ownership does not belong to the selected DevTools install: ${JSON.stringify(ownership)}`);
    }
    const backgroundCaptureProcessFlags = screenshotTool.validateBackgroundCaptureProcessFlags(launchedListener);
    if (!backgroundCaptureProcessFlags.ok) {
      throw new Error(
        'The DevTools process is missing --disable-backgrounding-occluded-windows. '
        + 'Fully exit the existing top-level DevTools process, then run ui:prewarm again; '
        + 'a single-instance process cannot inherit NW_PRE_ARGS after it has started.'
      );
    }
    const listenerIdentityHash = screenshotTool.listenerIdentityHash(launchedListener);
    const projectPathHash = screenshotTool.hashCanonical(
      screenshotTool.normalizeProjectPath(sourceProjectPath)
    );
    const appServiceReadiness = await waitForAppServiceReady(launched, timeoutMs);
    const marker = {
      sessionId: crypto.randomBytes(32).toString('hex'),
      projectPathHash,
      endpointHash: screenshotTool.hashCanonical(endpoint),
      listenerIdentityHash,
      boundAt: new Date().toISOString(),
    };
    const markerBinding = await screenshotTool.bindRuntimeSession(launched, marker);
    if (!markerBinding
        || markerBinding.ok !== true
        || markerBinding.sessionId !== marker.sessionId
        || markerBinding.projectPathHash !== marker.projectPathHash
        || markerBinding.listenerIdentityHash !== marker.listenerIdentityHash) {
      throw new Error(`AppService runtime marker binding failed: ${JSON.stringify(markerBinding || {})}`);
    }

    disconnect(launched);
    launched = null;
    const afterDisconnect = screenshotTool.resolveListenerIdentity(endpoint);
    const listenerValidation = screenshotTool.validateListenerIdentity(afterDisconnect, launchedListener);
    if (!listenerValidation.ok) {
      throw new Error(`Automation listener changed after disconnect: ${JSON.stringify(listenerValidation)}`);
    }

    reconnected = await screenshotTool.timeout(
      automator.connect({ wsEndpoint: endpoint }),
      timeoutMs,
      'ui:prewarm reconnect'
    );
    const [runtimeMarker, rawToolInfo, currentPageInfo, rawSystemInfo] = await Promise.all([
      screenshotTool.readRuntimeSession(reconnected),
      reconnected.send('Tool.getInfo'),
      reconnected.send('App.getCurrentPage'),
      reconnected.systemInfo(),
    ]);
    const toolInfo = screenshotTool.selectToolInfo(rawToolInfo);
    const systemInfo = screenshotTool.selectSystemInfo(rawSystemInfo);
    const toolProjectPath = screenshotTool.normalizeProjectPath(toolInfo.projectPath);
    const expectedProjectPath = screenshotTool.normalizeProjectPath(sourceProjectPath);
    const checks = {
      reconnectMarker: screenshotTool.hashCanonical(runtimeMarker) === screenshotTool.hashCanonical(marker),
      toolProjectPath: !toolProjectPath || toolProjectPath === expectedProjectPath,
      sdkVersion: !!toolInfo.SDKVersion
        && (!expectedSDKVersion || toolInfo.SDKVersion === expectedSDKVersion),
      viewport: systemInfo.windowWidth === expectedWindowWidth,
      route: !!screenshotTool.normalizeRoute(currentPageInfo),
      listenerIdentity: screenshotTool.validateListenerIdentity(
        screenshotTool.resolveListenerIdentity(endpoint),
        launchedListener
      ).ok,
      backgroundCaptureProcessFlags: backgroundCaptureProcessFlags.ok,
    };
    if (!Object.values(checks).every(Boolean)) {
      throw new Error(`Prewarm verification failed: ${JSON.stringify(checks)}`);
    }
    const git = screenshotTool.currentGitManifest(screenshotTool.REPOSITORY_ROOT);
    if (!git.ok) throw new Error('Unable to bind the prewarm receipt to the current Git worktree state.');
    checks.sourceStableDuringPrewarm = screenshotTool.hashCanonical(git) === screenshotTool.hashCanonical(gitBeforeLaunch);
    if (!checks.sourceStableDuringPrewarm) {
      throw new Error('Git worktree changed while DevTools was launching; the runtime cannot be signed by this prewarm.');
    }
    const session = {
      kind: screenshotTool.SESSION_KIND,
      createdAt: new Date().toISOString(),
      endpoint,
      port,
      sourceProjectPath,
      projectPathHash,
      sessionId: marker.sessionId,
      expectedWindowWidth,
      expectedSDKVersion: toolInfo.SDKVersion,
      listenerIdentity: launchedListener,
      projectBinding: {
        ok: true,
        method: screenshotTool.PROJECT_BINDING_METHOD,
        listenerIdentityHash,
        cliRoot: ownership.cliRoot,
        backgroundCaptureProcessFlags: backgroundCaptureProcessFlags.checks,
      },
      toolInfo,
      currentPageInfo,
      systemInfo,
      gitHead: git.head,
      gitManifestHash: screenshotTool.hashCanonical(git),
    };
    const validation = screenshotTool.validateSessionRecord(session, {
      wsEndpoint: endpoint,
      sourceProjectPath,
      expectedWindowWidth,
    });
    if (!validation.ok) {
      throw new Error(`Generated prewarm receipt did not validate: ${JSON.stringify(validation)}`);
    }
    screenshotTool.writeJsonAtomically(sessionFile, session);
    const recoveryClear = screenshotTool.clearSessionRecovery(sessionFile);
    if (!recoveryClear.ok) {
      throw new Error(
        `New prewarm session was written but the stale-recovery barrier could not be cleared: ${recoveryClear.recoveryFile}`
      );
    }
    const poisonClear = screenshotTool.clearSessionPoison(sessionFile);
    if (!poisonClear.ok) {
      throw new Error(`New prewarm session was written but the old poison marker could not be cleared: ${poisonClear.poisonFile}`);
    }
    console.log(JSON.stringify({
      kind: 'weapp-ui-prewarm-result-v2',
      ok: true,
      sessionFile,
      appServiceReadiness,
      checks,
      recoveryClear,
      poisonClear,
      session,
    }, null, 2));
    return 0;
  } finally {
    disconnect(reconnected);
    disconnect(launched);
    screenshotTool.releaseSessionLockOrThrow(sessionLock);
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main, waitForAppServiceReady, resolveWindowsIdeServiceFiles, requestIdeServiceReadiness, waitForWindowsIdeServiceReady };
