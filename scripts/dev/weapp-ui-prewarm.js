#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const screenshotTool = require('./weapp-ui-screenshot');
const { snapshotNativeStartup, waitForNativeStartup } = require('./weapp-ui-native-startup');

function createStartupBudget(totalMs, options = {}) {
  if (!Number.isInteger(totalMs) || totalMs < 5000 || totalMs > 180000) throw Error('Startup budget must be between 5000 and 180000ms');
  const now = options.now || Date.now, startedAt = now(), deadline = startedAt + totalMs, stages = [];
  return {
    deadline,
    remaining(stage, minimumMs = 1000, capMs = Infinity, reserveMs = 0) {
      const elapsedMs = now() - startedAt, remainingMs = deadline - now();
      const grantedMs = Math.max(0, Math.min(capMs, remainingMs - reserveMs));
      const entry = { stage, elapsedMs, remainingMs, reserveMs, grantedMs, minimumMs };
      stages.push(entry); if (options.onStage) options.onStage(entry);
      if (grantedMs < minimumMs) throw Error(`Startup budget insufficient for ${stage}: remaining=${remainingMs}ms, reserved=${reserveMs}ms, granted=${grantedMs}ms, required=${minimumMs}ms, total=${totalMs}ms`);
      return grantedMs;
    },
    snapshot() { return { totalMs, startedAt, deadline, elapsedMs: now() - startedAt, stages: stages.map(stage => ({ ...stage })) }; },
  };
}

async function waitForViewportReady(miniProgram, width, timeoutMs, options = {}) {
  const height = options.height || 0;
  if (!Number.isInteger(width) || width <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0
      || (height && (!Number.isInteger(height) || height <= 0))) throw Error('Viewport readiness requires an explicit positive target and deadline');
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const startedAt = now(), deadline = startedAt + timeoutMs;
  let previous = '', last = null, attempts = 0, transientReadTimeouts = 0;
  while (now() < deadline) {
    const readTimeoutMs = Math.min(5000, Math.max(1, deadline - now()));
    attempts++;
    try {
      last = screenshotTool.selectSystemInfo(await screenshotTool.timeout(miniProgram.systemInfo(), readTimeoutMs, 'prewarm:real-viewport'));
    } catch (error) {
      if (readTimeoutMs !== 5000 || transientReadTimeouts !== 0 || now() >= deadline
          || String(error && error.message) !== 'prewarm:real-viewport timed out after 5000ms') throw error;
      transientReadTimeouts++; previous = '';
      if (options.onReadTimeout) options.onReadTimeout({ attempts, elapsedMs: now() - startedAt, remainingMs: deadline - now() });
      if (options.reconnectAfterReplacement) miniProgram = await options.reconnectAfterReplacement(miniProgram, deadline);
      await sleep(Math.min(options.pollMs || 1000, deadline - now()));
      continue;
    }
    if (now() >= deadline) break;
    const matches = last.windowWidth === width && last.windowHeight > 0 && (!height || last.windowHeight === height);
    const hash = matches ? screenshotTool.hashCanonical(last) : '';
    if (hash && hash === previous) return { ready: true, attempts, transientReadTimeouts, elapsedMs: now() - startedAt, systemInfo: last };
    previous = hash;
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(options.pollMs || 1000, remaining));
  }
  throw Error(`Real viewport did not settle before the deadline: ${JSON.stringify({ width, height, attempts, last })}`);
}

