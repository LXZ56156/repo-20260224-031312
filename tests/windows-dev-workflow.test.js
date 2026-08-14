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
  assert.match(pkg.scripts['verify:light'], /tests\/preview-qrcode-delivery\.test\.js/);
  assert.match(pkg.scripts['verify:full'], /npm test/);
  assert.match(pkg.scripts['verify:full'], /git diff --check/);
  assert.equal(pkg.scripts['screenshot:schedule'], 'node scripts/dev/weapp-ui-screenshot.js scheduleRunning');
  assert.equal(pkg.scripts['screenshot:smoke'], 'node scripts/dev/weapp-ui-screenshot.js --smoke');
  assert.match(pkg.scripts['screenshot:diagnose'], /scripts\/dev\/weapp-screenshot-diagnose\.js/);
  assert.match(pkg.scripts['weapp:probe'], /probe-weapp-automation\.ps1/);
  assert.equal(pkg.scripts['records:latest'], 'node scripts/show-workflow-records.js');
  assert.equal(pkg.scripts['mp:preview:deliver'], 'node scripts/mp-ci.js preview-deliver');
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
  assert.match(docs, /mp:preview:deliver/);
  assert.match(docs, /preview-qrcodes/);
  assert.match(docs, /Do not upload the mini program/);
});

test('GitHub agent instructions remain a thin adapter to canonical governance', () => {
  const docs = fs.readFileSync(path.join(REPO_DIR, '.github/copilot-instructions.md'), 'utf8');

  assert.match(docs, /AGENTS\.md/);
  assert.match(docs, /docs\/tasks\/current\.md/);
  assert.match(docs, /docs\/status\/project-state\.md/);
  assert.doesNotMatch(docs, /\b[0-9a-f]{7,40}\b/i);
  assert.doesNotMatch(docs, /ws:\/\/127\.0\.0\.1:\d+/i);
});

test('governance separates current status, product boundary and archived restart evidence', () => {
  const agents = fs.readFileSync(path.join(REPO_DIR, 'AGENTS.md'), 'utf8');
  const current = fs.readFileSync(path.join(REPO_DIR, 'docs/tasks/current.md'), 'utf8');
  const status = fs.readFileSync(path.join(REPO_DIR, 'docs/status/project-state.md'), 'utf8');
  const plan = fs.readFileSync(path.join(REPO_DIR, 'docs/specs/incremental-ui-optimization.md'), 'utf8');
  const restart = fs.readFileSync(path.join(REPO_DIR, 'docs/archive/2026/handoffs/incremental-ui-restart-2026-07-29.md'), 'utf8');
  const windowsDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/windows-dev-environment.md'), 'utf8');
  const screenshotDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/weapp-ui-screenshot-workflow.md'), 'utf8');
  const recordsDocs = fs.readFileSync(path.join(REPO_DIR, 'docs/records/README.md'), 'utf8');
  const historicalPlan = fs.readFileSync(path.join(REPO_DIR, 'docs/archive/2026/plans/core-flow-simplification-ui-fix-plan.md'), 'utf8');
  const historicalLog = fs.readFileSync(path.join(REPO_DIR, 'docs/archive/2026/session-logs/20260622-core-flow-simplification-ui-fix.md'), 'utf8');

  assert.match(agents, /docs\/tasks\/current\.md/);
  assert.match(agents, /docs\/status\/project-state\.md/);
  assert.doesNotMatch(agents, /\b[0-9a-f]{7,40}\b/i);
  assert.match(current, /docs_governance_consolidation_completed_online_baseline_confirmed/);
  assert.ok(current.trimEnd().split(/\r?\n/).length <= 50);
  assert.match(status, /master[\s\S]*5813ffc/);
  assert.match(status, /云函数部署授权[\s\S]*兼容变更自动部署/);
  assert.match(status, /不授权[\s\S]*不兼容迁移/);
  assert.match(plan, /线上版本[\s\S]*master[\s\S]*5813ffc/);
  assert.match(plan, /38d6ea4/);
  assert.match(plan, /score-only 基线已于 2026-07-29 建立/);
  assert.match(plan, /新路线工具链边界[\s\S]*不得同时迁入旧分支的 workflow records/);
  assert.match(plan, /历史提交批次（不得重放）[\s\S]*新路线首批只能是 `38d6ea4`/);
  assert.match(restart, /生命周期：已完成并归档/);
  assert.match(restart, /patch-id[\s\S]*2cf91c83878e94c9b39fb57694c5b2cf09c4028d/);
  assert.match(restart, /git diff --name-only master -- cloudfunctions[\s\S]*必须为空/);
  assert.match(restart, /冻结入口的 15 个 implementation\/evidence tracked modified[\s\S]*收尾审计状态是 43 tracked modified \+ 2 个顶层 untracked/);
  assert.match(restart, /浏览器[^\n]*近似方案[\s\S]*DevTools 实图/);
  assert.match(restart, /未 push、未建 PR[\s\S]*未 upload[\s\S]*未部署/);
  assert.match(windowsDocs, /Git push[^\n]*not[^\n]*(mini-program|online)[^\n]*(release|state)/i);
  assert.match(screenshotDocs, /pre-commit acceptance snapshot/);
  assert.match(screenshotDocs, /dirty=true/);
  assert.match(recordsDocs, /point-in-time local workflow evidence/);
  assert.match(recordsDocs, /not[^\n]*release evidence/i);
  assert.match(historicalPlan, /superseded[^\n]*2026-07-13/i);
  assert.match(historicalPlan, /0\.002ms/);
  assert.match(historicalLog, /historical request[^\n]*not current authorization/i);
});
