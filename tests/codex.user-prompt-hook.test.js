const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const HOOK_SCRIPT = path.join(REPO_DIR, '.codex/hooks/user_prompt_sync_windows_mirror.py');
const STOP_HOOK_SCRIPT = path.join(REPO_DIR, '.codex/hooks/stop_sync_windows_mirror.py');

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-user-prompt-hook-'));
  const modeLog = path.join(rootDir, 'mode.log');
  const helper = path.join(rootDir, 'fake-weapp-hook-ensure.sh');

  fs.writeFileSync(
    helper,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" > "${modeLog}"
`,
    'utf8'
  );
  fs.chmodSync(helper, 0o755);

  return {
    env: {
      ...process.env,
      WEAPP_HOOK_ENSURE_SCRIPT: helper,
    },
    modeLog,
  };
}

function runHook(payload, env) {
  return execFileSync('python3', [HOOK_SCRIPT], {
    cwd: REPO_DIR,
    env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function runStopHook(payload, env) {
  return execFileSync('python3', [STOP_HOOK_SCRIPT], {
    cwd: REPO_DIR,
    env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

test('user prompt hook prepares full mcp chain for weapp-related prompts', () => {
  const fixture = createFixture();

  runHook({ prompt: '用微信mcp对修改结果做验证' }, fixture.env);

  assert.equal(fs.readFileSync(fixture.modeLog, 'utf8').trim(), 'mcp');
});

test('user prompt hook keeps mirror-only preflight for unrelated prompts', () => {
  const fixture = createFixture();

  runHook({ prompt: '整理一下这份审计文档' }, fixture.env);

  assert.equal(fs.readFileSync(fixture.modeLog, 'utf8').trim(), 'mirror');
});

test('stop hook routes mirror helper through Git Bash on Windows', () => {
  const fixture = createFixture();

  runStopHook({}, fixture.env);

  assert.equal(fs.readFileSync(fixture.modeLog, 'utf8').trim(), 'mirror');
});
