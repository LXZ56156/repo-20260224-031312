const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { compareImages } = require('../scripts/dev/weapp-pixel-diff');
test('pixel differences are reported without changing baseline or rejecting changed pixels', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-pixel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const a = new PNG({ width: 10, height: 10 });
  a.data.fill(255);
  const baseline = path.join(dir, 'baseline.png');
  const candidate = path.join(dir, 'candidate.png');
  const original = PNG.sync.write(a);
  fs.writeFileSync(baseline, original);
  a.data.fill(0); for (let i = 3; i < a.data.length; i += 4) a.data[i] = 255;
  fs.writeFileSync(candidate, PNG.sync.write(a));
  const report = await compareImages(baseline, candidate, path.join(dir, 'report'));
  assert.equal(report.changedRatio, 1);
  assert.equal(report.mode, 'report-only');
  assert.deepEqual(fs.readFileSync(baseline), original);
  assert.ok(fs.existsSync(report.diffPath));
});

test('pixel reports do not compare page and simulator-frame evidence even at equal dimensions', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-surface-diff-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const data = PNG.sync.write(new PNG({ width: 10, height: 10 }));
  const hash = require('node:crypto').createHash('sha256').update(data).digest('hex');
  const baseline = path.join(dir, 'baseline.png');
  const candidate = path.join(dir, 'candidate.png');
  for (const file of [baseline, candidate]) fs.writeFileSync(file, data);
  const receipt = (kind) => JSON.stringify({ captureSurface: { kind }, png: { sha256: hash } });
  fs.writeFileSync(path.join(dir, 'baseline.receipt.json'), receipt('page'));
  fs.writeFileSync(path.join(dir, 'candidate.receipt.json'), receipt('simulator-frame'));
  const mixed = await compareImages(baseline, candidate, path.join(dir, 'mixed'));
  assert.equal(mixed.comparable, false);
  assert.equal(mixed.incomparableReason, 'capture-surface-mismatch');
  assert.equal(mixed.changedPixels, null);
  fs.writeFileSync(path.join(dir, 'baseline.receipt.json'), receipt('simulator-frame'));
  const frame = await compareImages(baseline, candidate, path.join(dir, 'frame'));
  assert.equal(frame.comparable, true);
  assert.equal(frame.systemChromeNoise, true);
  assert.equal(frame.pageGeometryVerified, false);
  fs.writeFileSync(path.join(dir, 'candidate.receipt.json'), JSON.stringify({
    captureSurface: { kind: 'simulator-frame' }, png: { sha256: '0'.repeat(64) },
  }));
  await assert.rejects(compareImages(baseline, candidate, path.join(dir, 'stale')), /receipt.*hash/i);
});
