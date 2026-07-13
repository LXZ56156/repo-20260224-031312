const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('canvas');

const {
  SMOKE_CASES,
  inspectPng,
  logicalViewportWidth,
  promoteScreenshotSet,
  runWithAttempts,
  shouldWriteScreenshotRecord,
  validateAndPromoteScreenshot,
  validateTemporalCoherence
} = require('../scripts/dev/weapp-ui-screenshot');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixturePng(filePath, { withRoundCard, cardText = 'VS 21 : 17' }) {
  const width = 390;
  const height = 752;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f7f8';
  ctx.fillRect(0, 0, width, height);

  // A noisy hero makes the file comfortably larger than 20KB, reproducing the
  // real failure where byte size passes while the required lower region is blank.
  const hero = ctx.createImageData(width, 250);
  let state = 0x12345678;
  for (let index = 0; index < hero.data.length; index += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    hero.data[index] = 40 + (state & 0x7f);
    hero.data[index + 1] = 70 + ((state >>> 8) & 0x7f);
    hero.data[index + 2] = 50 + ((state >>> 16) & 0x7f);
    hero.data[index + 3] = 255;
  }
  ctx.putImageData(hero, 0, 0);

  if (withRoundCard) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, 280, 366, 360);
    ctx.fillStyle = '#111827';
    ctx.font = '24px sans-serif';
    ctx.fillText(cardText, 90, 390);
    ctx.fillText('21 : 17', 150, 540);
    ctx.strokeStyle = '#17b26a';
    ctx.lineWidth = 8;
    ctx.strokeRect(25, 310, 340, 145);
  }

  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
}

const DOM_ROWS = [{
  selector: '.round-card',
  index: 0,
  text: 'VS 21 : 17',
  size: { width: 366, height: 360 },
  offset: { left: 12, top: 280 }
}];

test('logical viewport width uses the widest page container, not a right-aligned narrow child', () => {
  assert.equal(logicalViewportWidth([
    { size: { width: 366 }, offset: { left: 12 } },
    { size: { width: 40 }, offset: { left: 310 } }
  ]), 390);
});

test('PNG inspection rejects neither dimensions nor bytes as sufficient visual proof', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot (WIN) '));
  const stalePath = path.join(rootDir, 'stale-but-large.png');
  writeFixturePng(stalePath, { withRoundCard: false });

  const basic = inspectPng(stalePath);

  assert.equal(basic.isPng, true);
  assert.equal(basic.width, 390);
  assert.equal(basic.height, 752);
  assert.ok(basic.bytes > 20 * 1024);
});

test('invalid visual region never overwrites the last good screenshot', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot protect (WIN) '));
  const outputPath = path.join(rootDir, 'scheduleRunning.png');
  const candidatePath = path.join(rootDir, 'scheduleRunning.candidate.png');
  fs.writeFileSync(outputPath, 'known-good-screenshot');
  writeFixturePng(candidatePath, { withRoundCard: false });
  const before = sha256(outputPath);

  await assert.rejects(
    validateAndPromoteScreenshot({
      candidatePath,
      outputPath,
      domRows: DOM_ROWS,
      visualSelectors: ['.round-card']
    }),
    /visual region/i
  );

  assert.equal(sha256(outputPath), before);
});

test('valid visual region is promoted only after strong validation', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot promote (WIN) '));
  const outputPath = path.join(rootDir, 'scheduleRunning.png');
  const candidatePath = path.join(rootDir, 'scheduleRunning.candidate.png');
  fs.writeFileSync(outputPath, 'previous');
  writeFixturePng(candidatePath, { withRoundCard: true });

  const result = await validateAndPromoteScreenshot({
    candidatePath,
    outputPath,
    domRows: DOM_ROWS,
    visualSelectors: ['.round-card']
  });

  assert.equal(result.ok, true);
  assert.equal(inspectPng(outputPath).isPng, true);
  assert.equal(fs.existsSync(candidatePath), false);
});

test('nonblank wrong-page or repeated stale frames fail temporal coherence', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot stale frame (WIN) '));
  const probePath = path.join(rootDir, 'probe.png');
  const candidatePath = path.join(rootDir, 'candidate.png');
  const confirmationPath = path.join(rootDir, 'confirmation.png');
  writeFixturePng(probePath, { withRoundCard: true });
  fs.copyFileSync(probePath, candidatePath);
  fs.copyFileSync(probePath, confirmationPath);

  await assert.rejects(
    validateTemporalCoherence({ probePath, candidatePath, confirmationPath, domRows: DOM_ROWS, selector: '.round-card' }),
    /coherence probe failed/i
  );
});

test('rendered probe transition plus two stable restored frames proves temporal coherence', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot coherent frame (WIN) '));
  const probePath = path.join(rootDir, 'probe.png');
  const candidatePath = path.join(rootDir, 'candidate.png');
  const confirmationPath = path.join(rootDir, 'confirmation.png');
  writeFixturePng(probePath, { withRoundCard: true, cardText: '验验验验验验' });
  writeFixturePng(candidatePath, { withRoundCard: true });
  fs.copyFileSync(candidatePath, confirmationPath);

  const result = await validateTemporalCoherence({
    probePath,
    candidatePath,
    confirmationPath,
    domRows: DOM_ROWS,
    selector: '.round-card'
  });

  assert.ok(result.transition.changedRatio > result.stability.changedRatio);
  assert.equal(result.stability.changedRatio, 0);
});

test('late case failure cannot promote any member of a screenshot set', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp screenshot transaction (WIN) '));
  const results = SMOKE_CASES.slice(0, 2).map((name) => {
    const output = path.join(rootDir, `${name}.png`);
    const candidatePath = path.join(rootDir, `.${name}.candidate.png`);
    fs.writeFileSync(output, `old-${name}`);
    fs.writeFileSync(candidatePath, `new-${name}`);
    return { name, ok: true, output, candidatePath };
  });
  const before = new Map(results.map((result) => [result.name, sha256(result.output)]));

  assert.equal(promoteScreenshotSet(results, SMOKE_CASES), false);
  for (const result of results) {
    assert.equal(sha256(result.output), before.get(result.name));
    assert.equal(fs.existsSync(result.candidatePath), false);
  }
});

test('connection failure participates in the configured retry budget', async () => {
  let attempts = 0;
  const result = await runWithAttempts(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('connect refused');
    return 'connected';
  }, { maxAttempts: 2, delayMs: 0 });

  assert.equal(result.value, 'connected');
  assert.equal(result.attempt, 2);
  assert.equal(attempts, 2);
});

test('smoke set is stable and partial or failed runs cannot write success records', () => {
  assert.deepEqual(SMOKE_CASES, ['launch', 'scheduleRunning', 'home']);
  assert.equal(shouldWriteScreenshotRecord([{ name: 'launch', ok: true }], SMOKE_CASES, 'smoke'), false);
  assert.equal(shouldWriteScreenshotRecord([
    { name: 'launch', ok: true },
    { name: 'scheduleRunning', ok: false },
    { name: 'home', ok: true }
  ], SMOKE_CASES, 'smoke'), false);
  const complete = SMOKE_CASES.map((name) => ({ name, ok: true }));
  assert.equal(shouldWriteScreenshotRecord(complete, SMOKE_CASES, 'smoke'), true);
  assert.equal(shouldWriteScreenshotRecord(complete, SMOKE_CASES, 'subset'), false);
});
