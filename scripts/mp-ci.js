#!/usr/bin/env node
'use strict';

const ci = require('miniprogram-ci');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 加载 .env.local（如果存在）
(function loadDotEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
})();

// ---- helpers ----

function normalizeProjectPath(raw) {
  if (!raw) return null;
  // Windows path D:\... → WSL /mnt/d/...
  if (process.platform === 'linux' && /^[A-Z]:[/\\]/.test(raw)) {
    const drive = raw[0].toLowerCase();
    const rest = raw.slice(2).replace(/\\/g, '/');
    return `/mnt/${drive}${rest}`;
  }
  return raw.replace(/\\/g, '/');
}

function gitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: ROOT }).trim();
  } catch (_) {
    return 'unknown';
  }
}

function gitLastCommitSubject() {
  try {
    return execSync('git log -1 --pretty=%s', { encoding: 'utf8', cwd: ROOT }).trim();
  } catch (_) {
    return '';
  }
}

function pkgVersion() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return p.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

function resolveProjectConfig(projectPath) {
  const direct = path.join(projectPath, 'project.config.json');
  if (fs.existsSync(direct)) {
    let miniprogramRoot = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(direct, 'utf8'));
      if (cfg.miniprogramRoot) {
        miniprogramRoot = path.join(projectPath, cfg.miniprogramRoot);
      }
    } catch (_) { /* ignore parse errors */ }
    return { configPath: direct, miniprogramRoot };
  }

  const nested = path.join(projectPath, 'miniprogram', 'project.config.json');
  if (fs.existsSync(nested)) {
    return { configPath: nested, miniprogramRoot: path.join(projectPath, 'miniprogram') };
  }

  return null;
}

// ---- validation ----

function fail(msg) {
  console.error(`\x1b[31m[错误] ${msg}\x1b[0m`);
  process.exit(1);
}

function validate(projectPath) {
  // 1. project path exists
  if (!fs.existsSync(projectPath)) {
    fail(`项目路径不存在: ${projectPath}`);
  }

  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) {
    fail(`项目路径不是目录: ${projectPath}`);
  }

  // 2. project.config.json exists
  const cfg = resolveProjectConfig(projectPath);
  if (!cfg) {
    fail(`项目目录内未找到 project.config.json（已检查根目录和 miniprogram/ 子目录）: ${projectPath}`);
  }

  // 3. app.json exists
  const appJsonPath = cfg.miniprogramRoot
    ? path.join(cfg.miniprogramRoot, 'app.json')
    : path.join(projectPath, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    fail(`项目目录内未找到 app.json: ${appJsonPath}`);
  }

  // 4. WX_APPID
  if (!process.env.WX_APPID) {
    fail('环境变量 WX_APPID 未设置');
  }

  // 5. WX_PRIVATE_KEY_PATH
  if (!process.env.WX_PRIVATE_KEY_PATH) {
    fail('环境变量 WX_PRIVATE_KEY_PATH 未设置');
  }

  // 6. key file exists
  let keyPath = process.env.WX_PRIVATE_KEY_PATH;
  if (process.platform === 'linux' && /^[A-Z]:[/\\]/.test(keyPath)) {
    const drive = keyPath[0].toLowerCase();
    const rest = keyPath.slice(2).replace(/\\/g, '');
    keyPath = `/mnt/${drive}${rest}`;
  }
  if (!fs.existsSync(keyPath)) {
    fail(`密钥文件不存在: ${process.env.WX_PRIVATE_KEY_PATH} (解析后: ${keyPath})`);
  }

  console.log(`\x1b[32m[校验通过]\x1b[0m`);
  console.log(`  项目路径: ${projectPath}`);
  console.log(`  配置文件: ${cfg.configPath}`);
  console.log(`  AppID: ${process.env.WX_APPID}`);
  console.log(`  密钥路径: ${keyPath}`);
}

// ---- main ----

async function main() {
  const mode = process.argv[2];
  if (!mode || (mode !== 'preview' && mode !== 'upload')) {
    console.error('用法: node scripts/mp-ci.js <preview|upload>');
    process.exit(1);
  }

  // resolve project path
  const rawProjectPath = process.env.MP_PROJECT_PATH || 'D:\\projects\\badminton-miniapp-preview';
  const projectPath = normalizeProjectPath(rawProjectPath);
  console.log(`[信息] MP_PROJECT_PATH: ${rawProjectPath}`);
  if (rawProjectPath !== projectPath) {
    console.log(`[信息] 规范化路径: ${projectPath}`);
  }

  // validate
  validate(projectPath);

  // resolve version
  const version = process.env.MP_VERSION || `${pkgVersion()}-${gitShortHash()}`;
  const desc = process.env.MP_DESC || gitLastCommitSubject() || gitShortHash();
  const robot = parseInt(process.env.MP_ROBOT || '1', 10);

  // resolve key path for WSL
  let keyPath = process.env.WX_PRIVATE_KEY_PATH;
  if (process.platform === 'linux' && /^[A-Z]:[/\\]/.test(keyPath)) {
    const drive = keyPath[0].toLowerCase();
    const rest = keyPath.slice(2).replace(/\\/g, '\\');
    keyPath = `/mnt/${drive}${rest}`;
  }

  console.log(`[信息] 模式: ${mode}`);
  console.log(`[信息] 版本: ${version}`);
  console.log(`[信息] 备注: ${desc}`);
  console.log(`[信息] 机器人: ${robot}`);

  const project = new ci.Project({
    appid: process.env.WX_APPID,
    type: 'miniProgram',
    projectPath,
    privateKeyPath: keyPath,
    ignores: ['node_modules/**/*'],
  });

  const setting = {
    es6: true,
    minify: true,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true,
  };

  const onProgressUpdate = (info) => {
    if (info && info.status) {
      console.log(`[进度] ${info.status}`);
    }
  };

  if (mode === 'preview') {
    const outputDir = path.join(ROOT, 'tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const qrcodeDest = path.join(outputDir, 'preview-qrcode.jpg');

    console.log(`[预览] 生成预览二维码...`);
    const result = await ci.preview({
      project,
      version,
      desc,
      setting,
      robot,
      qrcodeFormat: 'image',
      qrcodeOutputDest: qrcodeDest,
      onProgressUpdate,
    });

    console.log(`\x1b[32m[预览成功]\x1b[0m 二维码已保存到: ${qrcodeDest}`);
    if (result) {
      if (result.subPackageInfo) {
        console.log('[包信息]', JSON.stringify(result.subPackageInfo, null, 2));
      }
      if (result.pluginInfo) {
        console.log('[插件信息]', JSON.stringify(result.pluginInfo, null, 2));
      }
    }
  } else {
    console.log(`[上传] 开始上传...`);
    const result = await ci.upload({
      project,
      version,
      desc,
      setting,
      robot,
      onProgressUpdate,
    });

    console.log(`\x1b[32m[上传成功]\x1b[0m`);
    if (result) {
      if (result.subPackageInfo) {
        console.log('[包信息]', JSON.stringify(result.subPackageInfo, null, 2));
      }
      if (result.pluginInfo) {
        console.log('[插件信息]', JSON.stringify(result.pluginInfo, null, 2));
      }
    }
  }
}

main().catch((err) => {
  console.error(`\x1b[31m[失败]\x1b[0m ${err.message}`);
  if (err.stack && process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
