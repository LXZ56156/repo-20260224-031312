'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const ready = require('../scripts/dev/weapp-ui-prewarm');

const cliPath = path.resolve('tmp/selected-devtools/cli.bat');
const guiPath = path.join(path.dirname(cliPath), '微信开发者工具.exe');
const files = { statusFile: 'status', portFile: 'port' };
function identity(extra = {}) {
  return { ok: true, endpoint: 'ws://127.0.0.1:29558', port: 29558,
    owningProcessId: 100, processStartFileTimeUtc: '1000', sessionId: 1,
    executablePath: guiPath, localAddresses: ['127.0.0.1'],
    processChain: [{ processId: 100, executablePath: guiPath }], ...extra };
}
function setup(overrides = {}) {
  let clock = 0;
  const options = { files, now: () => clock,
    sleep: async (ms) => { clock += ms; },
    readFile: (file) => file === 'status' ? 'On' : '29558',
    resolveListener: () => identity(), probe: async () => ({ ready: true }), ...overrides };
  return { options, get clock() { return clock; } };
}
async function serverProbe(handler, timeoutMs = 100) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await ready.requestIdeServiceReadiness(server.address().port, timeoutMs); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('service files use the official exact install hash without scanning profiles', () => {
  const userProfile = path.resolve('tmp/mock-profile');
  const seen = [];
  const result = ready.resolveWindowsIdeServiceFiles(cliPath, { userProfile, readFile(file) {
    seen.push(file); return JSON.stringify({ name: '微信开发者工具' });
  } });
  const hash = crypto.createHash('md5').update(path.join(path.dirname(cliPath), 'resources/app.asar')).digest('hex');
  assert.equal(result.portFile, path.join(userProfile, 'AppData/Local/微信开发者工具/User Data', hash, 'Default/.ide'));
  assert.equal(result.statusFile, path.join(path.dirname(result.portFile), '.ide-status'));
  assert.deepEqual(seen, [path.join(path.dirname(cliPath), 'resources/app.asar.unpacked/package.json')]);
});

test('cold service files, listener and explicit WS-not-ready are polled before ready', async () => {
  let statusReads = 0;
  let queries = 0;
  let probes = 0;
  const state = setup({ readFile(file) {
    if (file === 'port') return '29558';
    statusReads += 1;
    if (statusReads === 1) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return statusReads === 2 ? 'Off' : 'On';
  }, resolveListener() {
    queries += 1;
    return queries === 1 ? { ok: false, reason: 'not-found' } : identity();
  }, probe: async () => { probes += 1; return probes === 1 ? { ready: false, reason: 'websocket-not-ready' } : { ready: true }; } });
  assert.deepEqual(await ready.waitForWindowsIdeServiceReady(cliPath, 2000, state.options),
    { ready: true, attempts: 5, elapsedMs: 1000 });
  assert.equal(probes, 2);
  assert.equal(queries, 4, 'verified both before and after the HTTP probe');
});

test('absent service is deadline bounded without any launch or auth action', async () => {
  const state = setup({ readFile: () => 'Off', resolveListener: () => { throw new Error('must not query'); } });
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 400, state.options), /within 400ms.*service-files-not-ready/);
  assert.equal(state.clock, 400);
});

test('invalid port, file access failure, wrong installation and unsafe binding fail immediately', async () => {
  const cases = [
    [{ readFile: (file) => file === 'status' ? 'On' : '29558garbage' }, /port file is invalid/],
    [{ readFile: () => { throw Object.assign(new Error('access denied'), { code: 'EACCES' }); } }, /access denied/],
    [{ resolveListener: () => identity({ executablePath: path.resolve('tmp/unrelated.exe') }) }, /selected GUI installation/],
    [{ resolveListener: () => identity({ processChain: [] }) }, /selected GUI installation/],
    [{ resolveListener: () => identity({ localAddresses: ['0.0.0.0'] }) }, /unsafe local address/],
    [{ resolveListener: () => identity({ localAddresses: [] }) }, /unsafe local address/],
    [{ resolveListener: () => ({ ok: false, reason: 'ambiguous-owner' }) }, /ambiguous-owner/],
    [{ probe: async () => { throw new Error('HTTP 401'); } }, /HTTP 401/],
    [{ probe: async () => ({}) }, /Invalid DevTools IDE readiness probe/],
  ];
  for (const [overrides, error] of cases) {
    const state = setup({ ...overrides, sleep: () => { throw new Error('must not retry'); } });
    await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 1000, state.options), error);
  }
});

test('listener identity and service port must stay the same throughout a ready probe', async () => {
  let queries = 0;
  const state = setup({ resolveListener: () => identity({ owningProcessId: ++queries === 1 ? 100 : 101 }) });
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 1000, state.options), /identity changed/);
  let reads = 0;
  const moved = setup({ readFile: (file) => file === 'status' ? 'On' : (++reads === 1 ? '29558' : '29559') });
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 1000, moved.options), /identity changed/);
});

