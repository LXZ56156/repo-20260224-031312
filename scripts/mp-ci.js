#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  buildStrictGitState,
  preflightWorkflowRecord,
  sanitizeValue,
  writeWorkflowRecordAfterRemoteSuccess
} = require('./lib/workflow-records');
const { acquireExclusiveFileLock } = require('./lib/exclusive-file-lock');
const {
  normalizeComparablePath,
  resolveWeappLocalConfig,
  windowsToWslPath
} = require('./lib/weapp-local-config');
const { validatePreviewManifest } = require('./lib/weapp-preview-manifest');
const { syncPreviewMirror } = require('./lib/weapp-preview-sync');
const {
  DEFAULT_DELIVERY_DIR,
  deliverPreviewQrcode,
  validatePublicPreviewVersion
} = require('./lib/weapp-preview-delivery');

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

function normalizeProjectPath(raw, platform = process.platform) {
  if (!raw) return null;
  if (platform === 'linux' && /^[A-Z]:[/\\]/i.test(raw)) return windowsToWslPath(raw);
  return platform === 'win32' ? path.normalize(raw) : raw;
}

function gitShortHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', cwd: ROOT }).trim();
  } catch (_) {
    return 'unknown';
  }
}

function gitLastCommitSubject() {
  try {
    return execFileSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8', cwd: ROOT }).trim();
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

function packageInfoFromResult(result) {
  if (!result || typeof result !== 'object') return {};
  const info = {};
  if (result.subPackageInfo) info.subPackageInfo = result.subPackageInfo;
  if (result.pluginInfo) info.pluginInfo = result.pluginInfo;
  return info;
}

function assertGitStateUnchanged(expected, actual) {
  const expectedState = JSON.stringify({
    branch: expected.branch,
    head: expected.head,
    dirty: expected.dirty,
    dirtyFiles: expected.dirtyFiles
  });
  const actualState = JSON.stringify({
    branch: actual.branch,
    head: actual.head,
    dirty: actual.dirty,
    dirtyFiles: actual.dirtyFiles
  });
  if (expectedState !== actualState) {
    throw new Error('Git source state changed while preview was running; QR delivery was withheld');
  }
}

function redactRuntimeText(value, env = process.env) {
  let redacted = String(sanitizeValue(String(value || '')));
  const sensitiveEnvName = /secret|password|passwd|token|api[_-]?key|private[_-]?key|open[_-]?id|union[_-]?id/i;
  for (const [name, rawValue] of Object.entries(env || {})) {
    if (!sensitiveEnvName.test(name) || typeof rawValue !== 'string' || rawValue.length < 4) continue;
    if (/private[_-]?key/i.test(name)) {
      const variants = new Set([rawValue, path.resolve(rawValue)]);
      if (fs.existsSync(rawValue)) {
        try {
          variants.add(fs.realpathSync.native(rawValue));
        } catch (_) {
          // The configured literal and resolved variants still remain protected.
        }
      }
      if (/^[A-Z]:[/\\]/i.test(rawValue)) variants.add(windowsToWslPath(rawValue));
      for (const variant of variants) {
        const pattern = String(variant)
          .split(/[\\/]+/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[\\\\/]');
        redacted = redacted.replace(new RegExp(pattern, 'gi'), '<redacted private-key path>');
      }
    } else {
      redacted = redacted.split(rawValue).join('<redacted>');
    }
  }
  return redacted;
}

function assertCanonicalDeliveryPreviewDir(projectPath, rootDir = ROOT) {
  const canonicalPreviewDir = path.resolve(path.dirname(rootDir), 'badminton-miniapp-preview');
  if (normalizeComparablePath(projectPath) !== normalizeComparablePath(canonicalPreviewDir)) {
    throw new Error(`preview-deliver only accepts the fixed preview mirror / 固定 preview mirror: ${canonicalPreviewDir}`);
  }
  return canonicalPreviewDir;
}

function recordMpCiSuccess({ mode, version, desc, robot, rawProjectPath, projectPath, qrcodeDest, result }, options = {}) {
  const record = writeWorkflowRecordAfterRemoteSuccess('miniapp-ci', {
    event: mode === 'upload' ? 'upload_success' : 'preview_success',
    mode,
    version,
    desc,
    robot,
    appid: process.env.WX_APPID || '',
    rawProjectPath,
    projectPath,
    qrcodePath: qrcodeDest || '',
    packageInfo: packageInfoFromResult(result),
    command: `node scripts/mp-ci.js ${mode}`
  }, options);
  console.log(`[记录] ${mode} 成功记录已写入: ${record.recordPath}`);
}

function preflightMpCiEvidence(options = {}) {
  try {
    const result = preflightWorkflowRecord('miniapp-ci', options);
    console.log(`[校验通过] workflow evidence storage: ${result.recordDir}`);
    return result;
  } catch (error) {
    const wrapped = new Error(`Workflow evidence preflight failed before remote action: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

// ---- validation ----

function fail(msg) {
  throw new Error(msg);
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
  if (process.platform === 'linux' && /^[A-Z]:[/\\]/i.test(keyPath)) keyPath = windowsToWslPath(keyPath);
  if (!fs.existsSync(keyPath)) {
    fail('密钥文件不存在；请检查 WX_PRIVATE_KEY_PATH 配置（路径已隐藏）');
  }

  console.log(`\x1b[32m[校验通过]\x1b[0m`);
  console.log(`  项目路径: ${projectPath}`);
  console.log(`  配置文件: ${cfg.configPath}`);
  console.log(`  AppID: ${process.env.WX_APPID}`);
  console.log('  密钥路径: <redacted path exists>');
}

// ---- main ----

async function main() {
  const mode = process.argv[2];
  if (!mode || !['preview', 'preview-deliver', 'upload', 'validate-preview-manifest'].includes(mode)) {
    console.error('用法: node scripts/mp-ci.js <preview|preview-deliver|upload|validate-preview-manifest>');
    process.exit(1);
  }

  const deliveryLock = mode === 'preview-deliver'
    ? acquireExclusiveFileLock(path.join(ROOT, 'tmp', 'preview-delivery.lock'), {
        purpose: 'mp:preview:deliver'
      })
    : null;
  let result;
  try {
    result = await runMode(mode);
  } catch (error) {
    if (deliveryLock) {
      try {
        deliveryLock.release();
      } catch (releaseError) {
        error.lockReleaseError = releaseError;
      }
    }
    throw error;
  }
  if (deliveryLock) {
    try {
      deliveryLock.release();
    } catch (releaseError) {
      console.warn(`[警告] preview delivery 已完成，但互斥锁清理失败: ${redactRuntimeText(releaseError.message)}`);
    }
  }
  return result;
}

async function runMode(mode) {
  // resolve project path
  const baseConfig = resolveWeappLocalConfig({ repoDir: ROOT });
  const rawProjectPath = process.env.MP_PROJECT_PATH || baseConfig.previewDir;
  const projectPath = normalizeProjectPath(rawProjectPath);
  const localConfig = resolveWeappLocalConfig({
    repoDir: ROOT,
    env: { ...process.env, WEAPP_PREVIEW_DIR: projectPath }
  });
  const deliveryGitState = mode === 'preview-deliver' ? buildStrictGitState(ROOT) : null;
  console.log(`[信息] MP_PROJECT_PATH: ${rawProjectPath}`);
  if (rawProjectPath !== projectPath) {
    console.log(`[信息] 规范化路径: ${projectPath}`);
  }

  if (mode === 'preview-deliver') {
    assertCanonicalDeliveryPreviewDir(projectPath);
    console.log(`[同步] 权威源码: ${localConfig.sourceDir}`);
    console.log(`[同步] preview mirror: ${localConfig.previewDir}`);
    const syncResult = syncPreviewMirror({
      sourceDir: localConfig.sourceDir,
      previewDir: localConfig.previewDir,
      allowCreate: true
    });
    console.log(`[同步完成] preview mirror signature: ${syncResult.signature}`);
  }

  const manifest = validatePreviewManifest({
    previewDir: projectPath,
    expectedSourceDir: localConfig.sourceDir,
    expectedPreviewDir: localConfig.previewDir
  });
  console.log(`[校验通过] preview sync manifest: ${manifest.syncedAt}`);
  if (mode === 'validate-preview-manifest') {
    validatePreviewManifest({
      previewDir: projectPath,
      expectedSourceDir: localConfig.sourceDir,
      expectedPreviewDir: localConfig.previewDir,
      expectedContentDir: ROOT
    });
    console.log('[校验通过] preview contents match the authoritative source');
    return;
  }

  // validate
  validate(projectPath);
  validatePreviewManifest({
    previewDir: projectPath,
    expectedSourceDir: localConfig.sourceDir,
    expectedPreviewDir: localConfig.previewDir,
    expectedContentDir: ROOT
  });
  console.log('[校验通过] preview contents match the authoritative source');
  const evidencePreflight = preflightMpCiEvidence();

  // resolve version
  const version = process.env.MP_VERSION || `${pkgVersion()}-${deliveryGitState ? deliveryGitState.shortHead : gitShortHash()}`;
  if (mode === 'preview-deliver') validatePublicPreviewVersion(version);
  const desc = process.env.MP_DESC || gitLastCommitSubject() || (deliveryGitState && deliveryGitState.shortHead) || gitShortHash();
  const robot = parseInt(process.env.MP_ROBOT || '1', 10);
  if (!Number.isInteger(robot) || robot < 1) {
    throw new Error('MP_ROBOT must be a positive integer');
  }

  // resolve key path for WSL
  let keyPath = process.env.WX_PRIVATE_KEY_PATH;
  if (process.platform === 'linux' && /^[A-Z]:[/\\]/i.test(keyPath)) keyPath = windowsToWslPath(keyPath);

  console.log(`[信息] 模式: ${mode}`);
  console.log(`[信息] 版本: ${version}`);
  if (mode !== 'preview-deliver') console.log(`[信息] 备注: ${desc}`);
  console.log(`[信息] 机器人: ${robot}`);

  const ci = require('miniprogram-ci');
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
      console.log(`[进度] ${redactRuntimeText(info.status)}`);
    }
  };

  if (mode === 'preview-deliver') {
    const generatedAt = new Date().toISOString();
    const gitState = deliveryGitState;
    console.log('[预览交付] 生成 preview-only 二维码...');
    const delivery = await deliverPreviewQrcode({
      deliveryDir: DEFAULT_DELIVERY_DIR,
      generatedAt,
      git: gitState,
      version,
      robot,
      workflowRecordPath: evidencePreflight.recordPath,
      workflowLatestPath: evidencePreflight.latestPath,
      runPreview: (qrcodeOutputDest) => ci.preview({
        project,
        version,
        desc,
        setting,
        robot,
        qrcodeFormat: 'image',
        qrcodeOutputDest,
        onProgressUpdate
      }),
      verifyAfterPreview: () => {
        const verifiedManifest = validatePreviewManifest({
          previewDir: projectPath,
          expectedSourceDir: localConfig.sourceDir,
          expectedPreviewDir: localConfig.previewDir,
          expectedContentDir: ROOT
        });
        if (verifiedManifest.signature !== manifest.signature) {
          throw new Error('Preview mirror signature changed while preview was running; QR delivery was withheld');
        }
        assertGitStateUnchanged(gitState, buildStrictGitState(ROOT));
      },
      writeRecord: (payload) => writeWorkflowRecordAfterRemoteSuccess(
        'miniapp-ci',
        {
          ...payload,
          sourcePath: ROOT,
          rawProjectPath,
          projectPath,
          previewManifest: {
            path: manifest.manifestPath,
            syncedAt: manifest.syncedAt,
            signature: manifest.signature
          }
        },
        { gitState }
      )
    });

    console.log('\x1b[32m[预览交付成功]\x1b[0m preview-only / 非正式版');
    console.log(`  专用目录: ${delivery.deliveryDir}`);
    console.log(`  历史二维码: ${delivery.historyQrcodePath}`);
    console.log(`  固定最新二维码: ${delivery.latestQrcodePath}`);
    console.log(`  固定最新元数据: ${delivery.latestMetadataPath}`);
    console.log(`  SHA-256: ${delivery.metadata.qrcode.sha256}`);
    console.log(`  来源: ${delivery.metadata.git.branch}@${delivery.metadata.git.commit} dirty=${delivery.metadata.git.dirty}`);
    console.log(`  版本/robot: ${version} / ${robot}`);
    console.log(`  生成时间: ${generatedAt}`);
    console.log(`  workflow record: ${delivery.recordResult.recordPath}`);
    if (delivery.recordResult.lockCleanupWarning) {
      console.warn(`  workflow lock 清理警告: ${redactRuntimeText(delivery.recordResult.lockCleanupWarning)}`);
    }
    console.log(`  时效提示: ${delivery.metadata.expiryNotice}`);
  } else if (mode === 'preview') {
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
    recordMpCiSuccess({ mode, version, desc, robot, rawProjectPath, projectPath, qrcodeDest, result });
    if (result) {
      if (result.subPackageInfo) {
        console.log('[包信息]', JSON.stringify(sanitizeValue(result.subPackageInfo), null, 2));
      }
      if (result.pluginInfo) {
        console.log('[插件信息]', JSON.stringify(sanitizeValue(result.pluginInfo), null, 2));
      }
    }
  } else if (mode === 'upload') {
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
    recordMpCiSuccess({ mode, version, desc, robot, rawProjectPath, projectPath, result });
    if (result) {
      if (result.subPackageInfo) {
        console.log('[包信息]', JSON.stringify(sanitizeValue(result.subPackageInfo), null, 2));
      }
      if (result.pluginInfo) {
        console.log('[插件信息]', JSON.stringify(sanitizeValue(result.pluginInfo), null, 2));
      }
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    if (err && err.remoteActionSucceeded) {
      console.error(`\x1b[33m[远端操作已成功，证据写入失败 / remote action succeeded, evidence write failed]\x1b[0m ${redactRuntimeText(err.message)}`);
      process.exit(2);
    }
    console.error(`\x1b[31m[失败]\x1b[0m ${redactRuntimeText(err.message)}`);
    if (err.stack && process.env.DEBUG) {
      console.error(redactRuntimeText(err.stack));
    }
    process.exit(1);
  });
}

module.exports = {
  assertCanonicalDeliveryPreviewDir,
  normalizeProjectPath,
  preflightMpCiEvidence,
  recordMpCiSuccess,
  redactRuntimeText,
  resolveProjectConfig
};
