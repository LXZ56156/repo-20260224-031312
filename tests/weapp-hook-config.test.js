const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');
const { defaultPatterns, resolveEslintArgs } = require('../scripts/run-eslint');

test('ESLint --fix keeps the repository default patterns for the post-edit hook', () => {
  assert.deepEqual(resolveEslintArgs(['--fix']), ['--fix', ...defaultPatterns]);
  assert.deepEqual(resolveEslintArgs(['--max-warnings', '0']), ['--max-warnings', '0', ...defaultPatterns]);
  assert.deepEqual(resolveEslintArgs(['--fix-type', 'problem']), ['--fix-type', 'problem', ...defaultPatterns]);
  assert.deepEqual(resolveEslintArgs(['-f', 'stylish']), ['-f', 'stylish', ...defaultPatterns]);
  assert.deepEqual(resolveEslintArgs([]), defaultPatterns);
  assert.deepEqual(resolveEslintArgs(['scripts/dev/weapp-post-edit.js']), ['scripts/dev/weapp-post-edit.js']);
  const postEdit = fs.readFileSync(path.join(REPO_DIR, 'scripts/dev/weapp-post-edit.js'), 'utf8');
  assert.match(postEdit, /const lint = run[\s\S]*lint\.status !== 0[\s\S]*ESLint --fix failed/);
});

test('Claude hooks use Windows-native Node entrypoints and keep mirror fallback explicit', () => {
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
  assert.match(weappPreHook.hooks[0].command, /node scripts\/dev\/weapp-hook-ensure\.js mcp/);
  assert.match(editPostHook.hooks[0].command, /node scripts\/dev\/weapp-post-edit\.js/);
  assert.match(recoverHook.hooks[0].command, /node scripts\/dev\/weapp-hook-ensure\.js mcp/);
  assert.doesNotMatch(weappPreHook.hooks[0].command, /bash|\.sh/);
  assert.doesNotMatch(editPostHook.hooks[0].command, /bash|\.sh/);
});

test('codex hooks enable preflight and stop hooks for the Windows weapp workflow', () => {
  const configToml = fs.readFileSync(path.join(REPO_DIR, '.codex/config.toml'), 'utf8');
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.codex/hooks.json'), 'utf8'));
  const userPromptCommand = hooks.hooks.UserPromptSubmit[0].hooks[0].command;
  const stopCommand = hooks.hooks.Stop[0].hooks[0].command;

  assert.match(configToml, /\[features\][\s\S]*hooks = true/);
  assert.match(configToml, /"\/home\/lizixuan\/projects\(WSL\)\/badminton-miniapp"\s*=\s*\{\s*trust_level\s*=\s*"trusted"\s*\}/);
  assert.match(configToml, /"D:\\\\projects\(WIN\)\\\\badminton-miniapp"\s*=\s*\{\s*trust_level\s*=\s*"trusted"\s*\}/);
  assert.doesNotMatch(configToml, /D:\\\\projects\\\\\(WIN\)/);
  assert.ok(hooks.hooks.UserPromptSubmit, '缺少 Codex UserPromptSubmit hook');
  assert.ok(hooks.hooks.Stop, '缺少 Codex Stop hook');
  assert.match(userPromptCommand, /node/);
  assert.match(userPromptCommand, /\.codex\/hooks\/weapp_preflight\.js/);
  assert.doesNotMatch(userPromptCommand, /\/usr\/bin\/python3|user_prompt_sync_windows_mirror|weapp-sync-preview|weapp-hook-ensure/);
  assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].statusMessage, /微信开发环境/);
  assert.match(stopCommand, /node/);
  assert.match(stopCommand, /\.codex\/hooks\/weapp_stop\.js/);
  assert.doesNotMatch(stopCommand, /\/usr\/bin\/python3|stop_sync_windows_mirror|weapp-sync-preview|weapp-hook-ensure/);
  assert.ok(fs.existsSync(path.join(REPO_DIR, '.codex/hooks/weapp_preflight.js')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, '.codex/hooks/weapp_stop.js')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-hook-ensure.js')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-post-edit.js')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-dev.sh')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-sync-preview.sh')));
});
