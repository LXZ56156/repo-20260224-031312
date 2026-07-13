'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST_NAME = '.weapp-preview-sync.json';
const WATCH_ROOT_FILES = ['project.config.json', 'project.private.config.json'];
const WATCH_ROOT_DIRS = ['miniprogram', 'cloudfunctions', 'miniprogram_npm'];
const PRUNED_DIR_NAMES = new Set(['.git', 'node_modules', '.idea', '.vscode', 'dist', 'coverage', 'tmp']);
const EXCLUDED_FILE_SUFFIXES = ['.tmp', '.swp', '.swo', '.cache', '.log'];

function normalizeManifestPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function requireManifestField(manifest, field) {
  if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
    throw new Error(`Preview sync manifest is missing required field: ${field}`);
  }
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function shouldExcludeFile(name) {
  return name === '.DS_Store' || EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function computePreviewTreeSignature(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Preview signature root is not a directory: ${rootDir || '<empty>'}`);
  }

  const entries = [];
  const addEntry = (relativePath, stats) => {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const fullPath = path.join(rootDir, ...normalizedPath.split('/'));
    if (stats.isSymbolicLink()) {
      entries.push(`l\t${normalizedPath}\t${fs.readlinkSync(fullPath)}`);
    } else if (stats.isFile()) {
      entries.push(`f\t${normalizedPath}\t${sha1(fs.readFileSync(fullPath))}`);
    }
  };
  const visit = (relativePath, isRootDir = false) => {
    const fullPath = path.join(rootDir, ...relativePath.split('/'));
    const stats = fs.lstatSync(fullPath);
    if (stats.isSymbolicLink() || stats.isFile()) {
      addEntry(relativePath, stats);
      return;
    }
    if (!stats.isDirectory()) return;
    if (!isRootDir && PRUNED_DIR_NAMES.has(path.posix.basename(relativePath))) return;

    for (const name of fs.readdirSync(fullPath)) {
      const childRelativePath = `${relativePath}/${name}`;
      const childPath = path.join(fullPath, name);
      const childStats = fs.lstatSync(childPath);
      if (childStats.isDirectory() && !childStats.isSymbolicLink() && PRUNED_DIR_NAMES.has(name)) continue;
      if ((childStats.isFile() || childStats.isSymbolicLink()) && shouldExcludeFile(name)) continue;
      visit(childRelativePath);
    }
  };

  for (const relativeFile of WATCH_ROOT_FILES) {
    const fullPath = path.join(rootDir, relativeFile);
    if (fs.existsSync(fullPath)) addEntry(relativeFile, fs.lstatSync(fullPath));
  }
  for (const relativeDir of WATCH_ROOT_DIRS) {
    const fullPath = path.join(rootDir, relativeDir);
    if (fs.existsSync(fullPath)) visit(relativeDir, true);
  }

  entries.sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')));
  return sha1(entries.length ? `${entries.join('\n')}\n` : '');
}

function validatePreviewManifest(options) {
  const previewDir = options && options.previewDir;
  const expectedSourceDir = options && options.expectedSourceDir;
  const expectedPreviewDir = options && options.expectedPreviewDir;
  if (!previewDir || !expectedSourceDir || !expectedPreviewDir) {
    throw new Error('Preview sync manifest validation requires preview and expected WSL paths');
  }

  const manifestPath = path.join(previewDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Preview sync manifest is missing; run the explicit mirror sync before preview/upload');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Preview sync manifest is invalid JSON: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Preview sync manifest must be a JSON object');
  }
  for (const field of ['sourceDir', 'previewDir', 'signature', 'syncedAt']) {
    requireManifestField(manifest, field);
  }
  if (Object.prototype.hasOwnProperty.call(manifest, 'invalidatedReason')) {
    throw new Error('Preview sync manifest is invalidated; run the explicit mirror sync before preview/upload');
  }
  if (normalizeManifestPath(manifest.sourceDir) !== normalizeManifestPath(expectedSourceDir)) {
    throw new Error('Preview sync manifest sourceDir does not match the configured WSL source path');
  }
  if (normalizeManifestPath(manifest.previewDir) !== normalizeManifestPath(expectedPreviewDir)) {
    throw new Error('Preview sync manifest previewDir does not match the configured WSL preview path');
  }
  const previewSignature = computePreviewTreeSignature(previewDir);
  if (previewSignature !== manifest.signature) {
    throw new Error('Preview sync manifest signature does not match current preview contents; run the explicit mirror sync before preview/upload');
  }
  if (options.expectedContentDir) {
    const sourceSignature = computePreviewTreeSignature(options.expectedContentDir);
    if (sourceSignature !== manifest.signature) {
      throw new Error('Preview sync manifest signature does not match current source contents; hand off and sync the authoritative source before preview/upload');
    }
  }

  return { ...manifest, manifestPath, previewSignature };
}

module.exports = {
  MANIFEST_NAME,
  computePreviewTreeSignature,
  normalizeManifestPath,
  validatePreviewManifest
};
