#!/usr/bin/env node
'use strict';

// Read-only, online export. Equal passes do not establish a cross-collection snapshot.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const weAnalysis = require('./fetch-we-analysis');

const ENDPOINTS = ['databasecollectionget', 'databasequery'];
const CONSISTENCY = 'ONLINE_NON_ATOMIC_NOT_FINAL_SNAPSHOT';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rawDocumentsHash(documents) {
  if (documents.some((document) => typeof document !== 'string')) throw new Error('Expected raw JSON document strings');
  const ordered = documents.map((raw) => ({ raw, id: JSON.parse(raw)._id })).sort((a, b) => compare(a.id, b.id));
  return sha256(JSON.stringify(ordered.map((item) => item.raw)));
}

function safeCollection(name) {
  if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error('Unsupported collection name');
  }
  return name;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--output' || !path.isAbsolute(argv[1])) {
    throw new Error('Usage: node scripts/backup-cloud-database.js --output <NEW_ABSOLUTE_DIRECTORY>');
  }
  return { outputDir: path.resolve(argv[1]) };
}

function createRequest(accessToken) {
  return async (endpoint, body) => {
    if (!ENDPOINTS.includes(endpoint)) throw new Error('Endpoint is not read-only allowlisted');
    try {
      const response = await globalThis.fetch(`https://api.weixin.qq.com/tcb/${endpoint}?access_token=${encodeURIComponent(accessToken)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: globalThis.AbortSignal.timeout(45000)
      });
      return { text: await response.text(), ok: response.ok, status: response.status };
    } catch (_) {
      // Never expose fetch URLs, credentials or document data in console errors.
      throw new Error(`${endpoint}: network request failed`);
    }
  };
}

async function runBackup({ outputDir, environmentId }, { request, progress = () => {} }) {
  if (!path.isAbsolute(outputDir)) throw new Error('Output directory must be absolute');
  // Refuse even an existing empty directory, so reruns cannot overwrite evidence.
  await fs.mkdir(outputDir);
  const manifest = {
    schemaVersion: 1,
    status: 'running',
    consistency: CONSISTENCY,
    environmentId,
    startedAtUtc: new Date().toISOString(),
    source: 'wechat_cloud_http_admin_readonly_export',
    remoteWritesExecuted: false,
    endpointsCalled: ENDPOINTS,
    allFields: true,
    losslessRestoreSource: 'Selected pass raw API data strings; parsed JSON/NDJSON are convenience copies and may lose unsafe integer precision',
    maxPasses: 3,
    collections: []
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  const saveManifest = () => fs.writeFile(manifestPath, json(manifest));
  let inventorySequence = 0;
  async function read(endpoint, body, relativePath) {
    if (!ENDPOINTS.includes(endpoint)) throw new Error('Endpoint is not read-only allowlisted');
    const response = await request(endpoint, body);
    const absolutePath = path.join(outputDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, response.text);
    let payload;
    try { payload = JSON.parse(response.text); } catch (_) {
      throw new Error(`${endpoint}: invalid JSON response (raw response retained)`);
    }
    if (!response.ok || Number(payload.errcode || 0) !== 0) {
      throw new Error(`${endpoint}: HTTP ${response.status}, API code ${Number(payload.errcode || 0)} (raw response retained)`);
    }
    return payload;
  }
  async function inventory() {
    inventorySequence += 1;
    const directory = `raw-inventories/${String(inventorySequence).padStart(3, '0')}`;
    const collections = [];
    let total = null;
    let offset = 0;
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      page += 1;
      const payload = await read('databasecollectionget', { env: environmentId, limit: 100, offset }, `${directory}/page-${String(page).padStart(4, '0')}.json`);
      if (!Array.isArray(payload.collections)) throw new Error('Inventory response has no collections array');
      const batch = payload.collections.map((item) => ({ name: safeCollection(item.name), count: Number(item.count) }));
      if (batch.some((item) => !Number.isSafeInteger(item.count) || item.count < 0)) throw new Error('Inventory count invalid');
      collections.push(...batch);
      offset += batch.length;
      const suppliedTotal = payload.pager && (payload.pager.Total ?? payload.pager.total);
      if (suppliedTotal !== undefined && suppliedTotal !== null) total = Number(suppliedTotal);
      hasMore = !(total !== null && offset >= total) && batch.length === 100;
    }
    if (total !== null && total !== collections.length) throw new Error('Inventory pagination incomplete');
    if (new Set(collections.map((item) => item.name)).size !== collections.length) throw new Error('Inventory contains duplicate collections');
    return { retrievedAtUtc: new Date().toISOString(), collections: collections.sort((a, b) => compare(a.name, b.name)), rawDirectory: directory };
  }
  async function readPass(name, pass) {
    const pageSize = name === 'tournaments' ? 20 : 100;
    const directory = `collections/${name}/passes/pass-${String(pass).padStart(2, '0')}`;
    const documents = [];
    const rawDocuments = [];
    let pages = 0;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      pages += 1;
      const query = `db.collection(${JSON.stringify(name)}).orderBy("_id", "asc").skip(${offset}).limit(${pageSize}).get()`;
      const payload = await read('databasequery', { env: environmentId, query }, `${directory}/raw/page-${String(pages).padStart(5, '0')}.json`);
      if (!Array.isArray(payload.data)) throw new Error(`${name}: query response has no data array`);
      if (payload.data.some((item) => typeof item !== 'string')) throw new Error(`${name}: expected raw JSON document strings`);
      const batch = payload.data.map((item) => JSON.parse(item));
      if (batch.length > pageSize) throw new Error(`${name}: oversized page`);
      documents.push(...batch);
      rawDocuments.push(...payload.data);
      offset += batch.length;
      hasMore = batch.length === pageSize;
    }
    const ids = documents.map((document) => document && document._id);
    if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error(`${name}: invalid document ID`);
    if (new Set(ids).size !== ids.length) throw new Error(`${name}: duplicate document IDs across pages`);
    // Canonical key/ID ordering prevents incidental API object-key order from changing the content hash.
    documents.sort((a, b) => compare(a._id, b._id));
    const contentSha256 = sha256(canonical(documents));
    const result = { pass, count: documents.length, pages, pageSize, contentSha256, rawDocumentStringsSha256: rawDocumentsHash(rawDocuments), rawDirectory: `${directory}/raw`, idUnique: true };
    await fs.writeFile(path.join(outputDir, directory, 'summary.json'), json(result));
    return { documents, result };
  }
  await saveManifest();
  try {
    const before = await inventory();
    manifest.inventoryBefore = before;
    await fs.writeFile(path.join(outputDir, 'inventory-before.json'), json(before));
    progress({ stage: 'inventory', collections: before.collections });
    await saveManifest();
    for (const collection of before.collections) {
      const entry = { name: collection.name, status: 'running', passes: [] };
      manifest.collections.push(entry);
      await saveManifest();
      let previous = null;
      let selected = null;
      for (let pass = 1; pass <= 3; pass += 1) {
        const countBefore = (await inventory()).collections.find((item) => item.name === collection.name)?.count;
        const current = await readPass(collection.name, pass);
        const countAfter = (await inventory()).collections.find((item) => item.name === collection.name)?.count;
        Object.assign(current.result, { countBefore, countAfter, countsMatch: countBefore === current.result.count && countAfter === current.result.count });
        entry.passes.push(current.result);
        selected = current;
        progress({ stage: 'pass', collection: collection.name, ...current.result });
        await saveManifest();
        if (previous && previous.result.countsMatch && current.result.countsMatch && previous.result.contentSha256 === current.result.contentSha256 && previous.result.rawDocumentStringsSha256 === current.result.rawDocumentStringsSha256) {
          entry.status = 'complete';
          break;
        }
        previous = current;
      }
      if (entry.status !== 'complete') entry.status = 'unstable';
      const documentJson = json(selected.documents);
      const documentNdjson = selected.documents.map((document) => JSON.stringify(document)).join('\n') + (selected.documents.length ? '\n' : '');
      const collectionDir = path.join(outputDir, 'collections', collection.name);
      await fs.writeFile(path.join(collectionDir, 'documents.json'), documentJson);
      await fs.writeFile(path.join(collectionDir, 'documents.ndjson'), documentNdjson);
      Object.assign(entry, {
        selectedPass: selected.result.pass,
        count: selected.result.count,
        contentSha256: selected.result.contentSha256,
        rawDocumentStringsSha256: selected.result.rawDocumentStringsSha256,
        files: [
          { path: `collections/${collection.name}/documents.json`, bytes: Buffer.byteLength(documentJson), sha256: sha256(documentJson) },
          { path: `collections/${collection.name}/documents.ndjson`, bytes: Buffer.byteLength(documentNdjson), sha256: sha256(documentNdjson) }
        ]
      });
      await saveManifest();
    }
    const after = await inventory();
    manifest.inventoryAfter = after;
    await fs.writeFile(path.join(outputDir, 'inventory-after.json'), json(after));
    manifest.inventoryNamesUnchanged = canonical(before.collections.map((item) => item.name)) === canonical(after.collections.map((item) => item.name));
    manifest.finalCountsMatch = manifest.collections.every((entry) => after.collections.find((item) => item.name === entry.name)?.count === entry.count);
    manifest.status = manifest.inventoryNamesUnchanged && manifest.finalCountsMatch && manifest.collections.every((entry) => entry.status === 'complete') ? 'complete' : 'incomplete';
    manifest.totalDocuments = manifest.collections.reduce((sum, entry) => sum + entry.count, 0);
    manifest.completedAtUtc = new Date().toISOString();
    await saveManifest();
    progress({ stage: 'finished', status: manifest.status, collections: manifest.collections.length, totalDocuments: manifest.totalDocuments });
    return manifest;
  } catch (error) {
    manifest.status = 'failed';
    manifest.failedAtUtc = new Date().toISOString();
    // Document parse errors may embed personal data: only persist a fixed summary.
    manifest.failure = error instanceof SyntaxError ? 'Invalid JSON document in retained raw page' : error.message;
    await saveManifest();
    throw new Error(manifest.failure);
  }
}

// Independent local verification also supports already-running exports created before
// raw-string hashing was added; it makes no remote requests and retains every page.
async function verifyRawPasses(outputDir) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.status === 'running') throw new Error('Cannot verify an export that is still running');
  for (const collection of manifest.collections) {
    for (const pass of collection.passes) {
      const directory = path.join(outputDir, pass.rawDirectory);
      const names = (await fs.readdir(directory)).filter((name) => /^page-\d+\.json$/.test(name)).sort(compare);
      const rawDocuments = [];
      for (const name of names) {
        const payload = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
        if (!Array.isArray(payload.data)) throw new Error(`${collection.name}: retained raw page has no data array`);
        rawDocuments.push(...payload.data);
      }
      if (names.length !== pass.pages || rawDocuments.length !== pass.count) throw new Error(`${collection.name}: retained raw page/count mismatch`);
      const rawHash = rawDocumentsHash(rawDocuments);
      if (pass.rawDocumentStringsSha256 && pass.rawDocumentStringsSha256 !== rawHash) throw new Error(`${collection.name}: retained raw string hash mismatch`);
      const documents = rawDocuments.map((raw) => JSON.parse(raw));
      const ids = documents.map((document) => document && document._id);
      if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error(`${collection.name}: retained raw document IDs invalid or duplicated`);
      documents.sort((a, b) => compare(a._id, b._id));
      if (sha256(canonical(documents)) !== pass.contentSha256) throw new Error(`${collection.name}: retained parsed content hash mismatch`);
      pass.rawDocumentStringsSha256 = rawHash;
    }
    const selected = collection.passes.find((pass) => pass.pass === collection.selectedPass);
    const previous = collection.passes.find((pass) => pass.pass === collection.selectedPass - 1);
    collection.rawPassesMatch = Boolean(previous && selected && previous.rawDocumentStringsSha256 === selected.rawDocumentStringsSha256);
    collection.rawDocumentStringsSha256 = selected && selected.rawDocumentStringsSha256;
    if (!collection.rawPassesMatch && collection.status === 'complete') collection.status = 'unstable';
    for (const file of collection.files || []) {
      const contents = await fs.readFile(path.join(outputDir, file.path));
      if (contents.length !== file.bytes || sha256(contents) !== file.sha256) throw new Error(`${collection.name}: exported file integrity mismatch`);
    }
  }
  manifest.losslessRestoreSource = 'Selected pass raw API data strings; parsed JSON/NDJSON are convenience copies and may lose unsafe integer precision';
  manifest.rawPassesVerified = manifest.collections.every((collection) => collection.rawPassesMatch);
  manifest.rawPassesVerifiedAtUtc = new Date().toISOString();
  if (!manifest.rawPassesVerified && manifest.status === 'complete') manifest.status = 'incomplete';
  await fs.writeFile(manifestPath, json(manifest));
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { envId: environmentId } = JSON.parse(await fs.readFile(path.resolve(__dirname, '../cloudbaserc.json'), 'utf8'));
  const credentials = await weAnalysis.loadEnvLocal(path.resolve(__dirname, '../.env.local'));
  const { accessToken } = await weAnalysis.getAccessToken({ appid: credentials.WX_APPID, secret: credentials.WX_APPSECRET });
  const manifest = await runBackup({ ...options, environmentId }, {
    request: createRequest(accessToken),
    progress: (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
  });
  if (manifest.status !== 'complete') process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`Database backup failed: ${error instanceof SyntaxError ? 'Invalid JSON input' : error.message}\n`);
  process.exitCode = 1;
});

module.exports = { CONSISTENCY, canonical, createRequest, parseArgs, rawDocumentsHash, runBackup, sha256, verifyRawPasses };
