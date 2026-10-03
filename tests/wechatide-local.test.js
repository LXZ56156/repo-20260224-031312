const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseConfig, run } = require('../scripts/dev/wechatide-local');
const fixture = '[mcp_servers.wechatide]\ncommand = "cmd.exe"\nargs = ["/d", "/s", "/c", "D:/tools/wechatide.cmd", "-c", "Codex", "mcp", "--token", "test-secret"]\n';

function mcpResponse(result, id = 'call') {
  return JSON.stringify({ jsonrpc: '2.0', id,
    result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
}

test('wechatide local wrapper preserves configured client case and token without printing token', () => {
  assert.equal(parseConfig(fixture).clientName, 'Codex');
  const calls = [];
  const result = run(['simulator_refresh', 'D:/projects(WIN)/badminton-miniapp'], {
    readFile: () => fixture,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      const payload = JSON.parse(options.input);
      assert.deepEqual(payload.args, ['-c', 'Codex', 'mcp', '--token', 'test-secret']);
      assert.deepEqual(payload.initialize, { jsonrpc: '2.0', id: 'init', method: 'initialize', params: {
        protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Codex', version: '1.0.0' }
      } });
      assert.deepEqual(payload.notification, { jsonrpc: '2.0', method: 'notifications/initialized' });
      assert.deepEqual(payload.call, { jsonrpc: '2.0', id: 'call', method: 'tools/call', params: {
        name: 'simulator_refresh', arguments: { project: 'D:/projects(WIN)/badminton-miniapp' }
      } });
      assert.equal(JSON.stringify(args).includes('test-secret'), false);
      assert.equal(options.windowsHide, true);
      return { status: 0, stdout: mcpResponse({ success: true, message: 'test-secret compiled' }), stderr: '' };
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.output), {
    tool: 'simulator_refresh', ok: true, result: { success: true, message: '[Token已隐藏] compiled' }
  });
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

test('wechatide wrapper hides a native spawn error without retrying or invoking authorization', () => {
  let calls = 0;
  assert.throws(() => run(['check_wechatide_status'], {
    readFile: () => fixture,
    spawn() { calls++; return { error: new Error('private test-secret ConvertFrom-Json') }; }
  }), error => !/test-secret|ConvertFrom-Json/.test(error.message));
  assert.equal(calls, 1);
});

test('wechatide wrapper opens an explicit or default neutral page without changing credential transport', () => {
  for (const [argv, expectedPage] of [
    [['simulator_open_page', 'D:/projects/badminton-miniapp/main', 'pages/water/index'], 'pages/water/index'],
    [['simulator_open_page', 'D:/projects/badminton-miniapp/main'], 'pages/launch/index']
  ]) {
    let calls = 0;
    const result = run(argv, { readFile: () => fixture, spawn(_command, args, options) {
      calls++;
      const payload = JSON.parse(options.input);
      assert.deepEqual(payload.args, ['-c', 'Codex', 'mcp', '--token', 'test-secret']);
      assert.deepEqual(payload.call.params, { name: 'simulator_open_page', arguments: {
        project: 'D:/projects/badminton-miniapp/main', page: expectedPage
      } });
      assert.equal(JSON.stringify(args).includes('test-secret'), false);
      assert.equal(options.windowsHide, true);
      return { status: 0, stdout: mcpResponse({ success: true, message: 'test-secret page opened' }), stderr: '' };
    } });
    assert.equal(calls, 1);
    assert.equal(result.status, 0);
    assert.equal(result.output.includes('test-secret'), false);
  }
});

test('wechatide wrapper uses bounded MCP initialization and closes only its own bridge process', () => {
  run(['check_wechatide_status'], { readFile: () => fixture, spawn(_command, args, options) {
    const script = args[args.length - 1];
    const payload = JSON.parse(options.input);
    assert.deepEqual(payload.call.params, { name: 'check_wechatide_status', arguments: {} });
    assert.deepEqual(payload.args, ['-c', 'Codex', 'mcp', '--token', 'test-secret']);
    assert.ok(script.indexOf('$p.initialize') < script.indexOf('$p.notification'));
    assert.ok(script.indexOf('$p.notification') < script.indexOf('$p.call'));
    assert.equal((script.match(/Wait\(15000\)/g) || []).length, 2);
    assert.match(script, /\$initialized\.error/);
    assert.match(script, /finally[\s\S]*StandardInput\.Close\(\)/);
    assert.match(script, /WaitForExit\(2000\)/);
    assert.match(script, /taskkill\.exe.*\/PID \$child\.Id \/T \/F/);
    assert.equal(script.includes('auth'), false);
    assert.equal(options.timeout, 45000);
    return { status: 0, stdout: mcpResponse({ loginExpired: false }), stderr: 'private test-secret ignored' };
  } });
});

test('wechatide wrapper returns nonzero for zero-exit protocol, logical and HTTP failures without raw diagnostics', () => {
  const failures = [
    JSON.stringify({ ok: false, errorType: 'CONNECT_ERROR', source: 'auth', detail: 'private test-secret' }),
    JSON.stringify({ jsonrpc: '2.0', id: 'call', error: { message: 'private test-secret' } }),
    JSON.stringify({ jsonrpc: '2.0', id: 'call', result: { isError: true, content: [] } }),
    mcpResponse({ success: true }, 'init'),
    mcpResponse({ ok: false, detail: 'private test-secret' }),
    mcpResponse({ success: false, detail: 'private test-secret' }),
    mcpResponse({ isError: true }),
    mcpResponse({ code: 433 }),
    mcpResponse({ errcode: 'CONNECT_ERROR' }),
    mcpResponse({ status: 403 }),
    mcpResponse({ status: 403, body: { success: true } }),
    mcpResponse({ status: 200, body: JSON.stringify({ success: false }) }),
    '', 'private test-secret malformed'
  ];
  for (const stdout of failures) {
    let calls = 0;
    const result = run(['check_wechatide_status'], { readFile: () => fixture, spawn() {
      calls++;
      return { status: 0, stdout, stderr: 'private test-secret automatic auth suggestion' };
    } });
    assert.equal(result.status, 1);
    assert.equal(calls, 1);
    assert.equal(/private|test-secret|CONNECT_ERROR|automatic auth/.test(result.output), false);
  }
});

test('wechatide wrapper preserves official successful body envelopes for the iterate consumer', () => {
  const result = run(['simulator_open_page', 'D:/project', 'pages/launch/index'], {
    readFile: () => fixture,
    spawn() {
      return { status: 0, stdout: mcpResponse({ status: 200,
        body: JSON.stringify({ success: true, message: 'page opened', code: 0 }) }), stderr: 'ignored' };
    }
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.output), { tool: 'simulator_open_page', ok: true,
    result: { success: true, message: 'page opened', code: 0 } });
});

test('wechatide MCP transport exchanges standard frames with an offline mock CLI and fails closed', {
  skip: process.platform !== 'win32'
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wechatide-mcp-mock-'));
  const executable = path.join(directory, 'wechatide.cmd');
  const serverPath = path.join(directory, 'mock-mcp.js');
  try {
    fs.writeFileSync(executable, `@echo off\r\n"${process.execPath}" "${serverPath}"\r\n`, 'utf8');
    fs.writeFileSync(serverPath, `
      const readline = require('node:readline');
      const mode = process.env.MOCK_BRIDGE_SCENARIO;
      require('node:fs').writeFileSync(process.env.MOCK_BRIDGE_PID_PATH, String(process.pid));
      if (mode === 'timeout') setInterval(() => {}, 1000);
      let clientName = '';
      let initialized = false;
      readline.createInterface({ input: process.stdin }).on('line', line => {
        const request = JSON.parse(line);
        const respond = response => process.stdout.write(JSON.stringify(response) + '\\n');
        if (request.method === 'initialize') {
          if (mode === 'timeout') return;
          clientName = request.params.clientInfo.name;
          respond(mode === 'init-failure'
            ? { jsonrpc: '2.0', id: request.id, error: { message: 'private test-secret' } }
            : { jsonrpc: '2.0', id: request.id, result: {
              protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'offline-mock', version: '1' }
            } });
        } else if (request.method === 'notifications/initialized') {
          initialized = true;
        } else if (request.method === 'tools/call') {
          if (!initialized || clientName !== 'Codex') throw new Error('MCP initialization order broken');
          respond({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify({
            success: mode !== 'business-failure', clientName, arguments: request.params.arguments
          }) }] } });
        } else throw new Error('Unexpected MCP method');
      });
    `, 'utf8');
    const source = '[mcp_servers.wechatide]\ncommand = ' + JSON.stringify(executable)
      + '\nargs = ["-c", "Codex", "mcp", "--token", "test-secret"]\n';
    for (const [scenario, argv] of [
      ['success', ['check_wechatide_status']],
      ['success', ['simulator_refresh', 'D:/项目(WIN)']],
      ['success', ['simulator_open_page', 'D:/项目(WIN)', 'pages/launch/index']],
      ...['init-failure', 'business-failure', 'timeout'].map(scenario =>
        [scenario, ['simulator_open_page', 'D:/项目(WIN)', 'pages/launch/index']])
    ]) {
      const pidPath = path.join(directory, 'mock.pid');
      const result = run(argv, {
        readFile: () => source,
        spawn(command, args, options) {
          // Exercise the production transport against only our local stub;
          // shortening its waits keeps the negative fixture deterministic.
          const boundedArgs = args.map(arg => arg.replace(/Wait\(15000\)/g, 'Wait(3000)'));
          return spawnSync(command, boundedArgs, {
            ...options, env: { ...process.env, MOCK_BRIDGE_SCENARIO: scenario, MOCK_BRIDGE_PID_PATH: pidPath }
          });
        }
      });
      assert.equal(result.status, scenario === 'success' ? 0 : 1, scenario);
      assert.equal(/test-secret|private/.test(result.output), false);
      const pid = Number(fs.readFileSync(pidPath, 'utf8'));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'the owned mock bridge must have exited');
      if (scenario === 'success') {
        const expectedArguments = argv[0] === 'check_wechatide_status' ? {} : { project: 'D:/项目(WIN)' };
        if (argv[0] === 'simulator_open_page') expectedArguments.page = 'pages/launch/index';
        assert.deepEqual(JSON.parse(result.output), { tool: argv[0], ok: true,
          result: { success: true, clientName: 'Codex', arguments: expectedArguments } });
      }
    }
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('wechatide wrapper rejects unsafe page routes, extra arguments and non-absolute projects before invocation', () => {
  let calls = 0;
  const deps = { readFile: () => fixture, spawn() { calls++; } };
  for (const page of ['', '/pages/launch/index', 'pages/launch/index?new=1',
    'pages/../launch/index', 'pages/launch/index.js', 'pages\\launch\\index',
    'pages/launch/index;whoami', 'pages/launch/index\n', 'pages//launch/index']) {
    assert.throws(() => run(['simulator_open_page', 'D:/project', page], deps));
  }
  for (const argv of [['simulator_open_page', 'relative/project', 'pages/launch/index'],
    ['simulator_open_page', 'D:/project', 'pages/launch/index', 'unexpected'],
    ['simulator_refresh', 'D:/project', 'pages/launch/index'],
    ['check_wechatide_status', 'D:/project']]) assert.throws(() => run(argv, deps));
  assert.equal(calls, 0);
});
