'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DELIVERY_DIR = path.join(ROOT, 'preview-qrcodes');
const LATEST_QRCODE_NAME = 'latest-preview-qrcode.jpg';
const LATEST_METADATA_NAME = 'latest-preview-qrcode.json';
const MIN_QRCODE_DIMENSION = 128;
const RELEASE_NOTICE = 'preview-only / 微信小程序预览版，非正式版';
const EXPIRY_NOTICE = '微信预览二维码可能过期或失效；失效后请重新运行已授权的 preview 交付命令。';
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function validatePublicPreviewVersion(version) {
  const value = String(version || '');
  if (!/^[0-9A-Za-z._-]{1,64}$/.test(value)) {
    throw new Error('Preview delivery version must use 1-64 public-safe characters: 0-9 A-Z a-z . _ -');
  }
  return value;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function inspectJpegQrcode(qrcodePath) {
  if (!fs.existsSync(qrcodePath)) {
    throw new Error(`Preview QR output is missing / 二维码不存在: ${qrcodePath}`);
  }
  const stats = fs.lstatSync(qrcodePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Preview QR output must be a regular file: ${qrcodePath}`);
  }
  if (stats.size === 0) {
    throw new Error('Preview QR output is empty / 二维码为空');
  }
  const data = fs.readFileSync(qrcodePath);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('Preview QR output is not a valid JPEG format');
  }
  if (data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
    throw new Error('Preview QR JPEG is truncated or missing the EOI marker');
  }

  let offset = 2;
  let width = 0;
  let height = 0;
  while (offset < data.length - 1) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) break;
    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) break;
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      throw new Error('Preview QR JPEG contains an invalid segment length');
    }
    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) throw new Error('Preview QR JPEG contains an invalid SOF segment');
      height = data.readUInt16BE(offset + 3);
      width = data.readUInt16BE(offset + 5);
      break;
    }
    offset += segmentLength;
  }
  if (!width || !height) {
    throw new Error('Preview QR JPEG dimensions could not be read');
  }
  if (width < MIN_QRCODE_DIMENSION || height < MIN_QRCODE_DIMENSION) {
    throw new Error(`Preview QR JPEG dimensions are too small: ${width}x${height}`);
  }
  return {
    format: 'jpeg',
    bytes: data.length,
    width,
    height,
    sha256: sha256(data)
  };
}

function assertQrcodeEvidenceMatches(actual, expected, label) {
  for (const field of ['format', 'bytes', 'width', 'height', 'sha256']) {
    if (actual[field] !== expected[field]) {
      throw new Error(`${label} no longer matches the validated preview QR (${field})`);
    }
  }
}

function assertRegularWritableTarget(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stats = fs.lstatSync(targetPath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Preview QR delivery target must be a regular file: ${targetPath}`);
  }
  fs.accessSync(targetPath, fs.constants.W_OK);
}

function preflightDeliveryDir(deliveryDir = DEFAULT_DELIVERY_DIR) {
  const resolved = path.resolve(deliveryDir);
  fs.mkdirSync(resolved, { recursive: true });
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Preview QR delivery directory must be a regular directory: ${resolved}`);
  }
  fs.accessSync(resolved, fs.constants.W_OK);
  const latestQrcodePath = path.join(resolved, LATEST_QRCODE_NAME);
  const latestMetadataPath = path.join(resolved, LATEST_METADATA_NAME);
  assertRegularWritableTarget(latestQrcodePath);
  assertRegularWritableTarget(latestMetadataPath);

  const probePath = path.join(resolved, `.preview-delivery-preflight-${process.pid}-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(probePath, 'preview-delivery-preflight\n', { encoding: 'utf8', flag: 'wx' });
  } finally {
    fs.rmSync(probePath, { force: true });
  }
  return { deliveryDir: resolved, latestQrcodePath, latestMetadataPath };
}