test('listener query failure reports safe process diagnostics and fails without retry', async () => {
  const state = setup({
    resolveListener: () => ({
      ok: false, reason: 'listener-query-failed',
      queryDiagnostics: { status: null, signal: 'SIGTERM', errorCode: 'ETIMEDOUT' },
      error: 'TEST_PRIVATE_CREDENTIAL_DO_NOT_LOG powershell.exe --token=secret',
    }),
    sleep: () => { throw new Error('must not retry'); },
    probe: () => { throw new Error('must not probe'); },
  });
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 1000, state.options), (error) => {
    assert.match(error.message, /listener-query-failed/);
    assert.match(error.message, /query diagnostics: \{"status":null,"signal":"SIGTERM","errorCode":"ETIMEDOUT"\}/);
    assert.doesNotMatch(error.message, /TEST_PRIVATE_CREDENTIAL|powershell\.exe|--token/);
    return true;
  });
});

test('listener query diagnostics discard unexpected or nonstructural fields', async () => {
  const privateOutput = 'TEST_PRIVATE_CREDENTIAL_DO_NOT_LOG';
  const state = setup({
    resolveListener: () => ({
      ok: false, reason: 'listener-query-failed',
      queryDiagnostics: { status: privateOutput, signal: privateOutput, errorCode: privateOutput,
        stderr: privateOutput, command: 'powershell.exe --token=secret' },
    }),
    sleep: () => { throw new Error('must not retry'); },
  });
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 1000, state.options), (error) => {
    assert.match(error.message, /query diagnostics: \{"status":null,"signal":null,"errorCode":null\}/);
    assert.doesNotMatch(error.message, /TEST_PRIVATE_CREDENTIAL|powershell\.exe|--token/);
    return true;
  });
});

test('OS listener queries receive the remaining overall deadline; a hung probe fails bounded', async () => {
  const seen = [];
  const state = setup({ resolveListener: (endpoint, timeoutMs) => { seen.push(timeoutMs); return identity(); } });
  await ready.waitForWindowsIdeServiceReady(cliPath, 321, state.options);
  assert.deepEqual(seen, [321, 321]);
  await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, 15,
    setup({ probe: () => new Promise(() => {}) }).options), /IDE service readiness probe timed out/);
  for (const value of [0, -1, NaN, Infinity]) {
    await assert.rejects(ready.waitForWindowsIdeServiceReady(cliPath, value, state.options), /positive finite/);
  }
});

test('HTTP probe uses only GET upgrade without credentials and accepts the vendor response types', async () => {
  const result = await serverProbe((request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/upgrade');
    assert.equal(request.headers.authorization, undefined);
    response.end(JSON.stringify({ port: 12345, projectId: '0' }));
  });
  assert.deepEqual(result, { ready: true });
});

test('only the exact vendor 503 is startup unavailability; authentication and malformed replies fail', async () => {
  assert.deepEqual(await serverProbe((request, response) => {
    response.statusCode = 503; response.end('cli websocket server not ready');
  }), { ready: false, reason: 'websocket-not-ready' });
  for (const status of [401, 302, 500]) {
    await assert.rejects(serverProbe((request, response) => { response.statusCode = status; response.end('denied'); }), new RegExp(`HTTP ${status}`));
  }
  for (const body of ['not json', '{}', '{"port":"1234","projectId":"0"}', '{"port":1234,"projectId":0}', '{"port":65536,"projectId":"0"}']) {
    await assert.rejects(serverProbe((request, response) => response.end(body)), /invalid JSON|invalid upgrade response/);
  }
  await assert.rejects(serverProbe((request, response) => response.end('x'.repeat(4097))), /exceeds the allowed size/);
});

test('HTTP deadline destroys a hung request instead of leaving transport open', async () => {
  assert.deepEqual(await serverProbe(() => {}, 15), { ready: false, reason: 'request-timeout' });
});


test('Windows GUI spawn is followed by service readiness before the single automation launch', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dev/weapp-ui-prewarm.js'), 'utf8');
  const windows = source.indexOf("if (process.platform === 'win32') {");
  const spawn = source.indexOf("const child = spawn(executable", windows);
  const wait = source.indexOf('await waitForWindowsIdeServiceReady(cliPath, timeoutMs)', spawn);
  const launch = source.indexOf('await automator.launch(', wait);
  assert.ok(windows > 0 && spawn > windows && wait > spawn && launch > wait);
  assert.equal((source.match(/automator\.launch\(/g) || []).length, 1);
  assert.ok(source.indexOf('await waitForAppServiceReady(launched, timeoutMs)', launch) > launch);
});
