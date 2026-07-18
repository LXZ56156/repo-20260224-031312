const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_DELIVERY_DIR,
  deliverPreviewQrcode,
  inspectJpegQrcode,
  validatePublicPreviewVersion
} = require('../scripts/lib/weapp-preview-delivery');
const { assertMiniProgramLayout, syncPreviewMirror } = require('../scripts/lib/weapp-preview-sync');
const { validatePreviewManifest } = require('../scripts/lib/weapp-preview-manifest');
const { assertCanonicalDeliveryPreviewDir } = require('../scripts/mp-ci');

const REPO_DIR = path.resolve(__dirname, '..');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeStaleMirrorMarker(sourceDir, previewDir) {
  writeFile(path.join(previewDir, '.weapp-preview-sync.json'), `${JSON.stringify({
    sourceDir,
    previewDir,
    signature: 'stale-signature',
    syncedAt: '2026-07-01T00:00:00.000Z',
    invalidatedReason: 'test fixture is stale'
  })}\n`);
}

function createJpeg(width = 320, height = 320) {
  const dimensions = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    dimensions,
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9])
  ]);
}

function deliveryFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-preview-delivery-'));
  const deliveryDir = path.join(rootDir, 'preview-qrcodes');
  const git = {
    branch: 'codex/ui-optimization-v2',
    head: 'e2670887ef1972440d9dbea268d174e5e7a02b20',
    shortHead: 'e267088',
    dirty: false,
    dirtyFiles: []
  };
  return { rootDir, deliveryDir, git };
}

function seedLatest(deliveryDir) {
  const latestQrcodePath = path.join(deliveryDir, 'latest-preview-qrcode.jpg');
  const latestMetadataPath = path.join(deliveryDir, 'latest-preview-qrcode.json');
  writeFile(latestQrcodePath, Buffer.from('previous-good-qrcode'));
  writeFile(latestMetadataPath, '{"previous":true}\n');
  return {
    latestQrcodePath,
    latestMetadataPath,
    qrcode: fs.readFileSync(latestQrcodePath),
    metadata: fs.readFileSync(latestMetadataPath)
  };
}

function assertLatestUnchanged(seed) {
  assert.deepEqual(fs.readFileSync(seed.latestQrcodePath), seed.qrcode);
  assert.deepEqual(fs.readFileSync(seed.latestMetadataPath), seed.metadata);
}

function deliveryOptions(fixture, overrides = {}) {
  return {
    deliveryDir: fixture.deliveryDir,
    generatedAt: '2026-07-17T08:09:10.123Z',
    git: fixture.git,
    version: '6.1.2-e267088',
    robot: 2,
    runPreview: async (qrcodeOutputDest) => {
      writeFile(qrcodeOutputDest, createJpeg());
      return {
        subPackageInfo: [{ name: 'main' }],
        privateKeyPath: 'D:\\secret\\private.key',
        openid: 'must-not-leak',
        access_token: 'must-not-leak'
      };
    },
    verifyAfterPreview: () => {},
    writeRecord: () => ({ recordPath: path.join(fixture.rootDir, 'miniapp-ci.jsonl') }),
    ...overrides
  };
}

test('delivery directory is stable, project-local, and intentionally named', () => {
  assert.equal(DEFAULT_DELIVERY_DIR, path.join(REPO_DIR, 'preview-qrcodes'));
});

test('preview delivery version is public-safe before remote preview starts', () => {
  assert.equal(validatePublicPreviewVersion('6.1.2-e267088'), '6.1.2-e267088');
  assert.throws(
    () => validatePublicPreviewVersion('openid: must-not-leak'),
    (error) => {
      assert.doesNotMatch(error.message, /must-not-leak/);
      return true;
    }
  );
});

