#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  cases,
  prepareDevToolsWindow,
  promoteScreenshotSet,
  restoreDevToolsWindow,
  runCase
} = require('./weapp-ui-screenshot');

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (error) {
    throw new Error(`Local miniprogram-automator is unavailable. Run npm install in the repository. (${error.message})`);
  }
}

function classifyError(error) {
  const message = String((error && error.message) || error || '');
  if (/ECONNREFUSED|WebSocket|connect/i.test(message)) return 'automation-port-or-connection';
  if (/reLaunch|switchTab/i.test(message)) return 'navigation';
  if (/missing selectors/i.test(message)) return 'dom-selectors';
  if (/missing expected text|forbidden text/i.test(message)) return 'dom-text';
  if (/visual region|blank or stale|PNG validation/i.test(message)) return 'blank-or-stale-visual';
  if (/window (?:state|restore)|DevTools window restoration|foreground window/i.test(message)) return 'window-restore';
  if (/App\.captureScreenshot|screenshot/i.test(message)) return 'devtools-screenshot-surface';
  if (/timed out/i.test(message)) return 'timeout';
  return 'unknown';
}

async function main() {
  const name = process.argv[2] || 'scheduleRunning';
  const item = cases[name];
  if (!item) {
    console.error(`Unknown case: ${name}`);
    console.error(`Available cases:\n${Object.keys(cases).join('\n')}`);
    return 1;
  }

  const automator = resolveAutomator();
  const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:39420';
  const outDir = path.resolve(process.env.WEAPP_SCREENSHOT_DIR || 'tmp/ui-screenshots-actual');
  const output = path.join(outDir, `${name}.png`);
  const diagnosticOutput = path.join(outDir, `${name}.diagnostic.png`);
  const reportOutput = path.join(outDir, `${name}.diagnostic.json`);
  const report = {
    case: name,
    wsEndpoint,
    output,
    diagnosticOutput,
    reportOutput,
    route: item.path,
    status: 'started',
    checks: {}
  };

  fs.mkdirSync(outDir, { recursive: true });
  let miniProgram;
  let result;
  let managedWindowState;
  let windowRestore = null;
  let captureError = null;
  let restoreError = null;
  try {
    managedWindowState = prepareDevToolsWindow().state;
    miniProgram = await automator.connect({ wsEndpoint });
    report.status = 'connected';
    result = await runCase(name, miniProgram);
    report.status = 'coherent-capture-ready';
    report.checks.dom = {
      rows: result.dom,
      missingSelectors: [],
      missingTexts: [],
      forbiddenTexts: []
    };
    fs.copyFileSync(result.candidatePath, diagnosticOutput);
    report.checks.screenshot = {
      attempted: true,
      nonBlank: true,
      diagnosticBytes: result.bytes,
      width: result.width,
      height: result.height,
      captureCount: result.captureCount,
      visualRegions: result.visualRegions,
      coherence: result.coherence,
      promoted: false
    };
  } catch (error) {
    captureError = error;
  } finally {
    if (miniProgram) {
      try {
        miniProgram.disconnect();
      } catch (_) {
        // Best effort cleanup only.
      }
    }
    try {
      windowRestore = restoreDevToolsWindow(managedWindowState);
    } catch (error) {
      restoreError = error;
    }
  }

  if (captureError || restoreError) {
    if (result && result.candidatePath) fs.rmSync(result.candidatePath, { force: true });
    const failure = captureError && restoreError
      ? new AggregateError([captureError, restoreError], 'Screenshot diagnosis and DevTools window restoration both failed')
      : (captureError || restoreError);
    report.status = 'failed';
    report.errorType = restoreError ? 'window-restore' : classifyError(failure);
    report.error = String((failure && failure.stack) || failure);
    if (captureError && restoreError) {
      report.captureError = String(captureError.stack || captureError);
      report.restoreError = String(restoreError.stack || restoreError);
    }
    fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return 2;
  }

  try {
    if (!promoteScreenshotSet([result], [name])) throw new Error(`${name}: validated screenshot could not be promoted`);
    report.checks.screenshot.promoted = true;
    report.checks.screenshot.outputBytes = fs.statSync(output).size;
    report.checks.windowRestore = windowRestore;
    report.status = 'ok';
    fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } catch (error) {
    if (result && result.candidatePath) fs.rmSync(result.candidatePath, { force: true });
    report.status = 'failed';
    report.errorType = classifyError(error);
    report.error = String((error && error.stack) || error);
    fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return 2;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
