'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const mirror = require('./preview-mirror');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function running(c) {
  const lock = mirror.readJSON(c.pidFile);
  if (!lock) return false;
  if (lock.sourceDir !== c.sourceDir || lock.previewDir !== c.previewDir || !Number.isSafeInteger(lock.pid) || lock.pid < 1 || !/^[\da-f-]{36}$/.test(lock.token || '')) throw new Error('Invalid or legacy mirror lock; inspect it before removing it');
  try { process.kill(lock.pid, 0); return lock; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function waitUntil(probe, timeout = 10000) {
  const end = Date.now() + timeout;
  do { if (await probe()) return true; await sleep(50); } while (Date.now() < end);
  return false;
}
async function startMirror(c, env = process.env) {
  mirror.validate(c);
  if (!running(c)) {
    if (fs.existsSync(c.pidFile)) throw new Error('Stale mirror lock exists; inspect it before removing it');
    fs.mkdirSync(path.dirname(c.logFile), {recursive: true});
    const fd = fs.openSync(c.logFile, 'a');
    const child = spawn(process.execPath, [path.join(__dirname, 'weapp-sync-preview.js'), 'run'], {
      detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: {...env, SOURCE_DIR: c.sourceDir, PREVIEW_DIR: c.previewDir,
        LOG_DIR: c.logDir, PID_FILE: c.pidFile, SYNC_MANIFEST_PATH: c.manifestPath, POLL_INTERVAL_SECONDS: String(c.interval / 1000), DEBOUNCE_MILLISECONDS: String(c.debounce)}
    });
    fs.closeSync(fd);
    let spawnError;
    child.on('error', (error) => { spawnError = error; });
    child.unref();
    if (!await waitUntil(() => { if (spawnError) throw spawnError; return !!running(c); })) throw new Error('Mirror failed to start; inspect its sync log');
  }
  if (!await waitUntil(() => mirror.status(c).state === 'current')) throw new Error('Mirror did not reach current source');
}
async function stopMirror(c) {
  const lock = running(c);
  if (!lock) return;
  // Cooperative stop: never send a kill signal to an unverified/reused PID.
  const stopFile = `${c.pidFile}.${lock.token}.stop`;
  fs.writeFileSync(stopFile, 'stop', {flag: 'wx'});
  if (!await waitUntil(() => mirror.readJSON(c.pidFile)?.token !== lock.token)) throw new Error('Mirror stop was not acknowledged; no process was killed');
}
async function orchestrate(action, adapter, log = console.log) {
  if (!['mcp', 'start', 'preview'].includes(action)) throw new Error('Unsupported native action');
  adapter.assertSupported();
  if (action === 'preview' || !await adapter.isDevtoolsRunning()) {
    log('启动微信开发者工具预览');
    await adapter.startDevtools();
  } else log('检测到已启动的微信开发者工具');
  if (action !== 'preview' && !await adapter.isMcpReady()) {
    await adapter.startMcp();
    if (!await waitUntil(() => adapter.isMcpReady(), adapter.timeout || 30000)) throw new Error('MCP launcher ran but readiness was not verified');
  }
}
function createNativeAdapter(env = process.env, platform = process.platform) {
  const supported = platform === 'win32' || !!env.WSL_DISTRO_NAME;
  const ps = env.POWERSHELL_EXE || (platform === 'win32' ? 'powershell.exe' : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
  const assertSupported = () => { if (!supported) throw new Error('Native WeChat DevTools launch requires Windows or WSL; mirror and tests work on Linux'); };
  const quote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
  const invoke = (args) => { assertSupported(); return execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {encoding: 'utf8', windowsHide: true, timeout: 15000}); };
  const windowsPath = (file) => platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], {encoding: 'utf8'}).trim();
  return {
    assertSupported,
    isDevtoolsRunning() {
      try { invoke(['-Command', "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'wechatdevtools|wechatwebdevtools|wechat-devtools|微信web开发者工具' } | Select-Object -First 1; if (!$p) { exit 1 }"]); return true; } catch (_) { return false; }
    },
    startDevtools() { invoke(['-File', windowsPath(env.POWERSHELL_SCRIPT || path.join(__dirname, 'start-weapp-preview.ps1'))]); },
    async isMcpReady() {
      const host = env.MCP_HOST || '127.0.0.1', port = Number(env.MCP_PORT || 39420);
      if (!/^[a-z\d.:-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MCP host/port');
      return new Promise((resolve) => {
        const ws = new globalThis.WebSocket(`ws://${host}:${port}`);
        const timer = setTimeout(() => finish(false), 5000);
        let settled = false;
        const finish = (ready) => { if (settled) return; settled = true; clearTimeout(timer); ws.close(); resolve(ready); };
        ws.addEventListener('open', () => ws.send(JSON.stringify({id: 'probe-tool-info', method: 'Tool.getInfo', params: {}})));
        ws.addEventListener('error', () => finish(false));
        ws.addEventListener('message', (event) => { try { const data = JSON.parse(event.data); finish(data.id === 'probe-tool-info' && !!data.result?.version && !!data.result?.SDKVersion); } catch (_) { finish(false); } });
      });
    },
    startMcp() {
      const cmd = env.WEAPP_MCP_WINDOWS_CMD;
      if (!cmd || !env.WEAPP_MCP_WINDOWS_DIR) throw new Error('Set explicit WEAPP_MCP_WINDOWS_CMD and WEAPP_MCP_WINDOWS_DIR');
      invoke(['-Command', `$env:WEAPP_MCP_NO_PAUSE='1'; Start-Process -FilePath 'cmd.exe' -ArgumentList '/c',${quote('"' + cmd + '"')} -WorkingDirectory ${quote(env.WEAPP_MCP_WINDOWS_DIR)} | Out-Null`]);
    }
  };
}
async function main() {
  const c = mirror.config(), action = process.argv[2] || 'status';
  switch (action) {
    case 'mirror': await startMirror(c); console.log('镜像已同步'); break;
    case 'stop': await stopMirror(c); console.log('同步脚本已停止'); break;
    case 'status': {
      const state = mirror.status(c), active = !!running(c);
      console.log(`镜像状态：${state.state === 'current' ? '已同步' : state.state === 'stale' ? '已过期' : '未知'} (${state.detail})`);
      console.log(`同步状态：${active ? 'running' : 'stopped（自动同步未运行）'}`);
      console.log('MCP 状态：未探测；镜像状态不等于原生 DevTools 验收');
      break;
    }
    case 'mcp': case 'start': case 'preview': {
      const adapter = createNativeAdapter(); adapter.assertSupported();
      await startMirror(c); await orchestrate(action, adapter); break;
    }
    default: throw new Error('Supported actions: mirror | status | stop | mcp | start | preview');
  }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = {running, startMirror, stopMirror, orchestrate, createNativeAdapter};