test('successful preview delivery validates JPEG, writes history, atomically updates latest, and records provenance', async () => {
  const fixture = deliveryFixture();
  const recordPayloads = [];
  const result = await deliverPreviewQrcode(deliveryOptions(fixture, {
    writeRecord: (payload) => {
      recordPayloads.push(payload);
      return { recordPath: path.join(fixture.rootDir, 'miniapp-ci.jsonl') };
    }
  }));

  assert.ok(fs.existsSync(result.historyQrcodePath));
  assert.ok(fs.existsSync(result.historyMetadataPath));
  assert.ok(fs.existsSync(result.latestQrcodePath));
  assert.ok(fs.existsSync(result.latestMetadataPath));
  assert.match(path.basename(result.historyQrcodePath), /^preview-qrcode-20260717T080910123Z-e267088\.jpg$/);
  assert.deepEqual(fs.readFileSync(result.latestQrcodePath), fs.readFileSync(result.historyQrcodePath));

  const metadata = JSON.parse(fs.readFileSync(result.latestMetadataPath, 'utf8'));
  assert.equal(metadata.previewOnly, true);
  assert.match(metadata.releaseNotice, /非正式版/);
  assert.match(metadata.expiryNotice, /失效|过期/);
  assert.equal(metadata.git.branch, fixture.git.branch);
  assert.equal(metadata.git.commit, fixture.git.head);
  assert.equal(metadata.git.dirty, false);
  assert.equal(metadata.version, '6.1.2-e267088');
  assert.equal(metadata.robot, 2);
  assert.equal(metadata.qrcode.sha256, crypto.createHash('sha256').update(createJpeg()).digest('hex'));
  assert.equal(metadata.qrcode.width, 320);
  assert.equal(metadata.qrcode.height, 320);
  assert.equal(recordPayloads.length, 1);
  assert.equal(recordPayloads[0].event, 'preview_delivery_success');
  assert.equal(recordPayloads[0].qrcode.sha256, metadata.qrcode.sha256);

  const publicEvidence = JSON.stringify({ metadata, recordPayload: recordPayloads[0] });
  assert.doesNotMatch(publicEvidence, /private\.key|must-not-leak|openid|access_token/i);
});

test('JPEG inspection rejects missing, empty, malformed, truncated, and undersized QR files', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-qrcode-validation-'));
  const qrcodePath = path.join(rootDir, 'qrcode.jpg');

  assert.throws(() => inspectJpegQrcode(qrcodePath), /missing|不存在/i);
  writeFile(qrcodePath, Buffer.alloc(0));
  assert.throws(() => inspectJpegQrcode(qrcodePath), /empty|为空/i);
  writeFile(qrcodePath, 'not-a-jpeg');
  assert.throws(() => inspectJpegQrcode(qrcodePath), /JPEG|格式/i);
  writeFile(qrcodePath, createJpeg().subarray(0, -2));
  assert.throws(() => inspectJpegQrcode(qrcodePath), /truncated|完整|EOI/i);
  writeFile(qrcodePath, createJpeg(32, 32));
  assert.throws(() => inspectJpegQrcode(qrcodePath), /dimensions|尺寸/i);
});

test('remote preview failure never replaces the previous successful latest QR', async () => {
  const fixture = deliveryFixture();
  const seed = seedLatest(fixture.deliveryDir);
  let recordCalls = 0;

  await assert.rejects(
    deliverPreviewQrcode(deliveryOptions(fixture, {
      runPreview: async () => { throw new Error('remote preview failed'); },
      writeRecord: () => { recordCalls += 1; }
    })),
    /remote preview failed/
  );
  assert.equal(recordCalls, 0);
  assertLatestUnchanged(seed);
});

test('missing or damaged QR output never replaces latest and writes no success record', async (t) => {
  for (const scenario of [
    { name: 'missing', runPreview: async () => ({}) },
    {
      name: 'damaged',
      runPreview: async (qrcodeOutputDest) => {
        writeFile(qrcodeOutputDest, 'damaged');
        return {};
      }
    }
  ]) {
    await t.test(scenario.name, async () => {
      const fixture = deliveryFixture();
      const seed = seedLatest(fixture.deliveryDir);
      let recordCalls = 0;
      await assert.rejects(
        deliverPreviewQrcode(deliveryOptions(fixture, {
          runPreview: scenario.runPreview,
          writeRecord: () => { recordCalls += 1; }
        })),
        /missing|不存在|JPEG|格式/i
      );
      assert.equal(recordCalls, 0);
      assertLatestUnchanged(seed);
    });
  }
});

test('post-preview source or mirror drift fails closed before publishing the QR', async () => {
  const fixture = deliveryFixture();
  const seed = seedLatest(fixture.deliveryDir);
  let recordCalls = 0;

  await assert.rejects(
    deliverPreviewQrcode(deliveryOptions(fixture, {
      verifyAfterPreview: () => { throw new Error('source contents drifted after preview started'); },
      writeRecord: () => { recordCalls += 1; }
    })),
    /drifted/
  );
  assert.equal(recordCalls, 0);
  assertLatestUnchanged(seed);
});

