'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runBackup, parseArgs, rawDocumentsHash, verifyRawPasses, CONSISTENCY } = require('../scripts/backup-cloud-database');

async function destination(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'badminton-backup-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, 'new-backup');
}

function mockSource(documents, transform = (rows) => rows) {
  let pass = 0;
  const requests = [];
  return {
    requests,
    request: async (endpoint, body) => {
      requests.push({ endpoint, body });
      let payload;
      if (endpoint === 'databasecollectionget') {
        payload = { errcode: 0, collections: [{ name: 'sample', count: documents.length }], pager: { Total: 1 } };
      } else {
        assert.equal(endpoint, 'databasequery');
        const offset = Number(body.query.match(/\.skip\((\d+)\)/)[1]);
        if (!offset) pass += 1;
        payload = { errcode: 0, data: transform(documents.slice(offset, offset + 100), pass).map((row) => JSON.stringify(row)) };
      }
      return { ok: true, status: 200, text: JSON.stringify(payload) };
    }
  };
}

test('all collections export with full pages, raw responses, matching hashes and no overwrite', async (t) => {
  const outputDir = await destination(t);
  const rows = Array.from({ length: 100 }, (_, i) => ({ _id: String(i).padStart(3, '0'), nested: { date: { $date: 1 }, field: 'kept' } }));
  const source = mockSource(rows);
  const manifest = await runBackup({ outputDir, environmentId: 'test' }, source);
  assert.equal(manifest.status, 'complete');
  assert.equal(manifest.consistency, CONSISTENCY);
  assert.equal(manifest.totalDocuments, 100);
  assert.equal(manifest.collections[0].passes.length, 2);
  assert.deepEqual(manifest.collections[0].passes.map((pass) => pass.pages), [2, 2]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(outputDir, 'collections/sample/documents.json'), 'utf8')), rows);
  const raw = JSON.parse(await fs.readFile(path.join(outputDir, 'collections/sample/passes/pass-01/raw/page-00001.json'), 'utf8'));
  assert.equal(typeof raw.data[0], 'string');
  assert.equal((await fs.readFile(path.join(outputDir, 'collections/sample/documents.ndjson'), 'utf8')).trim().split('\n').length, 100);
  assert.equal((await verifyRawPasses(outputDir)).rawPassesVerified, true);
  const requestsBeforeRerun = source.requests.length;
  const manifestBeforeRerun = await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8');
  await assert.rejects(runBackup({ outputDir, environmentId: 'test' }, source), { code: 'EEXIST' });
  assert.equal(source.requests.length, requestsBeforeRerun);
  assert.equal(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'), manifestBeforeRerun);
  const emptyDirectory = `${outputDir}-empty`;
  await fs.mkdir(emptyDirectory);
  await assert.rejects(runBackup({ outputDir: emptyDirectory, environmentId: 'test' }, source), { code: 'EEXIST' });
  assert.deepEqual(await fs.readdir(emptyDirectory), []);
  assert.equal(source.requests.length, requestsBeforeRerun);
  assert.throws(() => parseArgs([]), /NEW_ABSOLUTE_DIRECTORY/);
});

test('raw document hashing distinguishes unsafe integer literals lost by JSON.parse', () => {
  const first = '{"_id":"a","value":9007199254740992}';
  const second = '{"_id":"a","value":9007199254740993}';
  assert.equal(JSON.parse(first).value, JSON.parse(second).value);
  assert.notEqual(rawDocumentsHash([first]), rawDocumentsHash([second]));
});

test('changing content preserves all three passes and refuses complete status', async (t) => {
  const outputDir = await destination(t);
  const manifest = await runBackup({ outputDir, environmentId: 'test' }, mockSource([{ _id: 'a' }], (rows, pass) => rows.map((row) => ({ ...row, version: pass }))));
  assert.equal(manifest.status, 'incomplete');
  assert.equal(manifest.collections[0].status, 'unstable');
  assert.equal(manifest.collections[0].passes.length, 3);
});

test('duplicate document IDs fail with raw evidence retained', async (t) => {
  const outputDir = await destination(t);
  await assert.rejects(runBackup({ outputDir, environmentId: 'test' }, mockSource([{ _id: 'a' }, { _id: 'a' }])), /duplicate document IDs/);
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  await fs.access(path.join(outputDir, 'collections/sample/passes/pass-01/raw/page-00001.json'));
});

test('unsafe integer changes cannot pass parsed hash equality and raw strings remain lossless', async (t) => {
  const outputDir = await destination(t);
  const source = mockSource([{ _id: 'a' }]);
  let pass = 0;
  const manifest = await runBackup({ outputDir, environmentId: 'test' }, {
    request: async (endpoint, body) => {
      const response = await source.request(endpoint, body);
      if (endpoint === 'databasequery') {
        pass += 1;
        const payload = JSON.parse(response.text);
        payload.data = [`{"_id":"a","value":${pass % 2 ? '9007199254740992' : '9007199254740993'}}`];
        response.text = JSON.stringify(payload);
      }
      return response;
    }
  });
  assert.equal(manifest.status, 'incomplete');
  assert.equal(new Set(manifest.collections[0].passes.map((entry) => entry.contentSha256)).size, 1);
  assert.equal(new Set(manifest.collections[0].passes.map((entry) => entry.rawDocumentStringsSha256)).size, 2);
  const rawPage = JSON.parse(await fs.readFile(path.join(outputDir, 'collections/sample/passes/pass-02/raw/page-00001.json'), 'utf8'));
  assert.equal(rawPage.data[0], '{"_id":"a","value":9007199254740993}');
  assert.equal((await verifyRawPasses(outputDir)).rawPassesVerified, false);
});

test('offline verification rejects altered raw data and parsed content without rewriting evidence', async (t) => {
  const outputDir = await destination(t);
  await runBackup({ outputDir, environmentId: 'test' }, mockSource([{ _id: 'a', value: 1 }]));
  const manifestPath = path.join(outputDir, 'manifest.json');
  const originalManifest = await fs.readFile(manifestPath, 'utf8');
  const rawPath = path.join(outputDir, 'collections/sample/passes/pass-01/raw/page-00001.json');
  const payload = JSON.parse(await fs.readFile(rawPath, 'utf8'));
  payload.data = ['{"_id":"a","value":2}'];
  await fs.writeFile(rawPath, JSON.stringify(payload));
  await assert.rejects(verifyRawPasses(outputDir), /raw string hash mismatch/);
  assert.equal(await fs.readFile(manifestPath, 'utf8'), originalManifest);
  const legacyManifest = JSON.parse(originalManifest);
  for (const pass of legacyManifest.collections[0].passes) delete pass.rawDocumentStringsSha256;
  await fs.writeFile(manifestPath, JSON.stringify(legacyManifest));
  await assert.rejects(verifyRawPasses(outputDir), /parsed content hash mismatch/);
});

test('offline verification rejects corrupted convenience export files', async (t) => {
  const outputDir = await destination(t);
  await runBackup({ outputDir, environmentId: 'test' }, mockSource([{ _id: 'a' }]));
  await fs.appendFile(path.join(outputDir, 'collections/sample/documents.ndjson'), 'corrupted');
  await assert.rejects(verifyRawPasses(outputDir), /exported file integrity mismatch/);
});
