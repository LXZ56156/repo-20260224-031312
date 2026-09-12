const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, run } = require('../scripts/dev/wechatide-local');
const fixture = '[mcp_servers.wechatide]\ncommand = "cmd.exe"\nargs = ["/d", "/s", "/c", "D:/tools/wechatide.cmd", "-c", "Codex", "mcp", "--token", "test-secret"]\n';

test('wechatide local wrapper preserves configured client case and token without printing token', () => {
  assert.equal(parseConfig(fixture).clientName, 'Codex');
  const calls = [];
  const result = run(['simulator_refresh', 'D:/projects(WIN)/badminton-miniapp'], {
    readFile: () => fixture,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      const payload = JSON.parse(options.input);
      assert.deepEqual(payload.args, ['-c', 'Codex', 'simulator_refresh', '--project', 'D:/projects(WIN)/badminton-miniapp', '--token', 'test-secret']);
      assert.equal(JSON.stringify(args).includes('test-secret'), false);
      assert.equal(options.windowsHide, true);
      return { status: 0, stdout: 'test-secret compiled', stderr: '' };
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(result.output.includes('test-secret'), false);
});

test('wechatide local wrapper never calls the CLI for missing token, ambiguous config or unapproved action', () => {
  let calls = 0;
  for (const source of [fixture.replace(', "--token", "test-secret"', ''), fixture.replace('test-secret', ''), fixture + fixture]) {
    assert.throws(() => run(['check_wechatide_status'], { readFile: () => source, spawn: () => { calls++; } }));
  }
  assert.throws(() => run(['auth'], { readFile: () => fixture, spawn: () => { calls++; } }));
  assert.equal(calls, 0);
});

test('wechatide wrapper sends non-ASCII paths as ASCII JSON and hides failed process payloads', () => {
  const result = run(['check_wechatide_status'], {
    readFile: () => fixture.replace('D:/tools/', 'D:/微信工具/'),
    spawn(_command, args, options) {
      assert.equal(/[^\x00-\x7f]/.test(options.input), false);
      assert.equal(JSON.parse(options.input).executable, 'D:/微信工具/wechatide.cmd');
      assert.match(args[args.length - 1], /ErrorActionPreference = 'Stop'/);
      assert.match(args[args.length - 1], /catch \{ exit 1 \}/);
      return { status: 1, stdout: options.input, stderr: 'private parser error' };
    }
  });
  assert.equal(result.status, 1);
  assert.equal(result.output.includes('test-secret'), false);
  assert.equal(result.output.includes('private parser error'), false);
  assert.equal(result.output.includes('executable'), false);
});

test('wechatide wrapper reports a real PowerShell invocation error as nonzero without private payload', { skip: process.platform !== 'win32' }, () => {
  const result = run(['check_wechatide_status'], {
    readFile: () => fixture.replace('D:/tools/', 'D:/__missing_wechatide_wrapper_test__/')
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.output.includes('test-secret'), false);
  assert.equal(result.output.includes('ConvertFrom-Json'), false);
});