test('workflow record failure rolls latest back and removes the uncommitted history artifact', async () => {
  const fixture = deliveryFixture();
  const seed = seedLatest(fixture.deliveryDir);

  await assert.rejects(
    deliverPreviewQrcode(deliveryOptions(fixture, {
      writeRecord: () => { throw new Error('workflow record write failed'); }
    })),
    /workflow record write failed/
  );
  assertLatestUnchanged(seed);
  const visibleHistory = fs.readdirSync(fixture.deliveryDir).filter((name) => /^preview-qrcode-/.test(name));
  assert.deepEqual(visibleHistory, []);
});

test('native preview mirror sync replaces stale contents transactionally and writes a valid manifest', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-native-preview-sync-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'preview');
  writeFile(path.join(sourceDir, 'project.config.json'), '{"miniprogramRoot":"miniprogram/"}\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.json'), '{}\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.js'), 'App({ fresh: true });\n');
  writeFile(path.join(sourceDir, 'miniprogram/ignored.log'), 'secret runtime log\n');
  writeFile(path.join(previewDir, 'miniprogram/app.js'), 'App({ stale: true });\n');
  writeStaleMirrorMarker(sourceDir, previewDir);

  const result = syncPreviewMirror({ sourceDir, previewDir, syncedAt: '2026-07-17T08:00:00.000Z' });
  assert.equal(fs.readFileSync(path.join(previewDir, 'miniprogram/app.js'), 'utf8'), 'App({ fresh: true });\n');
  assert.equal(fs.existsSync(path.join(previewDir, 'miniprogram/ignored.log')), false);
  assert.equal(result.manifest.sourceDir, sourceDir);
  assert.equal(result.manifest.previewDir, previewDir);

  const validated = validatePreviewManifest({
    previewDir,
    expectedSourceDir: sourceDir,
    expectedPreviewDir: previewDir,
    expectedContentDir: sourceDir
  });
  assert.equal(validated.signature, result.manifest.signature);
});

test('native preview mirror sync failure preserves the previous mirror and stale manifest', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-native-preview-sync-failure-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'preview');
  writeFile(path.join(sourceDir, 'project.config.json'), '{"miniprogramRoot":"miniprogram/"}\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.json'), '{}\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.js'), 'App({ fresh: true });\n');
  writeFile(path.join(previewDir, 'miniprogram/app.js'), 'App({ previous: true });\n');
  writeStaleMirrorMarker(sourceDir, previewDir);

  assert.throws(
    () => syncPreviewMirror({
      sourceDir,
      previewDir,
      beforePromote: () => { throw new Error('simulated sync failure'); }
    }),
    /simulated sync failure/
  );
  assert.equal(fs.readFileSync(path.join(previewDir, 'miniprogram/app.js'), 'utf8'), 'App({ previous: true });\n');
  assert.match(fs.readFileSync(path.join(previewDir, '.weapp-preview-sync.json'), 'utf8'), /stale/);
});

test('invalid authoritative source layout never replaces the previous marked mirror', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-native-preview-invalid-source-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'preview');
  writeFile(path.join(sourceDir, 'project.config.json'), '{}\n');
  writeFile(path.join(sourceDir, 'miniprogram/incomplete.txt'), 'missing app files\n');
  writeFile(path.join(previewDir, 'miniprogram/app.js'), 'App({ previous: true });\n');
  writeStaleMirrorMarker(sourceDir, previewDir);

  assert.throws(
    () => syncPreviewMirror({ sourceDir, previewDir }),
    /layout|app\.js|app\.json/i
  );
  assert.equal(fs.readFileSync(path.join(previewDir, 'miniprogram/app.js'), 'utf8'), 'App({ previous: true });\n');
});

