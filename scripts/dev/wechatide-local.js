#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ACTIONS = new Set(['check_wechatide_status', 'simulator_refresh']);

function parseConfig(source) {
  const headers = Array.from(String(source).matchAll(/^\s*\[([^\]\r\n]+)\]\s*(?:#.*)?$/gm));
  const matches = headers.filter(item => item[1].trim() === 'mcp_servers.wechatide');
  if (matches.length !== 1) throw new Error('需要唯一的 mcp_servers.wechatide 配置；未调用开发者工具');
  const header = matches[0];
  const next = headers.find(item => item.index > header.index);
  const table = source.slice(header.index + header[0].length, next ? next.index : source.length);
  const values = {};
  for (const key of ['command', 'args']) {
    const assignments = Array.from(table.matchAll(new RegExp('^\\s*' + key + '\\s*=([^\\r\\n]+)$', 'gm')));
    if (assignments.length !== 1) throw new Error('wechatide command/args 缺失或重复；未调用开发者工具');
    try { values[key] = JSON.parse(assignments[0][1].trim()); }
    catch (_) { throw new Error('wechatide 需要现有 JSON 字符串 command 和单行 JSON 数组 args 格式'); }
  }
  if (typeof values.command !== 'string' || !Array.isArray(values.args)
      || values.args.some(value => typeof value !== 'string')) {
    throw new Error('wechatide command/args 类型错误；未调用开发者工具');
  }
  let executable = values.command;
  let args = values.args.slice();
  if (path.win32.basename(executable).toLowerCase() === 'cmd.exe') {
    if (args.length < 4 || args[0].toLowerCase() !== '/d'
        || args[1].toLowerCase() !== '/s' || args[2].toLowerCase() !== '/c') {
      throw new Error('wechatide cmd 包装参数不明确；未调用开发者工具');
    }
    executable = args[3];
    args = args.slice(4);
  }
  if (!/^wechatide\.(cmd|exe)$/i.test(path.win32.basename(executable))
      || args.length !== 5 || args[0] !== '-c' || args[2] !== 'mcp' || args[3] !== '--token'
      || !args[1] || !args[4]) {
    throw new Error('wechatide 客户端名或原 Token 缺失/有歧义；未调用开发者工具，不自动授权');
  }
  if ([executable, args[1], args[4]].some(value => /["&|<>^%!\r\n]/.test(value))) {
    throw new Error('wechatide 参数包含不支持的 shell 字符；未调用开发者工具');
  }
  return { executable, clientName: args[1], token: args[4] };
}

function configPath(env = process.env) {
  if (env.CODEX_HOME) return path.join(env.CODEX_HOME, 'config.toml');
  const relocated = 'D:/Relocated/LIZIXUAN/Codex/config.toml';
  return fs.existsSync(relocated) ? relocated : path.join(os.homedir(), '.codex', 'config.toml');
}

function run(argv, deps = {}) {
  const [action, project, ...extra] = argv;
  if (!ACTIONS.has(action) || extra.length || (action === 'check_wechatide_status' && project)) {
    throw new Error('用法：node scripts/dev/wechatide-local.js check_wechatide_status | simulator_refresh [项目绝对路径]');
  }
  const source = (deps.readFile || fs.readFileSync)(deps.configPath || configPath(), 'utf8');
  const config = parseConfig(source);
  const target = project || process.cwd();
  if (action === 'simulator_refresh' && (!path.isAbsolute(target) && !path.win32.isAbsolute(target)
      || /["&|<>^%!\r\n]/.test(target))) throw new Error('项目必须是合法绝对路径');
  const args = ['-c', config.clientName, action];
  if (action === 'simulator_refresh') args.push('--project', target);
  args.push('--token', config.token);
  // JSON travels on stdin, never through an interpolated PowerShell command.
  const script = "$ErrorActionPreference = 'Stop'; [Console]::InputEncoding = [Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); try { $p = [Console]::In.ReadToEnd() | ConvertFrom-Json; $taskArgs = @($p.args); & $p.executable @taskArgs; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE } catch { exit 1 }";
  const input = JSON.stringify({ executable: config.executable, args })
    .replace(/[\u007f-\uffff]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  const result = (deps.spawn || spawnSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) throw new Error('wechatide 本地调用失败或超时；未重试或自动授权');
  const status = result.status == null ? 1 : result.status;
  if (status !== 0) return { status, output: 'wechatide 本地调用失败；未输出原始错误载荷，未重试或自动授权。\n' };
  const output = String(result.stdout || '') + String(result.stderr || '');
  return { status, output: output.split(config.token).join('[Token已隐藏]') };
}

if (require.main === module) {
  try {
    const result = run(process.argv.slice(2));
    process.stdout.write(result.output);
    process.exitCode = result.status;
  } catch (_) {
    // Never expose parser/native errors that may contain private configuration.
    process.stderr.write('wechatide 本地检查未完成：检查动作、项目路径与原 mcp_servers.wechatide 配置（含客户端名和Token）；未执行自动授权或重试。\n');
    process.exitCode = 1;
  }
}

module.exports = { parseConfig, configPath, run };
