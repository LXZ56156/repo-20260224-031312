const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');
const PREFLIGHT_SCRIPT = path.join(REPO_DIR, '.codex/hooks/windows_weapp_preflight.ps1');
const STOP_SCRIPT = path.join(REPO_DIR, '.codex/hooks/windows_weapp_stop.ps1');

test('codex user prompt hook points to Windows main DevTools preflight', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.codex/hooks.json'), 'utf8'));
  const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command;

  assert.ok(fs.existsSync(PREFLIGHT_SCRIPT));
  assert.match(command, /powershell\.exe/);
  assert.match(command, /windows_weapp_preflight\.ps1/);
  assert.match(command, /D:\\projects\\badminton-miniapp/);
  assert.doesNotMatch(command, /user_prompt_sync_windows_mirror|weapp-sync-preview|weapp-hook-ensure|\/usr\/bin\/python3/);
});

test('Windows preflight is keyword-gated and uses the main source launcher', () => {
  const script = fs.readFileSync(PREFLIGHT_SCRIPT, 'utf8');

  assert.match(script, /WEAPP_PREFLIGHT_LAUNCHER/);
  assert.match(script, /weapp-main-dev\.cmd/);
  assert.match(script, /39420/);
  assert.match(script, /Test-WeappPrompt/);
  assert.match(script, /0x5fae/);
  assert.match(script, /0x5c0f/);
  assert.match(script, /devtools/);
  assert.match(script, /0x622a/);
  assert.doesNotMatch(script, /badminton-miniapp-preview|weapp-sync-preview|weapp-hook-ensure/);
});

test('Windows preflight skips empty prompt payload unless explicitly forced', () => {
  const script = fs.readFileSync(PREFLIGHT_SCRIPT, 'utf8');

  assert.match(script, /WEAPP_PREFLIGHT_FORCE[\s\S]*return \$true/);
  assert.match(script, /IsNullOrWhiteSpace\(\$Payload\)[\s\S]*return \$false/);
});

test('codex stop hook is a no-op for Windows main development', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.codex/hooks.json'), 'utf8'));
  const command = hooks.hooks.Stop[0].hooks[0].command;
  const script = fs.readFileSync(STOP_SCRIPT, 'utf8');

  assert.ok(fs.existsSync(STOP_SCRIPT));
  assert.match(command, /powershell\.exe/);
  assert.match(command, /windows_weapp_stop\.ps1/);
  assert.match(script, /exit 0/);
  assert.doesNotMatch(script, /badminton-miniapp-preview|weapp-sync-preview|weapp-hook-ensure/);
});

test('legacy mirror hook files are retained for preview or upload workflows only', () => {
  assert.ok(fs.existsSync(path.join(REPO_DIR, '.codex/hooks/user_prompt_sync_windows_mirror.py')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, '.codex/hooks/stop_sync_windows_mirror.py')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-dev.sh')));
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'scripts/dev/weapp-sync-preview.sh')));
});