async function reconnectViewportAfterReplacement(context, deadline, options = {}) {
  const now = options.now || Date.now;
  const resolveListener = options.resolveListener || screenshotTool.resolveListenerIdentity;
  const manifestHash = options.manifestHash || (() => screenshotTool.hashCanonical(screenshotTool.currentGitManifest()));
  const remaining = (stage, cap = 10000) => {
    const ms = Math.min(cap, deadline - now());
    if (ms < 5000) throw Error(`Device replacement budget insufficient for ${stage}; no RPC started`);
    return ms;
  };
  const verify = () => {
    if (manifestHash() !== context.gitManifestHash) throw Error('Source changed during device replacement');
    const current = resolveListener(context.endpoint);
    if (!screenshotTool.validateListenerIdentity(current, context.listener).ok
        || !screenshotTool.validateDevToolsOwnership(current, context.cliPath).ok
        || !screenshotTool.validateBackgroundCaptureProcessFlags(current).ok) throw Error('Device replacement listener/install identity changed');
  };
  context.observer.poll();
  let replacement = context.observer.incarnation();
  if (!replacement || !context.baseline || replacement.key !== context.baseline.key
      || replacement.generation <= context.baseline.generation) throw Error('Viewport timeout without proved same-window AppService replacement');
  verify(); remaining('native readiness');
  disconnect(context.miniProgram);
  await waitForNativeStartup(context.observer, remaining('native readiness', deadline - now()), options);
  replacement = context.observer.incarnation();
  if (!replacement || replacement.key !== context.baseline.key || replacement.generation <= context.baseline.generation
      || !replacement.ready || !replacement.processId || replacement.processId === context.baseline.processId) throw Error('Replacement AppService incarnation is not ready');
  verify();
  let fresh;
  try {
    fresh = await screenshotTool.timeout(context.automator.connect({ wsEndpoint: context.endpoint }), remaining('connect'), 'device replacement connect');
    context.onConnected(fresh); // The outer finally owns cleanup even when later proof fails.
    const tool = screenshotTool.selectToolInfo(await screenshotTool.timeout(fresh.send('Tool.getInfo'), remaining('tool'), 'device replacement Tool.getInfo'));
    if (tool.SDKVersion !== context.expectedSDKVersion || (tool.projectPath
        && screenshotTool.normalizeProjectPath(tool.projectPath) !== screenshotTool.normalizeProjectPath(context.projectPath))) throw Error('Replacement SDK/project mismatch');
    await waitForAppServiceReady(fresh, remaining('AppService', deadline - now()), { ...options, minimumReadBudgetMs: 5000, absoluteDeadline: deadline });
    context.observer.poll(); const stable = context.observer.incarnation();
    if (!stable || !stable.ready || stable.key !== replacement.key || stable.generation !== replacement.generation
        || stable.processId !== replacement.processId) throw Error('AppService changed again during replacement proof');
    verify(); remaining('stable viewport');
    if (context.onReconnected) context.onReconnected({ before: context.baseline, after: stable, remainingMs: deadline - now() });
    return fresh;
  } catch (error) { disconnect(fresh); throw error; }
}

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
  return { portFile: path.join(profile, '.ide'), statusFile: path.join(profile, '.ide-status'),
    logDirectory: path.join(path.dirname(profile), 'WeappLog/logs') };
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
    if (!listener || listener.ok !== true) {
      const diagnostics = listener && listener.queryDiagnostics
        ? `; query diagnostics: ${JSON.stringify(screenshotTool.safeListenerQueryDiagnostics(listener.queryDiagnostics))}`
        : '';
      throw new Error(`DevTools IDE listener query failed: ${listener && listener.reason || 'invalid-result'}${diagnostics}.`);
    }
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
  const minimumReadBudgetMs = options.minimumReadBudgetMs || 1;
  if (!Number.isFinite(minimumReadBudgetMs) || minimumReadBudgetMs <= 0) throw Error('AppService minimum read budget must be positive');
  const deadline = Math.min(startedAt + timeoutMs, options.absoluteDeadline === undefined ? Infinity : options.absoluteDeadline);
  let lastProbe = null;
  let attempts = 0;
  let startupBridgeTimeouts = 0;
  while (now() < deadline) {
    const readBudgetMs = deadline - now();
    if (readBudgetMs < minimumReadBudgetMs) throw Error(`AppService readiness budget insufficient: remaining=${readBudgetMs}ms, required=${minimumReadBudgetMs}ms; no RPC started; last probe: ${JSON.stringify(lastProbe || {})}`);
    attempts += 1;
    // The vendor bridge can return its own 10s response timeout while the new
    // AppService boots, before this startup deadline. Only a proved
    // native startup may observe that exact error once more; never retry launch,
    // marker writes, transport loss, application exceptions or a local deadline.
    try {
      lastProbe = await screenshotTool.timeout(miniProgram.evaluate(function inspectAppServiceReady() {
        const functions = { getApp: typeof getApp, getCurrentPages: typeof getCurrentPages,
          App: typeof App, Page: typeof Page };
        const app = functions.getApp === 'function' ? getApp() : null;
        const pages = functions.getCurrentPages === 'function' ? getCurrentPages() : null;
        const pageCount = Array.isArray(pages) ? pages.length : 0;
        const currentPage = pageCount ? pages[pageCount - 1] : null;
        const route = currentPage && (currentPage.route || currentPage.__route__);
        return { functions, appAvailable: !!app && typeof app === 'object', pagesAvailable: Array.isArray(pages),
          pageCount, pageReady: typeof route === 'string' && route.trim().length > 0 };
      }), readBudgetMs, 'AppService readiness evaluate');
    } catch (error) {
      if (options.nativeStartupVerified !== true || startupBridgeTimeouts !== 0
          || !error || error.message !== 'timeout waiting for automator response'
          || now() >= deadline) throw error;
      startupBridgeTimeouts += 1;
      if (options.onStartupBridgeTimeout) options.onStartupBridgeTimeout({
        rpc: 'App.callFunction(inspectAppServiceReady)', attempt: attempts,
        elapsedMs: now() - startedAt, remainingMs: deadline - now(),
      });
      continue;
    }
    const keys = ['getApp', 'getCurrentPages', 'App', 'Page'];
    if (!lastProbe || !lastProbe.functions
        || keys.some((key) => typeof lastProbe.functions[key] !== 'string')
        || typeof lastProbe.appAvailable !== 'boolean' || typeof lastProbe.pagesAvailable !== 'boolean'
        || !Number.isInteger(lastProbe.pageCount) || lastProbe.pageCount < 0
        || typeof lastProbe.pageReady !== 'boolean'
        || (lastProbe.pageReady && (!lastProbe.pagesAvailable || lastProbe.pageCount === 0))) {
      throw new Error(`Invalid AppService readiness probe: ${JSON.stringify(lastProbe || {})}`);
    }
    if (now() >= deadline) break;
    if (keys.every((key) => lastProbe.functions[key] === 'function')
        && lastProbe.appAvailable && lastProbe.pagesAvailable && lastProbe.pageReady) {
      return { ready: true, attempts, elapsedMs: now() - startedAt, lastProbe, startupBridgeTimeouts };
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
  const expectedWindowHeight = Number(process.env.WEAPP_EXPECTED_WINDOW_HEIGHT || 0);
  const viewportWaitMs = Number(process.env.WEAPP_PREWARM_VIEWPORT_WAIT_MS || 0);
  if (!Number.isInteger(viewportWaitMs) || viewportWaitMs < 0 || viewportWaitMs > 300000
      || !Number.isInteger(expectedWindowHeight) || expectedWindowHeight < 0) throw Error('Invalid bounded viewport wait/height');
  const timeoutMs = Number(process.env.WEAPP_PREWARM_TIMEOUT_MS || 60000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) throw Error('Prewarm operation timeout must be within 1..180000ms');
  const startupTimeoutMs = Number(process.env.WEAPP_PREWARM_STARTUP_TIMEOUT_MS || timeoutMs);
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
    const startupBudget = createStartupBudget(startupTimeoutMs, {
      onStage: stage => console.error(`ui:prewarm startup budget: ${JSON.stringify(stage)}`),
    });
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
      const ideReadiness = await waitForWindowsIdeServiceReady(cliPath, startupBudget.remaining('ide-service', 1000, timeoutMs));
      console.error(`ui:prewarm IDE service ready after ${ideReadiness.elapsedMs}ms (${ideReadiness.attempts} probes)`);
    }
    const nativeStartup = process.platform === 'win32'
      ? snapshotNativeStartup(resolveWindowsIdeServiceFiles(cliPath).logDirectory, sourceProjectPath) : null;
    const previousNwPreArgs = process.env.NW_PRE_ARGS;
    process.env.NW_PRE_ARGS = screenshotTool.ensureBackgroundCaptureNwPreArgs(previousNwPreArgs);
    try {
      const launchAllowance = startupBudget.remaining('automation-launch', 1000, timeoutMs);
      launched = await screenshotTool.timeout(automator.launch({
        cliPath: launchCommand.executable,
        args: launchCommand.args,
        projectPath: sourceProjectPath,
        port,
        timeout: launchAllowance,
      }), launchAllowance, 'Startup automation launch');
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
    const nativeStartupReadiness = nativeStartup
      ? await waitForNativeStartup(nativeStartup, startupBudget.remaining('native-container', 1000, timeoutMs, 15000)) : null;
    if (nativeStartupReadiness) console.error(`ui:prewarm native container complete: ${JSON.stringify(nativeStartupReadiness)}`);
    const appServiceAllowance = startupBudget.remaining('app-service', 5000, timeoutMs);
    console.error(`ui:prewarm AppService readiness RPC starting at ${new Date().toISOString()}: App.callFunction(inspectAppServiceReady)`);
    let appServiceReadiness;
    try {
      appServiceReadiness = await waitForAppServiceReady(launched, appServiceAllowance, {
        minimumReadBudgetMs: 5000, absoluteDeadline: startupBudget.deadline,
        nativeStartupVerified: !!nativeStartupReadiness && nativeStartupReadiness.ready === true,
        onStartupBridgeTimeout: (diagnostic) => console.error(
          `ui:prewarm bounded startup bridge timeout at ${new Date().toISOString()}: ${JSON.stringify(diagnostic)}`
        ),
      });
    } catch (error) {
      throw new Error(`ui:prewarm AppService readiness RPC App.callFunction(inspectAppServiceReady) failed: ${error.message}`, { cause: error });
    }
    const startupTiming = startupBudget.snapshot();
    if (startupTiming.elapsedMs >= startupTiming.totalMs) throw Error(`Overall startup budget expired after AppService readiness: ${JSON.stringify(startupTiming)}`);
    console.error(`ui:prewarm startup complete within budget: ${JSON.stringify(startupTiming)}`);
    console.error(`ui:prewarm AppService ready at ${new Date().toISOString()}: ${JSON.stringify(appServiceReadiness)}`);
    let viewportReadiness = null;
    if (viewportWaitMs) {
      const viewportIncarnation = nativeStartup && nativeStartup.incarnation();
      console.error(`ui:prewarm awaiting real viewport ${expectedWindowWidth}x${expectedWindowHeight || '*'} for at most ${viewportWaitMs}ms; GUI device selection only, no second launch`);
      viewportReadiness = await waitForViewportReady(launched, expectedWindowWidth, viewportWaitMs, { height: expectedWindowHeight,
        reconnectAfterReplacement: nativeStartup ? (miniProgram, deadline) => reconnectViewportAfterReplacement({
          miniProgram, observer: nativeStartup, baseline: viewportIncarnation, endpoint, listener: launchedListener,
          cliPath, gitManifestHash: screenshotTool.hashCanonical(gitBeforeLaunch), expectedSDKVersion, projectPath: sourceProjectPath, automator,
          onConnected: fresh => { launched = fresh; },
          onReconnected: proof => console.error(`ui:prewarm device replacement reconnected: ${JSON.stringify(proof)}`),
        }, deadline) : undefined,
        onReadTimeout: diagnostic => console.error(`ui:prewarm bounded viewport read timeout: ${JSON.stringify(diagnostic)}`) });
      console.error(`ui:prewarm real viewport stable: ${JSON.stringify(viewportReadiness)}`);
    }
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
    console.error(`ui:prewarm marker bound at ${new Date().toISOString()}`);

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
      viewportHeight: !expectedWindowHeight || systemInfo.windowHeight === expectedWindowHeight,
      route: !!screenshotTool.normalizeRoute(currentPageInfo),
      listenerIdentity: screenshotTool.validateListenerIdentity(
        screenshotTool.resolveListenerIdentity(endpoint),
        launchedListener
      ).ok,
      backgroundCaptureProcessFlags: backgroundCaptureProcessFlags.ok,
    };
    if (!Object.values(checks).every(Boolean)) {
      throw new Error(`Prewarm verification failed: ${JSON.stringify({ checks,
        verifiedAt: new Date().toISOString(), markerBoundAt: marker.boundAt,
        appServiceReadiness, runtimeMarkerPresent: !!runtimeMarker,
        runtimeMarkerKeys: runtimeMarker ? Object.keys(runtimeMarker).sort() : [],
        expectedMarkerHash: screenshotTool.hashCanonical(marker),
        actualMarkerHash: screenshotTool.hashCanonical(runtimeMarker) })}`);
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
      nativeStartupReadiness,
      startupTiming,
      appServiceReadiness,
      viewportReadiness,
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

module.exports = { main, createStartupBudget, reconnectViewportAfterReplacement, waitForAppServiceReady, waitForViewportReady, resolveWindowsIdeServiceFiles, requestIdeServiceReadiness, waitForWindowsIdeServiceReady };
