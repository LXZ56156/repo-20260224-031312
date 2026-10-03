#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { cases } = require('./weapp-ui-screenshot-cases');

const ROOT = path.resolve(__dirname, '..', '..');
const HELP = '用法：npm run ui:iterate -- <case> [case...]\n只连接现有热会话；必要时自动执行 source challenge → 官方编译并打开 launch → refresh，再截图。\n不预热、不切设备、不操作窗口。详细日志：tmp/ui-iterate-runs/<id>。';

// The runner prints successive pretty JSON objects; the official wrapper also
// emits a trailing diagnostic line. Parse complete objects without shell/npm.
function jsonObjects(output) {
  const result = [];
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (start < 0) {
      if (character === '{') { start = index; depth = 1; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try { result.push(JSON.parse(output.slice(start, index + 1))); }
        catch (_) { /* Non-JSON diagnostic text is not evidence. */ }
        start = -1;
      }
    }
  }
  return result;
}

function allChecks(checks) {
  return !!checks && Object.keys(checks).length > 0
    && Object.values(checks).every(value => value === true);
}

function onlySourceChanged(doctor) {
  if (!doctor || doctor.kind !== 'weapp-ui-doctor-readonly-v1'
      || doctor.ok !== false || doctor.checks.sourceSnapshot !== false) return false;
  return Object.entries(doctor.checks).every(([name, value]) => (
    name === 'sourceSnapshot' || name === 'marker' || value === true
  ));
}

function validChallenge(refresh) {
  const checks = refresh && refresh.checks;
  const baseNames = ['sessionRecord', 'runtimeMarkerReadable', 'listenerIdentity',
    'toolProjectPath', 'sdkVersion', 'viewport', 'route', 'git'];
  if (!refresh || refresh.kind !== 'weapp-ui-doctor-result-v3' || refresh.ok !== false
      || refresh.sourceSnapshotChanged !== true || !checks
      || !baseNames.every(name => checks[name] === true)
      || checks.runtimeRecompiledForChangedSource !== false
      || checks.sourceStableDuringDoctor !== true) return false;
  if (refresh.runtimeMarkerMatchesPendingChallenge === true
      && refresh.pendingMatchesCurrentSource === true) return true;
  const pending = refresh.pendingSession && refresh.pendingSession.pendingRefresh;
  return !!pending && /^[a-f0-9]{64}$/i.test(String(pending.challengeId || ''))
    && /^[a-f0-9]{64}$/i.test(String(pending.targetGitManifestHash || ''))
    && !pending.viewportRebind && !!refresh.challengeBinding
    && refresh.challengeBinding.ok === true;
}

function successfulRefresh(result) {
  return result && result.kind === 'weapp-ui-doctor-result-v3'
    && result.ok === true && allChecks(result.checks);
}

function captureDiagnostics(receipts, promotion) {
  return {
    publication: promotion ? {
      promoted: promotion.promoted,
      publicationState: promotion.publicationState,
      reason: promotion.reason || promotion.error || null,
      manifestPath: promotion.manifestPath || null,
    } : null,
    caseDiagnostics: receipts.map(receipt => ({
      name: receipt.name,
      captureOk: receipt.captureOk === true,
      evidenceOk: receipt.evidenceOk === true,
      machineOk: receipt.machineOk === true,
      error: receipt.error ? String(receipt.error).split('\n')[0] : null,
      failedChecks: Object.entries(receipt.receiptValidation && receipt.receiptValidation.checks || {})
        .filter(([, value]) => value !== true).map(([name]) => name),
      cleanupError: receipt.cleanupError || null,
      fixtureCleanup: receipt.fixtureCleanup || null,
      storageFixtureCleanup: receipt.storageFixtureCleanup || null,
      runtimeExceptionCount: (receipt.runtimeExceptions || []).length,
      runtimeConsoleEvents: (receipt.runtimeConsole || []).length,
      candidatePng: receipt.captureOk === true ? receipt.candidateOutput || null : null,
      candidateReceipt: receipt.candidateReceiptPath || null,
    })),
  };
}

