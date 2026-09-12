#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
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
    const launchCommand = screenshotTool.resolveLaunchCommand(cliPath);
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

module.exports = { main };