test('layout validation honors explicit miniprogramRoot and rejects traversal or non-files', async (t) => {
  await t.test('wrong explicit root does not fall back', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-layout-wrong-root-'));
    writeFile(path.join(rootDir, 'project.config.json'), '{"miniprogramRoot":"missing/"}\n');
    writeFile(path.join(rootDir, 'miniprogram/app.js'), 'App({});\n');
    writeFile(path.join(rootDir, 'miniprogram/app.json'), '{}\n');
    assert.throws(() => assertMiniProgramLayout(rootDir, 'fixture'), /app\.js|app\.json/);
  });

  for (const [label, config] of [
    ['missing miniprogramRoot', {}],
    ['empty miniprogramRoot', { miniprogramRoot: '' }],
    ['non-string miniprogramRoot', { miniprogramRoot: true }]
  ]) {
    await t.test(`${label} does not fall back to miniprogram/`, () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-layout-no-fallback-'));
      writeFile(path.join(rootDir, 'project.config.json'), `${JSON.stringify(config)}\n`);
      writeFile(path.join(rootDir, 'miniprogram/app.js'), 'App({});\n');
      writeFile(path.join(rootDir, 'miniprogram/app.json'), '{}\n');
      assert.throws(() => assertMiniProgramLayout(rootDir, 'fixture'), /app\.js|app\.json/);
    });
  }

  await t.test('configured root cannot escape project', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-layout-traversal-'));
    const rootDir = path.join(parentDir, 'source');
    const outsideDir = path.join(parentDir, 'outside');
    writeFile(path.join(rootDir, 'project.config.json'), '{"miniprogramRoot":"../outside/"}\n');
    writeFile(path.join(outsideDir, 'app.js'), 'App({});\n');
    writeFile(path.join(outsideDir, 'app.json'), '{}\n');
    assert.throws(() => assertMiniProgramLayout(rootDir, 'fixture'), /outside the project/);
  });

  await t.test('app paths must be regular files', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-layout-directories-'));
    writeFile(path.join(rootDir, 'project.config.json'), '{"miniprogramRoot":"miniprogram/"}\n');
    fs.mkdirSync(path.join(rootDir, 'miniprogram/app.js'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'miniprogram/app.json'), { recursive: true });
    assert.throws(() => assertMiniProgramLayout(rootDir, 'fixture'), /app\.js|app\.json/);
  });
});

test('native preview mirror sync refuses to replace an existing unmarked directory', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-native-preview-unmarked-'));
  const sourceDir = path.join(rootDir, 'source');
  const previewDir = path.join(rootDir, 'ordinary-directory');
  writeFile(path.join(sourceDir, 'project.config.json'), '{}\n');
  writeFile(path.join(sourceDir, 'miniprogram/app.js'), 'App({ fresh: true });\n');
  writeFile(path.join(previewDir, 'keep-me.txt'), 'ordinary user data\n');

  assert.throws(
    () => syncPreviewMirror({ sourceDir, previewDir }),
    /marker|manifest|refuses/i
  );
  assert.equal(fs.readFileSync(path.join(previewDir, 'keep-me.txt'), 'utf8'), 'ordinary user data\n');
});

test('preview delivery command accepts only the fixed sibling preview mirror', () => {
  const canonical = path.join(path.dirname(REPO_DIR), 'badminton-miniapp-preview');
  assert.equal(assertCanonicalDeliveryPreviewDir(canonical), canonical);
  assert.throws(
    () => assertCanonicalDeliveryPreviewDir(path.join(os.tmpdir(), 'wrong-preview-target')),
    /fixed preview mirror|固定 preview mirror/i
  );
});

test('package exposes one preview-only delivery command and ignores dynamic QR artifacts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));
  const gitignore = fs.readFileSync(path.join(REPO_DIR, '.gitignore'), 'utf8');
  const mpCi = fs.readFileSync(path.join(REPO_DIR, 'scripts/mp-ci.js'), 'utf8');

  assert.equal(pkg.scripts['mp:preview:deliver'], 'node scripts/mp-ci.js preview-deliver');
  assert.match(gitignore, /^preview-qrcodes\/$/m);
  assert.match(mpCi, /preview-deliver/);
  assert.match(mpCi, /deliverPreviewQrcode/);
  const deliveryBranch = mpCi.slice(
    mpCi.indexOf("if (mode === 'preview-deliver')", mpCi.indexOf('const onProgressUpdate')),
    mpCi.indexOf("} else if (mode === 'preview')", mpCi.indexOf('const onProgressUpdate'))
  );
  assert.match(deliveryBranch, /ci\.preview\(/);
  assert.doesNotMatch(deliveryBranch, /ci\.upload\(/);
});
