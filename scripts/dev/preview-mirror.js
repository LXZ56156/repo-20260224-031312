'use strict';

// Shared, shell-free mirror engine. It never follows source or destination links.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT_FILES = ['project.config.json', 'project.private.config.json'];
const ROOT_DIRS = ['miniprogram', 'cloudfunctions', 'miniprogram_npm'];
const EXCLUDED = new Set(['.git', 'node_modules', '.idea', '.vscode', 'dist', 'coverage', 'tmp']);
const MANIFEST = '.weapp-preview-sync.json';
const OWNER = '.weapp-preview-owner.json';
function exists(file) { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function noLinks(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    const stat = exists(current);
    if (stat && stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`);
    if (path.dirname(current) === current) break;
  }
}
function entries(root, metadataOnly = false) {
  const result = [];
  const visit = (relative) => {
    const file = path.join(root, relative);
    const stat = exists(file);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Source links are not supported: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (EXCLUDED.has(name) || /\.(tmp|swp|swo|cache|log)$/.test(name) || name === '.DS_Store') continue;
        visit(path.join(relative, name));
      }
    } else if (stat.isFile()) {
      const detail = metadataOnly ? fs.statSync(file, {bigint: true}) : null;
      result.push({relative: relative.split(path.sep).join('/'), data: metadataOnly
        ? Buffer.from(`${detail.size}:${detail.mtimeNs}:${detail.ctimeNs}`) : fs.readFileSync(file)});
    }
    else throw new Error(`Unsupported source entry: ${relative}`);
  };
  noLinks(root);
  if (!exists(root)?.isDirectory()) throw new Error('Source directory does not exist');
  for (const name of [...ROOT_FILES, ...ROOT_DIRS]) visit(name);
  return result.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}
function digest(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) hash.update(JSON.stringify([file.relative, file.data.length])).update('\0').update(file.data);
  return hash.digest('hex');
}
function signature(root) { return digest(entries(root)); }
function changeSignature(root) { return digest(entries(root, true)); }
function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; } }
function config(env = process.env) {
  const sourceDir = path.resolve(env.SOURCE_DIR || env.PROJECT_DIR || path.join(__dirname, '../..'));
  const previewDir = path.resolve(env.PREVIEW_DIR || path.join(sourceDir, '..', 'preview'));
  const logDir = path.resolve(env.LOG_DIR || path.join(sourceDir, 'tmp/weapp-preview'));
  return {sourceDir, previewDir, logDir, manifestPath: path.resolve(env.SYNC_MANIFEST_PATH || path.join(previewDir, MANIFEST)),
    pidFile: path.resolve(env.PID_FILE || path.join(logDir, 'weapp-sync-preview.pid')), logFile: path.resolve(env.SYNC_LOG || path.join(logDir, 'weapp-sync-preview.log')),
    interval: Math.max(50, Number(env.POLL_INTERVAL_SECONDS || 0.4) * 1000), debounce: Math.max(0, Number(env.DEBOUNCE_MILLISECONDS || 400))};
}
function validate(c) {
  const source = path.resolve(c.sourceDir), target = path.resolve(c.previewDir);
  noLinks(source); noLinks(target);
  noLinks(path.join(target, OWNER)); noLinks(c.manifestPath);
  const inside = (a, b) => { const r = path.relative(a, b); return !r || (!r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r)); };
  if (target === path.parse(target).root || inside(source, target) || inside(target, source)) throw new Error('Source and preview must be separate, non-overlapping directories');
  if (!Number.isFinite(c.interval) || !Number.isFinite(c.debounce)) throw new Error('Invalid polling/debounce interval');
  if (path.dirname(c.manifestPath) !== target) throw new Error('Manifest must be directly inside the preview directory');
  if (inside(target, c.logDir) || inside(target, c.pidFile) || inside(target, c.logFile)) throw new Error('Control files cannot be inside the mirror');
  if (exists(path.join(target, '.git'))) throw new Error('Refusing to overwrite a Git checkout');
  if (exists(target) && fs.readdirSync(target).length) {
    const owner = readJSON(path.join(target, OWNER)) || readJSON(c.manifestPath);
    if (!owner || path.resolve(owner.sourceDir || '') !== source || path.resolve(owner.previewDir || '') !== target) throw new Error('Non-empty preview is not owned by this source; choose an empty preview directory');
  }
}
function syncOnce(c) {
  validate(c);
  // Read/validate every input before changing the owned destination.
  const files = entries(c.sourceDir);
  const expected = new Set(files.map((f) => f.relative));
  fs.mkdirSync(c.previewDir, {recursive: true});
  fs.writeFileSync(path.join(c.previewDir, OWNER), JSON.stringify({sourceDir: c.sourceDir, previewDir: c.previewDir}));
  fs.rmSync(c.manifestPath, {force: true});
  function clean(dir, relative = '') {
    for (const name of fs.readdirSync(dir)) {
      if (!relative && [OWNER, path.basename(c.manifestPath)].includes(name)) continue;
      const file = path.join(dir, name), rel = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(file);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        clean(file, rel);
        if (!fs.readdirSync(file).length) fs.rmdirSync(file);
      } else if (stat.isSymbolicLink() || !expected.has(rel)) fs.rmSync(file, {force: true});
    }
  }
  clean(c.previewDir);
  for (const {relative, data} of files) {
    const target = path.join(c.previewDir, relative);
    // File/directory type changes are confined to this owned mirror.
    for (let parent = path.dirname(target); parent !== c.previewDir; parent = path.dirname(parent)) {
      const stat = exists(parent);
      if (stat && !stat.isDirectory()) fs.rmSync(parent);
    }
    if (exists(target)?.isDirectory()) fs.rmSync(target, {recursive: true});
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (!exists(target) || !fs.readFileSync(target).equals(data)) fs.writeFileSync(target, data);
  }
  const manifest = {sourceDir: c.sourceDir, previewDir: c.previewDir, signature: digest(files), syncedAt: new Date().toISOString(), engine: 'node-v1'};
  fs.writeFileSync(c.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
function status(c) {
  const manifest = readJSON(c.manifestPath);
  if (!manifest || manifest.sourceDir !== c.sourceDir || manifest.previewDir !== c.previewDir) return {state: 'unknown', detail: '缺少或不匹配的同步清单'};
  const current = manifest.signature === signature(c.sourceDir) && manifest.signature === signature(c.previewDir);
  return {state: current ? 'current' : 'stale', detail: current ? '源码与预览目录一致' : '源码已变化或镜像被修改', syncedAt: manifest.syncedAt};
}
module.exports = {config, validate, syncOnce, signature, changeSignature, status, readJSON};
