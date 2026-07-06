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
  assert.match(pkg.scripts['verify:full'], /npm test/);
  assert.match(pkg.scripts['verify:full'], /git diff --check/);
  assert.equal(pkg.scripts['screenshot:schedule'], 'node scripts/dev/weapp-ui-screenshot.js scheduleRunning');
  assert.match(pkg.scripts['screenshot:diagnose'], /scripts\/dev\/weapp-screenshot-diagnose\.js/);
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
  assert.match(script, /fileLooksNonBlank/);
  assert.match(script, /fs\.copyFileSync\(diagnosticOutput, output\)/);
  assert.match(script, /devtools-screenshot-surface/);
});

test('Windows development docs document the main project and legacy preview boundary', () => {
  const docs = fs.readFileSync(path.join(REPO_DIR, 'docs/tools/windows-dev-environment.md'), 'utf8');

  assert.match(docs, /D:\\projects\\badminton-miniapp/);
  assert.match(docs, /D:\\weapp-mcp-launcher\\weapp-main-dev\.cmd/);
  assert.match(docs, /ws:\/\/127\.0\.0\.1:39420/);
  assert.match(docs, /badminton-miniapp-preview/);
  assert.match(docs, /Do not upload the mini program/);
});

test('GitHub agent instructions point agents to the same Windows workflow', () => {
  const docs = fs.readFileSync(path.join(REPO_DIR, '.github/copilot-instructions.md'), 'utf8');

  assert.match(docs, /AGENTS\.md/);
  assert.match(docs, /docs\/tools\/windows-dev-environment\.md/);
  assert.match(docs, /npm run verify:light/);
  assert.match(docs, /Do not deploy cloud functions/);
  assert.match(docs, /D:\\projects\\badminton-miniapp/);
});