function run(argv, deps = {}) {
  if (argv.length === 1 && argv[0] === '--help') return { ok: true, help: HELP, exitCode: 0 };
  if (!argv.length || argv.some(name => !Object.hasOwn(cases, name))
      || new Set(argv).size !== argv.length) {
    return { ok: false, exitCode: 1, error: '请明确指定存在且不重复的截图 case；使用 --help 查看用法。' };
  }
  const env = deps.env || { ...process.env,
    WEAPP_CAPTURE_SURFACE: process.env.WEAPP_CAPTURE_SURFACE || 'simulator-frame' };
  if (env.WEAPP_CAPTURE_MODE && env.WEAPP_CAPTURE_MODE !== 'capture') {
    return { ok: false, exitCode: 1, error: 'ui:iterate 仅支持正式 capture 模式，不编排 focus probe。' };
  }
  const now = deps.now || Date.now;
  const execute = deps.execute || ((executable, args, options) => spawnSync(executable, args, options));
  const withCompileLock = deps.withCompileLock || ((action) => {
    const screenshot = require('./weapp-ui-screenshot');
    const lock = screenshot.acquireSessionLock(screenshot.resolveSessionFile(env, ROOT), 'iterate-compile');
    try { return action(); }
    finally { screenshot.releaseSessionLockOrThrow(lock); }
  });
  const save = deps.save || ((filename, value) => {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, value, 'utf8');
  });
  const runId = deps.runId || `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const logDir = path.join(ROOT, 'tmp', 'ui-iterate-runs', runId);
  const started = now();
  const stages = [];
  let failedStage = null;
  let failureDetails = {};
  function stage(name, script, args) {
    failedStage = name;
    const stageStart = now();
    const result = execute(process.execPath, [path.join(__dirname, script), ...args], {
      cwd: ROOT, env, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    });
    const stdout = String(result && result.stdout || '');
    const stderr = String(result && result.stderr || '');
    const exitCode = result && Number.isInteger(result.status) ? result.status : null;
    stages.push({ name, durationMs: now() - stageStart, exitCode });
    save(path.join(logDir, `${name}.stdout.log`), stdout);
    save(path.join(logDir, `${name}.stderr.log`), stderr);
    if (!result || result.error || exitCode === null) throw new Error('子命令未正常结束；保留日志，不自动重试。');
    return { exitCode, objects: jsonObjects(stdout) };
  }
  function singleKind(result, kind) {
    const matching = result.objects.filter(item => item.kind === kind);
    return matching.length === 1 ? matching[0] : null;
  }
  function finish(summary) {
    const value = { ...summary, cases: argv, stages, totalMs: now() - started, logDir };
    save(path.join(logDir, 'summary.json'), `${JSON.stringify(value, null, 2)}\n`);
    return value;
  }
  try {
    const doctorStage = stage('doctor', 'weapp-ui-screenshot.js', ['--doctor']);
    const doctor = singleKind(doctorStage, 'weapp-ui-doctor-readonly-v1');
    if (!(doctorStage.exitCode === 0 && doctor && doctor.ok === true && allChecks(doctor.checks))) {
      if (doctorStage.exitCode !== 2 || !onlySourceChanged(doctor)) {
        throw new Error('热会话诊断失败，未自动修复身份、锁、SDK、宽度或窗口；查看 doctor 日志。');
      }
      const challengeStage = stage('refresh-challenge', 'weapp-ui-screenshot.js', ['--refresh-session']);
      const challenge = singleKind(challengeStage, 'weapp-ui-doctor-result-v3');
      if (!(challengeStage.exitCode === 0 && successfulRefresh(challenge))) {
        if (challengeStage.exitCode !== 2 || !validChallenge(challenge)) {
          throw new Error('未取得有效的当前源码 challenge；未执行官方编译。');
        }
        failedStage = 'compile';
        const compileStage = withCompileLock(() => stage('compile', 'wechatide-local.js', ['simulator_open_page', ROOT, 'pages/launch/index']));
        const official = compileStage.objects.filter(item => item.tool === 'simulator_open_page');
        if (compileStage.exitCode !== 0 || official.length !== 1
            || official[0].ok !== true || !official[0].result || official[0].result.success !== true) {
          throw new Error('官方 simulator_open_page 未明确成功；未继续刷新或截图。');
        }
        const refreshStage = stage('refresh-after-compile', 'weapp-ui-screenshot.js', ['--refresh-session']);
        const refresh = singleKind(refreshStage, 'weapp-ui-doctor-result-v3');
        if (refreshStage.exitCode !== 0 || !successfulRefresh(refresh)
            || refresh.changedSourceCompileProven !== true) {
          throw new Error('编译后的签名验证失败；未继续截图。');
        }
      }
    }
    const captureStage = stage('capture', 'weapp-ui-screenshot.js', argv);
    const receipts = captureStage.objects.filter(item => item.kind === 'weapp-ui-capture-receipt-v1');
    const promotion = captureStage.objects[captureStage.objects.length - 1];
    failureDetails = captureDiagnostics(receipts, promotion);
    if (captureStage.exitCode !== 0 || receipts.length !== argv.length
        || !receipts.every((receipt, index) => receipt.name === argv[index]
          && receipt.ok === true && receipt.captureOk === true && receipt.evidenceOk === true
          && receipt.machineOk === true && typeof receipt.output === 'string' && receipt.output
          && receipt.promotion && receipt.promotion.promoted === true)
        || !promotion || promotion.ok !== true || promotion.promoted !== true
        || promotion.publicationState !== 'committed') {
      throw new Error('截图或批次发布未通过；保留 candidate 与日志，不自动重试。');
    }
    return finish({ ok: true, exitCode: 0, reviewStatus: 'pending',
      screenshots: receipts.map(receipt => ({ name: receipt.name, png: receipt.output,
        receipt: receipt.receiptPath, runtimeExceptions: (receipt.runtimeExceptions || []).length,
        runtimeConsoleEvents: (receipt.runtimeConsole || []).length,
        viewport: receipt.systemInfo ? { width: receipt.systemInfo.windowWidth,
          height: receipt.systemInfo.windowHeight } : null,
        pixels: receipt.png ? { width: receipt.png.width, height: receipt.png.height } : null,
        sdk: receipt.expectedSDKVersion || null,
        dataVerified: receipt.caseData ? receipt.caseData.ok === true : null,
        matchedElements: Object.values(receipt.selectorCoverage && receipt.selectorCoverage.counts || {})
          .reduce((sum, count) => sum + Number(count), 0) })) });
  } catch (error) {
    return finish({ ok: false, exitCode: 1, failedStage, error: String(error.message || error), ...failureDetails });
  }
}

if (require.main === module) {
  const result = run(process.argv.slice(2));
  console.log(result.help || JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}

module.exports = { run, jsonObjects };
