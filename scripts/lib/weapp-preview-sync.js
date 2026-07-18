'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  MANIFEST_NAME,
  WATCH_ROOT_DIRS,
  WATCH_ROOT_FILES,
  computePreviewTreeSignature,
  normalizeManifestPath,
  shouldExcludeFile,
  validatePreviewManifest
} = require('./weapp-preview-manifest');
const { windowsToWslPath } = require('./weapp-local-config');

const PRUNED_DIR_NAMES = new Set(['.git', 'node_modules', '.idea', '.vscode', 'dist', 'coverage', 'tmp']);

function isNestedPath(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeMirrorPaths(sourceDir, previewDir, options = {}) {
  const source = path.resolve(sourceDir || '');
  const preview = path.resolve(previewDir || '');
  if (!sourceDir || !previewDir) {
    throw new Error('Preview mirror sync requires sourceDir and previewDir');
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Preview mirror source is not a directory: ${source}`);
  }
  if (source === preview || isNestedPath(source, preview) || isNestedPath(preview, source)) {
    throw new Error('Preview mirror directory must be separate from and outside the authoritative source');
  }
  const previewParent = path.dirname(preview);
  if (previewParent === path.parse(preview).root) {
    throw new Error(`Preview mirror directory is too close to the filesystem root: ${preview}`);
  }
  if (fs.existsSync(preview)) {
    const previewStats = fs.lstatSync(preview);
    if (previewStats.isSymbolicLink() || !previewStats.isDirectory()) {
      throw new Error(`Preview mirror directory must be a regular directory: ${preview}`);
    }
    const entries = fs.readdirSync(preview);
    if (entries.length > 0 && !entries.includes(MANIFEST_NAME)) {
      throw new Error(`Preview mirror sync refuses to replace an existing unmarked directory without ${MANIFEST_NAME}: ${preview}`);
    }
    if (entries.includes(MANIFEST_NAME)) {
      let marker;
      try {
        marker = JSON.parse(fs.readFileSync(path.join(preview, MANIFEST_NAME), 'utf8').replace(/^\uFEFF/, ''));
      } catch (error) {
        throw new Error(`Preview mirror marker is invalid JSON; refusing replacement: ${error.message}`);
      }
      if (!marker || typeof marker.sourceDir !== 'string' || typeof marker.previewDir !== 'string') {
        throw new Error('Preview mirror marker is missing sourceDir or previewDir ownership fields; refusing replacement');
      }
      const expectedPreviewPaths = new Set([
        normalizeManifestPath(preview),
        normalizeManifestPath(windowsToWslPath(preview))
      ]);
      if (!expectedPreviewPaths.has(normalizeManifestPath(marker.previewDir))) {
        throw new Error('Preview mirror marker previewDir does not own the configured mirror; refusing replacement');
      }
      const expectedSourcePaths = new Set([
        normalizeManifestPath(source),
        normalizeManifestPath(windowsToWslPath(source))
      ]);
      if (!expectedSourcePaths.has(normalizeManifestPath(marker.sourceDir)) && !marker.invalidatedReason) {
        throw new Error('Preview mirror marker sourceDir does not match the authoritative source and is not explicitly invalidated');
      }
    }
  } else if (!options.allowCreate) {
    throw new Error(`Preview mirror directory is missing and allowCreate was not granted: ${preview}`);
  }
  fs.mkdirSync(previewParent, { recursive: true });
  return { source, preview, previewParent };
}

function copyPreviewEntry(sourcePath, destinationPath) {
  const stats = fs.lstatSync(sourcePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Preview mirror sync refuses symbolic links: ${sourcePath}`);
  }
  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const name of fs.readdirSync(sourcePath)) {
      const childSource = path.join(sourcePath, name);
      const childStats = fs.lstatSync(childSource);
      if (childStats.isDirectory() && !childStats.isSymbolicLink() && PRUNED_DIR_NAMES.has(name)) continue;
      if ((childStats.isFile() || childStats.isSymbolicLink()) && shouldExcludeFile(name)) continue;
      copyPreviewEntry(childSource, path.join(destinationPath, name));
    }
    return;
  }
  if (!stats.isFile()) {
    throw new Error(`Preview mirror sync only accepts regular files and directories: ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
}

function assertMiniProgramLayout(rootDir, label) {
  const directConfigPath = path.join(rootDir, 'project.config.json');
  const nestedConfigPath = path.join(rootDir, 'miniprogram', 'project.config.json');
  const configPath = fs.existsSync(directConfigPath)
    ? directConfigPath
    : (fs.existsSync(nestedConfigPath) ? nestedConfigPath : null);
  if (!configPath || !fs.lstatSync(configPath).isFile()) {
    throw new Error(`${label} layout is missing project.config.json`);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${label} layout has invalid project.config.json: ${error.message}`);
  }
  let candidateRoots;
  if (configPath === nestedConfigPath) {
    candidateRoots = [path.join(rootDir, 'miniprogram')];
  } else if (config && typeof config.miniprogramRoot === 'string' && config.miniprogramRoot.trim()) {
    const configuredRoot = path.resolve(rootDir, config.miniprogramRoot);
    const relativeRoot = path.relative(rootDir, configuredRoot);
    if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
      throw new Error(`${label} layout has miniprogramRoot outside the project directory`);
    }
    candidateRoots = [configuredRoot];
  } else {
    candidateRoots = [rootDir];
  }
  const validRoot = candidateRoots.find((candidate) => (
    ['app.js', 'app.json'].every((name) => {
      const targetPath = path.join(candidate, name);
      if (!fs.existsSync(targetPath)) return false;
      const stats = fs.lstatSync(targetPath);
      return stats.isFile() && !stats.isSymbolicLink();
    })
  ));
  if (!validRoot) {
    throw new Error(`${label} layout is missing app.js or app.json`);
  }
  return { configPath, miniprogramRoot: validRoot };
}

