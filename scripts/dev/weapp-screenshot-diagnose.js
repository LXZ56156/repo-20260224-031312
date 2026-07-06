#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { cases, fileLooksNonBlank } = require('./weapp-ui-screenshot');

function resolveAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (_) {
    // Fall through to the local npx cache.
  }
  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  const candidates = [];
  try {
    for (const entry of fs.readdirSync(npxRoot)) {
      const modulePath = path.join(npxRoot, entry, 'node_modules', 'miniprogram-automator');
      if (fs.existsSync(modulePath)) {
        candidates.push({ modulePath, mtimeMs: fs.statSync(modulePath).mtimeMs });
      }
    }
  } catch (_) {
    // The actionable error below covers a missing cache.
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length) return require(candidates[0].modulePath);
  throw new Error('miniprogram-automator not found. Run: npx --yes -p miniprogram-automator node scripts/dev/weapp-screenshot-diagnose.js <case>');
}

function timeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function collectDom(page, selectors) {
  const rows = [];
  const missingSelectors = [];
  for (const selector of selectors) {
    const elements = await page.$$(selector).catch(() => []);
    if (!elements.length) missingSelectors.push(selector);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const [text, size, offset] = await Promise.all([
        element.text().catch(() => ''),
        element.size().catch(() => null),
        element.offset().catch(() => null)
      ]);
      rows.push({ selector, index, text: String(text || '').replace(/\s+/g, ' ').trim(), size, offset });
    }
  }
  return { rows, missingSelectors };
}

function classifyError(error) {
  const message = String((error && error.message) || error || '');
  if (/ECONNREFUSED|WebSocket|connect/i.test(message)) return 'automation-port-or-connection';
  if (/reLaunch|switchTab/i.test(message)) return 'navigation';
  if (/missing selectors/i.test(message)) return 'dom-selectors';
  if (/missing expected text|forbidden text/i.test(message)) return 'dom-text';
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
  const screenshotTimeoutMs = Number(process.env.WEAPP_SCREENSHOT_TIMEOUT_MS || 60000);
  const reLaunchTimeoutMs = Number(process.env.WEAPP_RELAUNCH_TIMEOUT_MS || 25000);
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
  try {
    miniProgram = await automator.connect({ wsEndpoint });
    report.status = 'connected';

    const routeMethod = item.route === 'switchTab' ? 'switchTab' : 'reLaunch';
    const page = await timeout(miniProgram[routeMethod](item.path), reLaunchTimeoutMs, `${name}:${routeMethod}`);
    await page.waitFor(1200);
    await page.setData(item.data);
    await page.waitFor(1800);
    report.status = 'dom-ready';

    const dom = await collectDom(page, item.selectors);
    const visibleText = dom.rows.map((row) => row.text).join(' ').replace(/\s+/g, '');
    const missingTexts = (item.expectedTexts || []).filter((value) => !visibleText.includes(String(value).replace(/\s+/g, '')));
    const forbiddenTexts = (item.forbiddenTexts || []).filter((value) => visibleText.includes(String(value).replace(/\s+/g, '')));
    report.checks.dom = {
      rows: dom.rows,
      missingSelectors: dom.missingSelectors,
      missingTexts,
      forbiddenTexts
    };
    if (dom.missingSelectors.length) throw new Error(`${name}: missing selectors: ${dom.missingSelectors.join(', ')}`);
    if (missingTexts.length) throw new Error(`${name}: missing expected text: ${missingTexts.join(', ')}`);
    if (forbiddenTexts.length) throw new Error(`${name}: forbidden text present: ${forbiddenTexts.join(', ')}`);

    await timeout(miniProgram.screenshot({ path: diagnosticOutput }), screenshotTimeoutMs, `${name}:screenshot`);
    const nonBlank = fileLooksNonBlank(diagnosticOutput);
    report.checks.screenshot = {
      attempted: true,
      nonBlank,
      diagnosticBytes: fs.existsSync(diagnosticOutput) ? fs.statSync(diagnosticOutput).size : 0,
      promoted: false
    };
    if (!nonBlank) {
      report.status = 'blank-or-small-screenshot';
      fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify(report, null, 2));
      return 2;
    }

    fs.copyFileSync(diagnosticOutput, output);
    report.checks.screenshot.promoted = true;
    report.checks.screenshot.outputBytes = fs.statSync(output).size;
    report.status = 'ok';
    fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } catch (error) {
    report.status = 'failed';
    report.errorType = classifyError(error);
    report.error = String((error && error.stack) || error);
    fs.writeFileSync(reportOutput, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return 2;
  } finally {
    if (miniProgram) {
      try {
        miniProgram.disconnect();
      } catch (_) {
        // Best effort cleanup only.
      }
    }
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
