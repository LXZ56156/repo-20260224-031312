const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');

test('claude weapp hooks always run mirror sync helpers', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.claude/settings.json'), 'utf8'));
  const preToolHooks = settings.hooks.PreToolUse || [];
  const postToolHooks = settings.hooks.PostToolUse || [];
  const postFailureHooks = settings.hooks.PostToolUseFailure || [];

  const weappPreHook = preToolHooks.find((entry) => entry.matcher === 'mcp__weapp_dev__.*');
  const editPostHook = postToolHooks.find((entry) => entry.matcher === 'Edit|MultiEdit|Write');
  const recoverHook = postFailureHooks.find((entry) => entry.matcher === 'mcp__weapp_dev__mp_ensureConnection');

  assert.ok(weappPreHook, '缺少微信 MCP 前置 hook');
  assert.ok(editPostHook, '缺少编辑后置 hook');
  assert.ok(recoverHook, '缺少 MCP 自动恢复 hook');
  assert.match(weappPreHook.hooks[0].command, /scripts\/dev\/weapp-hook-ensure\.sh mcp/);
  assert.match(editPostHook.hooks[0].command, /scripts\/dev\/weapp-hook-ensure\.sh mirror/);
  assert.match(recoverHook.hooks[0].command, /scripts\/dev\/weapp-hook-ensure\.sh mcp/);
});

test('codex hooks enable mirror sync before and after each turn', () => {
  const configToml = fs.readFileSync(path.join(REPO_DIR, '.codex/config.toml'), 'utf8');
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.codex/hooks.json'), 'utf8'));

  assert.match(configToml, /\[features\][\s\S]*codex_hooks = true/);
  assert.ok(hooks.hooks.UserPromptSubmit, '缺少 Codex UserPromptSubmit hook');
  assert.ok(hooks.hooks.Stop, '缺少 Codex Stop hook');
  assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].command, /\.codex\/hooks\/user_prompt_sync_windows_mirror\.py/);
  assert.match(hooks.hooks.Stop[0].hooks[0].command, /\.codex\/hooks\/stop_sync_windows_mirror\.py/);
});