function writeManifest(stagingDir, manifest) {
  const manifestPath = path.join(stagingDir, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function removeOwnedPath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function syncPreviewMirror(options = {}) {
  const { source, preview, previewParent } = assertSafeMirrorPaths(
    options.sourceDir,
    options.previewDir,
    { allowCreate: options.allowCreate === true }
  );
  const unique = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
  const stagingDir = path.join(previewParent, `.${path.basename(preview)}.sync-staging-${unique}`);
  const backupDir = path.join(previewParent, `.${path.basename(preview)}.sync-backup-${unique}`);
  let previousMoved = false;
  let stagingPromoted = false;

  try {
    assertMiniProgramLayout(source, 'Authoritative source');
    fs.mkdirSync(stagingDir, { recursive: false });
    for (const relativeFile of WATCH_ROOT_FILES) {
      const sourcePath = path.join(source, relativeFile);
      if (fs.existsSync(sourcePath)) copyPreviewEntry(sourcePath, path.join(stagingDir, relativeFile));
    }
    for (const relativeDir of WATCH_ROOT_DIRS) {
      const sourcePath = path.join(source, relativeDir);
      if (fs.existsSync(sourcePath)) copyPreviewEntry(sourcePath, path.join(stagingDir, relativeDir));
    }
    assertMiniProgramLayout(stagingDir, 'Preview mirror staging');

    const sourceSignature = computePreviewTreeSignature(source);
    const stagingSignature = computePreviewTreeSignature(stagingDir);
    if (sourceSignature !== stagingSignature) {
      throw new Error('Preview mirror staging signature does not match the authoritative source');
    }

    const manifest = {
      sourceDir: source,
      previewDir: preview,
      signature: stagingSignature,
      syncedAt: options.syncedAt || new Date().toISOString()
    };
    writeManifest(stagingDir, manifest);
    validatePreviewManifest({
      previewDir: stagingDir,
      expectedSourceDir: source,
      expectedPreviewDir: preview,
      expectedContentDir: source
    });
    if (typeof options.beforePromote === 'function') options.beforePromote({ stagingDir, manifest });

    if (fs.existsSync(preview)) {
      fs.renameSync(preview, backupDir);
      previousMoved = true;
    }
    fs.renameSync(stagingDir, preview);
    stagingPromoted = true;

    const validated = validatePreviewManifest({
      previewDir: preview,
      expectedSourceDir: source,
      expectedPreviewDir: preview,
      expectedContentDir: source
    });
    let cleanupWarning = '';
    if (previousMoved) {
      try {
        removeOwnedPath(backupDir);
      } catch (error) {
        cleanupWarning = `Validated preview mirror is active, but the old hidden backup could not be removed: ${error.message}`;
      }
    }
    return { manifest, manifestPath: validated.manifestPath, signature: validated.signature, cleanupWarning };
  } catch (error) {
    let rollbackError = null;
    try {
      if (stagingPromoted && fs.existsSync(preview)) removeOwnedPath(preview);
      if (previousMoved && fs.existsSync(backupDir) && !fs.existsSync(preview)) {
        fs.renameSync(backupDir, preview);
      }
    } catch (caught) {
      rollbackError = caught;
    }
    try {
      removeOwnedPath(stagingDir);
    } catch (_) {
      // Keep the original sync or rollback error.
    }
    if (rollbackError) {
      const wrapped = new Error(`Preview mirror sync failed and rollback also failed: ${error.message}; rollback: ${rollbackError.message}`);
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

module.exports = {
  assertMiniProgramLayout,
  assertSafeMirrorPaths,
  syncPreviewMirror
};