function timestampForFilename(generatedAt) {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid preview generation time: ${generatedAt}`);
  return date.toISOString().replace(/[-:.]/g, '');
}

function safeShortCommit(git) {
  const value = String((git && (git.shortHead || git.head)) || 'unknown').trim();
  const safe = value.replace(/[^a-z0-9_-]/gi, '').slice(0, 12);
  return safe || 'unknown';
}

function reserveHistoryPaths(deliveryDir, generatedAt, git) {
  const base = `preview-qrcode-${timestampForFilename(generatedAt)}-${safeShortCommit(git)}`;
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const qrcodePath = path.join(deliveryDir, `${candidate}.jpg`);
    const metadataPath = path.join(deliveryDir, `${candidate}.json`);
    if (!fs.existsSync(qrcodePath) && !fs.existsSync(metadataPath)) {
      return { historyQrcodePath: qrcodePath, historyMetadataPath: metadataPath };
    }
  }
  throw new Error('Unable to reserve a unique preview QR history filename');
}

function writeExclusiveJson(filePath, value) {
  const descriptor = fs.openSync(filePath, 'wx');
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function removeFile(targetPath) {
  if (!targetPath) return;
  fs.rmSync(targetPath, { force: true });
}

function rollbackLatest(transaction) {
  const errors = [];
  for (const [installedPath, installed] of [
    [transaction.latestQrcodePath, transaction.newQrcodeInstalled],
    [transaction.latestMetadataPath, transaction.newMetadataInstalled]
  ]) {
    if (!installed) continue;
    try {
      removeFile(installedPath);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const [backupPath, latestPath, existed] of [
    [transaction.backupQrcodePath, transaction.latestQrcodePath, transaction.previousQrcodeMoved],
    [transaction.backupMetadataPath, transaction.latestMetadataPath, transaction.previousMetadataMoved]
  ]) {
    if (!existed) continue;
    try {
      if (fs.existsSync(backupPath) && !fs.existsSync(latestPath)) fs.renameSync(backupPath, latestPath);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
}

function installLatestPair(paths, unique) {
  const transaction = {
    ...paths,
    backupQrcodePath: path.join(path.dirname(paths.latestQrcodePath), `.latest-preview-qrcode-${unique}.backup.jpg`),
    backupMetadataPath: path.join(path.dirname(paths.latestMetadataPath), `.latest-preview-qrcode-${unique}.backup.json`),
    previousQrcodeMoved: false,
    previousMetadataMoved: false,
    newQrcodeInstalled: false,
    newMetadataInstalled: false
  };
  try {
    if (fs.existsSync(paths.latestQrcodePath)) {
      fs.renameSync(paths.latestQrcodePath, transaction.backupQrcodePath);
      transaction.previousQrcodeMoved = true;
    }
    if (fs.existsSync(paths.latestMetadataPath)) {
      fs.renameSync(paths.latestMetadataPath, transaction.backupMetadataPath);
      transaction.previousMetadataMoved = true;
    }
    fs.renameSync(paths.stagedLatestQrcodePath, paths.latestQrcodePath);
    transaction.newQrcodeInstalled = true;
    fs.renameSync(paths.stagedLatestMetadataPath, paths.latestMetadataPath);
    transaction.newMetadataInstalled = true;
    return transaction;
  } catch (error) {
    try {
      rollbackLatest(transaction);
    } catch (rollbackError) {
      const wrapped = new Error(`Preview QR latest promotion failed and rollback also failed: ${error.message}; rollback: ${rollbackError.message}`);
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

function publicGitState(git = {}) {
  return {
    branch: String(git.branch || ''),
    commit: String(git.head || ''),
    shortCommit: safeShortCommit(git),
    dirty: Boolean(git.dirty)
  };
}

async function deliverPreviewQrcode(options = {}) {
  if (typeof options.runPreview !== 'function') throw new Error('Preview QR delivery requires runPreview');
  if (typeof options.writeRecord !== 'function') throw new Error('Preview QR delivery requires writeRecord');
  const version = validatePublicPreviewVersion(options.version);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const { deliveryDir, latestQrcodePath, latestMetadataPath } = preflightDeliveryDir(options.deliveryDir);
  const unique = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
  const stagingQrcodePath = path.join(deliveryDir, `.preview-qrcode-${unique}.staging.jpg`);
  const stagedHistoryQrcodePath = path.join(deliveryDir, `.preview-qrcode-${unique}.history-staging.jpg`);
  const stagedHistoryMetadataPath = path.join(deliveryDir, `.preview-qrcode-${unique}.history-staging.json`);
  const stagedLatestQrcodePath = path.join(deliveryDir, `.latest-preview-qrcode-${unique}.staging.jpg`);
  const stagedLatestMetadataPath = path.join(deliveryDir, `.latest-preview-qrcode-${unique}.staging.json`);
  const { historyQrcodePath, historyMetadataPath } = reserveHistoryPaths(deliveryDir, generatedAt, options.git);
  let transaction = null;
  let historyCreated = false;
  let historyMetadataCreated = false;

  try {
    await options.runPreview(stagingQrcodePath);
    if (typeof options.verifyAfterPreview === 'function') options.verifyAfterPreview();
    const qrcode = inspectJpegQrcode(stagingQrcodePath);
    const git = publicGitState(options.git);
    const metadata = {
      schemaVersion: 1,
      kind: 'wechat-mini-program-preview-qrcode',
      previewOnly: true,
      releaseNotice: RELEASE_NOTICE,
      expiryNotice: EXPIRY_NOTICE,
      generatedAt,
      git,
      version,
      robot: Number(options.robot),
      qrcode: {
        historyPath: historyQrcodePath,
        latestPath: latestQrcodePath,
        historyMetadataPath,
        latestMetadataPath,
        format: qrcode.format,
        bytes: qrcode.bytes,
        width: qrcode.width,
        height: qrcode.height,
        sha256: qrcode.sha256
      },
      workflowRecord: {
        stream: 'miniapp-ci',
        event: 'preview_delivery_success',
        recordPath: String(options.workflowRecordPath || ''),
        latestPath: String(options.workflowLatestPath || '')
      }
    };

    fs.copyFileSync(stagingQrcodePath, stagedHistoryQrcodePath, fs.constants.COPYFILE_EXCL);
    assertQrcodeEvidenceMatches(inspectJpegQrcode(stagedHistoryQrcodePath), qrcode, 'Preview QR history staging copy');
    writeExclusiveJson(stagedHistoryMetadataPath, metadata);
    fs.renameSync(stagedHistoryQrcodePath, historyQrcodePath);
    historyCreated = true;
    assertQrcodeEvidenceMatches(inspectJpegQrcode(historyQrcodePath), qrcode, 'Preview QR history copy');
    fs.renameSync(stagedHistoryMetadataPath, historyMetadataPath);
    historyMetadataCreated = true;
    fs.copyFileSync(historyQrcodePath, stagedLatestQrcodePath, fs.constants.COPYFILE_EXCL);
    assertQrcodeEvidenceMatches(inspectJpegQrcode(stagedLatestQrcodePath), qrcode, 'Preview QR latest staging copy');
    writeExclusiveJson(stagedLatestMetadataPath, metadata);

    transaction = installLatestPair({
      latestQrcodePath,
      latestMetadataPath,
      stagedLatestQrcodePath,
      stagedLatestMetadataPath
    }, unique);
    assertQrcodeEvidenceMatches(inspectJpegQrcode(latestQrcodePath), qrcode, 'Preview QR latest file');

    const recordPayload = {
      event: 'preview_delivery_success',
      mode: 'preview',
      previewOnly: true,
      releaseNotice: RELEASE_NOTICE,
      expiryNotice: EXPIRY_NOTICE,
      generatedAt,
      git,
      version,
      robot: Number(options.robot),
      qrcode: { ...metadata.qrcode },
      command: 'npm run mp:preview:deliver'
    };
    const recordResult = await options.writeRecord(recordPayload);
    const completedTransaction = transaction;
    transaction = null;
    for (const backupPath of [completedTransaction.backupQrcodePath, completedTransaction.backupMetadataPath]) {
      try {
        removeFile(backupPath);
      } catch (_) {
        // The validated latest pair and workflow record are authoritative; an old hidden backup can be cleaned later.
      }
    }
    return {
      deliveryDir,
      historyQrcodePath,
      historyMetadataPath,
      latestQrcodePath,
      latestMetadataPath,
      metadata,
      recordResult
    };
  } catch (error) {
    let rollbackError = null;
    const cleanupErrors = [];
    if (transaction) {
      try {
        rollbackLatest(transaction);
      } catch (caught) {
        rollbackError = caught;
      }
    }
    for (const [targetPath, created] of [
      [historyQrcodePath, historyCreated],
      [historyMetadataPath, historyMetadataCreated]
    ]) {
      if (!created) continue;
      try {
        removeFile(targetPath);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (rollbackError || cleanupErrors.length) {
      const detail = rollbackError
        ? `latest rollback: ${rollbackError.message}`
        : `history cleanup: ${cleanupErrors[0].message}`;
      const wrapped = new Error(`Preview QR delivery failed and cleanup also failed: ${error.message}; ${detail}`);
      wrapped.cause = error;
      if (error.remoteActionSucceeded) wrapped.remoteActionSucceeded = true;
      if (error.code) wrapped.code = error.code;
      wrapped.cleanupErrors = [...(rollbackError ? [rollbackError] : []), ...cleanupErrors];
      throw wrapped;
    }
    throw error;
  } finally {
    for (const targetPath of [
      stagingQrcodePath,
      stagedHistoryQrcodePath,
      stagedHistoryMetadataPath,
      stagedLatestQrcodePath,
      stagedLatestMetadataPath
    ]) {
      try {
        removeFile(targetPath);
      } catch (_) {
        // Preserve the primary delivery result.
      }
    }
  }
}

module.exports = {
  DEFAULT_DELIVERY_DIR,
  EXPIRY_NOTICE,
  LATEST_METADATA_NAME,
  LATEST_QRCODE_NAME,
  RELEASE_NOTICE,
  deliverPreviewQrcode,
  inspectJpegQrcode,
  preflightDeliveryDir,
  validatePublicPreviewVersion
};
