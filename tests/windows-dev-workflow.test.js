const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');

test('package scripts expose the Windows agent workflow shortcuts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));

  assert.match(pkg.scripts['verify:windows-env'], /scripts\/dev\/check-windows-env\.js/);
  assert.match(pkg.scripts['verify:light'], /tests\/weapp-hook-config\.test\.js/);
  assert.match(pkg.scripts['verify:light'], /tests\/squad\.fairness\.test\.js/);
  assert.match(pkg.scripts['verify:light'], /tests\/ui-screenshot-matrix\.test\.js/);
  assert.match(pkg.scripts['verify:light'], /tests\/workflow-records\.test\.js/);
  assert.match(pkg.scripts['verify:full'], /npm test/);
  assert.match(pkg.scripts['verify:full'], /git diff --check/);
  assert.equal(pkg.scripts['screenshot:schedule'], 'node scripts/dev/weapp-ui-screenshot.js scheduleRunning');
  assert.equal(pkg.scripts['screenshot:smoke'], 'node scripts/dev/weapp-ui-screenshot.js --smoke');
  assert.match(pkg.scripts['screenshot:diagnose'], /scripts\/dev\/weapp-screenshot-diagnose\.js/);
  assert.match(pkg.scripts['weapp:probe'], /probe-weapp-automation\.ps1/);
  assert.equal(pkg.scripts['records:latest'], 'node scripts/show-workflow-records.js');
});

test('Windows environment checker reports private config without printing secret values', () => {
  const script = fs.readFileSync(path.join(REPO_DIR, 'scripts/dev/check-windows-env.js'), 'utf8');

  assert.match(script, /<redacted>/);
  assert.match(script, /WX_APPID/);
  assert.match(script, /WX_APPSECRET/);
  assert.doesNotMatch(script, /console\.log\(.*readEnvValue/);
});

test('screenshot diagnostic protects the last good screenshot from blank captures', () => {
  const script = fs.readFileSync(path.join(REPO_DIR, 'scripts/dev/weapp-screenshot-diagnose.js'), 'utf8');

  assert.match(script, /diagnostic\.png/);
  assert.match(script, /runCase/);
  assert.match(script, /promoteScreenshotSet/);
  assert.match(script, /prepareDevToolsWindow[\s\S]*restoreDevToolsWindow/);
  assert.match(script, /blank-or-stale-visual/);
  assert.match(script, /devtools-screenshot-surface/);
});

test('Windows development docs document the main project and legacy preview boundary', () => {
  const docs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/windows-dev-environment.md'), 'utf8');

  assert.match(docs, /D:\\projects\(WIN\)\\badminton-miniapp/);
  assert.match(docs, /D:\\weapp-mcp-launcher\\weapp-main-dev\.cmd/);
  assert.match(docs, /ws:\/\/127\.0\.0\.1:39420/);
  assert.match(docs, /docs\/records/);
  assert.match(docs, /npm run records:latest/);
  assert.match(docs, /badminton-miniapp-preview/);
  assert.match(docs, /Do not upload the mini program/);
});

test('GitHub agent instructions point agents to the same Windows workflow', () => {
  const docs = fs.readFileSync(path.join(REPO_DIR, '.github/copilot-instructions.md'), 'utf8');

  assert.match(docs, /AGENTS\.md/);
  assert.match(docs, /windows-native-toolchain-migration-handoff\.md/);
  assert.match(docs, /docs\/tools\/windows-dev-environment\.md/);
  assert.match(docs, /npm run verify:light/);
  assert.match(docs, /Do not deploy cloud functions/);
  assert.match(docs, /D:\\projects\(WIN\)\\badminton-miniapp/);
});

test('active handoff docs distinguish the pushed Git branch from the online mini-program release', () => {
  const agents = fs.readFileSync(path.join(REPO_DIR, 'AGENTS.md'), 'utf8');
  const current = fs.readFileSync(path.join(REPO_DIR, 'docs/tasks/current.md'), 'utf8');
  const plan = fs.readFileSync(path.join(REPO_DIR, 'docs/tasks/incremental-ui-optimization-plan.md'), 'utf8');
  const windowsDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/windows-dev-environment.md'), 'utf8');
  const screenshotDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/weapp-ui-screenshot-workflow.md'), 'utf8');
  const recordsDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/records/README.md'), 'utf8');
  const historicalPlan = fs.readFileSync(path.join(REPO_DIR, 'docs/tasks/core-flow-simplification-ui-fix-plan.md'), 'utf8');
  const historicalLog = fs.readFileSync(path.join(REPO_DIR, 'docs/tasks/session-logs/20260622-core-flow-simplification-ui-fix.md'), 'utf8');

  assert.match(agents, /线上正式版[\s\S]*master[\s\S]*origin\/master[\s\S]*5813ffc/);
  assert.match(current, /线上正式版[\s\S]*master[\s\S]*origin\/master[\s\S]*5813ffc/);
  assert.match(current, /origin\/codex\/ui-optimization-v2/);
  assert.match(current, /尚未[^\n]*小程序[^\n]*发布/);
  assert.ok(current.trimEnd().split(/\r?\n/).length <= 50);
  assert.match(plan, /线上版本[\s\S]*master[\s\S]*5813ffc/);
  assert.match(windowsDocs, /Git push[^\n]*not[^\n]*(mini-program|online)[^\n]*(release|state)/i);
  assert.match(screenshotDocs, /pre-commit acceptance snapshot/);
  assert.match(screenshotDocs, /dirty=true/);
  assert.match(recordsDocs, /point-in-time local workflow evidence/);
  assert.match(recordsDocs, /not[^\n]*release evidence/i);
  assert.match(historicalPlan, /superseded[^\n]*2026-07-13/i);
  assert.match(historicalPlan, /0\.002ms/);
  assert.match(historicalLog, /historical request[^\n]*not current authorization/i);
});
