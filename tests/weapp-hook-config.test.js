const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('post-commit hook cannot deploy cloud functions', () => {
  const hook = fs.readFileSync(path.join(__dirname, '../scripts/git-hooks/post-commit-cloud-deploy.sh'), 'utf8');
  assert.doesNotMatch(hook, /(?:bash|node|npm).*deploy/);
});
test('daily hooks cannot start mirror, DevTools, or broad tests', () => {
  for (const file of ['.codex/hooks.json', '.claude/settings.json']) {
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    assert.deepEqual(settings.hooks, {}, file);
  }
  const legacy = fs.readFileSync(path.join(__dirname, '../scripts/dev/weapp-dev.sh'), 'utf8');
  assert.doesNotMatch(legacy, /_npx|patch_weapp_mcp_screenshot_timeout/);
});
